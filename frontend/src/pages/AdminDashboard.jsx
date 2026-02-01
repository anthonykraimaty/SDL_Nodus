import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    brancheMembers: 0,
  });
  const [pictureStats, setPictureStats] = useState({
    total: 0,
    pending: 0,
    classified: 0,
    approved: 0,
    rejected: 0,
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pictureSyncData, setPictureSyncData] = useState(null);
  const [syncingPictures, setSyncingPictures] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [typeSyncData, setTypeSyncData] = useState(null);
  const [syncingTypes, setSyncingTypes] = useState(false);
  const [typeSyncResult, setTypeSyncResult] = useState(null);
  const [debugData, setDebugData] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load users stats
      const usersResponse = await fetch(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const users = await usersResponse.json();

      setStats({
        totalUsers: users.length,
        activeUsers: users.filter(u => u.isActive).length,
        brancheMembers: users.filter(u => u.role === 'BRANCHE_ECLAIREURS').length,
      });

      // Load all pictures to get counts by status
      const [pendingRes, classifiedRes, approvedRes, rejectedRes] = await Promise.all([
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
      ]);

      const [pendingData, classifiedData, approvedData, rejectedData] = await Promise.all([
        pendingRes.json(),
        classifiedRes.json(),
        approvedRes.json(),
        rejectedRes.json(),
      ]);

      const pending = pendingData.pagination?.total || 0;
      const classified = classifiedData.pagination?.total || 0;
      const approved = approvedData.pagination?.total || 0;
      const rejected = rejectedData.pagination?.total || 0;

      setPictureStats({
        total: pending + classified + approved + rejected,
        pending,
        classified,
        approved,
        rejected,
      });

      // Load categories with picture counts
      const categoriesResponse = await fetch(`${API_URL}/api/categories`);
      const categories = await categoriesResponse.json();

      // Load pictures per category
      const categoryPictureCounts = await Promise.all(
        categories.slice(0, 10).map(async (cat) => {
          const res = await fetch(`${API_URL}/api/pictures?categoryId=${cat.id}&status=APPROVED&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.json();
          return {
            name: cat.name,
            count: data.pagination?.total || 0,
          };
        })
      );

      // Sort by count and take top categories
      setCategoryStats(categoryPictureCounts.sort((a, b) => b.count - a.count));
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate max for bar chart scaling
  const maxCategoryCount = Math.max(...categoryStats.map(c => c.count), 1);

  // Check for pictures needing category sync from their set
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

  // Sync picture categories from their sets
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
      loadStats();
    } catch (error) {
      console.error('Failed to sync picture categories:', error);
      setSyncResult({ error: 'Failed to sync picture categories' });
    } finally {
      setSyncingPictures(false);
    }
  };

  // Check for pictures needing type sync from their set
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

  // Sync picture types from their sets
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
      loadStats();
    } catch (error) {
      console.error('Failed to sync picture types:', error);
      setTypeSyncResult({ error: 'Failed to sync picture types' });
    } finally {
      setSyncingTypes(false);
    }
  };

  // Debug picture types
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
        <div className="stats-grid stats-grid-3">
          <Link to="/admin/users" className="stat-card clickable">
            <div className="stat-icon users">👥</div>
            <div className="stat-content">
              <h3>{stats.totalUsers}</h3>
              <p>Total Users</p>
              <span className="stat-detail">{stats.activeUsers} active</span>
            </div>
          </Link>

          <Link to="/admin/users?role=BRANCHE_ECLAIREURS" className="stat-card clickable">
            <div className="stat-icon branche">🔐</div>
            <div className="stat-content">
              <h3>{stats.brancheMembers}</h3>
              <p>Branche Members</p>
              <span className="stat-detail">District access control</span>
            </div>
          </Link>

          <Link to="/admin/users?role=CHEF_TROUPE" className="stat-card clickable">
            <div className="stat-icon ct">🏕️</div>
            <div className="stat-content">
              <h3>{stats.totalUsers - stats.brancheMembers - 1}</h3>
              <p>Chef Troupes</p>
              <span className="stat-detail">Troupe leaders</span>
            </div>
          </Link>
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
