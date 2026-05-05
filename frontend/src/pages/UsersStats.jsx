import { Fragment, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsService, settingsService } from '../services/api';
import './UsersStats.css';

// Fallbacks if /api/settings fails. Match the backend defaults in
// backend/src/utils/settings.js so colors still appear when offline.
const DEFAULT_TIER_HIGH = 20;
const DEFAULT_TIER_MID = 15;
const DEFAULT_AGG_FACTOR = 0.8;

const emptyBucket = () => ({ total: 0, toClassify: 0, toApprove: 0, approved: 0, rejected: 0 });

const COLUMN_ORDER_STORAGE_KEY = 'usersStats.columnOrder.v1';

const DEFAULT_COLUMN_ORDER = [
  'district', 'group', 'troupe',
  'users', 'uploaders', 'total',
  'photos.total', 'photos.approved', 'photos.toClassify', 'photos.toApprove', 'photos.rejected',
  'schematics.total', 'schematics.approved', 'schematics.toApprove', 'schematics.rejected',
];

const UsersStats = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('troupe'); // 'troupe' | 'group' | 'district'
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' });

  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      if (!saved) return DEFAULT_COLUMN_ORDER;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return DEFAULT_COLUMN_ORDER;
      const known = new Set(DEFAULT_COLUMN_ORDER);
      const cleaned = parsed.filter((id) => known.has(id));
      const missing = DEFAULT_COLUMN_ORDER.filter((id) => !cleaned.includes(id));
      return [...cleaned, ...missing];
    } catch {
      return DEFAULT_COLUMN_ORDER;
    }
  });
  const [draggedColId, setDraggedColId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);

  // Tier coloring thresholds, configured by admins via /admin/organizations.
  const [tierConfig, setTierConfig] = useState({
    high: DEFAULT_TIER_HIGH,
    mid: DEFAULT_TIER_MID,
    factor: DEFAULT_AGG_FACTOR,
  });

  // Pictures-by-category chart (moved here from Dashboard)
  const [categoryStats, setCategoryStats] = useState([]);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [categoryStatusFilter, setCategoryStatusFilter] = useState('all'); // all|pending|classified|approved|rejected
  const [categoryPage, setCategoryPage] = useState(1);
  const CATEGORY_PAGE_SIZE = 10;

  useEffect(() => {
    loadStats();
    loadTierConfig();
  }, []);

  const loadTierConfig = async () => {
    try {
      const s = await settingsService.get();
      setTierConfig({
        high: Number.isFinite(s?.statsTierHighThreshold) ? s.statsTierHighThreshold : DEFAULT_TIER_HIGH,
        mid: Number.isFinite(s?.statsTierMidThreshold) ? s.statsTierMidThreshold : DEFAULT_TIER_MID,
        factor: Number.isFinite(s?.statsAggregationFactor) ? s.statsAggregationFactor : DEFAULT_AGG_FACTOR,
      });
    } catch {
      // keep defaults
    }
  };

  useEffect(() => {
    loadCategoryStats(categoryStatusFilter);
  }, [categoryStatusFilter]);

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

  const loadCategoryStats = async (status) => {
    try {
      const params = {};
      if (status && status !== 'all') params.status = status.toUpperCase();
      const data = await analyticsService.getPicturesByCategory(params);
      setCategoryStats(data.categories || []);
      setCategoryTotal(data.totalPictures || 0);
      setCategoryPage(1); // reset to first page when filter changes
    } catch (err) {
      console.error('Failed to load category stats:', err);
    }
  };

  const categoryTotalPages = Math.max(1, Math.ceil(categoryStats.length / CATEGORY_PAGE_SIZE));
  const categoryPageItems = categoryStats.slice(
    (categoryPage - 1) * CATEGORY_PAGE_SIZE,
    categoryPage * CATEGORY_PAGE_SIZE
  );

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

  // Aggregate per-user rows based on selected grouping. Branche/Admin users
  // are excluded from the table — only scout users count toward troupe stats.
  const scoutUsers = useMemo(
    () => users.filter((u) => u.role !== 'BRANCHE_ECLAIREURS' && u.role !== 'ADMIN'),
    [users]
  );

  const groupRows = useMemo(() => {
    const map = new Map();
    const troupeKeys = new Map(); // grouping key -> Set of distinct troupe identifiers
    for (const u of scoutUsers) {
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
          troupeCount: 0,
          photos: emptyBucket(),
          schematics: emptyBucket(),
        };
        map.set(key, entry);
        troupeKeys.set(key, new Set());
      }
      if (u.troupe) {
        troupeKeys.get(key).add(`${districtName}||${groupName}||${u.troupe}`);
      }
      entry.users += 1;
      if (u.total > 0) entry.uploaders += 1;
      entry.total += u.total;
      for (const k of ['total', 'toClassify', 'toApprove', 'approved', 'rejected']) {
        entry.photos[k] += u.photos?.[k] || 0;
        entry.schematics[k] += u.schematics?.[k] || 0;
      }
    }
    for (const [key, set] of troupeKeys) {
      map.get(key).troupeCount = set.size;
    }
    return Array.from(map.values());
  }, [scoutUsers, groupBy]);

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
    for (const u of scoutUsers) {
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
  }, [scoutUsers, districtFilter, search]);

  const exportCSV = () => {
    const showGroup = groupBy !== 'district';
    const showTroupe = groupBy === 'troupe';
    const headers = [
      'District',
      ...(showGroup ? ['Group'] : []),
      ...(showTroupe ? ['Troupe'] : []),
      'Users', 'Uploaders',
      'Total',
      'Photos', 'Photos Approved', 'Photos To Classify', 'Photos To Approve', 'Photos Rejected',
      'Schematics', 'Schematics Approved', 'Schematics To Approve', 'Schematics Rejected',
    ];
    const rows = filteredSorted.map((r) => [
      r.district,
      ...(showGroup ? [r.group] : []),
      ...(showTroupe ? [r.troupe] : []),
      r.users, r.uploaders,
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

  const columnDefs = useMemo(() => ({
    district: {
      label: 'District',
      sortKey: 'district',
      numeric: false,
      visible: true,
      render: (r) => <td>{r.district}</td>,
    },
    group: {
      label: 'Groupe',
      sortKey: 'group',
      numeric: false,
      visible: groupBy !== 'district',
      render: (r) => <td className="group-name-cell">{r.group}</td>,
    },
    troupe: {
      label: 'Troupe',
      sortKey: 'troupe',
      numeric: false,
      visible: groupBy === 'troupe',
      render: (r) => <td className="troupe-name-cell">{r.troupe}</td>,
    },
    users: {
      label: 'Utilisateurs',
      sortKey: 'users',
      numeric: true,
      visible: true,
      render: (r) => <td className="num-col">{r.users}</td>,
    },
    uploaders: {
      label: 'Uploaders',
      sortKey: 'uploaders',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          <span className={r.uploaders === 0 ? 'zero-count' : ''}>{r.uploaders}</span>
        </td>
      ),
    },
    total: {
      label: 'Total',
      sortKey: 'total',
      numeric: true,
      visible: true,
      render: (r) => <td className="num-col total-col">{r.total}</td>,
    },
    'photos.total': {
      label: 'Photos',
      sortKey: 'photos.total',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          <span className={r.photos.total === 0 ? 'zero-count' : ''}>{r.photos.total}</span>
        </td>
      ),
    },
    'photos.approved': {
      label: 'Approuvées',
      sortKey: 'photos.approved',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          <span className={r.photos.approved > 0 ? 'approved-count' : ''}>{r.photos.approved}</span>
        </td>
      ),
    },
    'photos.toClassify': {
      label: 'À classer',
      sortKey: 'photos.toClassify',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          {r.photos.toClassify > 0 && <span className="pending-count">{r.photos.toClassify}</span>}
        </td>
      ),
    },
    'photos.toApprove': {
      label: 'À approuver',
      sortKey: 'photos.toApprove',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          {r.photos.toApprove > 0 && <span className="pending-count">{r.photos.toApprove}</span>}
        </td>
      ),
    },
    'photos.rejected': {
      label: 'Rejetées',
      sortKey: 'photos.rejected',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          {r.photos.rejected > 0 && <span className="rejected-count">{r.photos.rejected}</span>}
        </td>
      ),
    },
    'schematics.total': {
      label: 'Schémas',
      sortKey: 'schematics.total',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          <span className={r.schematics.total === 0 ? 'zero-count' : ''}>{r.schematics.total}</span>
        </td>
      ),
    },
    'schematics.approved': {
      label: 'Approuvés',
      sortKey: 'schematics.approved',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          <span className={r.schematics.approved > 0 ? 'approved-count' : ''}>{r.schematics.approved}</span>
        </td>
      ),
    },
    'schematics.toApprove': {
      label: 'À approuver',
      sortKey: 'schematics.toApprove',
      numeric: true,
      visible: true,
      render: (r) => {
        const v = r.schematics.toClassify + r.schematics.toApprove;
        return (
          <td className="num-col">
            {v > 0 && <span className="pending-count">{v}</span>}
          </td>
        );
      },
    },
    'schematics.rejected': {
      label: 'Rejetés',
      sortKey: 'schematics.rejected',
      numeric: true,
      visible: true,
      render: (r) => (
        <td className="num-col">
          {r.schematics.rejected > 0 && <span className="rejected-count">{r.schematics.rejected}</span>}
        </td>
      ),
    },
  }), [groupBy]);

  const visibleColumns = useMemo(
    () => columnOrder.filter((id) => columnDefs[id]?.visible),
    [columnOrder, columnDefs]
  );

  const persistColumnOrder = (next) => {
    setColumnOrder(next);
    try {
      localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / privacy mode
    }
  };

  const handleColDragStart = (id) => (e) => {
    setDraggedColId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* some browsers */ }
  };

  const handleColDragOver = (id) => (e) => {
    if (draggedColId == null || draggedColId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== id) setDragOverColId(id);
  };

  const handleColDragLeave = (id) => () => {
    if (dragOverColId === id) setDragOverColId(null);
  };

  const handleColDrop = (targetId) => (e) => {
    e.preventDefault();
    if (!draggedColId || draggedColId === targetId) {
      setDraggedColId(null);
      setDragOverColId(null);
      return;
    }
    const next = [...columnOrder];
    const fromIdx = next.indexOf(draggedColId);
    const toIdx = next.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedColId(null);
      setDragOverColId(null);
      return;
    }
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggedColId);
    persistColumnOrder(next);
    setDraggedColId(null);
    setDragOverColId(null);
  };

  const handleColDragEnd = () => {
    setDraggedColId(null);
    setDragOverColId(null);
  };

  const resetColumnOrder = () => {
    persistColumnOrder(DEFAULT_COLUMN_ORDER);
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
                <div className="zero-label">Troupes with 0 uploads</div>
                <div className="zero-sublabel">Aucun upload</div>
              </div>
              <div className="zero-card">
                <div className="zero-value">{totals.zeroPhotos}</div>
                <div className="zero-label">0 photos</div>
                <div className="zero-sublabel">Aucune photo</div>
              </div>
              <div className="zero-card">
                <div className="zero-value">{totals.zeroSchematics}</div>
                <div className="zero-label">Troupes with 0 schémas</div>
                <div className="zero-sublabel">Aucun schéma</div>
              </div>
            </div>

            {/* Pictures by Category — paginated, 10 per page */}
            {categoryStats.length > 0 && (
              <div className="chart-section">
                <div className="section-header">
                  <h3>Photos par catégorie</h3>
                  <span className="section-subtitle">
                    {categoryStats.length} catégorie{categoryStats.length !== 1 ? 's' : ''}
                    {' · '}
                    {categoryStatusFilter === 'all' ? 'tous statuts' : categoryStatusFilter}
                  </span>
                </div>

                <div className="category-status-tabs">
                  {[
                    { key: 'all', label: 'Tous' },
                    { key: 'pending', label: 'En attente' },
                    { key: 'classified', label: 'Classés' },
                    { key: 'approved', label: 'Approuvés' },
                    { key: 'rejected', label: 'Rejetés' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`category-status-tab ${categoryStatusFilter === key ? 'active' : ''}`}
                      onClick={() => setCategoryStatusFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="category-chart">
                  {categoryPageItems.map((cat, index) => {
                    const barWidth = categoryTotal > 0 ? (cat.count / categoryTotal) * 100 : 0;
                    return (
                      <div key={`${cat.name}-${index}`} className="chart-bar-row">
                        <span className="chart-label" title={cat.name}>
                          {cat.name.length > 22 ? cat.name.substring(0, 22) + '…' : cat.name}
                        </span>
                        <div className="chart-bar-container">
                          <div className="chart-bar" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="chart-value">{cat.count}/{categoryTotal}</span>
                      </div>
                    );
                  })}
                </div>

                {categoryTotalPages > 1 && (
                  <div className="chart-pagination">
                    <button
                      type="button"
                      className="chart-page-btn"
                      onClick={() => setCategoryPage((p) => Math.max(1, p - 1))}
                      disabled={categoryPage === 1}
                      aria-label="Page précédente"
                    >
                      ←
                    </button>
                    <span className="chart-page-status">
                      Page <strong>{categoryPage}</strong> sur {categoryTotalPages}
                    </span>
                    <button
                      type="button"
                      className="chart-page-btn"
                      onClick={() => setCategoryPage((p) => Math.min(categoryTotalPages, p + 1))}
                      disabled={categoryPage === categoryTotalPages}
                      aria-label="Page suivante"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            )}

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
              <button
                type="button"
                className="btn-reset-columns"
                onClick={resetColumnOrder}
                title="Restaurer l'ordre par défaut des colonnes"
              >
                Reset columns
              </button>
            </div>

            <div className="data-table-wrapper">
              <table className="users-stats-table">
                <thead>
                  <tr>
                    {visibleColumns.map((id) => {
                      const col = columnDefs[id];
                      const classes = [
                        col.numeric ? 'num-col' : '',
                        'reorderable-col',
                        draggedColId === id ? 'col-dragging' : '',
                        dragOverColId === id ? 'col-drag-over' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <th
                          key={id}
                          className={classes}
                          draggable
                          onDragStart={handleColDragStart(id)}
                          onDragOver={handleColDragOver(id)}
                          onDragLeave={handleColDragLeave(id)}
                          onDrop={handleColDrop(id)}
                          onDragEnd={handleColDragEnd}
                          onClick={() => toggleSort(col.sortKey)}
                          title="Glisser pour réorganiser · Cliquer pour trier"
                        >
                          <span className="col-drag-handle" aria-hidden="true">⋮⋮</span>
                          {col.label} <SortIcon column={col.sortKey} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length} className="empty-row">
                        Aucun résultat trouvé
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((r) => {
                      // Tier threshold scales with grouping: per-troupe baseline
                      // comes from the admin-configured settings. When grouped
                      // by group/district, scale by troupe count × aggregation
                      // factor.
                      const troupeCount = r.troupeCount || 1;
                      const highBase = troupeCount > 1
                        ? tierConfig.high * troupeCount * tierConfig.factor
                        : tierConfig.high;
                      const midBase = troupeCount > 1
                        ? tierConfig.mid * troupeCount * tierConfig.factor
                        : tierConfig.mid;
                      const approvedTier =
                        r.photos.approved >= highBase ? 'tier-high' :
                        r.photos.approved >= midBase ? 'tier-mid' : '';
                      return (
                        <tr key={r.key} className={approvedTier}>
                          {visibleColumns.map((id) => (
                            <Fragment key={id}>{columnDefs[id].render(r)}</Fragment>
                          ))}
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
