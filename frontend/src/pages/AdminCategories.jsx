import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import { categorySetService } from '../services/api';
import Modal from '../components/Modal';
import './AdminCategories.css';

const AdminCategories = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryStats, setCategoryStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // category to delete
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    displayOrder: 0,
    parentId: null,
  });

  // Category Sets state
  const [categorySets, setCategorySets] = useState([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [showAddSetModal, setShowAddSetModal] = useState(false);
  const [editingSet, setEditingSet] = useState(null);
  const [setForm, setSetForm] = useState({ name: '', displayOrder: 0 });
  const [expandedSets, setExpandedSets] = useState({});
  const [addingItemToSet, setAddingItemToSet] = useState(null); // setId
  const [addItemSearch, setAddItemSearch] = useState('');
  const [deleteSetConfirm, setDeleteSetConfirm] = useState(null);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadCategories();
      loadCategorySets();
    }
  }, [user]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Load all categories
      const response = await fetch(
        `${API_URL}/api/categories`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load categories');
      }

      const data = await response.json();
      console.log('Loaded categories:', data);
      setCategories(data || []);
    } catch (err) {
      console.error('Error loading categories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCategorySets = async () => {
    try {
      setLoadingSets(true);
      const data = await categorySetService.getAll();
      setCategorySets(data || []);
    } catch (err) {
      console.error('Error loading category sets:', err);
    } finally {
      setLoadingSets(false);
    }
  };

  const handleCreateSet = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await categorySetService.create({
        name: setForm.name,
        displayOrder: parseInt(setForm.displayOrder) || 0,
      });
      setSuccess('Category set created successfully');
      setShowAddSetModal(false);
      setEditingSet(null);
      setSetForm({ name: '', displayOrder: 0 });
      loadCategorySets();
    } catch (err) {
      setError(err.message || 'Failed to create category set');
    }
  };

  const handleUpdateSet = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await categorySetService.update(editingSet.id, {
        name: setForm.name,
        displayOrder: parseInt(setForm.displayOrder) || 0,
      });
      setSuccess('Category set updated successfully');
      setEditingSet(null);
      setShowAddSetModal(false);
      setSetForm({ name: '', displayOrder: 0 });
      loadCategorySets();
    } catch (err) {
      setError(err.message || 'Failed to update category set');
    }
  };

  const handleDeleteSet = async () => {
    if (!deleteSetConfirm) return;
    try {
      setError('');
      await categorySetService.delete(deleteSetConfirm.id);
      setSuccess('Category set deleted successfully');
      setDeleteSetConfirm(null);
      loadCategorySets();
    } catch (err) {
      setError(err.message || 'Failed to delete category set');
      setDeleteSetConfirm(null);
    }
  };

  const handleAddItemToSet = async (setId, categoryId) => {
    try {
      setError('');
      const set = categorySets.find(s => s.id === setId);
      const maxOrder = set?.items?.length || 0;
      await categorySetService.addItem(setId, {
        categoryId: parseInt(categoryId),
        displayOrder: maxOrder,
      });
      setSuccess('Category added to set');
      setAddingItemToSet(null);
      loadCategorySets();
    } catch (err) {
      setError(err.message || 'Failed to add category to set');
    }
  };

  const handleRemoveItemFromSet = async (setId, categoryId) => {
    try {
      setError('');
      await categorySetService.removeItem(setId, categoryId);
      setSuccess('Category removed from set');
      loadCategorySets();
    } catch (err) {
      setError(err.message || 'Failed to remove category from set');
    }
  };

  const toggleSetExpanded = (setId) => {
    setExpandedSets(prev => ({ ...prev, [setId]: !prev[setId] }));
  };

  const openEditSet = (set) => {
    setEditingSet(set);
    setSetForm({ name: set.name, displayOrder: set.displayOrder });
    setShowAddSetModal(true);
  };

  const openAddSet = () => {
    setEditingSet(null);
    setSetForm({ name: '', displayOrder: categorySets.length });
    setShowAddSetModal(true);
  };

  // Get categories not yet in a specific set
  const getAvailableCategoriesForSet = (setId) => {
    const set = categorySets.find(s => s.id === setId);
    const usedCategoryIds = set?.items?.map(i => i.category?.id || i.categoryId) || [];
    return categories.filter(c => !usedCategoryIds.includes(c.id));
  };

  const handleToggleSchematic = async (categoryId, currentStatus) => {
    try {
      setError('');
      setSuccess('');
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/categories/${categoryId}/schematic`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          isSchematicEnabled: !currentStatus,
        }),
      });

      if (!response.ok) throw new Error('Failed to update category status');

      setSuccess(`Category ${!currentStatus ? 'enabled' : 'disabled'} for schematics`);
      loadCategories();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setSuccess('');
      const token = localStorage.getItem('token');

      const categoryData = {
        name: newCategory.name,
        description: newCategory.description,
        displayOrder: parseInt(newCategory.displayOrder) || 0,
        type: 'INSTALLATION_PHOTO', // Same categories for both types
        parentId: newCategory.parentId ? parseInt(newCategory.parentId) : null,
      };

      console.log('Creating category:', categoryData);

      const response = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(categoryData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create category');
      }

      setSuccess('Category created successfully');
      setShowAddModal(false);
      setNewCategory({ name: '', description: '', displayOrder: 0, parentId: null });
      loadCategories();
    } catch (err) {
      console.error('Error creating category:', err);
      setError(err.message);
    }
  };

  const handleDeleteClick = (category, e) => {
    if (e) e.stopPropagation();
    setDeleteConfirm(category);
  };

  const handleDeleteCategory = async () => {
    if (!deleteConfirm) return;

    try {
      setError('');
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/categories/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete category');
      }

      setSuccess('Category deleted successfully');
      setSelectedCategory(null);
      setDeleteConfirm(null);
      loadCategories();
    } catch (err) {
      setError(err.message);
      setDeleteConfirm(null);
    }
  };

  const handleCategoryClick = async (category) => {
    setSelectedCategory(category);
    setLoadingStats(true);
    setCategoryStats(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/categories/${category.id}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCategoryStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load category stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const [renamingCategory, setRenamingCategory] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRenameCategory = async () => {
    if (!renamingCategory || !renameValue.trim()) return;

    try {
      setError('');
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/categories/${renamingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to rename category');
      }

      const updated = await response.json();
      setSuccess(`Category renamed to "${updated.name}"`);
      setRenamingCategory(null);
      setRenameValue('');
      // Update selectedCategory if it's the same one
      if (selectedCategory?.id === updated.id) {
        setSelectedCategory({ ...selectedCategory, name: updated.name });
      }
      loadCategories();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateCategorySettings = async (setting, value) => {
    if (!selectedCategory) return;

    try {
      setError('');
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/categories/${selectedCategory.id}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ [setting]: value }),
      });

      if (!response.ok) throw new Error('Failed to update category settings');

      const updatedCategory = await response.json();
      setSelectedCategory(updatedCategory);
      setSuccess(`Category ${setting === 'isUploadDisabled' ? (value ? 'uploads disabled' : 'uploads enabled') : (value ? 'hidden from browse' : 'visible in browse')}`);
      loadCategories();
    } catch (err) {
      setError(err.message);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only administrators can access this page</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="admin-categories">
      <div className="container">
        <div className="page-header">
          <h2>Category Management</h2>
          <button onClick={() => setShowAddModal(true)} className="btn-add primary">
            Add New Category
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="management-sections">
          {/* Installation Photos Section */}
          <section className="category-section">
            <h3>📸 Installation Photos</h3>
            <p className="section-description">
              Categories for installation photos - Always available for upload
            </p>

            {categories.length === 0 ? (
              <div className="empty-state">
                <p>No categories yet. Create your first category!</p>
              </div>
            ) : (
              <div className="photo-categories-grid">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className={`photo-category-card ${category.isUploadDisabled ? 'upload-disabled' : ''} ${category.isHiddenFromBrowse ? 'hidden-from-browse' : ''}`}
                    onClick={() => handleCategoryClick(category)}
                  >
                    <div className="photo-category-header">
                      <h4>{category.name}</h4>
                      <button
                        onClick={(e) => handleDeleteClick(category, e)}
                        className="btn-delete-small"
                        title="Delete category"
                      >
                        ×
                      </button>
                    </div>
                    <div className="photo-category-badges">
                      {category.isUploadDisabled && (
                        <span className="mini-badge disabled">No Upload</span>
                      )}
                      {category.isHiddenFromBrowse && (
                        <span className="mini-badge hidden">Hidden</span>
                      )}
                    </div>
                    {category._count?.pictures > 0 && (
                      <span className="picture-count">{category._count.pictures} pics</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Category Sets Section */}
          <section className="category-section">
            <div className="section-header-row">
              <div>
                <h3>Category Sets</h3>
                <p className="section-description">
                  Group categories into named sets to track patrouille progress per set
                </p>
              </div>
              <button onClick={openAddSet} className="btn-add primary">
                Add New Set
              </button>
            </div>

            {loadingSets ? (
              <div className="cdm-loading">Loading sets...</div>
            ) : categorySets.length === 0 ? (
              <div className="empty-state">
                <p>No category sets defined yet. Create your first set!</p>
              </div>
            ) : (
              <div className="category-sets-list">
                {categorySets.map((set) => (
                  <div key={set.id} className="category-set-card">
                    <div className="category-set-header" onClick={() => toggleSetExpanded(set.id)}>
                      <div className="category-set-title">
                        <span className="expand-icon">{expandedSets[set.id] ? '\u25BC' : '\u25B6'}</span>
                        <h4>{set.name}</h4>
                        <span className="item-count">{set.items?.length || 0} categories</span>
                      </div>
                      <div className="category-set-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-edit-small"
                          onClick={() => openEditSet(set)}
                          title="Edit set"
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete-small"
                          onClick={() => setDeleteSetConfirm(set)}
                          title="Delete set"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {expandedSets[set.id] && (
                      <div className="category-set-items">
                        {set.items?.length > 0 ? (
                          <div className="set-items-grid">
                            {set.items.map((item) => (
                              <div key={item.id} className="set-item-chip">
                                <span>{item.category?.name || 'Unknown'}</span>
                                <button
                                  className="btn-remove-item"
                                  onClick={() => handleRemoveItemFromSet(set.id, item.category?.id || item.categoryId)}
                                  title="Remove from set"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-items">No categories in this set yet</p>
                        )}

                        {addingItemToSet === set.id ? (
                          <div className="add-item-selector">
                            <div className="add-item-search-wrapper">
                              <input
                                type="text"
                                className="add-item-search"
                                placeholder="Search categories..."
                                value={addItemSearch}
                                onChange={(e) => setAddItemSearch(e.target.value)}
                                autoFocus
                              />
                              <button
                                className="btn-cancel-small"
                                onClick={() => { setAddingItemToSet(null); setAddItemSearch(''); }}
                              >
                                Cancel
                              </button>
                            </div>
                            <div className="add-item-list">
                              {getAvailableCategoriesForSet(set.id)
                                .filter(cat => cat.name.toLowerCase().includes(addItemSearch.toLowerCase()))
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((cat) => (
                                  <button
                                    key={cat.id}
                                    className="add-item-option"
                                    onClick={() => {
                                      handleAddItemToSet(set.id, cat.id);
                                      setAddItemSearch('');
                                    }}
                                  >
                                    {cat.name}
                                  </button>
                                ))}
                              {getAvailableCategoriesForSet(set.id)
                                .filter(cat => cat.name.toLowerCase().includes(addItemSearch.toLowerCase())).length === 0 && (
                                <p className="no-results">No matching categories</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            className="btn-add-item"
                            onClick={() => setAddingItemToSet(set.id)}
                          >
                            + Add Category
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Schematics Section */}
          <section className="category-section">
            <h3>Schematics Upload</h3>
            <p className="section-description">
              Click to enable/disable categories for schematic uploads
            </p>

            <div className="schematic-categories-grid">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`schematic-category-chip ${category.isSchematicEnabled ? 'enabled' : 'disabled'}`}
                  onClick={() => handleToggleSchematic(category.id, category.isSchematicEnabled)}
                  title={category.description || category.name}
                >
                  <span className="chip-name">{category.name}</span>
                  <span className="chip-toggle">{category.isSchematicEnabled ? '\u2713' : '\u25CB'}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Add Category Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Category"
        size="medium"
      >
        <form onSubmit={handleAddCategory}>
          <Modal.Body>
            <div className="form-group">
              <label htmlFor="name">Category Name *</label>
              <input
                type="text"
                id="name"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={newCategory.description}
                onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                rows="3"
              />
            </div>

            <div className="form-group">
              <label htmlFor="parentId">Parent Category (Optional)</label>
              <select
                id="parentId"
                value={newCategory.parentId || ''}
                onChange={(e) => setNewCategory({ ...newCategory, parentId: e.target.value })}
              >
                <option value="">None (Top-level category)</option>
                {categories.filter(c => !c.parentId).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="displayOrder">Display Order</label>
              <input
                type="number"
                id="displayOrder"
                value={newCategory.displayOrder}
                onChange={(e) =>
                  setNewCategory({ ...newCategory, displayOrder: parseInt(e.target.value) })
                }
              />
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button type="submit" className="primary">
              Create Category
            </button>
            <button type="button" onClick={() => setShowAddModal(false)} className="secondary">
              Cancel
            </button>
          </Modal.Actions>
        </form>
      </Modal>

      {/* Category Details Modal */}
      <Modal
        isOpen={!!selectedCategory}
        onClose={() => setSelectedCategory(null)}
        title={selectedCategory?.name || 'Category Details'}
        size="medium"
      >
        <Modal.Body>
          {/* Statistics */}
          <div className="cdm-section">
            <div className="cdm-label">Statistics</div>
            {loadingStats ? (
              <div className="cdm-loading">Loading...</div>
            ) : categoryStats ? (
              <div className="cdm-stats">
                <div className="cdm-stat">
                  <span className="cdm-stat-value">{categoryStats.total}</span>
                  <span className="cdm-stat-label">Total</span>
                </div>
                <div className="cdm-stat pending">
                  <span className="cdm-stat-value">{categoryStats.pending}</span>
                  <span className="cdm-stat-label">Pending</span>
                </div>
                <div className="cdm-stat classified">
                  <span className="cdm-stat-value">{categoryStats.classified}</span>
                  <span className="cdm-stat-label">Classified</span>
                </div>
                <div className="cdm-stat approved">
                  <span className="cdm-stat-value">{categoryStats.approved}</span>
                  <span className="cdm-stat-label">Approved</span>
                </div>
                <div className="cdm-stat rejected">
                  <span className="cdm-stat-value">{categoryStats.rejected}</span>
                  <span className="cdm-stat-label">Rejected</span>
                </div>
                <div className="cdm-stat recent">
                  <span className="cdm-stat-value">{categoryStats.recentUploads}</span>
                  <span className="cdm-stat-label">7 Days</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Rename */}
          <div className="cdm-section">
            <div className="cdm-label">Rename</div>
            <div className="cdm-rename">
              <input
                type="text"
                value={renamingCategory?.id === selectedCategory?.id ? renameValue : selectedCategory?.name || ''}
                onChange={(e) => {
                  if (renamingCategory?.id !== selectedCategory?.id) {
                    setRenamingCategory(selectedCategory);
                    setRenameValue(e.target.value);
                  } else {
                    setRenameValue(e.target.value);
                  }
                }}
                onFocus={() => {
                  if (renamingCategory?.id !== selectedCategory?.id) {
                    setRenamingCategory(selectedCategory);
                    setRenameValue(selectedCategory?.name || '');
                  }
                }}
                placeholder="Category name"
                className="cdm-rename-input"
              />
              {renamingCategory?.id === selectedCategory?.id && renameValue.trim() && renameValue.trim() !== selectedCategory?.name && (
                <button
                  className="btn-rename-save"
                  onClick={handleRenameCategory}
                >
                  Save
                </button>
              )}
            </div>
          </div>

          {/* Settings */}
          <div className="cdm-section">
            <div className="cdm-label">Settings</div>
            <div className="cdm-settings">
              <label className="cdm-setting">
                <input
                  type="checkbox"
                  checked={selectedCategory?.isUploadDisabled || false}
                  onChange={(e) => handleUpdateCategorySettings('isUploadDisabled', e.target.checked)}
                />
                <span>Disable Uploads</span>
              </label>
              <label className="cdm-setting">
                <input
                  type="checkbox"
                  checked={selectedCategory?.isHiddenFromBrowse || false}
                  onChange={(e) => handleUpdateCategorySettings('isHiddenFromBrowse', e.target.checked)}
                />
                <span>Hide from Browse</span>
              </label>
            </div>
          </div>
        </Modal.Body>
        <Modal.Actions>
          <button
            className="danger"
            onClick={() => handleDeleteClick(selectedCategory)}
          >
            Delete
          </button>
          <button className="secondary" onClick={() => setSelectedCategory(null)}>
            Close
          </button>
        </Modal.Actions>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Category"
        variant="danger"
        size="small"
      >
        <Modal.Body>
          <p>Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?</p>
          <p className="warning-text">This action cannot be undone.</p>
        </Modal.Body>
        <Modal.Actions>
          <button className="danger" onClick={handleDeleteCategory}>
            Delete
          </button>
          <button className="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </button>
        </Modal.Actions>
      </Modal>

      {/* Add/Edit Category Set Modal */}
      <Modal
        isOpen={showAddSetModal}
        onClose={() => { setShowAddSetModal(false); setEditingSet(null); }}
        title={editingSet ? 'Edit Category Set' : 'Add New Category Set'}
        size="small"
      >
        <form onSubmit={editingSet ? handleUpdateSet : handleCreateSet}>
          <Modal.Body>
            <div className="form-group">
              <label htmlFor="setName">Set Name *</label>
              <input
                type="text"
                id="setName"
                value={setForm.name}
                onChange={(e) => setSetForm({ ...setForm, name: e.target.value })}
                placeholder="e.g., Couchement"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="setDisplayOrder">Display Order</label>
              <input
                type="number"
                id="setDisplayOrder"
                value={setForm.displayOrder}
                onChange={(e) => setSetForm({ ...setForm, displayOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button type="submit" className="primary">
              {editingSet ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowAddSetModal(false); setEditingSet(null); }} className="secondary">
              Cancel
            </button>
          </Modal.Actions>
        </form>
      </Modal>

      {/* Delete Category Set Confirmation */}
      <Modal
        isOpen={!!deleteSetConfirm}
        onClose={() => setDeleteSetConfirm(null)}
        title="Delete Category Set"
        variant="danger"
        size="small"
      >
        <Modal.Body>
          <p>Are you sure you want to delete the set <strong>{deleteSetConfirm?.name}</strong>?</p>
          <p className="warning-text">This will remove the set grouping but will not delete the categories themselves.</p>
        </Modal.Body>
        <Modal.Actions>
          <button className="danger" onClick={handleDeleteSet}>
            Delete Set
          </button>
          <button className="secondary" onClick={() => setDeleteSetConfirm(null)}>
            Cancel
          </button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default AdminCategories;
