import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, schematicService, analyticsService } from '../services/api';
import { getImageUrl, API_URL } from '../config/api';
import Modal from '../components/Modal';
import { ToastContainer, useToast } from '../components/Toast';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pictures, setPictures] = useState([]);
  const [allPictures, setAllPictures] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    classified: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [schematicStats, setSchematicStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');

      // For Chef Troupe, show their own pictures
      if (user?.role === 'CHEF_TROUPE') {
        const data = await pictureService.getAll({ limit: 50 });
        const userPictures = data.pictures.filter(p => p.uploadedBy?.id === user.id);
        setAllPictures(userPictures);
        setPictures(userPictures);

        const pending = userPictures.filter(p => p.status === 'PENDING').length;
        const classified = userPictures.filter(p => p.status === 'CLASSIFIED').length;
        const approved = userPictures.filter(p => p.status === 'APPROVED').length;
        const rejected = userPictures.filter(p => p.status === 'REJECTED').length;

        setStats({
          total: pending + classified + approved + rejected,
          pending,
          classified,
          approved,
          rejected,
        });
      }

      // For Branche, show pictures needing review with detailed stats
      if (user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') {
        const data = await pictureService.getAll({ limit: 50 });
        setAllPictures(data.pictures);
        setPictures(data.pictures);

        // Get accurate counts from API
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

        setStats({
          total: pending + classified + approved + rejected,
          pending,
          classified,
          approved,
          rejected,
        });

        // Load category stats for Branche users
        try {
          const catData = await analyticsService.getPicturesByCategory();
          setCategoryStats(catData.categories || []);
        } catch (err) {
          console.error('Failed to load category stats:', err);
        }
      }

      // Load schematic stats for all authenticated users
      try {
        const schematicData = await schematicService.getStats();
        setSchematicStats(schematicData);
      } catch (err) {
        console.error('Failed to load schematic stats:', err);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryStats = async (status) => {
    if (user?.role !== 'BRANCHE_ECLAIREURS' && user?.role !== 'ADMIN') return;
    try {
      const params = {};
      if (status && status !== 'all') params.status = status.toUpperCase();
      const catData = await analyticsService.getPicturesByCategory(params);
      setCategoryStats(catData.categories || []);
    } catch (err) {
      console.error('Failed to load category stats:', err);
    }
  };

  const filterByStatus = (status) => {
    setActiveFilter(status);
    if (status === 'all') {
      setPictures(allPictures);
    } else {
      setPictures(allPictures.filter(p => p.status === status.toUpperCase()));
    }
    loadCategoryStats(status);
  };

  // Check if user can delete a picture set
  const canDelete = (picture) => {
    if (!user) return false;
    const isOwner = picture.uploadedBy?.id === user.id;
    const isAdmin = user.role === 'ADMIN';
    const isApproved = picture.status === 'APPROVED';

    // Admin can delete anything
    if (isAdmin) return true;
    // Owner can delete non-approved
    if (isOwner && !isApproved) return true;
    return false;
  };

  const handleDelete = async (pictureId) => {
    try {
      setDeleting(true);
      await pictureService.delete(pictureId);
      setDeleteConfirm(null);
      // Reload dashboard data
      await loadDashboardData();
    } catch (err) {
      console.error('Failed to delete picture set:', err);
      addToast(err.error || 'Failed to delete picture set', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="container">
        <div className="dashboard-header">
          <div>
            <h2>Dashboard</h2>
            <p className="text-muted">
              Welcome back, {user?.name}
            </p>
          </div>
        </div>

        {/* Quick Actions - Pictures */}
        <div className="quick-actions">
          {user?.role === 'CHEF_TROUPE' && (
            <Link to="/upload" className="action-card upload-action">
              <div className="action-icon">📤</div>
              <div className="action-content">
                <h3>Upload Pictures</h3>
                <p>Add new installation photos</p>
              </div>
            </Link>
          )}
          {(user?.role === 'CHEF_TROUPE' || user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') && (
            <Link to="/classify" className="action-card classify-action">
              <div className="action-icon">🏷️</div>
              <div className="action-content">
                <h3>Classify Pictures</h3>
                <p>Add categories and details to pending pictures</p>
              </div>
            </Link>
          )}
          {(user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') && (
            <Link to="/review" className="action-card review-action">
              <div className="action-icon">✅</div>
              <div className="action-content">
                <h3>Review Queue</h3>
                <p>Approve or reject classified pictures</p>
              </div>
            </Link>
          )}
        </div>

        {/* Separator */}
        <div className="quick-actions-separator"></div>

        {/* Quick Actions - Schematics */}
        <div className="quick-actions">
          {user?.role === 'CHEF_TROUPE' && (
            <Link to="/schematics/upload" className="action-card schematic-action">
              <div className="action-icon">📐</div>
              <div className="action-content">
                <h3>Upload Schematic</h3>
                <p>Add patrouille hand-drawn schematics</p>
              </div>
            </Link>
          )}
          <Link to="/schematics/progress" className="action-card progress-action">
            <div className="action-icon">📊</div>
            <div className="action-content">
              <h3>Schematic Progress</h3>
              <p>Track patrouille completion</p>
            </div>
          </Link>
          {(user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') && (
            <Link to="/schematics/review" className="action-card schematic-review-action">
              <div className="action-icon">📋</div>
              <div className="action-content">
                <h3>Review Schematics</h3>
                <p>{schematicStats.pending} pending approval</p>
              </div>
            </Link>
          )}
        </div>

        {/* Stats Cards */}
        <div className="stats-grid stats-grid-5">
          <div
            className={`stat-card ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => filterByStatus('all')}
          >
            <div className="stat-icon total">🖼️</div>
            <div className="stat-info">
              <h3>{stats.total}</h3>
              <p>Total</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'pending' ? 'active' : ''}`}
            onClick={() => filterByStatus('pending')}
          >
            <div className="stat-icon pending">⏳</div>
            <div className="stat-info">
              <h3>{stats.pending}</h3>
              <p>Pending</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'classified' ? 'active' : ''}`}
            onClick={() => filterByStatus('classified')}
          >
            <div className="stat-icon classified">📝</div>
            <div className="stat-info">
              <h3>{stats.classified}</h3>
              <p>Classified</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'approved' ? 'active' : ''}`}
            onClick={() => filterByStatus('approved')}
          >
            <div className="stat-icon approved">✅</div>
            <div className="stat-info">
              <h3>{stats.approved}</h3>
              <p>Approved</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'rejected' ? 'active' : ''}`}
            onClick={() => filterByStatus('rejected')}
          >
            <div className="stat-icon rejected">❌</div>
            <div className="stat-info">
              <h3>{stats.rejected}</h3>
              <p>Rejected</p>
            </div>
          </div>
        </div>

        {/* Category Chart - Only for Branche users */}
        {(user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') && categoryStats.length > 0 && (
          <div className="chart-section">
            <div className="section-header">
              <h3>Pictures by Category</h3>
              <span className="section-subtitle">Top categories by {activeFilter === 'all' ? 'all' : activeFilter} pictures</span>
            </div>
            <div className="category-chart">
              {categoryStats.map((cat, index) => {
                const maxCount = Math.max(...categoryStats.map(c => c.count), 1);
                return (
                  <div key={index} className="chart-bar-row">
                    <span className="chart-label" title={cat.name}>
                      {cat.name.length > 18 ? cat.name.substring(0, 18) + '...' : cat.name}
                    </span>
                    <div className="chart-bar-container">
                      <div
                        className="chart-bar"
                        style={{ width: `${(cat.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="chart-value">{cat.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Pictures */}
        <div className="recent-pictures">
          <div className="pictures-header">
            <h3>
              {user?.role === 'CHEF_TROUPE' ? 'Your Pictures' : 'Recent Submissions'}
              {activeFilter !== 'all' && ` - ${activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}`}
            </h3>
            {activeFilter !== 'all' && (
              <button onClick={() => filterByStatus('all')} className="btn-clear-filter">
                Show All
              </button>
            )}
          </div>

          {pictures.length === 0 ? (
            <div className="empty-state">
              <p>No pictures yet</p>
              {user?.role === 'CHEF_TROUPE' && (
                <Link to="/upload" className="primary">
                  Upload Your First Picture
                </Link>
              )}
            </div>
          ) : (
            <div className="pictures-grid-container">
              {pictures.slice(0, 10).map((picture) => (
                <div key={picture.id} className="picture-card">
                  <div className="picture-card-image">
                    <div className="picture-thumbnails-grid">
                      {picture.pictures?.slice(0, 6).map((pic, index) => (
                        <div key={pic.id} className="thumbnail-item">
                          <img
                            src={getImageUrl(pic.filePath)}
                            alt={`${picture.title} - ${index + 1}`}
                          />
                        </div>
                      ))}
                      {/* Fill empty slots if less than 6 pictures */}
                      {picture.pictures?.length < 6 &&
                        Array.from({ length: Math.min(6, 6 - (picture.pictures?.length || 0)) }).map((_, i) => (
                          <div key={`empty-${i}`} className="thumbnail-item empty"></div>
                        ))
                      }
                    </div>
                    <div className="picture-card-type">
                      {picture.type === 'INSTALLATION_PHOTO' ? '📸' : '📐'}
                    </div>
                    {picture.pictures?.length > 6 && (
                      <div className="picture-card-more">+{picture.pictures.length - 6}</div>
                    )}
                  </div>
                  <div className="picture-card-content">
                    <h4 className="picture-card-title">{picture.title}</h4>
                    <div className="picture-card-meta">
                      <span className={`status-badge ${picture.status.toLowerCase()}`}>
                        {picture.status}
                      </span>
                      <span className="picture-card-date">
                        {new Date(picture.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="picture-card-actions">
                      <Link to={`/picture/${picture.id}`} className="btn-view-card">
                        View Details
                      </Link>
                      {canDelete(picture) && (
                        <button
                          className="btn-delete-card"
                          onClick={() => setDeleteConfirm(picture)}
                          title="Delete picture set"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Picture Set?"
          variant="danger"
        >
          <Modal.Body>
            {deleteConfirm && (
              <>
                <p>
                  Are you sure you want to delete "<strong>{deleteConfirm.title}</strong>"?
                  This will permanently delete all {deleteConfirm.pictures?.length || 0} pictures.
                </p>
                <p className="warning-text">This action cannot be undone.</p>
              </>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={() => handleDelete(deleteConfirm?.id)}
              className="danger"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="secondary"
              disabled={deleting}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default Dashboard;
