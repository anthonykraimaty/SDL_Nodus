import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import './AdminUsers.css';

const AdminUsers = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [troupes, setTroupes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CHEF_TROUPE',
    troupeId: '',
    isActive: true,
    forcePasswordChange: false,
  });

  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [usersResponse, troupesResponse] = await Promise.all([
        fetch('http://localhost:3001/api/admin/users', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('http://localhost:3001/api/admin/troupes', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const usersData = await usersResponse.json();
      const troupesData = await troupesResponse.json();

      setUsers(usersData);
      setTroupes(troupesData);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
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
        await fetch(`http://localhost:3001/api/admin/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        });
        setSuccess('User updated successfully!');
      } else {
        if (!userForm.password) {
          setError('Password is required for new users');
          return;
        }
        await fetch('http://localhost:3001/api/admin/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        });
        setSuccess('User created successfully!');
      }

      resetForm();
      loadData();
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const handleEdit = (userToEdit) => {
    setEditingUser(userToEdit);
    setUserForm({
      name: userToEdit.name,
      email: userToEdit.email,
      password: '',
      role: userToEdit.role,
      troupeId: userToEdit.troupeId || '',
      isActive: userToEdit.isActive,
      forcePasswordChange: userToEdit.forcePasswordChange || false,
    });

    // Pre-select district and group if editing a CHEF_TROUPE user
    if (userToEdit.role === 'CHEF_TROUPE' && userToEdit.troupe) {
      if (userToEdit.troupe.group && userToEdit.troupe.group.districtId) {
        setSelectedDistrict(userToEdit.troupe.group.districtId.toString());
        setSelectedGroup(userToEdit.troupe.groupId.toString());
      } else {
        setSelectedDistrict('');
        setSelectedGroup('');
      }
    } else {
      setSelectedDistrict('');
      setSelectedGroup('');
    }

    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const token = localStorage.getItem('token');
      await fetch(`http://localhost:3001/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setSuccess('User deleted successfully!');
      loadData();
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const resetForm = () => {
    setUserForm({
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
    setShowModal(false);
  };

  // Excel Import Functions
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Validate and transform data
        const users = data.map((row, index) => ({
          name: row.Name || row.name || '',
          email: row.Email || row.email || '',
          password: row.Password || row.password || '',
          role: row.Role || row.role || '',
          district: row.District || row.district || '',
          group: row.Group || row.group || '',
          troupe: row.Troupe || row.troupe || '',
          rowNumber: index + 2,
        }));

        setImportPreview(users);
      } catch (err) {
        setError('Failed to parse Excel file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (!importPreview || importPreview.length === 0) return;

    setImporting(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/admin/users/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ users: importPreview }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import users');
      }

      const result = await response.json();

      let messages = [];
      if (result.errors.length > 0) {
        messages.push(`${result.errors.length} errors`);
        console.error('Import errors:', result.details.errors);
      }

      if (result.troupesNeeded.length > 0) {
        messages.push(`${result.troupesNeeded.length} users need troupes to be created first`);
        console.warn('Troupes needed:', result.details.troupesNeeded);
      }

      if (messages.length > 0) {
        setError(`Import completed with issues: ${messages.join(', ')}. Check console for details.`);
      }

      if (result.success > 0) {
        setSuccess(`Successfully imported ${result.success} users!`);
      }

      setImportPreview(null);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        Name: 'John Doe',
        Email: 'john@example.com',
        Password: 'password123',
        Role: 'CHEF_TROUPE',
        District: 'Vieux Bruxelles',
        Group: 'Group A',
        Troupe: 'Troupe Saint-Georges'
      },
      {
        Name: 'Jane Smith',
        Email: 'jane@example.com',
        Password: 'password123',
        Role: 'BRANCHE_ECLAIREURS',
        District: '',
        Group: '',
        Troupe: ''
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'users_template.xlsx');
  };

  // Filter users based on search term
  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;

    const search = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search) ||
      u.role?.toLowerCase().includes(search) ||
      u.troupe?.name?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="admin-users">
        <div className="container loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="admin-container">
        <div className="page-header">
          <h1>User Management</h1>
          <div className="header-actions">
            <button onClick={downloadTemplate} className="btn-secondary">
              Download Template
            </button>
            <label className="btn-secondary file-upload-btn">
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button onClick={() => setShowModal(true)} className="btn-add primary">
              Add New User
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Search Bar */}
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, role, or troupe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Import Preview */}
        {importPreview && (
          <div className="import-preview">
            <div className="import-preview-header">
              <h3>Import Preview ({importPreview.length} users)</h3>
              <div className="import-actions">
                <button onClick={() => setImportPreview(null)} className="btn-cancel">
                  Cancel
                </button>
                <button onClick={handleImport} className="btn-primary" disabled={importing}>
                  {importing ? 'Importing...' : 'Confirm Import'}
                </button>
              </div>
            </div>
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>District</th>
                    <th>Group</th>
                    <th>Troupe</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((user, idx) => (
                    <tr key={idx} className={!user.name || !user.email || !user.password || !user.role ? 'error-row' : ''}>
                      <td>{user.rowNumber}</td>
                      <td>{user.name || <span className="missing">Missing</span>}</td>
                      <td>{user.email || <span className="missing">Missing</span>}</td>
                      <td>{user.role || <span className="missing">Missing</span>}</td>
                      <td>{user.district || '-'}</td>
                      <td>{user.group || '-'}</td>
                      <td>{user.troupe || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="users-table-container">
          <table className="users-table">
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
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-badge ${u.role.toLowerCase()}`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{u.troupe?.name || '-'}</td>
                  <td>
                    <span className={`status-badge ${u.isActive ? 'active' : 'inactive'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions">
                    <button onClick={() => handleEdit(u)} className="btn-icon btn-edit">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="btn-icon btn-delete">
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
            <form onSubmit={handleSubmit}>
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

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={userForm.isActive}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={userForm.forcePasswordChange}
                    onChange={(e) => setUserForm({ ...userForm, forcePasswordChange: e.target.checked })}
                  />
                  <span>Force Password Change on Next Login</span>
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={resetForm} className="btn-cancel">
                  Cancel
                </button>
                <button type="submit" className="btn-submit primary">
                  {editingUser ? 'Update' : 'Create'} User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
