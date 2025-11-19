import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPictures: 0,
    totalCategories: 0,
    pendingReviews: 0,
    activeUsers: 0,
    brancheMembers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load users stats
      const usersResponse = await fetch('http://localhost:3001/api/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const users = await usersResponse.json();

      // Load pictures stats
      const picturesResponse = await fetch('http://localhost:3001/api/pictures?status=PENDING', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const picturesData = await picturesResponse.json();

      // Load categories
      const categoriesResponse = await fetch('http://localhost:3001/api/categories');
      const categories = await categoriesResponse.json();

      setStats({
        totalUsers: users.length,
        activeUsers: users.filter(u => u.isActive).length,
        brancheMembers: users.filter(u => u.role === 'BRANCHE_ECLAIREURS').length,
        totalPictures: picturesData.pagination?.total || 0,
        totalCategories: categories.length,
        pendingReviews: picturesData.pagination?.total || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
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

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon users">👥</div>
            <div className="stat-content">
              <h3>{stats.totalUsers}</h3>
              <p>Total Users</p>
              <span className="stat-detail">{stats.activeUsers} active</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon branche">🔐</div>
            <div className="stat-content">
              <h3>{stats.brancheMembers}</h3>
              <p>Branche Members</p>
              <span className="stat-detail">District access control</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon categories">📁</div>
            <div className="stat-content">
              <h3>{stats.totalCategories}</h3>
              <p>Categories</p>
              <span className="stat-detail">Installation & Schematics</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon pending">⏳</div>
            <div className="stat-content">
              <h3>{stats.pendingReviews}</h3>
              <p>Pending Reviews</p>
              <span className="stat-detail">Awaiting classification</span>
            </div>
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
          </div>
        </div>

        {/* System Info */}
        <div className="system-info">
          <h2>System Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Platform Version:</span>
              <span className="info-value">1.0.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">Environment:</span>
              <span className="info-value">Development</span>
            </div>
            <div className="info-item">
              <span className="info-label">Admin Role:</span>
              <span className="info-value">{user?.role}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
