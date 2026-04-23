import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { analyticsService } from '../services/api';
import './UsersStats.css';

const UsersStats = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
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
      setError(err.message || 'Failed to load user upload statistics');
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

  const filteredSorted = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!s) return true;
      return (
        u.name?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) ||
        u.troupe?.toLowerCase().includes(s) ||
        u.group?.toLowerCase().includes(s) ||
        u.district?.toLowerCase().includes(s)
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
  }, [users, search, roleFilter, sort]);

  const totals = useMemo(() => {
    return filteredSorted.reduce(
      (acc, u) => {
        acc.total += u.total;
        acc.photos += u.photos.total;
        acc.schematics += u.schematics.total;
        acc.approved += u.photos.approved + u.schematics.approved;
        acc.pending += u.photos.pending + u.photos.classified + u.schematics.pending + u.schematics.classified;
        if (u.total === 0) acc.zeroUploads += 1;
        if (u.photos.total === 0) acc.zeroPhotos += 1;
        if (u.schematics.total === 0) acc.zeroSchematics += 1;
        return acc;
      },
      { total: 0, photos: 0, schematics: 0, approved: 0, pending: 0, zeroUploads: 0, zeroPhotos: 0, zeroSchematics: 0 }
    );
  }, [filteredSorted]);

  const exportCSV = () => {
    const headers = [
      'Name', 'Email', 'Role', 'District', 'Group', 'Troupe',
      'Total', 'Photos', 'Photos Approved', 'Photos Pending',
      'Schematics', 'Schematics Approved', 'Schematics Pending',
    ];
    const rows = filteredSorted.map((u) => [
      u.name, u.email, u.role, u.district || '', u.group || '', u.troupe || '',
      u.total,
      u.photos.total, u.photos.approved, u.photos.pending + u.photos.classified,
      u.schematics.total, u.schematics.approved, u.schematics.pending + u.schematics.classified,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_uploads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role)) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Branche members and Admins can view user statistics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-stats-page">
      <div className="container">
        <div className="stats-header">
          <h2>Statistiques Utilisateurs</h2>
          <p>Uploads par utilisateur (photos et schémas)</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : (
          <>
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
                <span className="summary-label">Utilisateurs</span>
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
              <div className="filter-tabs">
                <button
                  className={`filter-tab ${roleFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('all')}
                >
                  Tous
                </button>
                <button
                  className={`filter-tab ${roleFilter === 'CHEF_TROUPE' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('CHEF_TROUPE')}
                >
                  Chefs Troupe
                </button>
                <button
                  className={`filter-tab ${roleFilter === 'BRANCHE_ECLAIREURS' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('BRANCHE_ECLAIREURS')}
                >
                  Branche
                </button>
                <button
                  className={`filter-tab ${roleFilter === 'ADMIN' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('ADMIN')}
                >
                  Admin
                </button>
              </div>
              <input
                type="search"
                className="stats-search"
                placeholder="Rechercher nom, email, troupe…"
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
                    <th onClick={() => toggleSort('name')}>
                      Nom <SortIcon column="name" />
                    </th>
                    <th onClick={() => toggleSort('role')}>
                      Rôle <SortIcon column="role" />
                    </th>
                    <th onClick={() => toggleSort('troupe')}>
                      Troupe <SortIcon column="troupe" />
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
                      <td colSpan={10} className="empty-row">
                        Aucun utilisateur trouvé
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((u) => {
                      const photoPending = u.photos.pending + u.photos.classified;
                      const schemPending = u.schematics.pending + u.schematics.classified;
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="user-cell">
                              <span className="user-name">{u.name}</span>
                              <span className="user-email">{u.email}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`role-badge role-${u.role.toLowerCase()}`}>
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            {u.troupe ? (
                              <div className="troupe-cell">
                                <span>{u.troupe}</span>
                                {u.group && <span className="troupe-sub">{u.group}</span>}
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="num-col total-col">{u.total}</td>
                          <td className="num-col">
                            <span className={u.photos.total === 0 ? 'zero-count' : ''}>
                              {u.photos.total}
                            </span>
                          </td>
                          <td className="num-col">
                            <span className={u.photos.approved > 0 ? 'approved-count' : ''}>
                              {u.photos.approved}
                            </span>
                          </td>
                          <td className="num-col">
                            {photoPending > 0 && <span className="pending-count">{photoPending}</span>}
                          </td>
                          <td className="num-col">
                            <span className={u.schematics.total === 0 ? 'zero-count' : ''}>
                              {u.schematics.total}
                            </span>
                          </td>
                          <td className="num-col">
                            <span className={u.schematics.approved > 0 ? 'approved-count' : ''}>
                              {u.schematics.approved}
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
