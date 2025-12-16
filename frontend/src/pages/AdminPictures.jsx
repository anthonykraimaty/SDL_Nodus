import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import './AdminPictures.css';

const AdminPictures = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pictureSets, setPictureSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('APPROVED');
  const [deleting, setDeleting] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  useEffect(() => {
    loadPictureSets();
  }, [statusFilter]);

  const loadPictureSets = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await pictureService.getAll({ status: statusFilter, limit: 100 });
      setPictureSets(data.pictures || []);
    } catch (err) {
      console.error('Failed to load picture sets:', err);
      setError('Failed to load picture sets');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (pictureSetId) => {
    try {
      setDeleting(pictureSetId);
      await pictureService.delete(pictureSetId);
      setSuccess('Picture set deleted successfully');
      setShowDeleteConfirm(null);
      await loadPictureSets();
    } catch (err) {
      console.error('Failed to delete picture set:', err);
      setError(err.error || 'Failed to delete picture set');
    } finally {
      setDeleting(null);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="admin-pictures">
        <div className="container">
          <div className="error-page">
            <h2>Access Denied</h2>
            <p>Only administrators can access this page</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-pictures">
      <div className="admin-container">
        <div className="page-header">
          <h1>Manage Pictures</h1>
          <p>View and manage all picture sets in the system</p>
        </div>

        {/* Status Filter */}
        <div className="filter-bar">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${statusFilter === 'APPROVED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('APPROVED')}
            >
              Approved ({pictureSets.length})
            </button>
            <button
              className={`filter-btn ${statusFilter === 'CLASSIFIED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('CLASSIFIED')}
            >
              Classified
            </button>
            <button
              className={`filter-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setStatusFilter('PENDING')}
            >
              Pending
            </button>
            <button
              className={`filter-btn ${statusFilter === 'REJECTED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('REJECTED')}
            >
              Rejected
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : pictureSets.length === 0 ? (
          <div className="empty-state">
            <p>No picture sets found with status: {statusFilter}</p>
          </div>
        ) : (
          <div className="picture-sets-table">
            <table>
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Title</th>
                  <th>Troupe</th>
                  <th>Pictures</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pictureSets.map((set) => (
                  <tr key={set.id}>
                    <td className="preview-cell">
                      {set.pictures?.[0] ? (
                        <img
                          src={getImageUrl(set.pictures[0].filePath)}
                          alt={set.title}
                          className="table-preview"
                        />
                      ) : (
                        <div className="no-preview">No image</div>
                      )}
                    </td>
                    <td>
                      <div className="set-title">{set.title}</div>
                      <div className="set-type">
                        {set.type === 'INSTALLATION_PHOTO' ? 'Photo' : 'Schematic'}
                      </div>
                    </td>
                    <td>
                      <div className="troupe-name">{set.troupe?.name || '-'}</div>
                      <div className="group-name">{set.troupe?.group?.name || ''}</div>
                    </td>
                    <td className="count-cell">{set.pictures?.length || 0}</td>
                    <td>
                      <div className="date-cell">
                        {new Date(set.uploadedAt).toLocaleDateString()}
                      </div>
                      <div className="uploader-name">{set.uploadedBy?.name || 'Unknown'}</div>
                    </td>
                    <td className="actions-cell">
                      <button
                        className="btn-view"
                        onClick={() => navigate(`/status/${set.id}`)}
                        title="View details"
                      >
                        View
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => setShowDeleteConfirm(set)}
                        disabled={deleting === set.id}
                        title="Delete picture set"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
            <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Picture Set?</h3>
              <div className="delete-info">
                <p>
                  <strong>Title:</strong> {showDeleteConfirm.title}
                </p>
                <p>
                  <strong>Status:</strong> {showDeleteConfirm.status}
                </p>
                <p>
                  <strong>Pictures:</strong> {showDeleteConfirm.pictures?.length || 0}
                </p>
              </div>
              <p className="warning-text">
                This will permanently delete all pictures in this set. This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button
                  onClick={() => handleDelete(showDeleteConfirm.id)}
                  className="btn-confirm-delete"
                  disabled={deleting === showDeleteConfirm.id}
                >
                  {deleting === showDeleteConfirm.id ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="btn-cancel"
                  disabled={deleting === showDeleteConfirm.id}
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

export default AdminPictures;
