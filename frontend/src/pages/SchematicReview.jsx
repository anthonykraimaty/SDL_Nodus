import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schematicService } from '../services/api';
import { getImageUrl } from '../config/api';
import ImagePreviewer from '../components/ImagePreviewer';
import Modal from '../components/Modal';
import { ToastContainer, useToast } from '../components/Toast';
import './SchematicReview.css';

const SchematicReview = () => {
  const { user } = useAuth();
  const [schematics, setSchematics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  // Filters
  const [filters, setFilters] = useState({
    setName: '',
    troupeId: '',
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  // Rejection modal
  const [rejectModal, setRejectModal] = useState({
    open: false,
    schematicId: null,
    reason: '',
  });

  // Image preview
  const [previewImages, setPreviewImages] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadSchematics();
  }, [filters, pagination.page]);

  const loadCategories = async () => {
    try {
      const data = await schematicService.getCategories();
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadSchematics = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (filters.setName) params.setName = filters.setName;
      if (filters.troupeId) params.troupeId = filters.troupeId;

      const data = await schematicService.getPending(params);
      setSchematics(data.schematics);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }));
    } catch (err) {
      setError('Failed to load pending schematics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      setActionLoading(id);
      const result = await schematicService.approve(id);

      // Show success feedback
      if (result.progress?.setComplete) {
        addToast(`Approved! ${result.progress.setName} set is now complete for this patrouille!`);
      }
      if (result.progress?.allComplete) {
        addToast('Congratulations! This patrouille has completed ALL sets and is a winner!');
      }

      // Reload list
      loadSchematics();
    } catch (err) {
      setError(err.message || 'Failed to approve schematic');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectClick = (id) => {
    setRejectModal({ open: true, schematicId: id, reason: '' });
  };

  const handleRejectSubmit = async () => {
    if (!rejectModal.reason.trim()) {
      addToast('Please provide a rejection reason', 'warning');
      return;
    }

    try {
      setActionLoading(rejectModal.schematicId);
      await schematicService.reject(rejectModal.schematicId, rejectModal.reason);
      setRejectModal({ open: false, schematicId: null, reason: '' });
      loadSchematics();
    } catch (err) {
      setError(err.message || 'Failed to reject schematic');
    } finally {
      setActionLoading(null);
    }
  };

  const openPreview = (pictures, index = 0) => {
    const images = pictures.map((p) => ({
      url: getImageUrl(p.filePath),
      caption: p.caption,
    }));
    setPreviewImages(images);
    setPreviewIndex(index);
  };

  const closePreview = () => {
    setPreviewImages([]);
    setPreviewIndex(0);
  };

  if (!['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role)) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Branche members and Admins can review schematics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="schematic-review-page">
      <div className="container">
        <div className="review-header">
          <h2>Review Schematics</h2>
          <p>Approve or reject pending schematic submissions</p>
        </div>

        {/* Filters */}
        <div className="review-filters">
          <select
            value={filters.setName}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, setName: e.target.value }))
            }
          >
            <option value="">All Sets</option>
            {categories.map((set) => (
              <option key={set.setName} value={set.setName}>
                {set.setName}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : schematics.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <h3>No Pending Schematics</h3>
            <p>All schematics have been reviewed</p>
          </div>
        ) : (
          <>
            <div className="pending-count">
              {pagination.total} schematic{pagination.total !== 1 ? 's' : ''}{' '}
              pending review
            </div>

            <div className="schematics-list">
              {schematics.map((schematic) => (
                <div key={schematic.id} className="schematic-card">
                  <div className="schematic-images">
                    {schematic.pictures.slice(0, 3).map((pic, idx) => (
                      <img
                        key={pic.id}
                        src={getImageUrl(pic.filePath)}
                        alt={`Schematic ${idx + 1}`}
                        onClick={() => openPreview(schematic.pictures, idx)}
                      />
                    ))}
                    {schematic.pictures.length > 3 && (
                      <div
                        className="more-images"
                        onClick={() => openPreview(schematic.pictures)}
                      >
                        +{schematic.pictures.length - 3}
                      </div>
                    )}
                  </div>

                  <div className="schematic-info">
                    <div className="schematic-category">
                      <span className="set-name">
                        {schematic.schematicCategory?.setName}
                      </span>
                      <span className="item-name">
                        {schematic.schematicCategory?.itemName}
                      </span>
                    </div>

                    <div className="schematic-meta">
                      <div className="meta-item">
                        <span className="meta-label">Patrouille:</span>
                        <span className="meta-value">
                          {schematic.patrouille?.name} ({schematic.patrouille?.totem})
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Troupe:</span>
                        <span className="meta-value">
                          {schematic.troupe?.name}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Group:</span>
                        <span className="meta-value">
                          {schematic.troupe?.group?.name}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Uploaded by:</span>
                        <span className="meta-value">
                          {schematic.uploadedBy?.name}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Date:</span>
                        <span className="meta-value">
                          {new Date(schematic.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="schematic-actions">
                      <button
                        className="btn-approve"
                        onClick={() => handleApprove(schematic.id)}
                        disabled={actionLoading === schematic.id}
                      >
                        {actionLoading === schematic.id
                          ? 'Processing...'
                          : 'Approve'}
                      </button>
                      <button
                        className="btn-reject"
                        onClick={() => handleRejectClick(schematic.id)}
                        disabled={actionLoading === schematic.id}
                      >
                        Reject
                      </button>
                      <Link
                        to={`/schematics/progress?patrouille=${schematic.patrouilleId}`}
                        className="btn-view-progress"
                      >
                        View Progress
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page === 1}
                >
                  Previous
                </button>
                <span>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page === pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Rejection Modal */}
        <Modal
          isOpen={rejectModal.open}
          onClose={() => setRejectModal({ open: false, schematicId: null, reason: '' })}
          title="Reject Schematic"
          variant="danger"
          size="medium"
        >
          <Modal.Body>
            <p>Please provide a reason for rejection:</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) =>
                setRejectModal((prev) => ({ ...prev, reason: e.target.value }))
              }
              placeholder="Enter rejection reason..."
              rows={4}
              style={{ width: '100%', marginTop: '12px' }}
            />
          </Modal.Body>
          <Modal.Actions>
            <button
              className="danger"
              onClick={handleRejectSubmit}
              disabled={!rejectModal.reason.trim()}
            >
              Confirm Rejection
            </button>
            <button
              className="secondary"
              onClick={() =>
                setRejectModal({ open: false, schematicId: null, reason: '' })
              }
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* Image Preview */}
        {previewImages.length > 0 && (
          <ImagePreviewer
            images={previewImages}
            initialIndex={previewIndex}
            onClose={closePreview}
          />
        )}
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default SchematicReview;
