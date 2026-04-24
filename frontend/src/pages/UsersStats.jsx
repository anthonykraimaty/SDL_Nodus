import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsService } from '../services/api';
import './UsersStats.css';

const emptyBucket = () => ({ total: 0, toClassify: 0, toApprove: 0, approved: 0, rejected: 0 });

const UsersStats = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('troupe'); // 'troupe' | 'group' | 'district'
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await analyticsService.getUsersUploads();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load upload statistics');
    } finally {
      setLoading(false);
    }
  };

  const getNested = (obj, path) =>
    path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

  const toggleSort = (key) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const SortIcon = ({ column }) => {
    if (sort.key !== column) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Aggregate per-user rows based on selected grouping
  const groupRows = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      const districtName = u.district || '—';
      const groupName = u.group || '—';
      const troupeName = u.troupe || '—';

      let key;
      let rowDistrict;
      let rowGroup;
      let rowTroupe;
      if (groupBy === 'district') {
        key = districtName;
        rowDistrict = districtName;
        rowGroup = '—';
        rowTroupe = '—';
      } else if (groupBy === 'group') {
        key = `${districtName}||${groupName}`;
        rowDistrict = districtName;
        rowGroup = groupName;
        rowTroupe = '—';
      } else {
        // troupe
        key = `${districtName}||${groupName}||${troupeName}`;
        rowDistrict = districtName;
        rowGroup = groupName;
        rowTroupe = troupeName;
      }

      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          district: rowDistrict,
          group: rowGroup,
          troupe: rowTroupe,
          users: 0,
          uploaders: 0,
          total: 0,
          photos: emptyBucket(),
          schematics: emptyBucket(),
        };
        map.set(key, entry);
      }
      entry.users += 1;
      if (u.total > 0) entry.uploaders += 1;
      entry.total += u.total;
      for (const k of ['total', 'toClassify', 'toApprove', 'approved', 'rejected']) {
        entry.photos[k] += u.photos?.[k] || 0;
        entry.schematics[k] += u.schematics?.[k] || 0;
      }
    }
    return Array.from(map.values());
  }, [users, groupBy]);

  // Districts for the filter dropdown
  const districts = useMemo(() => {
    return Array.from(new Set(groupRows.map(r => r.district).filter(d => d && d !== '—')))
      .sort((a, b) => a.localeCompare(b));
  }, [groupRows]);

  const filteredSorted = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = groupRows.filter((r) => {
      if (districtFilter !== 'all' && r.district !== districtFilter) return false;
      if (!s) return true;
      return (
        r.group?.toLowerCase().includes(s) ||
        r.district?.toLowerCase().includes(s) ||
        r.troupe?.toLowerCase().includes(s)
      );
    });

    return [...filtered].sort((a, b) => {
      let av = getNested(a, sort.key);
      let bv = getNested(b, sort.key);
      if (av == null) av = typeof bv === 'number' ? 0 : '';
      if (bv == null) bv = typeof av === 'number' ? 0 : '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [groupRows, districtFilter, search, sort]);

  const totals = useMemo(() => {
    return filteredSorted.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.photos += r.photos.total;
        acc.schematics += r.schematics.total;
        acc.photosApproved += r.photos.approved;
        acc.schematicsApproved += r.schematics.approved;
        acc.approved += r.photos.approved + r.schematics.approved;
        acc.photosToClassify += r.photos.toClassify;
        acc.photosToApprove += r.photos.toApprove;
        acc.schematicsToApprove += r.schematics.toClassify + r.schematics.toApprove;
        acc.pending += r.photos.toClassify + r.photos.toApprove + r.schematics.toClassify + r.schematics.toApprove;
        acc.rejected += r.photos.rejected + r.schematics.rejected;
        if (r.total === 0) acc.zeroUploads += 1;
        if (r.photos.total === 0) acc.zeroPhotos += 1;
        if (r.schematics.total === 0) acc.zeroSchematics += 1;
        return acc;
      },
      { total: 0, photos: 0, schematics: 0, approved: 0, photosApproved: 0, schematicsApproved: 0, pending: 0, rejected: 0, photosToClassify: 0, photosToApprove: 0, schematicsToApprove: 0, zeroUploads: 0, zeroPhotos: 0, zeroSchematics: 0 }
    );
  }, [filteredSorted]);

  // Distinct troupe, group and district counts matching the active district + search filters
  const filteredCounts = useMemo(() => {
    const s = search.trim().toLowerCase();
    const troupeSet = new Set();
    const groupSet = new Set();
    const districtSet = new Set();
    for (const u of users) {
      const districtName = u.district || '—';
      const groupName = u.group || '—';
      const troupeName = u.troupe || '—';
      if (districtFilter !== 'all' && districtName !== districtFilter) continue;
      if (
        s &&
        !groupName.toLowerCase().includes(s) &&
        !districtName.toLowerCase().includes(s) &&
        !troupeName.toLowerCase().includes(s)
      ) continue;
      if (u.troupe) troupeSet.add(`${districtName}||${groupName}||${u.troupe}`);
      if (u.group) groupSet.add(`${districtName}||${groupName}`);
      if (u.district) districtSet.add(districtName);
    }
    return { troupes: troupeSet.size, groups: groupSet.size, districts: districtSet.size };
  }, [users, districtFilter, search]);

  const exportCSV = () => {
    const headers = [
      'District', 'Group', 'Troupe', 'Users', 'Uploaders',
      'Total',
      'Photos', 'Photos Approved', 'Photos To Classify', 'Photos To Approve', 'Photos Rejected',
      'Schematics', 'Schematics Approved', 'Schematics To Approve', 'Schematics Rejected',
    ];
    const rows = filteredSorted.map((r) => [
      r.district, r.group, r.troupe, r.users, r.uploaders,
      r.total,
      r.photos.total, r.photos.approved, r.photos.toClassify, r.photos.toApprove, r.photos.rejected,
      r.schematics.total, r.schematics.approved, r.schematics.toClassify + r.schematics.toApprove, r.schematics.rejected,
    ]);
    const scope = groupBy === 'district' ? 'districts' : groupBy === 'group' ? 'groups' : 'troupes';
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scope}_uploads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role)) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Branche members and Admins can view statistics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-stats-page">
      <div className="container">
        <div className="stats-header">
          <h2>Statistiques des uploads</h2>
          <p>Images agrégées par troupe, groupe ou district (photos et schémas, par image individuelle)</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : (
          <>
            <div className="approval-kpi-row approval-kpi-row--three">
              <Link to="/classify" className="approval-card approval-card--classify">
                <div className="approval-icon" aria-hidden="true">🏷️</div>
                <div className="approval-body">
                  <div className="approval-value">{totals.photosToClassify}</div>
                  <div className="approval-label">Photos à classer</div>
                  <div className="approval-sublabel">
                    {districtFilter === 'all' ? 'Tous districts' : districtFilter}
                    {totals.photosToClassify > 0 && ' — ouvrir'}
                  </div>
                </div>
              </Link>
              <Link to="/review" className="approval-card approval-card--photos">
                <div className="approval-icon" aria-hidden="true">📷</div>
                <div className="approval-body">
                  <div className="approval-value">{totals.photosToApprove}</div>
                  <div className="approval-label">Photos à approuver</div>
                  <div className="approval-sublabel">
                    {districtFilter === 'all' ? 'Tous districts' : districtFilter}
                    {totals.photosToApprove > 0 && ' — ouvrir la file'}
                  </div>
                </div>
              </Link>
              <Link to="/schematics/review" className="approval-card approval-card--schematics">
                <div className="approval-icon" aria-hidden="true">📐</div>
                <div className="approval-body">
                  <div className="approval-value">{totals.schematicsToApprove}</div>
                  <div className="approval-label">Schémas à approuver</div>
                  <div className="approval-sublabel">
                    {districtFilter === 'all' ? 'Tous districts' : districtFilter}
                    {totals.schematicsToApprove > 0 && ' — ouvrir la file'}
                  </div>
                </div>
              </Link>
            </div>

            <div className="zero-uploads-row">
              <div className="zero-card">
                <div className="zero-value">{totals.zeroUploads}</div>
                <div className="zero-label">0 uploads</div>
                <div className="zero-sublabel">Aucun upload</div>
              </div>
              <div className="zero-card">
                <div className="zero-value">{totals.zeroPhotos}</div>
                <div className="zero-label">0 photos</div>
                <div className="zero-sublabel">Aucune photo</div>
              </div>
              <div className="zero-card">
                <div className="zero-value">{totals.zeroSchematics}</div>
                <div className="zero-label">0 schémas</div>
                <div className="zero-sublabel">Aucun schéma</div>
              </div>
            </div>

            <div className="summary-meta">
              <strong>{filteredCounts.troupes}</strong> troupes
              <span className="summary-meta-sep">·</span>
              <strong>{filteredCounts.groups}</strong> groupes
              <span className="summary-meta-sep">·</span>
              <strong>{filteredCounts.districts}</strong> districts
            </div>

            <div className="summary-kpi-row">
              <div className="kpi-card kpi-card--total">
                <div className="kpi-icon" aria-hidden="true">📤</div>
                <div className="kpi-body">
                  <div className="kpi-value">{totals.total}</div>
                  <div className="kpi-label">Total uploads</div>
                </div>
              </div>
              <div className="kpi-card kpi-card--photos-approved">
                <div className="kpi-icon" aria-hidden="true">📷</div>
                <div className="kpi-body">
                  <div className="kpi-value">{totals.photosApproved}</div>
                  <div className="kpi-label">Photos approuvées</div>
                </div>
              </div>
              <div className="kpi-card kpi-card--schematics-approved">
                <div className="kpi-icon" aria-hidden="true">📐</div>
                <div className="kpi-body">
                  <div className="kpi-value">{totals.schematicsApproved}</div>
                  <div className="kpi-label">Schémas approuvés</div>
                </div>
              </div>
              <div className="kpi-card kpi-card--rejected">
                <div className="kpi-icon" aria-hidden="true">❌</div>
                <div className="kpi-body">
                  <div className="kpi-value">{totals.rejected}</div>
                  <div className="kpi-label">Rejetés</div>
                </div>
              </div>
            </div>

            <div className="stats-toolbar">
              <select
                className="district-filter"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                title="Grouper par"
                aria-label="Grouper par"
              >
                <option value="troupe">Grouper par troupe</option>
                <option value="group">Grouper par groupe</option>
                <option value="district">Grouper par district</option>
              </select>
              <select
                className="district-filter"
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
              >
                <option value="all">Tous les districts</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <input
                type="search"
                className="stats-search"
                placeholder="Rechercher troupe, groupe, district…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="btn-export-csv" onClick={exportCSV}>
                Export CSV
              </button>
            </div>

            <div className="data-table-wrapper">
              <table className="users-stats-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('district')}>
                      District <SortIcon column="district" />
                    </th>
                    <th onClick={() => toggleSort('group')}>
                      Groupe <SortIcon column="group" />
                    </th>
                    <th onClick={() => toggleSort('troupe')}>
                      Troupe <SortIcon column="troupe" />
                    </th>
                    <th onClick={() => toggleSort('users')} className="num-col">
                      Utilisateurs <SortIcon column="users" />
                    </th>
                    <th onClick={() => toggleSort('uploaders')} className="num-col">
                      Uploaders <SortIcon column="uploaders" />
                    </th>
                    <th onClick={() => toggleSort('total')} className="num-col">
                      Total <SortIcon column="total" />
                    </th>
                    <th onClick={() => toggleSort('photos.total')} className="num-col">
                      Photos <SortIcon column="photos.total" />
                    </th>
                    <th onClick={() => toggleSort('photos.approved')} className="num-col">
                      Approuvées <SortIcon column="photos.approved" />
                    </th>
                    <th onClick={() => toggleSort('photos.toClassify')} className="num-col">
                      À classer <SortIcon column="photos.toClassify" />
                    </th>
                    <th onClick={() => toggleSort('photos.toApprove')} className="num-col">
                      À approuver <SortIcon column="photos.toApprove" />
                    </th>
                    <th onClick={() => toggleSort('photos.rejected')} className="num-col">
                      Rejetées <SortIcon column="photos.rejected" />
                    </th>
                    <th onClick={() => toggleSort('schematics.total')} className="num-col">
                      Schémas <SortIcon column="schematics.total" />
                    </th>
                    <th onClick={() => toggleSort('schematics.approved')} className="num-col">
                      Approuvés <SortIcon column="schematics.approved" />
                    </th>
                    <th onClick={() => toggleSort('schematics.toApprove')} className="num-col">
                      À approuver <SortIcon column="schematics.toApprove" />
                    </th>
                    <th onClick={() => toggleSort('schematics.rejected')} className="num-col">
                      Rejetés <SortIcon column="schematics.rejected" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="empty-row">
                        Aucun résultat trouvé
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((r) => {
                      const schemToApprove = r.schematics.toClassify + r.schematics.toApprove;
                      return (
                        <tr key={r.key}>
                          <td>{r.district}</td>
                          <td className="group-name-cell">{r.group}</td>
                          <td className="troupe-name-cell">{r.troupe}</td>
                          <td className="num-col">{r.users}</td>
                          <td className="num-col">
                            <span className={r.uploaders === 0 ? 'zero-count' : ''}>
                              {r.uploaders}
                            </span>
                          </td>
                          <td className="num-col total-col">{r.total}</td>
                          <td className="num-col">
                            <span className={r.photos.total === 0 ? 'zero-count' : ''}>
                              {r.photos.total}
                            </span>
                          </td>
                          <td className="num-col">
                            <span className={r.photos.approved > 0 ? 'approved-count' : ''}>
                              {r.photos.approved}
                            </span>
                          </td>
                          <td className="num-col">
                            {r.photos.toClassify > 0 && <span className="pending-count">{r.photos.toClassify}</span>}
                          </td>
                          <td className="num-col">
                            {r.photos.toApprove > 0 && <span className="pending-count">{r.photos.toApprove}</span>}
                          </td>
                          <td className="num-col">
                            {r.photos.rejected > 0 && <span className="rejected-count">{r.photos.rejected}</span>}
                          </td>
                          <td className="num-col">
                            <span className={r.schematics.total === 0 ? 'zero-count' : ''}>
                              {r.schematics.total}
                            </span>
                          </td>
                          <td className="num-col">
                            <span className={r.schematics.approved > 0 ? 'approved-count' : ''}>
                              {r.schematics.approved}
                            </span>
                          </td>
                          <td className="num-col">
                            {schemToApprove > 0 && <span className="pending-count">{schemToApprove}</span>}
                          </td>
                          <td className="num-col">
                            {r.schematics.rejected > 0 && <span className="rejected-count">{r.schematics.rejected}</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UsersStats;
