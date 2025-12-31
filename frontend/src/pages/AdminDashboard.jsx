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
      </div>
    </div>
  );
};

export default AdminDashboard;
