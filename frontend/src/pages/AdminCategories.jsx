import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import './AdminCategories.css';

const AdminCategories = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
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

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      setError('');
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/categories/${categoryId}`, {
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

            <div className="categories-list">
              {categories.length === 0 ? (
                <div className="empty-state">
                  <p>No categories yet. Create your first category!</p>
                </div>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className="category-item">
                    <div className="category-info">
                      <h4>{category.name}</h4>
                      {category.description && (
                        <p className="category-description">{category.description}</p>
                      )}
                      {category.subcategories && category.subcategories.length > 0 && (
                        <span className="subcategory-count">
                          {category.subcategories.length} subcategories
                        </span>
                      )}
                    </div>
                    <div className="category-actions">
                      <span className="status-badge always-active">Always Active</span>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="btn-delete"
                        title="Delete category"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Schematics Section */}
          <section className="category-section">
            <h3>📐 Schematics Upload</h3>
            <p className="section-description">
              Enable/disable categories for schematic uploads
            </p>

            <div className="categories-list">
              {categories.map((category) => (
                <div key={category.id} className="category-item">
                  <div className="category-info">
                    <h4>{category.name}</h4>
                    {category.description && (
                      <p className="category-description">{category.description}</p>
                    )}
                  </div>
                  <div className="category-actions">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={category.isSchematicEnabled || false}
                        onChange={() =>
                          handleToggleSchematic(category.id, category.isSchematicEnabled)
                        }
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className={`status-badge ${category.isSchematicEnabled ? 'enabled' : 'disabled'}`}>
                      {category.isSchematicEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add New Category</h3>
            <form onSubmit={handleAddCategory}>
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

              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-cancel">
                  Cancel
                </button>
                <button type="submit" className="btn-submit primary">
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCategories;
