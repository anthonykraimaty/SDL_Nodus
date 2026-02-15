import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import { categoryService } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import './Admin.css';

const Admin = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [troupes, setTroupes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedSection, setExpandedSection] = useState('form');
  const [confirmAction, setConfirmAction] = useState(null);

  // Category form state
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    type: 'INSTALLATION_PHOTO',
    parentId: '',
    displayOrder: 0,
  });

  // User form state
  const [userForm, setUserForm] = useState({
    id: '',
    name: '',
    email: '',
    password: '',
    role: 'CHEF_TROUPE',
    troupeId: '',
    isActive: true,
    forcePasswordChange: false,
  });

  // Cascading selection for CHEF_TROUPE
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'categories') {
        const categoriesData = await categoryService.getAll({});
        setCategories(categoriesData);
      } else if (activeTab === 'users') {
        // Load users
        const response = await fetch(`${API_URL}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        const data = await response.json();
        setUsers(data);

        // Load troupes for dropdown
        const troupesResponse = await fetch(`${API_URL}/api/admin/troupes`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        const troupesData = await troupesResponse.json();
        setTroupes(troupesData);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Get unique districts from troupes
  const getDistricts = () => {
    const districtsMap = new Map();
    troupes.forEach(troupe => {
      if (troupe.group?.district) {
        const district = troupe.group.district;
        if (!districtsMap.has(district.id)) {
          districtsMap.set(district.id, district);
        }
      }
    });
    return Array.from(districtsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get groups for selected district
  const getGroupsForDistrict = (districtId) => {
    if (!districtId) return [];
    const groupsMap = new Map();
    troupes.forEach(troupe => {
      if (troupe.group?.districtId === parseInt(districtId)) {
        if (!groupsMap.has(troupe.group.id)) {
          groupsMap.set(troupe.group.id, troupe.group);
        }
      }
    });
    return Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Handle district change
  const handleDistrictChange = (districtId) => {
    setSelectedDistrict(districtId);
    setSelectedGroup('');
    setUserForm({ ...userForm, troupeId: '' });
  };

  // Handle group change
  const handleGroupChange = (groupId) => {
    setSelectedGroup(groupId);
    setUserForm({ ...userForm, troupeId: '' });
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const data = {
        ...categoryForm,
        parentId: categoryForm.parentId ? parseInt(categoryForm.parentId) : null,
        displayOrder: parseInt(categoryForm.displayOrder),
      };

      if (editingCategory) {
        // Update existing category
        await fetch(`${API_URL}/api/categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(data),
        });
        setSuccess('Category updated successfully!');
      } else {
        // Create new category
        await fetch(`${API_URL}/api/categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(data),
        });
        setSuccess('Category created successfully!');
      }

      setExpandedSection(null);
      // Reset form
      setCategoryForm({
        name: '',
        description: '',
        type: 'INSTALLATION_PHOTO',
        parentId: '',
        displayOrder: 0,
      });
      setEditingCategory(null);
      loadData();
    } catch (err) {
      setError('Failed to save category');
    }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const data = {
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
        troupeId: userForm.troupeId ? parseInt(userForm.troupeId) : null,
        isActive: userForm.isActive,
        forcePasswordChange: userForm.forcePasswordChange,
      };

      if (userForm.password) {
        data.password = userForm.password;
      }

      if (editingUser) {
        // Update existing user
        await fetch(`${API_URL}/api/admin/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(data),
        });
        setSuccess('User updated successfully!');
      } else {
        // Create new user
        if (!userForm.password) {
          setError('Password is required for new users');
          return;
        }
        await fetch(`${API_URL}/api/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(data),
        });
        setSuccess('User created successfully!');
      }

      setExpandedSection(null);
      // Reset form
      setUserForm({
        id: '',
        name: '',
        email: '',
        password: '',
        role: 'CHEF_TROUPE',
        troupeId: '',
        isActive: true,
        forcePasswordChange: false,
      });
      setSelectedDistrict('');
      setSelectedGroup('');
      setEditingUser(null);
      loadData();
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      type: category.type,
      parentId: category.parentId || '',
      displayOrder: category.displayOrder,
    });
    setExpandedSection('form');
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      troupeId: user.troupeId || '',
      isActive: user.isActive,
      forcePasswordChange: user.forcePasswordChange || false,
    });

    // Pre-select district and group if editing a CHEF_TROUPE user
    if (user.role === 'CHEF_TROUPE' && user.troupe) {
      setSelectedDistrict(user.troupe.group.districtId.toString());
      setSelectedGroup(user.troupe.groupId.toString());
    } else {
      setSelectedDistrict('');
      setSelectedGroup('');
    }

    setExpandedSection('form');
  };

  const handleDeleteCategory = (id) => {
    setConfirmAction({
      title: 'Delete category?',
      message: 'Are you sure you want to delete this category?',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await fetch(`${API_URL}/api/categories/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          });
          setSuccess('Category deleted successfully!');
          loadData();
        } catch (err) {
          setError('Failed to delete category');
        }
      },
    });
  };

  const handleDeleteUser = (id) => {
    setConfirmAction({
      title: 'Delete user?',
      message: 'Are you sure you want to delete this user?',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await fetch(`${API_URL}/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          });
          setSuccess('User deleted successfully!');
          loadData();
        } catch (err) {
          setError('Failed to delete user');
        }
      },
    });
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

  return (
    <div className="admin-page">
      <div className="container">
        <div className="admin-header">
          <h1>Admin Dashboard</h1>
          <p>Manage categories, users, and system settings</p>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button
            className={`tab-button ${activeTab === 'categories' ? 'active' : ''}`}
            onClick={() => setActiveTab('categories')}
          >
            Categories
          </button>
          <button
            className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
        </div>

        {/* Messages */}
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="admin-content">
            <div className="admin-grid">
              {/* Category Form */}
              <div className="admin-card accordion-container">
                <div className="accordion-section">
                  <button
                    className={`accordion-header ${expandedSection === 'form' ? 'active' : ''}`}
                    onClick={() => toggleSection('form')}
                  >
                    <span>{editingCategory ? '✏️ Edit Category' : '➕ Create Category'}</span>
                    <span className="accordion-icon">{expandedSection === 'form' ? '▼' : '▶'}</span>
                  </button>
                  {expandedSection === 'form' && (
                    <div className="accordion-content">
                      <form onSubmit={handleCategorySubmit} className="admin-form">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                      rows="3"
                    />
                  </div>

                  <div className="form-group">
                    <label>Type *</label>
                    <select
                      value={categoryForm.type}
                      onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value })}
                      required
                    >
                      <option value="INSTALLATION_PHOTO">Installation Photo</option>
                      <option value="SCHEMATIC">Schematic</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Parent Category (for subcategories)</label>
                    <select
                      value={categoryForm.parentId}
                      onChange={(e) => setCategoryForm({ ...categoryForm, parentId: e.target.value })}
                    >
                      <option value="">None (Top-level category)</option>
                      {categories.filter(c => !c.parentId && c.type === categoryForm.type).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Display Order</label>
                    <input
                      type="number"
                      value={categoryForm.displayOrder}
                      onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: e.target.value })}
                    />
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn-primary">
                      {editingCategory ? 'Update' : 'Create'} Category
                    </button>
                    {editingCategory && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditingCategory(null);
                          setCategoryForm({
                            name: '',
                            description: '',
                            type: 'INSTALLATION_PHOTO',
                            parentId: '',
                            displayOrder: 0,
                          });
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              {/* Categories List */}
              <div className="admin-card">
                <h2>All Categories</h2>
                {loading ? (
                  <div className="loading">Loading...</div>
                ) : (
                  <div className="data-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Parent</th>
                          <th>Order</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map(cat => (
                          <tr key={cat.id}>
                            <td>{cat.name}</td>
                            <td>{cat.type}</td>
                            <td>{cat.parent?.name || '-'}</td>
                            <td>{cat.displayOrder}</td>
                            <td className="actions">
                              <button
                                className="btn-edit"
                                onClick={() => handleEditCategory(cat)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-delete"
                                onClick={() => handleDeleteCategory(cat.id)}
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
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="admin-content">
            <div className="admin-grid">
              {/* User Form */}
              <div className="admin-card accordion-container">
                <div className="accordion-section">
                  <button
                    className={`accordion-header ${expandedSection === 'form' ? 'active' : ''}`}
                    onClick={() => toggleSection('form')}
                  >
                    <span>{editingUser ? '✏️ Edit User' : '➕ Create User'}</span>
                    <span className="accordion-icon">{expandedSection === 'form' ? '▼' : '▶'}</span>
                  </button>
                  {expandedSection === 'form' && (
                    <div className="accordion-content">
                      <form onSubmit={handleUserSubmit} className="admin-form">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={userForm.name}
                      onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Password {!editingUser && '*'}</label>
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      required={!editingUser}
                      placeholder={editingUser ? 'Leave blank to keep current' : ''}
                    />
                  </div>

                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      required
                    >
                      <option value="CHEF_TROUPE">Chef Troupe</option>
                      <option value="BRANCHE_ECLAIREURS">Branche Éclaireurs</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>

                  {userForm.role === 'CHEF_TROUPE' && (
                    <>
                      <div className="form-group">
                        <label>District *</label>
                        <select
                          value={selectedDistrict}
                          onChange={(e) => handleDistrictChange(e.target.value)}
                          required
                        >
                          <option value="">Select District</option>
                          {getDistricts().map(district => (
                            <option key={district.id} value={district.id}>
                              {district.name} ({district.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Group *</label>
                        <select
                          value={selectedGroup}
                          onChange={(e) => handleGroupChange(e.target.value)}
                          disabled={!selectedDistrict}
                          required
                        >
                          <option value="">Select Group</option>
                          {getGroupsForDistrict(selectedDistrict).map(group => (
                            <option key={group.id} value={group.id}>
                              {group.name} ({group.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Troupe *</label>
                        <select
                          value={userForm.troupeId}
                          onChange={(e) => setUserForm({ ...userForm, troupeId: e.target.value })}
                          disabled={!selectedGroup}
                          required
                        >
                          <option value="">Select Troupe</option>
                          {troupes.filter(t => t.groupId === parseInt(selectedGroup)).map(troupe => (
                            <option key={troupe.id} value={troupe.id}>
                              {troupe.name} ({troupe.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={userForm.isActive}
                        onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                      />
                      <span>Active</span>
                    </label>
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={userForm.forcePasswordChange}
                        onChange={(e) => setUserForm({ ...userForm, forcePasswordChange: e.target.checked })}
                      />
                      <span>Force Password Change on Next Login</span>
                    </label>
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn-primary">
                      {editingUser ? 'Update' : 'Create'} User
                    </button>
                    {editingUser && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditingUser(null);
                          setUserForm({
                            id: '',
                            name: '',
                            email: '',
                            password: '',
                            role: 'CHEF_TROUPE',
                            troupeId: '',
                            isActive: true,
                            forcePasswordChange: false,
                          });
                          setSelectedDistrict('');
                          setSelectedGroup('');
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              {/* Users List */}
              <div className="admin-card">
                <h2>All Users</h2>
                {loading ? (
                  <div className="loading">Loading...</div>
                ) : (
                  <div className="data-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Troupe</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id}>
                            <td>{u.name}</td>
                            <td>{u.email}</td>
                            <td>{u.role}</td>
                            <td>{u.troupe?.name || '-'}</td>
                            <td>
                              <span className={`status-badge ${u.isActive ? 'active' : 'inactive'}`}>
                                {u.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="actions">
                              <button
                                className="btn-edit"
                                onClick={() => handleEditUser(u)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-delete"
                                onClick={() => handleDeleteUser(u.id)}
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
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        {...confirmAction}
      />
    </div>
  );
};

export default Admin;
