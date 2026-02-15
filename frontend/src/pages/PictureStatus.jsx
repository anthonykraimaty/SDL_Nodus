import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ImageEditor from '../components/ImageEditor';
import { ToastContainer, useToast } from '../components/Toast';
import './PictureStatus.css';

const PictureStatus = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pictureSet, setPictureSet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pictureToDelete, setPictureToDelete] = useState(null);
  const [viewingPicture, setViewingPicture] = useState(null);

  // Review/approval state
  const [excludedPictures, setExcludedPictures] = useState(new Set());
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [success, setSuccess] = useState('');
  const [editingPicture, setEditingPicture] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    loadPictureSet();
  }, [id]);

  const loadPictureSet = async () => {
    try {
      setLoading(true);
      const data = await pictureService.getById(id);
      setPictureSet(data);
    } catch (err) {
      console.error('Failed to load picture set:', err);
      setError('Failed to load picture set');
    } finally {
      setLoading(false);
    }
  };

  // Check if user can delete this set
  const canDelete = () => {
    if (!user || !pictureSet) return false;
    const isOwner = pictureSet.uploadedById === user.id;
    const isAdmin = user.role === 'ADMIN';
    const isApproved = pictureSet.status === 'APPROVED';

    // Admin can delete anything, owner can delete non-approved
    if (isAdmin) return true;
    if (isOwner && !isApproved) return true;
    return false;
  };

  // Check if user can delete individual pictures
  const canDeletePictures = () => {
    if (!user || !pictureSet) return false;
    const isOwner = pictureSet.uploadedById === user.id;
    const isAdmin = user.role === 'ADMIN';
    const isApproved = pictureSet.status === 'APPROVED';

    if (isAdmin) return true;
    if (isOwner && !isApproved) return true;
    return false;
  };

  // Check if user can approve/reject
  const canReview = user && (user.role === 'BRANCHE_ECLAIREURS' || user.role === 'ADMIN');

  // Exclusion handlers for approve/reject
  const toggleExclusion = (pictureId, e) => {
    e.stopPropagation();
    setExcludedPictures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pictureId)) {
        newSet.delete(pictureId);
      } else {
        newSet.add(pictureId);
      }
      return newSet;
    });
  };

  const isExcluded = (pictureId) => excludedPictures.has(pictureId);
  const getIncludedCount = () => (pictureSet?.pictures?.length || 0) - excludedPictures.size;

  // Approve handler
  const handleApprove = async (asHighlight = false) => {
    try {
      setError('');
      setSuccess('');
      const excludedIds = Array.from(excludedPictures);

      if (getIncludedCount() === 0) {
        setError('Cannot approve: all pictures are excluded');
        return;
      }

      await pictureService.approve(pictureSet.id, asHighlight, excludedIds);
      const excludedMsg = excludedIds.length > 0 ? ` (${excludedIds.length} excluded)` : '';
      setSuccess(asHighlight ? `Picture set approved as highlight!${excludedMsg}` : `Picture set approved!${excludedMsg}`);
      setExcludedPictures(new Set());
      await loadPictureSet();
    } catch (err) {
      console.error('Approval error:', err);
      setError('Failed to approve picture set');
    }
  };

  // Reject handler
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      addToast('Please provide a reason for rejection', 'warning');
      return;
    }

    try {
      setError('');
      setSuccess('');
      await pictureService.reject(pictureSet.id, rejectionReason);
      setSuccess('Picture set rejected');
      setShowRejectModal(false);
      setRejectionReason('');
      await loadPictureSet();
    } catch (err) {
      console.error('Rejection error:', err);
      setError('Failed to reject picture set');
    }
  };

  // Edit picture handler
  const handleEditPicture = (picture, e) => {
    e.stopPropagation();
    setEditingPicture(picture);
  };

  // Save edited image
  const handleSaveEdit = async (blob, pictureId) => {
    try {
      const result = await pictureService.editImage(pictureId, blob);
      setSuccess('Image updated successfully!');
      setEditingPicture(null);
      // Update picture filePath in existing state — preserves selections
      setPictureSet(prev => ({
        ...prev,
        pictures: prev.pictures.map(pic =>
          pic.id === pictureId ? { ...pic, filePath: result.picture.filePath } : pic
        ),
      }));
    } catch (err) {
      console.error('Failed to save edited image:', err);
      setError('Failed to save edited image: ' + err.message);
    }
  };

  const handleDeleteSet = async () => {
    if (!canDelete()) return;

    try {
      setDeleting(true);
      await pictureService.delete(pictureSet.id);
      navigate('/dashboard', { state: { message: 'Picture set deleted successfully' } });
    } catch (err) {
      console.error('Failed to delete picture set:', err);
      setError(err.error || 'Failed to delete picture set');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeletePicture = async (pictureId) => {
    if (!canDeletePictures()) return;

    try {
      setDeleting(true);
      await pictureService.deletePicture(pictureSet.id, pictureId);
      setPictureToDelete(null);
      await loadPictureSet(); // Reload to get updated pictures
    } catch (err) {
      console.error('Failed to delete picture:', err);
      setError(err.error || 'Failed to delete picture');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      PENDING: {
        icon: '⏳',
        label: 'Pending Classification',
        color: '#ff9800',
        description: 'Picture set has been uploaded and is waiting for classification.',
        nextStep: 'Add categories and metadata to classify the pictures.',
      },
      CLASSIFIED: {
        icon: '📝',
        label: 'Classified - Awaiting Review',
        color: '#2196F3',
        description: 'Picture set has been classified with categories and metadata.',
        nextStep: 'Waiting for Branche Éclaireurs to review and approve.',
      },
      APPROVED: {
        icon: '✅',
        label: 'Approved - Public',
        color: '#4CAF50',
        description: 'Picture set has been approved and is now publicly visible.',
        nextStep: 'No further action needed. Pictures are live on the platform.',
      },
      REJECTED: {
        icon: '❌',
        label: 'Rejected',
        color: '#f44336',
        description: 'Picture set was rejected during review.',
        nextStep: 'Review the rejection reason and make necessary changes.',
      },
    };
    return statusMap[status] || statusMap.PENDING;
  };

  const getWorkflowSteps = (currentStatus) => {
    const steps = [
      { status: 'PENDING', label: 'Uploaded', icon: '📤' },
      { status: 'CLASSIFIED', label: 'Classified', icon: '📝' },
      { status: 'APPROVED', label: 'Approved', icon: '✅' },
    ];

    const statusOrder = ['PENDING', 'CLASSIFIED', 'APPROVED', 'REJECTED'];
    const currentIndex = statusOrder.indexOf(currentStatus);

    return steps.map((step, index) => {
      const stepIndex = statusOrder.indexOf(step.status);
      let state = 'incomplete';

      if (currentStatus === 'REJECTED') {
        state = index === 0 ? 'complete' : 'rejected';
      } else if (stepIndex <= currentIndex) {
        state = 'complete';
      } else if (stepIndex === currentIndex + 1) {
        state = 'current';
      }

      return { ...step, state };
    });
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error || !pictureSet) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Picture Set Not Found</h2>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(pictureSet.status);
  const workflowSteps = getWorkflowSteps(pictureSet.status);

  return (
    <div className="picture-status-page">
      <div className="container">
        {/* Header */}
        <div className="status-header">
          <button onClick={() => navigate('/dashboard')} className="btn-back">
            ← Back to Dashboard
          </button>
          <h1>{pictureSet.title}</h1>
          {pictureSet.description && <p className="description">{pictureSet.description}</p>}
        </div>

        {/* Success/Error Messages */}
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Current Status Card */}
        <div className="current-status-card" style={{ borderColor: statusInfo.color }}>
          <div className="status-icon" style={{ color: statusInfo.color }}>
            {statusInfo.icon}
          </div>
          <div className="status-content">
            <h2 style={{ color: statusInfo.color }}>{statusInfo.label}</h2>
            <p className="status-description">{statusInfo.description}</p>
            <p className="status-next-step">
              <strong>Next Step:</strong> {statusInfo.nextStep}
            </p>
          </div>
        </div>

        {/* Workflow Progress */}
        <div className="workflow-section">
          <h2>Workflow Progress</h2>
          <div className="workflow-steps">
            {workflowSteps.map((step, index) => (
              <div key={step.status} className={`workflow-step ${step.state}`}>
                <div className="step-icon">{step.icon}</div>
                <div className="step-label">{step.label}</div>
                {index < workflowSteps.length - 1 && (
                  <div className={`step-connector ${step.state === 'complete' ? 'complete' : ''}`}></div>
                )}
              </div>
            ))}
          </div>

          {pictureSet.status === 'REJECTED' && (
            <div className="rejection-info">
              <h3>❌ Rejection Details</h3>
              <p><strong>Reason:</strong> {pictureSet.rejectionReason || 'No reason provided'}</p>
              {pictureSet.reviewedBy && (
                <p><strong>Reviewed by:</strong> {pictureSet.reviewedBy.name}</p>
              )}
              {pictureSet.reviewedAt && (
                <p><strong>Reviewed on:</strong> {new Date(pictureSet.reviewedAt).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="metadata-section">
          <h2>Picture Set Details</h2>
          <div className="metadata-grid">
            <div className="metadata-item">
              <strong>Type:</strong>
              <span>{pictureSet.type === 'INSTALLATION_PHOTO' ? '📸 Installation Photo' : '📐 Schematic'}</span>
            </div>
            <div className="metadata-item">
              <strong>Classification:</strong>
              <span>
                {(() => {
                  const classified = pictureSet.pictures?.filter(p => p.categoryId).length || 0;
                  const total = pictureSet.pictures?.length || 0;
                  if (classified === 0) return 'No pictures classified';
                  if (classified === total) return `All ${total} pictures classified`;
                  return `${classified} of ${total} pictures classified`;
                })()}
              </span>
            </div>
            <div className="metadata-item">
              <strong>District:</strong>
              <span>{pictureSet.troupe?.group?.district?.name || 'Not assigned'}</span>
            </div>
            <div className="metadata-item">
              <strong>Group:</strong>
              <span>{pictureSet.troupe?.group?.name || 'Not assigned'}</span>
            </div>
            <div className="metadata-item">
              <strong>Troupe:</strong>
              <span>{pictureSet.troupe?.name || 'Not assigned'}</span>
            </div>
            {pictureSet.patrouille && (
              <div className="metadata-item">
                <strong>Patrouille:</strong>
                <span>⚜️ {pictureSet.patrouille.name}</span>
              </div>
            )}
            {pictureSet.location && (
              <div className="metadata-item">
                <strong>Location:</strong>
                <span>📍 {pictureSet.location}</span>
              </div>
            )}
            <div className="metadata-item">
              <strong>Uploaded By:</strong>
              <span>👤 {pictureSet.uploadedBy?.name || 'Unknown'}</span>
            </div>
            <div className="metadata-item">
              <strong>Uploaded On:</strong>
              <span>📅 {new Date(pictureSet.uploadedAt).toLocaleString()}</span>
            </div>
            {pictureSet.classifiedBy && (
              <div className="metadata-item">
                <strong>Classified By:</strong>
                <span>👤 {pictureSet.classifiedBy.name}</span>
              </div>
            )}
            {pictureSet.classifiedAt && (
              <div className="metadata-item">
                <strong>Classified On:</strong>
                <span>📅 {new Date(pictureSet.classifiedAt).toLocaleString()}</span>
              </div>
            )}
            {pictureSet.reviewedBy && (
              <div className="metadata-item">
                <strong>Reviewed By:</strong>
                <span>👤 {pictureSet.reviewedBy.name}</span>
              </div>
            )}
            {pictureSet.reviewedAt && (
              <div className="metadata-item">
                <strong>Reviewed On:</strong>
                <span>📅 {new Date(pictureSet.reviewedAt).toLocaleString()}</span>
              </div>
            )}
            {pictureSet.isHighlight && (
              <div className="metadata-item">
                <strong>Highlight:</strong>
                <span>⭐ Featured Picture</span>
              </div>
            )}
          </div>
        </div>

        {/* Pictures Grid */}
        <div className="pictures-section">
          <h2>Pictures ({pictureSet.pictures?.length || 0})</h2>
          {/* Show included/excluded count when reviewing */}
          {canReview && pictureSet.status === 'CLASSIFIED' && (
            <p className="review-hint">
              Click ✓/✗ to include/exclude pictures from approval.
              <strong> {getIncludedCount()} of {pictureSet.pictures?.length || 0}</strong> will be approved.
            </p>
          )}
          <div className="pictures-preview-grid">
            {pictureSet.pictures?.map((picture) => (
              <div
                key={picture.id}
                className={`picture-preview-card clickable ${isExcluded(picture.id) ? 'excluded' : ''}`}
                onClick={() => setViewingPicture(picture)}
              >
                <img
                  src={getImageUrl(picture.filePath)}
                  alt={`Picture ${picture.displayOrder}`}
                />
                <div className="picture-info">
                  <span className="picture-number">#{picture.displayOrder}</span>
                  {picture.category ? (
                    <span className="picture-category-name">{picture.category.name}</span>
                  ) : (
                    <span className="picture-not-classified">Not classified</span>
                  )}
                </div>
                {picture.takenAt && (
                  <div className="picture-date">
                    {new Date(picture.takenAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                )}

                {/* Edit button for reviewers */}
                {canReview && (
                  <button
                    className="btn-edit-picture"
                    onClick={(e) => handleEditPicture(picture, e)}
                    title="Edit image (crop/rotate)"
                  >
                    ✎
                  </button>
                )}

                {/* Include/Exclude toggle for review */}
                {canReview && pictureSet.status === 'CLASSIFIED' && (
                  <button
                    className={`btn-toggle-include ${isExcluded(picture.id) ? 'excluded' : 'included'}`}
                    onClick={(e) => toggleExclusion(picture.id, e)}
                    title={isExcluded(picture.id) ? 'Click to include' : 'Click to exclude'}
                  >
                    {isExcluded(picture.id) ? '✗' : '✓'}
                  </button>
                )}

                {canDeletePictures() && pictureSet.pictures.length > 1 && (
                  <button
                    className="btn-delete-picture"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPictureToDelete(picture);
                    }}
                    title="Delete this picture"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          {pictureSet.status === 'PENDING' && (
            user?.role === 'CHEF_TROUPE' || user?.role === 'BRANCHE_ECLAIREURS'
          ) && (
            <button
              onClick={() => navigate(`/classify/${pictureSet.id}`)}
              className="btn-action primary"
            >
              📝 Classify Pictures
            </button>
          )}

          {pictureSet.status === 'CLASSIFIED' && (
            user?.role === 'CHEF_TROUPE' || user?.role === 'BRANCHE_ECLAIREURS'
          ) && (
            <button
              onClick={() => navigate(`/classify/${pictureSet.id}`)}
              className="btn-action secondary"
            >
              ✏️ Edit Classification
            </button>
          )}

          {pictureSet.status === 'CLASSIFIED' && canReview && (
            <>
              <button
                onClick={() => handleApprove(false)}
                className="btn-action approve"
                disabled={getIncludedCount() === 0}
              >
                ✓ Approve ({getIncludedCount()})
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="btn-action reject"
              >
                ✕ Reject
              </button>
            </>
          )}

          {pictureSet.status === 'APPROVED' && (
            <button
              onClick={() => navigate('/browse')}
              className="btn-action secondary"
            >
              🌐 View in Browse
            </button>
          )}

          {/* Delete Set Button */}
          {canDelete() && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-action danger"
              disabled={deleting}
            >
              🗑️ Delete Set
            </button>
          )}
        </div>

        {/* Delete Set Confirmation Modal */}
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete Picture Set?"
          variant="danger"
        >
          <Modal.Body>
            <p>
              Are you sure you want to delete "<strong>{pictureSet.title}</strong>"?
              This will permanently delete all {pictureSet.pictures?.length || 0} pictures.
            </p>
            <p className="warning-text">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={handleDeleteSet}
              className="danger"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="secondary"
              disabled={deleting}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* Delete Picture Confirmation Modal */}
        <Modal
          isOpen={!!pictureToDelete}
          onClose={() => setPictureToDelete(null)}
          title="Delete Picture?"
          variant="danger"
        >
          <Modal.Body>
            {pictureToDelete && (
              <>
                <div className="delete-preview">
                  <img
                    src={getImageUrl(pictureToDelete.filePath)}
                    alt="Picture to delete"
                  />
                </div>
                <p>Are you sure you want to delete picture #{pictureToDelete.displayOrder}?</p>
                <p className="warning-text">This action cannot be undone.</p>
              </>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={() => handleDeletePicture(pictureToDelete?.id)}
              className="danger"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setPictureToDelete(null)}
              className="secondary"
              disabled={deleting}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* View Picture Modal */}
        <Modal.ImageViewer
          isOpen={!!viewingPicture}
          onClose={() => setViewingPicture(null)}
          images={pictureSet?.pictures?.map(p => ({
            id: p.id,
            src: getImageUrl(p.filePath),
            alt: `Picture ${p.displayOrder}`,
            displayOrder: p.displayOrder,
            category: p.category,
            takenAt: p.takenAt,
          })) || []}
          currentIndex={viewingPicture ? pictureSet?.pictures?.findIndex(p => p.id === viewingPicture.id) || 0 : 0}
          onNavigate={(index) => setViewingPicture(pictureSet?.pictures?.[index])}
          renderInfo={(img) => (
            <>
              <span>#{img.displayOrder}</span>
              {img.category && <span>{img.category.name}</span>}
              {img.takenAt && <span>{new Date(img.takenAt).toLocaleDateString()}</span>}
            </>
          )}
        />

        {/* Rejection Modal */}
        <Modal
          isOpen={showRejectModal}
          onClose={() => {
            setShowRejectModal(false);
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
              onClick={handleReject}
              className="danger"
              disabled={!rejectionReason.trim()}
            >
              Confirm Rejection
            </button>
            <button
              onClick={() => {
                setShowRejectModal(false);
                setRejectionReason('');
              }}
              className="secondary"
            >
              Cancel
            </button>
          </Modal.Actions>
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
              onSave={handleSaveEdit}
            />
          )}
        </Modal>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default PictureStatus;
