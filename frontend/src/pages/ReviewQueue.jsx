import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import './ReviewQueue.css';

const ReviewQueue = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pictureSets, setPictureSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await pictureService.getAll({ status: 'CLASSIFIED' });
      setPictureSets(data.pictures || []);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load classified pictures');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (pictureSetId, asHighlight = false) => {
    try {
      setError('');
      setSuccess('');

      await pictureService.approve(pictureSetId, asHighlight);

      setSuccess(asHighlight ? 'Picture set approved and marked as highlight!' : 'Picture set approved successfully!');
      await loadData();
    } catch (err) {
      console.error('Approval error:', err);
      setError('Failed to approve picture set');
    }
  };

  const handleReject = async (pictureSetId) => {
    try {
      setError('');
      setSuccess('');

      if (!rejectionReason.trim()) {
        alert('Please provide a reason for rejection');
        return;
      }

      await pictureService.reject(pictureSetId, rejectionReason);

      setSuccess('Picture set rejected');
      setRejectionReason('');
      setShowRejectModal(null);
      await loadData();
    } catch (err) {
      console.error('Rejection error:', err);
      setError('Failed to reject picture set');
    }
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user || (user.role !== 'BRANCHE_ECLAIREURS' && user.role !== 'ADMIN')) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Branche Éclaireurs and Admin can access the review queue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="review-queue-page">
      <div className="container">
        <div className="review-header">
          <h1>Review Queue</h1>
          <p>Review and approve classified pictures before they become publicly visible</p>
          <div className="review-stats">
            <span className="stat-badge">{pictureSets.length} sets pending review</span>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {pictureSets.length === 0 ? (
          <div className="empty-state">
            <h2>✅ All Caught Up!</h2>
            <p>No classified pictures waiting for review</p>
          </div>
        ) : (
          <div className="review-sets">
            {pictureSets.map(set => (
              <div key={set.id} className="review-set-card">
                <div className="set-info">
                  <div className="set-header">
                    <h2>{set.title}</h2>
                    <div className="set-metadata">
                      <span className="metadata-item">
                        👤 {set.uploadedBy?.name || 'Unknown'}
                      </span>
                      <span className="metadata-item">
                        📁 {set.category?.name || 'No category'}
                      </span>
                      <span className="metadata-item">
                        🏕️ {set.troupe?.name || 'No troupe'}
                      </span>
                      {set.patrouille && (
                        <span className="metadata-item">
                          ⚜️ {set.patrouille.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {set.description && (
                    <p className="set-description">{set.description}</p>
                  )}

                  <div className="set-details">
                    <div className="detail-item">
                      <strong>Type:</strong> {set.type === 'INSTALLATION_PHOTO' ? 'Installation Photo' : 'Schematic'}
                    </div>
                    {set.location && (
                      <div className="detail-item">
                        <strong>Location:</strong> {set.location}
                      </div>
                    )}
                    <div className="detail-item">
                      <strong>Uploaded:</strong> {new Date(set.uploadedAt).toLocaleDateString()}
                    </div>
                    <div className="detail-item">
                      <strong>Classified by:</strong> {set.classifiedBy?.name || 'Unknown'}
                    </div>
                  </div>
                </div>

                <div className="pictures-preview">
                  <div className="preview-grid">
                    {set.pictures?.slice(0, 6).map(picture => (
                      <div
                        key={picture.id}
                        className="preview-image-wrapper"
                        onClick={() => setSelectedImage(picture)}
                      >
                        <img
                          src={`http://localhost:3001/${picture.filePath}`}
                          alt={`Picture ${picture.displayOrder}`}
                          className="preview-image"
                        />
                        {picture.categoryId && (
                          <div className="picture-category-badge">
                            ✓
                          </div>
                        )}
                      </div>
                    ))}
                    {set.pictures && set.pictures.length > 6 && (
                      <div className="preview-more">
                        +{set.pictures.length - 6} more
                      </div>
                    )}
                  </div>
                  <p className="picture-count">
                    {set.pictures?.length || 0} picture{set.pictures?.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="review-actions">
                  <button
                    onClick={() => handleApprove(set.id, false)}
                    className="btn-approve"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => handleApprove(set.id, true)}
                    className="btn-highlight"
                  >
                    ⭐ Approve as Highlight
                  </button>
                  <button
                    onClick={() => setShowRejectModal(set.id)}
                    className="btn-reject"
                  >
                    ✗ Reject
                  </button>
                  <button
                    onClick={() => navigate(`/classify/${set.id}`)}
                    className="btn-view-details"
                  >
                    👁️ View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rejection Modal */}
        {showRejectModal && (
          <div className="modal-overlay" onClick={() => setShowRejectModal(null)}>
            <div className="modal-content reject-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Reject Picture Set</h3>
              <p>Please provide a reason for rejecting this picture set:</p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection..."
                rows="4"
                className="rejection-textarea"
                autoFocus
              />
              <div className="modal-actions">
                <button
                  onClick={() => handleReject(showRejectModal)}
                  className="btn-confirm-reject"
                  disabled={!rejectionReason.trim()}
                >
                  Confirm Rejection
                </button>
                <button
                  onClick={() => {
                    setShowRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="btn-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Preview Modal */}
        {selectedImage && (
          <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
            <div className="modal-content image-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedImage(null)}>
                ×
              </button>
              <img
                src={`http://localhost:3001/${selectedImage.filePath}`}
                alt="Full size preview"
                className="modal-image"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewQueue;
