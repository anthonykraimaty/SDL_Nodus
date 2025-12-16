import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const [pictures, setPictures] = useState([]);
  const [allPictures, setAllPictures] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    classified: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const params = {};

      // For Chef Troupe, show their own pictures
      if (user?.role === 'CHEF_TROUPE') {
        // This would need backend support to filter by user
        const data = await pictureService.getAll({ limit: 50 });
        const userPictures = data.pictures.filter(p => p.uploadedBy?.id === user.id);
        setAllPictures(userPictures);
        setPictures(userPictures);

        // Calculate stats
        setStats({
          pending: userPictures.filter(p => p.status === 'PENDING').length,
          classified: userPictures.filter(p => p.status === 'CLASSIFIED').length,
          approved: userPictures.filter(p => p.status === 'APPROVED').length,
          rejected: userPictures.filter(p => p.status === 'REJECTED').length,
        });
      }

      // For Branche, show pictures needing review
      if (user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') {
        const data = await pictureService.getAll({ limit: 50 });
        setAllPictures(data.pictures);
        setPictures(data.pictures);

        setStats({
          pending: data.pictures.filter(p => p.status === 'PENDING').length,
          classified: data.pictures.filter(p => p.status === 'CLASSIFIED').length,
          approved: data.pictures.filter(p => p.status === 'APPROVED').length,
          rejected: data.pictures.filter(p => p.status === 'REJECTED').length,
        });
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterByStatus = (status) => {
    setActiveFilter(status);
    if (status === 'all') {
      setPictures(allPictures);
    } else {
      setPictures(allPictures.filter(p => p.status === status.toUpperCase()));
    }
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
      alert(err.error || 'Failed to delete picture set');
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
          {user?.role === 'CHEF_TROUPE' && (
            <Link to="/upload" className="btn-upload primary">
              Upload Picture
            </Link>
          )}
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
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
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Picture Set?</h3>
              <p>
                Are you sure you want to delete "<strong>{deleteConfirm.title}</strong>"?
                This will permanently delete all {deleteConfirm.pictures?.length || 0} pictures.
              </p>
              <p className="warning-text">This action cannot be undone.</p>
              <div className="modal-actions">
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  className="btn-confirm-delete"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="btn-cancel"
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
