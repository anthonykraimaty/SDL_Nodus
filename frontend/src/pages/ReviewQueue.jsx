import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ImageEditor from '../components/ImageEditor';
import './ReviewQueue.css';

const ReviewQueue = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pictureSets, setPictureSets] = useState([]);
  const [rejectedSets, setRejectedSets] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'rejected'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(null);
  // Track excluded pictures per set: { setId: Set of pictureIds }
  const [excludedPictures, setExcludedPictures] = useState({});
  const [editingPicture, setEditingPicture] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Only load installation photos - schematics have their own review page
      const [classifiedData, rejectedData] = await Promise.all([
        pictureService.getAll({ status: 'CLASSIFIED', type: 'INSTALLATION_PHOTO' }),
        pictureService.getAll({ status: 'REJECTED', type: 'INSTALLATION_PHOTO' })
      ]);
      setPictureSets(classifiedData.pictures || []);
      setRejectedSets(rejectedData.pictures || []);
      // Reset excluded pictures when data reloads
      setExcludedPictures({});
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load pictures');
    } finally {
      setLoading(false);
    }
  };

  const togglePictureExclusion = (setId, pictureId, e) => {
    e.stopPropagation(); // Prevent opening the image preview
    setExcludedPictures(prev => {
      const setExcluded = new Set(prev[setId] || []);
      if (setExcluded.has(pictureId)) {
        setExcluded.delete(pictureId);
      } else {
        setExcluded.add(pictureId);
      }
      return { ...prev, [setId]: setExcluded };
    });
  };

  const isPictureExcluded = (setId, pictureId) => {
    return excludedPictures[setId]?.has(pictureId) || false;
  };

  const getIncludedCount = (set) => {
    const excluded = excludedPictures[set.id]?.size || 0;
    return (set.pictures?.length || 0) - excluded;
  };

  const handleApprove = async (pictureSetId, asHighlight = false) => {
    try {
      setError('');
      setSuccess('');

      const excluded = excludedPictures[pictureSetId];
      const excludedIds = excluded ? Array.from(excluded) : [];

      // Check if all pictures are excluded
      const set = pictureSets.find(s => s.id === pictureSetId);
      if (set && excludedIds.length >= set.pictures?.length) {
        setError('Cannot approve: all pictures are excluded. Please include at least one picture or reject the set.');
        return;
      }

      await pictureService.approve(pictureSetId, asHighlight, excludedIds);

      const excludedMsg = excludedIds.length > 0 ? ` (${excludedIds.length} picture${excludedIds.length > 1 ? 's' : ''} excluded)` : '';
      setSuccess(asHighlight ? `Picture set approved and marked as highlight!${excludedMsg}` : `Picture set approved successfully!${excludedMsg}`);
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

  // Get current sets based on active tab
  const currentSets = activeTab === 'pending' ? pictureSets : rejectedSets;

  return (
    <div className="review-queue-page">
      <div className="container">
        <div className="review-header">
          <h1>Review Queue</h1>
          <p>Review and approve classified pictures before they become publicly visible</p>
          <p className="review-hint">Click on pictures to exclude them from approval</p>
        </div>

        {/* Tabs */}
        <div className="review-tabs">
          <button
            className={`review-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Review
            {pictureSets.length > 0 && <span className="tab-badge">{pictureSets.length}</span>}
          </button>
          <button
            className={`review-tab ${activeTab === 'rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            Rejected
            {rejectedSets.length > 0 && <span className="tab-badge rejected">{rejectedSets.length}</span>}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {currentSets.length === 0 ? (
          <div className="empty-state">
            <h2>{activeTab === 'pending' ? 'All Caught Up!' : 'No Rejected Sets'}</h2>
            <p>{activeTab === 'pending' ? 'No classified pictures waiting for review' : 'No rejected picture sets to re-review'}</p>
          </div>
        ) : (
          <div className="review-sets">
            {currentSets.map(set => (
              <div key={set.id} className="review-set-card">
                <div className="set-info">
                  <div className="set-header">
                    <h2>{set.title}</h2>
                    <div className="set-metadata">
                      <span className="metadata-item">
                        {set.uploadedBy?.name || 'Unknown'}
                      </span>
                      <span className="metadata-item">
                        {set.pictures?.length || 0} pictures
                      </span>
                      <span className="metadata-item">
                        {set.troupe?.name || 'No troupe'}
                      </span>
                      {set.patrouille && (
                        <span className="metadata-item">
                          {set.patrouille.name}
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

                  {/* Show rejection reason for rejected sets */}
                  {activeTab === 'rejected' && set.rejectionReason && (
                    <div className="rejection-reason-box">
                      <strong>Rejection Reason:</strong>
                      <p>{set.rejectionReason}</p>
                    </div>
                  )}
                </div>

                <div className="pictures-preview">
                  <div className="preview-grid" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
                    {set.pictures?.map(picture => (
                      <div
                        key={picture.id}
                        className={`preview-image-wrapper ${isPictureExcluded(set.id, picture.id) ? 'excluded' : ''}`}
                        style={{ width: '320px', height: '240px', flex: '0 0 320px' }}
                      >
                        <img
                          src={getImageUrl(picture.filePath)}
                          alt={`Picture ${picture.displayOrder}`}
                          className="preview-image"
                          onClick={() => setSelectedImage(picture)}
                          title="Click to view full size"
                        />
                        {picture.category && (
                          <div className="picture-category-label">{picture.category.name}</div>
                        )}
                        <button
                          className="picture-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPicture(picture);
                          }}
                          title="Edit image (crop/rotate)"
                        >
                          ✎
                        </button>
                        <button
                          className={`picture-toggle-btn ${isPictureExcluded(set.id, picture.id) ? 'excluded' : 'included'}`}
                          onClick={(e) => togglePictureExclusion(set.id, picture.id, e)}
                          title={isPictureExcluded(set.id, picture.id) ? 'Click to include' : 'Click to exclude'}
                        >
                          {isPictureExcluded(set.id, picture.id) ? '✗' : '✓'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="picture-count">
                    {getIncludedCount(set)} of {set.pictures?.length || 0} picture{set.pictures?.length !== 1 ? 's' : ''} will be approved
                    {excludedPictures[set.id]?.size > 0 && (
                      <span className="excluded-count"> ({excludedPictures[set.id].size} excluded)</span>
                    )}
                  </p>
                </div>

                <div className="review-actions">
                  <button
                    onClick={() => handleApprove(set.id, false)}
                    className="btn-approve"
                    disabled={getIncludedCount(set) === 0}
                  >
                    {activeTab === 'rejected' ? 'Re-Approve' : 'Approve'} {getIncludedCount(set) < set.pictures?.length ? `(${getIncludedCount(set)})` : ''}
                  </button>
                  {activeTab === 'pending' && (
                    <button
                      onClick={() => setShowRejectModal(set.id)}
                      className="btn-reject"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/classify/${set.id}`)}
                    className="btn-view-details"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rejection Modal */}
        <Modal
          isOpen={!!showRejectModal}
          onClose={() => {
            setShowRejectModal(null);
            setRejectionReason('');
          }}
          title="Reject Picture Set"
          variant="danger"
          size="medium"
        >
          <Modal.Body>
            <p>Please provide a reason for rejecting this picture set:</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows="4"
              className="rejection-textarea"
              autoFocus
            />
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={() => handleReject(showRejectModal)}
              className="danger"
              disabled={!rejectionReason.trim()}
            >
              Confirm Rejection
            </button>
            <button
              onClick={() => {
                setShowRejectModal(null);
                setRejectionReason('');
              }}
              className="secondary"
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* Image Preview Modal */}
        <Modal
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          variant="image"
          size="fullscreen"
        >
          {selectedImage && (
            <img
              src={getImageUrl(selectedImage.filePath)}
              alt="Full size preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          )}
        </Modal>

        {/* Image Editor Modal */}
        <Modal
          isOpen={!!editingPicture}
          onClose={() => setEditingPicture(null)}
          title={`Edit Image #${editingPicture?.displayOrder || ''}`}
          size="fullscreen"
          closeOnOverlay={false}
        >
          {editingPicture && (
            <ImageEditor
              imageUrl={getImageUrl(editingPicture.filePath)}
              pictureId={editingPicture.id}
              onCancel={() => setEditingPicture(null)}
              onSave={async (blob, pictureId) => {
                try {
                  await pictureService.editImage(pictureId, blob);
                  setSuccess('Image updated successfully!');
                  setEditingPicture(null);
                  // Reload data to get updated image
                  await loadData();
                } catch (err) {
                  console.error('Failed to save edited image:', err);
                  setError('Failed to save edited image: ' + err.message);
                }
              }}
            />
          )}
        </Modal>
      </div>
    </div>
  );
};

export default ReviewQueue;
