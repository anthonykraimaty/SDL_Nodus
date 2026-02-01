import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService, analyticsService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ImageEditor from '../components/ImageEditor';
import './AdminPictures.css';

const AdminPictures = () => {
  const { user } = useAuth();

  const [pictures, setPictures] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('APPROVED');
  const [deleting, setDeleting] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });

  // Sorting state
  const [sortBy, setSortBy] = useState('uploadedAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Edit modal state
  const [editingPicture, setEditingPicture] = useState(null);
  const [editForm, setEditForm] = useState({
    categoryId: '',
    takenAt: '',
    woodCount: '',
    type: '',
  });
  const [saving, setSaving] = useState(false);

  // View modal state
  const [viewingPicture, setViewingPicture] = useState(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);

  // Bulk selection state
  const [selectedPictures, setSelectedPictures] = useState(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ type: '', categoryId: '' });
  const [bulkSaving, setBulkSaving] = useState(false);

  // Preview size state (0 = table view, 100 = full thumbnail grid)
  const [previewSize, setPreviewSize] = useState(0);

  // Image editor state
  const [imageEditingPicture, setImageEditingPicture] = useState(null);

  useEffect(() => {
    loadCategories();
    checkSyncNeeded();
  }, []);

  useEffect(() => {
    loadPictures();
  }, [statusFilter, pagination.page, sortBy, sortOrder]);

  const loadCategories = async () => {
    try {
      const data = await categoryService.getAll({});
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const checkSyncNeeded = async () => {
    try {
      const [categorySync, typeSync] = await Promise.all([
        analyticsService.checkCategorySync(),
        analyticsService.checkTypeSync(),
      ]);
      setSyncInfo({
        categoriesNeedSync: categorySync.totalPictures > 0,
        categoryCount: categorySync.totalPictures,
        typesNeedSync: typeSync.totalPictures > 0,
        typeCount: typeSync.totalPictures,
      });
    } catch (err) {
      console.error('Failed to check sync status:', err);
    }
  };

  const handleSyncCategories = async () => {
    try {
      setSyncing(true);
      const result = await analyticsService.syncCategories();
      setSuccess(`Synced categories for ${result.totalUpdated} picture(s)`);
      await checkSyncNeeded();
      await loadPictures();
    } catch (err) {
      console.error('Failed to sync categories:', err);
      setError(err.message || 'Failed to sync categories');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncTypes = async () => {
    try {
      setSyncing(true);
      const result = await analyticsService.syncTypes();
      setSuccess(`Synced types for ${result.totalUpdated} picture(s)`);
      await checkSyncNeeded();
      await loadPictures();
    } catch (err) {
      console.error('Failed to sync types:', err);
      setError(err.message || 'Failed to sync types');
    } finally {
      setSyncing(false);
    }
  };

  const loadPictures = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await pictureService.getIndividualPictures({
        status: statusFilter,
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
      });
      setPictures(data.pictures || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
    } catch (err) {
      console.error('Failed to load pictures:', err);
      setError('Failed to load pictures');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (pictureId) => {
    try {
      setDeleting(pictureId);
      await pictureService.deleteIndividualPicture(pictureId);
      setSuccess('Picture deleted successfully');
      setShowDeleteConfirm(null);
      await loadPictures();
    } catch (err) {
      console.error('Failed to delete picture:', err);
      setError(err.message || 'Failed to delete picture');
    } finally {
      setDeleting(null);
    }
  };

  const handleEditClick = (picture) => {
    setEditingPicture(picture);
    setEditForm({
      categoryId: picture.categoryId || '',
      takenAt: picture.takenAt ? new Date(picture.takenAt).toISOString().split('T')[0] : '',
      woodCount: picture.woodCount || '',
      type: picture.type || 'INSTALLATION_PHOTO',
    });
  };

  const handleEditSave = async () => {
    try {
      setSaving(true);
      await pictureService.updateIndividualPicture(editingPicture.id, {
        categoryId: editForm.categoryId || null,
        takenAt: editForm.takenAt || null,
        woodCount: editForm.woodCount || null,
        type: editForm.type,
      });
      setSuccess('Picture updated successfully');
      setEditingPicture(null);
      await loadPictures();
    } catch (err) {
      console.error('Failed to update picture:', err);
      setError(err.message || 'Failed to update picture');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusFilterChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPagination(prev => ({ ...prev, page: 1 }));
    setSelectedPictures(new Set()); // Clear selection on filter change
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      // Toggle order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) return '↕';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedPictures.size === pictures.length) {
      setSelectedPictures(new Set());
    } else {
      setSelectedPictures(new Set(pictures.map(p => p.id)));
    }
  };

  const toggleSelectPicture = (pictureId) => {
    const newSelected = new Set(selectedPictures);
    if (newSelected.has(pictureId)) {
      newSelected.delete(pictureId);
    } else {
      newSelected.add(pictureId);
    }
    setSelectedPictures(newSelected);
  };

  const handleBulkEditClick = () => {
    setBulkEditForm({ type: '', categoryId: '' });
    setShowBulkEdit(true);
  };

  const handleBulkEditSave = async () => {
    try {
      setBulkSaving(true);
      const updates = {};
      if (bulkEditForm.type) updates.type = bulkEditForm.type;
      if (bulkEditForm.categoryId) updates.categoryId = bulkEditForm.categoryId;

      if (Object.keys(updates).length === 0) {
        setError('Please select at least one field to update');
        return;
      }

      const result = await pictureService.bulkUpdatePictures(
        Array.from(selectedPictures),
        updates
      );
      setSuccess(result.message);
      setShowBulkEdit(false);
      setSelectedPictures(new Set());
      await loadPictures();
    } catch (err) {
      console.error('Bulk update failed:', err);
      setError(err.message || 'Failed to update pictures');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkDeleteClick = () => {
    setShowBulkDelete(true);
  };

  const handleBulkDeleteConfirm = async () => {
    try {
      setBulkSaving(true);
      const result = await pictureService.bulkDeletePictures(Array.from(selectedPictures));

      let message = result.message;
      if (result.skipped && result.skipped.length > 0) {
        message += ` (${result.skipped.length} skipped - last picture in set)`;
      }

      setSuccess(message);
      setShowBulkDelete(false);
      setSelectedPictures(new Set());
      await loadPictures();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      setError(err.message || 'Failed to delete pictures');
    } finally {
      setBulkSaving(false);
    }
  };

  // Handle image edit save
  const handleImageEditSave = async (blob, pictureId) => {
    try {
      await pictureService.editImage(pictureId, blob);
      setSuccess('Image updated successfully');
      setImageEditingPicture(null);
      setViewingPicture(null);
      await loadPictures();
    } catch (err) {
      console.error('Failed to save edited image:', err);
      setError(err.message || 'Failed to save edited image');
    }
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

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
          <p>View and manage individual pictures in the system</p>
        </div>

        {/* Sync Tools */}
        {syncInfo && (syncInfo.categoriesNeedSync || syncInfo.typesNeedSync) && (
          <div className="sync-tools">
            <div className="sync-alert">
              <span className="sync-icon">⚠️</span>
              <span className="sync-message">
                Some pictures need data sync from their picture sets.
              </span>
            </div>
            <div className="sync-actions">
              {syncInfo.typesNeedSync && (
                <button
                  className="btn-sync"
                  onClick={handleSyncTypes}
                  disabled={syncing}
                >
                  {syncing ? 'Syncing...' : `Sync Types (${syncInfo.typeCount} pictures)`}
                </button>
              )}
              {syncInfo.categoriesNeedSync && (
                <button
                  className="btn-sync"
                  onClick={handleSyncCategories}
                  disabled={syncing}
                >
                  {syncing ? 'Syncing...' : `Sync Categories (${syncInfo.categoryCount} pictures)`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status Filter */}
        <div className="filter-bar">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${statusFilter === 'APPROVED' ? 'active' : ''}`}
              onClick={() => handleStatusFilterChange('APPROVED')}
            >
              Approved
            </button>
            <button
              className={`filter-btn ${statusFilter === 'CLASSIFIED' ? 'active' : ''}`}
              onClick={() => handleStatusFilterChange('CLASSIFIED')}
            >
              Classified
            </button>
            <button
              className={`filter-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => handleStatusFilterChange('PENDING')}
            >
              Pending
            </button>
            <button
              className={`filter-btn ${statusFilter === 'REJECTED' ? 'active' : ''}`}
              onClick={() => handleStatusFilterChange('REJECTED')}
            >
              Rejected
            </button>
          </div>
          <div className="results-count">
            {pagination.total} picture(s) found
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Bulk Actions Bar */}
        {selectedPictures.size > 0 && (
          <div className="bulk-actions-bar">
            <span className="bulk-count">{selectedPictures.size} picture(s) selected</span>
            <div className="bulk-buttons">
              <button className="btn-bulk-edit" onClick={handleBulkEditClick}>
                Edit Selected
              </button>
              <button className="btn-bulk-delete" onClick={handleBulkDeleteClick}>
                Delete Selected
              </button>
              <button className="btn-bulk-clear" onClick={() => setSelectedPictures(new Set())}>
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Preview Size Slider */}
        {!loading && pictures.length > 0 && (
          <div className="preview-size-slider">
            <span className="slider-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              Table
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={previewSize}
              onChange={(e) => setPreviewSize(parseInt(e.target.value))}
              className="size-slider"
            />
            <span className="slider-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Grid
            </span>
          </div>
        )}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : pictures.length === 0 ? (
          <div className="empty-state">
            <p>No pictures found with status: {statusFilter}</p>
          </div>
        ) : previewSize >= 50 ? (
          /* Thumbnail Grid View */
          <div
            className="pictures-grid"
            style={{ '--thumbnail-size': `${80 + (previewSize - 50) * 3}px` }}
          >
            {pictures.map((picture) => (
              <div
                key={picture.id}
                className={`picture-thumbnail ${selectedPictures.has(picture.id) ? 'selected' : ''}`}
              >
                <div className="thumbnail-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedPictures.has(picture.id)}
                    onChange={() => toggleSelectPicture(picture.id)}
                  />
                </div>
                <img
                  src={getImageUrl(picture.filePath)}
                  alt={`Picture ${picture.id}`}
                  onClick={() => setViewingPicture(picture)}
                />
                <div className="thumbnail-overlay">
                  <span className={`type-indicator ${picture.type === 'SCHEMATIC' ? 'schematic' : 'photo'}`}>
                    {picture.type === 'SCHEMATIC' ? '📐' : '📸'}
                  </span>
                  <div className="thumbnail-actions">
                    <button
                      className="btn-thumb-edit"
                      onClick={(e) => { e.stopPropagation(); handleEditClick(picture); }}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-thumb-delete"
                      onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(picture); }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="thumbnail-info">
                  <span className="thumbnail-category">
                    {picture.category?.name || 'No category'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div
              className="pictures-table"
              style={{ '--preview-size': `${60 + previewSize * 2.4}px` }}
            >
              <table>
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <input
                        type="checkbox"
                        checked={selectedPictures.size === pictures.length && pictures.length > 0}
                        onChange={toggleSelectAll}
                        title="Select all"
                      />
                    </th>
                    <th>Preview</th>
                    <th className="sortable" onClick={() => handleSort('type')}>
                      Type <span className="sort-icon">{getSortIcon('type')}</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('district')}>
                      District <span className="sort-icon">{getSortIcon('district')}</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('group')}>
                      Group <span className="sort-icon">{getSortIcon('group')}</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('troupe')}>
                      Troupe <span className="sort-icon">{getSortIcon('troupe')}</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('uploadedAt')}>
                      Date Uploaded <span className="sort-icon">{getSortIcon('uploadedAt')}</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('category')}>
                      Category <span className="sort-icon">{getSortIcon('category')}</span>
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pictures.map((picture) => (
                    <tr
                      key={picture.id}
                      className={`${selectedPictures.has(picture.id) ? 'selected' : ''} ${selectedPictures.size > 0 ? 'selection-mode' : ''}`}
                      onClick={() => selectedPictures.size > 0 && toggleSelectPicture(picture.id)}
                    >
                      <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedPictures.has(picture.id)}
                          onChange={() => toggleSelectPicture(picture.id)}
                        />
                      </td>
                      <td className="preview-cell" onClick={(e) => e.stopPropagation()}>
                        <img
                          src={getImageUrl(picture.filePath)}
                          alt={`Picture ${picture.id}`}
                          className="table-preview"
                          onClick={() => setViewingPicture(picture)}
                        />
                      </td>
                      <td>
                        <span className={`type-badge ${picture.type === 'SCHEMATIC' ? 'schematic' : 'photo'}`}>
                          {picture.type === 'SCHEMATIC' ? '📐 Schematic' : '📸 Photo'}
                        </span>
                      </td>
                      <td>
                        <div className="district-name">
                          {picture.pictureSet?.troupe?.group?.district?.name || '-'}
                        </div>
                      </td>
                      <td>
                        <div className="group-name">
                          {picture.pictureSet?.troupe?.group?.name || '-'}
                        </div>
                      </td>
                      <td>
                        <div className="troupe-name">
                          {picture.pictureSet?.troupe?.name || '-'}
                        </div>
                      </td>
                      <td>
                        <div className="date-cell">
                          {new Date(picture.uploadedAt).toLocaleDateString()}
                        </div>
                        <div className="uploader-name">
                          {picture.pictureSet?.uploadedBy?.name || 'Unknown'}
                        </div>
                      </td>
                      <td>
                        <div className="category-cell">
                          {picture.category?.name || (
                            <span className="no-category">Not classified</span>
                          )}
                        </div>
                        {picture.woodCount && (
                          <div className="wood-count">{picture.woodCount} bois</div>
                        )}
                      </td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-view"
                          onClick={() => setViewingPicture(picture)}
                          title="View picture"
                        >
                          View
                        </button>
                        <button
                          className="btn-edit"
                          onClick={() => handleEditClick(picture)}
                          title="Edit classification"
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete"
                          onClick={() => setShowDeleteConfirm(picture)}
                          disabled={deleting === picture.id}
                          title="Delete picture"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>
        )}

        {/* Pagination - shown for both views */}
        {!loading && pictures.length > 0 && pagination.totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="btn-page"
            >
              Previous
            </button>
            <span className="page-info">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="btn-page"
            >
              Next
            </button>
          </div>
        )}

        {/* View Picture Modal */}
        {viewingPicture && (
          <Modal
            isOpen={true}
            onClose={() => setViewingPicture(null)}
            title="View Picture"
            size="large"
          >
            <Modal.Body>
              <div className="view-picture-modal">
                <img
                  src={getImageUrl(viewingPicture.filePath)}
                  alt={`Picture ${viewingPicture.id}`}
                  className="view-picture-image"
                />
                <div className="view-picture-details">
                  <div className="detail-row">
                    <span className="detail-label">ID:</span>
                    <span className="detail-value">#{viewingPicture.id}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Type:</span>
                    <span className="detail-value">
                      {viewingPicture.type === 'SCHEMATIC' ? '📐 Schematic' : '📸 Photo'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">District:</span>
                    <span className="detail-value">
                      {viewingPicture.pictureSet?.troupe?.group?.district?.name || '-'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Group:</span>
                    <span className="detail-value">
                      {viewingPicture.pictureSet?.troupe?.group?.name || '-'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Troupe:</span>
                    <span className="detail-value">
                      {viewingPicture.pictureSet?.troupe?.name || '-'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Category:</span>
                    <span className="detail-value">
                      {viewingPicture.category?.name || 'Not classified'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Wood Count:</span>
                    <span className="detail-value">
                      {viewingPicture.woodCount || '-'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Uploaded:</span>
                    <span className="detail-value">
                      {new Date(viewingPicture.uploadedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Uploaded By:</span>
                    <span className="detail-value">
                      {viewingPicture.pictureSet?.uploadedBy?.name || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </Modal.Body>
            <Modal.Actions>
              <button
                onClick={() => setImageEditingPicture(viewingPicture)}
                className="primary"
              >
                Edit Image
              </button>
              <button onClick={() => setViewingPicture(null)} className="secondary">
                Close
              </button>
            </Modal.Actions>
          </Modal>
        )}

        {/* Image Editor Modal */}
        {imageEditingPicture && (
          <Modal
            isOpen={true}
            onClose={() => setImageEditingPicture(null)}
            title="Edit Image"
            size="large"
          >
            <Modal.Body>
              <ImageEditor
                imageUrl={getImageUrl(imageEditingPicture.filePath)}
                pictureId={imageEditingPicture.id}
                onSave={handleImageEditSave}
                onCancel={() => setImageEditingPicture(null)}
              />
            </Modal.Body>
          </Modal>
        )}

        {/* Edit Picture Modal */}
        <Modal
          isOpen={!!editingPicture}
          onClose={() => setEditingPicture(null)}
          title="Edit Picture Classification"
          size="medium"
        >
          <Modal.Body>
            {editingPicture && (
              <div className="edit-picture-modal">
                <div className="edit-preview">
                  <img
                    src={getImageUrl(editingPicture.filePath)}
                    alt={`Picture ${editingPicture.id}`}
                  />
                </div>
                <div className="edit-form">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      className="form-select"
                    >
                      <option value="INSTALLATION_PHOTO">📸 Photo</option>
                      <option value="SCHEMATIC">📐 Schematic</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                      className="form-select"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Date Taken</label>
                    <input
                      type="date"
                      value={editForm.takenAt}
                      onChange={(e) => setEditForm({ ...editForm, takenAt: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Wood Count (Nombre de bois)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.woodCount}
                      onChange={(e) => setEditForm({ ...editForm, woodCount: e.target.value })}
                      placeholder="e.g., 12"
                      className="form-input"
                    />
                  </div>
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={handleEditSave}
              className="primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => setEditingPicture(null)}
              className="secondary"
              disabled={saving}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(null)}
          title="Delete Picture?"
          variant="danger"
          size="small"
        >
          <Modal.Body>
            {showDeleteConfirm && (
              <>
                <div className="delete-preview">
                  <img
                    src={getImageUrl(showDeleteConfirm.filePath)}
                    alt="Picture to delete"
                  />
                </div>
                <div className="delete-info">
                  <p>
                    <strong>ID:</strong> #{showDeleteConfirm.id}
                  </p>
                  <p>
                    <strong>Type:</strong> {showDeleteConfirm.type === 'SCHEMATIC' ? 'Schematic' : 'Photo'}
                  </p>
                  <p>
                    <strong>Category:</strong> {showDeleteConfirm.category?.name || 'Not classified'}
                  </p>
                </div>
                <p className="warning-text">
                  This will permanently delete this picture. This action cannot be undone.
                </p>
              </>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={() => handleDelete(showDeleteConfirm?.id)}
              className="danger"
              disabled={deleting === showDeleteConfirm?.id}
            >
              {deleting === showDeleteConfirm?.id ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="secondary"
              disabled={deleting === showDeleteConfirm?.id}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* Bulk Edit Modal */}
        <Modal
          isOpen={showBulkEdit}
          onClose={() => setShowBulkEdit(false)}
          title={`Edit ${selectedPictures.size} Picture(s)`}
          size="medium"
        >
          <Modal.Body>
            <div className="bulk-edit-modal">
              <p className="bulk-edit-info">
                Leave a field empty to keep the existing value for each picture.
              </p>
              <div className="edit-form">
                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={bulkEditForm.type}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, type: e.target.value })}
                    className="form-select"
                  >
                    <option value="">-- Keep existing --</option>
                    <option value="INSTALLATION_PHOTO">Photo</option>
                    <option value="SCHEMATIC">Schematic</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={bulkEditForm.categoryId}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, categoryId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">-- Keep existing --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={handleBulkEditSave}
              className="primary"
              disabled={bulkSaving || (!bulkEditForm.type && !bulkEditForm.categoryId)}
            >
              {bulkSaving ? 'Updating...' : 'Update Pictures'}
            </button>
            <button
              onClick={() => setShowBulkEdit(false)}
              className="secondary"
              disabled={bulkSaving}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>

        {/* Bulk Delete Confirmation Modal */}
        <Modal
          isOpen={showBulkDelete}
          onClose={() => setShowBulkDelete(false)}
          title={`Delete ${selectedPictures.size} Picture(s)?`}
          variant="danger"
          size="small"
        >
          <Modal.Body>
            <div className="bulk-delete-info">
              <p>You are about to delete <strong>{selectedPictures.size}</strong> picture(s).</p>
              <p className="warning-text">
                This will permanently delete the selected pictures. This action cannot be undone.
              </p>
              <p className="bulk-delete-note">
                Note: Pictures that are the last remaining picture in their set will be skipped.
              </p>
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={handleBulkDeleteConfirm}
              className="danger"
              disabled={bulkSaving}
            >
              {bulkSaving ? 'Deleting...' : 'Yes, Delete All'}
            </button>
            <button
              onClick={() => setShowBulkDelete(false)}
              className="secondary"
              disabled={bulkSaving}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>
      </div>
    </div>
  );
};

export default AdminPictures;
