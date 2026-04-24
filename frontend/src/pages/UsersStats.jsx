import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsService } from '../services/api';
import './UsersStats.css';

const emptyBucket = () => ({ total: 0, pending: 0, classified: 0, approved: 0, rejected: 0 });

const UsersStats = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
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

  // Aggregate per-user rows into per-group rows (key: district + group name)
  const groupRows = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      const groupName = u.group || '—';
      const districtName = u.district || '—';
      const key = `${districtName}||${groupName}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          district: districtName,
          group: groupName,
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
      for (const status of ['total', 'pending', 'classified', 'approved', 'rejected']) {
        entry.photos[status] += u.photos?.[status] || 0;
        entry.schematics[status] += u.schematics?.[status] || 0;
      }
    }
    return Array.from(map.values());
  }, [users]);

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
        r.district?.toLowerCase().includes(s)
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
        acc.approved += r.photos.approved + r.schematics.approved;
        // Photos have two pre-approval states:
        //   - PENDING     → needs classification (chef or branche)
        //   - CLASSIFIED  → needs approval decision (branche only)
        // Schematics skip classify — they're uploaded PENDING with a category, then approved.
        acc.photosToClassify += r.photos.pending;
        acc.photosToApprove += r.photos.classified;
        acc.schematicsToApprove += r.schematics.pending + r.schematics.classified;
        acc.pending += r.photos.pending + r.photos.classified + r.schematics.pending + r.schematics.classified;
        if (r.total === 0) acc.zeroUploads += 1;
        if (r.photos.total === 0) acc.zeroPhotos += 1;
        if (r.schematics.total === 0) acc.zeroSchematics += 1;
        return acc;
      },
      { total: 0, photos: 0, schematics: 0, approved: 0, pending: 0, photosToClassify: 0, photosToApprove: 0, schematicsToApprove: 0, zeroUploads: 0, zeroPhotos: 0, zeroSchematics: 0 }
    );
  }, [filteredSorted]);

  const exportCSV = () => {
    const headers = [
      'District', 'Group', 'Users', 'Uploaders',
      'Total', 'Photos', 'Photos Approved', 'Photos Pending',
      'Schematics', 'Schematics Approved', 'Schematics Pending',
    ];
    const rows = filteredSorted.map((r) => [
      r.district, r.group, r.users, r.uploaders,
      r.total,
      r.photos.total, r.photos.approved, r.photos.pending + r.photos.classified,
      r.schematics.total, r.schematics.approved, r.schematics.pending + r.schematics.classified,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `group_uploads_${new Date().toISOString().slice(0, 10)}.csv`;
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
          <h2>Statistiques par Groupe</h2>
          <p>Uploads agrégés par groupe (photos et schémas)</p>
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

            <div className="summary-bar">
              <div className="summary-item">
                <span className="summary-value">{filteredSorted.length}</span>
                <span className="summary-label">Groupes</span>
              </div>
              <div className="summary-item">
                <span className="summary-value">{totals.total}</span>
                <span className="summary-label">Total uploads</span>
              </div>
              <div className="summary-item">
                <span className="summary-value">{totals.photos}</span>
                <span className="summary-label">Photos</span>
              </div>
              <div className="summary-item">
                <span className="summary-value">{totals.schematics}</span>
                <span className="summary-label">Schémas</span>
              </div>
              <div className="summary-item approved">
                <span className="summary-value">{totals.approved}</span>
                <span className="summary-label">Approuvés</span>
              </div>
              <div className="summary-item pending">
                <span className="summary-value">{totals.pending}</span>
                <span className="summary-label">En attente</span>
              </div>
            </div>

            <div className="stats-toolbar">
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
                placeholder="Rechercher groupe, district…"
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
                    <th className="num-col">
                      En attente
                    </th>
                    <th onClick={() => toggleSort('schematics.total')} className="num-col">
                      Schémas <SortIcon column="schematics.total" />
                    </th>
                    <th onClick={() => toggleSort('schematics.approved')} className="num-col">
                      Approuvés <SortIcon column="schematics.approved" />
                    </th>
                    <th className="num-col">
                      En attente
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty-row">
                        Aucun groupe trouvé
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((r) => {
                      const photoPending = r.photos.pending + r.photos.classified;
                      const schemPending = r.schematics.pending + r.schematics.classified;
                      return (
                        <tr key={r.key}>
                          <td>{r.district}</td>
                          <td className="group-name-cell">{r.group}</td>
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
                            {photoPending > 0 && <span className="pending-count">{photoPending}</span>}
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
                            {schemPending > 0 && <span className="pending-count">{schemPending}</span>}
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
