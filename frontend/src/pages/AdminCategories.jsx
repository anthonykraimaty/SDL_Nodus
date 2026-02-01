import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
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

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadCategories();
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

          {/* Schematics Section */}
          <section className="category-section">
            <h3>📐 Schematics Upload</h3>
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
                  <span className="chip-toggle">{category.isSchematicEnabled ? '✓' : '○'}</span>
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
    </div>
  );
};

export default AdminCategories;
