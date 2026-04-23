import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schematicService, organizationService, pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import ImagePreviewer from '../components/ImagePreviewer';
import ImageEditor from '../components/ImageEditor';
import Modal from '../components/Modal';
import { ToastContainer, useToast } from '../components/Toast';
import './SchematicReview.css';

const SchematicReview = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const pictureSetIdParam = searchParams.get('pictureSetId');

  const [schematics, setSchematics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  // Filters
  const [filters, setFilters] = useState({
    setName: '',
    troupeId: '',
    groupId: '',
    districtId: '',
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

  // Pre-approval confirmation modal (for un-edited schematics)
  const [approveModal, setApproveModal] = useState({
    open: false,
    schematic: null,
  });

  // Image preview
  const [previewPictures, setPreviewPictures] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Image editor
  const [editingPicture, setEditingPicture] = useState(null);

  useEffect(() => {
    loadCategories();
    loadOrgData();
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

  const loadOrgData = async () => {
    try {
      const [districtsData, groupsData] = await Promise.all([
        organizationService.getDistricts(),
        organizationService.getGroups(),
      ]);
      setDistricts(districtsData);
      setGroups(groupsData);
    } catch (err) {
      console.error('Failed to load organization data:', err);
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
      if (filters.groupId) params.groupId = filters.groupId;
      if (filters.districtId) params.districtId = filters.districtId;

      const data = await schematicService.getPending(params);
      let results = data.schematics;

      // If deep-linking to a specific pictureSet, prioritize it
      if (pictureSetIdParam && pagination.page === 1) {
        const targetId = parseInt(pictureSetIdParam);
        const targetIndex = results.findIndex(s => s.id === targetId);
        if (targetIndex > 0) {
          // Move the target to the top
          const [target] = results.splice(targetIndex, 1);
          results.unshift(target);
        }
      }

      setSchematics(results);
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

  const handleApprove = (schematic) => {
    const hasUnedited = schematic.pictures.some(
      (p) => !p.filePath?.toLowerCase().endsWith('.pdf') && !p.originalFilePath
    );
    if (hasUnedited) {
      setApproveModal({ open: true, schematic });
      return;
    }
    doApprove(schematic.id);
  };

  const doApprove = async (id) => {
    try {
      setActionLoading(id);
      setApproveModal({ open: false, schematic: null });
      const result = await schematicService.approve(id);

      if (result.progress?.setComplete) {
        addToast(`Approved! ${result.progress.setName} set is now complete for this patrouille!`);
      }
      if (result.progress?.allComplete) {
        addToast('Congratulations! This patrouille has completed ALL sets and is a winner!');
      }

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
    setPreviewPictures(pictures);
    setPreviewIndex(index);
  };

  const closePreview = () => {
    setPreviewPictures([]);
    setPreviewIndex(0);
  };

  const handleEditImage = (picture) => {
    setEditingPicture(picture);
  };

  const handleImageEditorSave = async (blob, pictureId) => {
    try {
      await pictureService.editImage(pictureId, blob);
      setEditingPicture(null);
      loadSchematics();
    } catch (err) {
      console.error('Failed to save edited image:', err);
      addToast('Failed to save edited image', 'error');
    }
  };

  const filteredGroups = filters.districtId
    ? groups.filter((g) => String(g.districtId) === filters.districtId)
    : groups;

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

          <select
            value={filters.districtId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, districtId: e.target.value, groupId: '' }))
            }
          >
            <option value="">All Districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={filters.groupId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, groupId: e.target.value }))
            }
          >
            <option value="">All Groups</option>
            {filteredGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {(filters.setName || filters.districtId || filters.groupId) && (
            <button
              className="btn-clear-filters"
              onClick={() => setFilters({ setName: '', troupeId: '', groupId: '', districtId: '' })}
            >
              Clear
            </button>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : schematics.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#x2705;</div>
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
              {schematics.map((schematic) => {
                const isHighlighted = pictureSetIdParam && schematic.id === parseInt(pictureSetIdParam);
                return (
                  <div
                    key={schematic.id}
                    className={`schematic-card ${isHighlighted ? 'highlighted' : ''}`}
                  >
                    <div className="schematic-images">
                      {schematic.pictures.slice(0, 3).map((pic, idx) => {
                        const isPdf = pic.filePath?.toLowerCase().endsWith('.pdf');
                        return (
                          <div key={pic.id} className="schematic-image-wrapper">
                            {isPdf ? (
                              <div className="pdf-preview-review">
                                <span className="pdf-icon">PDF</span>
                              </div>
                            ) : (
                              <img
                                src={getImageUrl(pic.filePath)}
                                alt={`Schematic ${idx + 1}`}
                                onClick={() => openPreview(schematic.pictures, idx)}
                              />
                            )}
                            {!isPdf && (
                              <button
                                className="btn-edit-overlay"
                                onClick={() => handleEditImage(pic)}
                                title="Edit image (crop/rotate)"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        );
                      })}
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
                          {schematic.schematicCategory?.setName || 'Unclassified'}
                        </span>
                        <span className="item-name">
                          {schematic.schematicCategory?.itemName || 'No category'}
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
                          onClick={() => handleApprove(schematic)}
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
                );
              })}
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

        {/* Pre-approval confirmation modal */}
        <Modal
          isOpen={approveModal.open}
          onClose={() => setApproveModal({ open: false, schematic: null })}
          title="Nettoyer les schémas avant approbation ?"
          variant="warning"
          size="medium"
        >
          <Modal.Body>
            <p>
              Ces schémas n'ont pas encore été retouchés. Vous pouvez les nettoyer
              (fond blanc, recadrage…) avant de les approuver, ou continuer tel
              quels.
            </p>
            <div className="approval-preview-grid">
              {approveModal.schematic?.pictures
                ?.filter((p) => !p.filePath?.toLowerCase().endsWith('.pdf') && !p.originalFilePath)
                .map((pic) => (
                  <div key={pic.id} className="approval-preview-item">
                    <img
                      src={getImageUrl(pic.filePath)}
                      alt="Schematic to review"
                      onClick={() => {
                        setApproveModal({ open: false, schematic: null });
                        handleEditImage(pic);
                      }}
                    />
                    <button
                      type="button"
                      className="btn-edit-preview"
                      onClick={() => {
                        setApproveModal({ open: false, schematic: null });
                        handleEditImage(pic);
                      }}
                    >
                      ✎ Retoucher
                    </button>
                  </div>
                ))}
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button
              className="primary"
              onClick={() => doApprove(approveModal.schematic.id)}
            >
              Approuver quand même
            </button>
            <button
              className="secondary"
              onClick={() => setApproveModal({ open: false, schematic: null })}
            >
              Annuler
            </button>
          </Modal.Actions>
        </Modal>

        {/* Image Preview */}
        {previewPictures.length > 0 && (
          <ImagePreviewer
            pictures={previewPictures}
            initialIndex={previewIndex}
            onClose={closePreview}
          />
        )}
      </div>

      {/* Image Editor */}
      {editingPicture && (
        <div className="image-editor-overlay">
          <ImageEditor
            pictureId={editingPicture.id}
            imageUrl={getImageUrl(editingPicture.filePath)}
            onSave={handleImageEditorSave}
            onCancel={() => setEditingPicture(null)}
          />
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default SchematicReview;
