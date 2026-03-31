import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Dashboard stats from new endpoint
  const [userStats, setUserStats] = useState(null);
  const [troupeStats, setTroupeStats] = useState([]);

  // Picture stats (kept separate — uses existing endpoints)
  const [pictureStats, setPictureStats] = useState({
    total: 0, pending: 0, classified: 0, approved: 0, rejected: 0,
  });
  const [categoryStats, setCategoryStats] = useState([]);

  // Troupe table state
  const [troupeSort, setTroupeSort] = useState({ key: 'district', dir: 'asc' });
  const [troupeFilter, setTroupeFilter] = useState('all'); // 'all', 'zero', 'active'

  // Never-logged-in table state
  const [showNeverLoggedIn, setShowNeverLoggedIn] = useState(false);
  const [neverLoggedInSort, setNeverLoggedInSort] = useState({ key: 'createdAt', dir: 'desc' });

  // Maintenance state (preserved from original)
  const [pictureSyncData, setPictureSyncData] = useState(null);
  const [syncingPictures, setSyncingPictures] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [typeSyncData, setTypeSyncData] = useState(null);
  const [syncingTypes, setSyncingTypes] = useState(false);
  const [typeSyncResult, setTypeSyncResult] = useState(null);
  const [debugData, setDebugData] = useState(null);

  useEffect(() => {
    loadAllStats();
  }, []);

  const loadAllStats = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load all data in parallel
      const [dashboardRes, pendingRes, classifiedRes, approvedRes, rejectedRes, categoriesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/dashboard-stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/pictures?status=PENDING&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/pictures?status=CLASSIFIED&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/pictures?status=APPROVED&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/pictures?status=REJECTED&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/categories`),
      ]);

      const [dashboardData, pendingData, classifiedData, approvedData, rejectedData, categories] = await Promise.all([
        dashboardRes.json(),
        pendingRes.json(),
        classifiedRes.json(),
        approvedRes.json(),
        rejectedRes.json(),
        categoriesRes.json(),
      ]);

      setUserStats(dashboardData.userStats);
      setTroupeStats(dashboardData.troupeStats);

      const pending = pendingData.pagination?.total || 0;
      const classified = classifiedData.pagination?.total || 0;
      const approved = approvedData.pagination?.total || 0;
      const rejected = rejectedData.pagination?.total || 0;

      setPictureStats({
        total: pending + classified + approved + rejected,
        pending, classified, approved, rejected,
      });

      // Load categories with picture counts
      const categoryPictureCounts = await Promise.all(
        categories.slice(0, 10).map(async (cat) => {
          const res = await fetch(`${API_URL}/api/pictures?categoryId=${cat.id}&status=APPROVED&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.json();
          return { name: cat.name, count: data.pagination?.total || 0 };
        })
      );

      setCategoryStats(categoryPictureCounts.sort((a, b) => b.count - a.count));
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sorting helpers
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((o, key) => o?.[key], obj);
  };

  const sortData = (data, sort) => {
    return [...data].sort((a, b) => {
      let aVal = getNestedValue(a, sort.key);
      let bVal = getNestedValue(b, sort.key);
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sort.dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const toggleSort = (setter, current, key) => {
    setter({
      key,
      dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc',
    });
  };

  const SortIcon = ({ sortState, column }) => {
    if (sortState.key !== column) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortState.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Export troupe stats to CSV (uses currently filtered & sorted data)
  const exportTroupeCSV = () => {
    const headers = ['District', 'Group', 'Troupe', 'Users', 'Photos', 'Photos Approved', 'Photos Pending', 'Schematics', 'Schematics Approved'];
    const rows = sortedTroupes.map(t => [
      t.district, t.group, t.name, t.users,
      t.photos.total, t.photos.approved, t.photos.pending + t.photos.classified,
      t.schematics.total, t.schematics.approved,
    ]);
    const csvContent = [headers, ...rows].map(row =>
      row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `troupe_stats_${troupeFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered and sorted troupe data
  const filteredTroupes = troupeStats.filter(t => {
    if (troupeFilter === 'zero') return t.photos.total === 0 && t.schematics.total === 0;
    if (troupeFilter === 'active') return t.photos.total > 0 || t.schematics.total > 0;
    return true;
  });
  const sortedTroupes = sortData(filteredTroupes, troupeSort);

  // Sorted never-logged-in users
  const sortedNeverLoggedIn = userStats ? sortData(userStats.neverLoggedIn, neverLoggedInSort) : [];

  // Calculate max for bar chart scaling
  const maxCategoryCount = Math.max(...categoryStats.map(c => c.count), 1);

  // Troupe summary
  const zeroUploadTroupes = troupeStats.filter(t => t.photos.total === 0 && t.schematics.total === 0).length;

  // --- Maintenance functions (preserved) ---
  const checkPictureSync = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/analytics/sync-picture-categories`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setPictureSyncData(data);
      setSyncResult(null);
    } catch (error) {
      console.error('Failed to check picture sync:', error);
    }
  };

  const syncPictureCategories = async () => {
    try {
      setSyncingPictures(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/analytics/sync-picture-categories`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setSyncResult(data);
      setPictureSyncData({ totalPictures: 0, sets: [] });
      loadAllStats();
    } catch (error) {
      console.error('Failed to sync picture categories:', error);
      setSyncResult({ error: 'Failed to sync picture categories' });
    } finally {
      setSyncingPictures(false);
    }
  };

  const checkTypeSync = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/analytics/sync-picture-types`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setTypeSyncData(data);
      setTypeSyncResult(null);
    } catch (error) {
      console.error('Failed to check type sync:', error);
    }
  };

  const syncPictureTypes = async () => {
    try {
      setSyncingTypes(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/analytics/sync-picture-types`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setTypeSyncResult(data);
      setTypeSyncData({ totalPictures: 0, sets: [] });
      loadAllStats();
    } catch (error) {
      console.error('Failed to sync picture types:', error);
      setTypeSyncResult({ error: 'Failed to sync picture types' });
    } finally {
      setSyncingTypes(false);
    }
  };

  const debugPictureTypes = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/analytics/picture-type-debug`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error('Failed to get debug data:', error);
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="container loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        <div className="dashboard-header">
          <h1>Admin Dashboard</h1>
          <p>Welcome back, {user?.name}! Manage your Nodus platform from here.</p>
        </div>

        {/* Picture Stats Section */}
        <div className="section-header">
          <h2>Pictures Overview</h2>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">🖼️</div>
            <div className="stat-content">
              <h3>{pictureStats.total}</h3>
              <p>Total Pictures</p>
              <span className="stat-detail">All submissions</span>
            </div>
          </div>

          <Link to="/review" className="stat-card clickable pending-card">
            <div className="stat-icon pending">⏳</div>
            <div className="stat-content">
              <h3>{pictureStats.pending + pictureStats.classified}</h3>
              <p>Under Review</p>
              <span className="stat-detail">{pictureStats.pending} pending, {pictureStats.classified} classified</span>
            </div>
          </Link>

          <div className="stat-card approved-card">
            <div className="stat-icon approved">✅</div>
            <div className="stat-content">
              <h3>{pictureStats.approved}</h3>
              <p>Approved</p>
              <span className="stat-detail">Publicly visible</span>
            </div>
          </div>

          <div className="stat-card rejected-card">
            <div className="stat-icon rejected">❌</div>
            <div className="stat-content">
              <h3>{pictureStats.rejected}</h3>
              <p>Rejected</p>
              <span className="stat-detail">Not approved</span>
            </div>
          </div>
        </div>

        {/* Category Chart Section */}
        <div className="chart-section">
          <div className="section-header">
            <h2>Pictures by Category</h2>
            <span className="section-subtitle">Top 10 categories by approved pictures</span>
          </div>
          <div className="category-chart">
            {categoryStats.length === 0 ? (
              <p className="no-data">No category data available</p>
            ) : (
              categoryStats.map((cat, index) => (
                <div key={index} className="chart-bar-row">
                  <span className="chart-label" title={cat.name}>
                    {cat.name.length > 20 ? cat.name.substring(0, 20) + '...' : cat.name}
                  </span>
                  <div className="chart-bar-container">
                    <div
                      className="chart-bar"
                      style={{ width: `${(cat.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                  <span className="chart-value">{cat.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Users Stats Section */}
        <div className="section-header">
          <h2>Users Overview</h2>
        </div>
        <div className="stats-grid">
          <Link to="/admin/users" className="stat-card clickable">
            <div className="stat-icon users">👥</div>
            <div className="stat-content">
              <h3>{userStats?.total || 0}</h3>
              <p>Total Users</p>
              <span className="stat-detail">{userStats?.active || 0} active</span>
            </div>
          </Link>

          <Link to="/admin/users?role=CHEF_TROUPE" className="stat-card clickable">
            <div className="stat-icon ct">🏕️</div>
            <div className="stat-content">
              <h3>{userStats?.byRole?.CHEF_TROUPE || 0}</h3>
              <p>Chef Troupes</p>
              <span className="stat-detail">Troupe leaders</span>
            </div>
          </Link>

          <Link to="/admin/users?role=BRANCHE_ECLAIREURS" className="stat-card clickable">
            <div className="stat-icon branche">🔐</div>
            <div className="stat-content">
              <h3>{userStats?.byRole?.BRANCHE_ECLAIREURS || 0}</h3>
              <p>Branche Members</p>
              <span className="stat-detail">District access control</span>
            </div>
          </Link>

          <div
            className={`stat-card clickable ${userStats?.neverLoggedIn?.length > 0 ? 'warning-card' : ''}`}
            onClick={() => setShowNeverLoggedIn(!showNeverLoggedIn)}
          >
            <div className="stat-icon never-logged">⚠️</div>
            <div className="stat-content">
              <h3>{userStats?.neverLoggedIn?.length || 0}</h3>
              <p>Never Logged In</p>
              <span className="stat-detail">Click to {showNeverLoggedIn ? 'hide' : 'show'} details</span>
            </div>
          </div>
        </div>

        {/* Never Logged In Table */}
        {showNeverLoggedIn && userStats?.neverLoggedIn?.length > 0 && (
          <div className="data-table-section">
            <div className="section-header">
              <h2>Users Who Never Logged In</h2>
              <span className="section-subtitle">{userStats.neverLoggedIn.length} users have never signed in</span>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'name')}>
                      Name <SortIcon sortState={neverLoggedInSort} column="name" />
                    </th>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'email')}>
                      Email <SortIcon sortState={neverLoggedInSort} column="email" />
                    </th>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'role')}>
                      Role <SortIcon sortState={neverLoggedInSort} column="role" />
                    </th>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'district')}>
                      District <SortIcon sortState={neverLoggedInSort} column="district" />
                    </th>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'group')}>
                      Group <SortIcon sortState={neverLoggedInSort} column="group" />
                    </th>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'troupe')}>
                      Troupe <SortIcon sortState={neverLoggedInSort} column="troupe" />
                    </th>
                    <th onClick={() => toggleSort(setNeverLoggedInSort, neverLoggedInSort, 'createdAt')}>
                      Created <SortIcon sortState={neverLoggedInSort} column="createdAt" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedNeverLoggedIn.map(u => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td className="email-cell">{u.email}</td>
                      <td><span className={`role-badge role-${u.role.toLowerCase()}`}>{u.role.replace('_', ' ')}</span></td>
                      <td>{u.district || '-'}</td>
                      <td>{u.group || '-'}</td>
                      <td>{u.troupe || '-'}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Troupe Stats Section */}
        <div className="data-table-section">
          <div className="section-header">
            <h2>Troupe Statistics</h2>
            <span className="section-subtitle">
              {troupeStats.length} troupes total
              {zeroUploadTroupes > 0 && (
                <> &mdash; <strong className="warning-text">{zeroUploadTroupes} with zero uploads</strong></>
              )}
            </span>
          </div>

          <div className="table-toolbar">
            <div className="filter-tabs">
              <button
                className={`filter-tab ${troupeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTroupeFilter('all')}
              >
                All ({troupeStats.length})
              </button>
              <button
                className={`filter-tab warning ${troupeFilter === 'zero' ? 'active' : ''}`}
                onClick={() => setTroupeFilter('zero')}
              >
                Zero Uploads ({zeroUploadTroupes})
              </button>
              <button
                className={`filter-tab ${troupeFilter === 'active' ? 'active' : ''}`}
                onClick={() => setTroupeFilter('active')}
              >
                Active ({troupeStats.length - zeroUploadTroupes})
              </button>
            </div>
            <button className="btn-export-csv" onClick={exportTroupeCSV}>
              Export CSV
            </button>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table troupe-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'district')}>
                    District <SortIcon sortState={troupeSort} column="district" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'group')}>
                    Group <SortIcon sortState={troupeSort} column="group" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'name')}>
                    Troupe <SortIcon sortState={troupeSort} column="name" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'users')} className="num-col">
                    Users <SortIcon sortState={troupeSort} column="users" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'photos.total')} className="num-col">
                    Photos <SortIcon sortState={troupeSort} column="photos.total" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'photos.approved')} className="num-col">
                    Approved <SortIcon sortState={troupeSort} column="photos.approved" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'photos.pending')} className="num-col">
                    Pending <SortIcon sortState={troupeSort} column="photos.pending" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'schematics.total')} className="num-col">
                    Schematics <SortIcon sortState={troupeSort} column="schematics.total" />
                  </th>
                  <th onClick={() => toggleSort(setTroupeSort, troupeSort, 'schematics.approved')} className="num-col">
                    S. Approved <SortIcon sortState={troupeSort} column="schematics.approved" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTroupes.map(t => {
                  const isZero = t.photos.total === 0 && t.schematics.total === 0;
                  return (
                    <tr key={t.id} className={isZero ? 'row-zero' : ''}>
                      <td>{t.district}</td>
                      <td>{t.group}</td>
                      <td className="troupe-name">{t.name}</td>
                      <td className="num-col">{t.users}</td>
                      <td className="num-col">
                        <span className={t.photos.total === 0 ? 'zero-count' : ''}>{t.photos.total}</span>
                      </td>
                      <td className="num-col">
                        <span className={t.photos.approved > 0 ? 'approved-count' : ''}>{t.photos.approved}</span>
                      </td>
                      <td className="num-col">
                        {t.photos.pending + t.photos.classified > 0 && (
                          <span className="pending-count">{t.photos.pending + t.photos.classified}</span>
                        )}
                      </td>
                      <td className="num-col">
                        <span className={t.schematics.total === 0 ? 'zero-count' : ''}>{t.schematics.total}</span>
                      </td>
                      <td className="num-col">
                        <span className={t.schematics.approved > 0 ? 'approved-count' : ''}>{t.schematics.approved}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            <Link to="/admin/users" className="action-card">
              <span className="action-icon">👥</span>
              <h3>Manage Users</h3>
              <p>Create, edit, and manage user accounts</p>
            </Link>

            <Link to="/admin/roles" className="action-card">
              <span className="action-icon">🔐</span>
              <h3>District Access</h3>
              <p>Assign districts to Branche members</p>
            </Link>

            <Link to="/admin/categories" className="action-card">
              <span className="action-icon">📁</span>
              <h3>Categories</h3>
              <p>Manage categories and monthly scheduling</p>
            </Link>

            <Link to="/admin/organizations" className="action-card">
              <span className="action-icon">🏢</span>
              <h3>Organizations</h3>
              <p>Manage districts, groups, and troupes</p>
            </Link>

            <Link to="/admin/pictures" className="action-card">
              <span className="action-icon">🖼️</span>
              <h3>Pictures</h3>
              <p>View and delete picture sets</p>
            </Link>
          </div>
        </div>

        {/* Maintenance Section */}
        <div className="maintenance-section">
          <div className="section-header">
            <h2>Maintenance</h2>
            <span className="section-subtitle">Database maintenance tools</span>
          </div>
          <div className="maintenance-card">
            <div className="maintenance-item">
              <div className="maintenance-info">
                <h3>Sync Picture Categories</h3>
                <p>
                  Some pictures may be missing their category assignment. This tool ensures
                  all pictures have their category properly set for filtering in the Browse page.
                </p>
                {pictureSyncData && (
                  <div className="fix-status">
                    {pictureSyncData.totalPictures === 0 ? (
                      <span className="status-ok">All pictures are synced</span>
                    ) : (
                      <span className="status-warning">
                        {pictureSyncData.totalPictures} picture(s) in {pictureSyncData.sets?.length || 0} set(s) need syncing
                      </span>
                    )}
                    {pictureSyncData.sets && pictureSyncData.sets.length > 0 && (
                      <ul className="fix-list">
                        {pictureSyncData.sets.slice(0, 10).map(set => (
                          <li key={set.id}>
                            #{set.id} "{set.title}" → {set.categoryName} ({set.pictureCount} pictures)
                          </li>
                        ))}
                        {pictureSyncData.sets.length > 10 && (
                          <li>... and {pictureSyncData.sets.length - 10} more sets</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {syncResult && (
                  <div className={`fix-result ${syncResult.error ? 'error' : 'success'}`}>
                    {syncResult.error || syncResult.message}
                  </div>
                )}
              </div>
              <div className="maintenance-actions">
                <button
                  className="btn-secondary"
                  onClick={checkPictureSync}
                  disabled={syncingPictures}
                >
                  Check
                </button>
                {pictureSyncData && pictureSyncData.totalPictures > 0 && (
                  <button
                    className="btn-primary"
                    onClick={syncPictureCategories}
                    disabled={syncingPictures}
                  >
                    {syncingPictures ? 'Syncing...' : 'Sync Now'}
                  </button>
                )}
              </div>
            </div>

            {/* Type Sync Tool */}
            <div className="maintenance-item">
              <div className="maintenance-info">
                <h3>Sync Picture Types</h3>
                <p>
                  Some pictures may be missing their type (Photo/Schematic). This tool copies
                  the type from each picture's set to ensure proper filtering in the Browse page.
                </p>
                {typeSyncData && (
                  <div className="fix-status">
                    {typeSyncData.totalPictures === 0 ? (
                      <span className="status-ok">All picture types are synced</span>
                    ) : (
                      <span className="status-warning">
                        {typeSyncData.totalPictures} picture(s) in {typeSyncData.sets?.length || 0} set(s) need type sync
                      </span>
                    )}
                    {typeSyncData.sets && typeSyncData.sets.length > 0 && (
                      <ul className="fix-list">
                        {typeSyncData.sets.slice(0, 10).map(set => (
                          <li key={set.id}>
                            #{set.id} "{set.title}" → {set.type === 'SCHEMATIC' ? '📐 Schematic' : '📸 Photo'} ({set.pictureCount} pictures)
                          </li>
                        ))}
                        {typeSyncData.sets.length > 10 && (
                          <li>... and {typeSyncData.sets.length - 10} more sets</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {typeSyncResult && (
                  <div className={`fix-result ${typeSyncResult.error ? 'error' : 'success'}`}>
                    {typeSyncResult.error || typeSyncResult.message}
                  </div>
                )}
              </div>
              <div className="maintenance-actions">
                <button
                  className="btn-secondary"
                  onClick={checkTypeSync}
                  disabled={syncingTypes}
                >
                  Check
                </button>
                {typeSyncData && typeSyncData.totalPictures > 0 && (
                  <button
                    className="btn-primary"
                    onClick={syncPictureTypes}
                    disabled={syncingTypes}
                  >
                    {syncingTypes ? 'Syncing...' : 'Sync Now'}
                  </button>
                )}
              </div>
            </div>

            {/* Debug Tool */}
            <div className="maintenance-item">
              <div className="maintenance-info">
                <h3>Debug Picture Data</h3>
                <p>
                  Check actual picture type and category values in the database.
                </p>
                {debugData && (
                  <div className="fix-status">
                    <pre style={{
                      background: '#1a1a1a',
                      padding: '12px',
                      borderRadius: '8px',
                      overflow: 'auto',
                      maxHeight: '400px',
                      fontSize: '12px'
                    }}>
                      {JSON.stringify(debugData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              <div className="maintenance-actions">
                <button
                  className="btn-secondary"
                  onClick={debugPictureTypes}
                >
                  Debug
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
