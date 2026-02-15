import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import * as XLSX from 'xlsx';
import './AdminUsers.css';

const AdminUsers = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [troupes, setTroupes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  // Never logged in users
  const [neverLoggedInUsers, setNeverLoggedInUsers] = useState([]);
  const [showNeverLoggedIn, setShowNeverLoggedIn] = useState(false);
  const [loadingNeverLoggedIn, setLoadingNeverLoggedIn] = useState(false);
  const [neverLoggedInSortKeys, setNeverLoggedInSortKeys] = useState([]); // Array of {key, direction}
  const [confirmAction, setConfirmAction] = useState(null);

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
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // Initialize search term from URL params (for role filter)
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam) {
      // Keep the underscore so it matches the role in the database
      setSearchTerm(roleParam);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, []);

  const loadNeverLoggedInUsers = async () => {
    try {
      setLoadingNeverLoggedIn(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/admin/users/never-logged-in`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setNeverLoggedInUsers(data);
    } catch (err) {
      setError('Failed to load never-logged-in users');
    } finally {
      setLoadingNeverLoggedIn(false);
    }
  };

  const exportNeverLoggedInCSV = () => {
    const exportData = neverLoggedInUsers.map(u => ({
      District: u.district || '',
      Groupe: u.group || '',
      Name: u.name || '',
      Email: u.email || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Never Logged In Users');
    XLSX.writeFile(wb, 'never_logged_in_users.csv');
  };

  const toggleNeverLoggedIn = () => {
    if (!showNeverLoggedIn && neverLoggedInUsers.length === 0) {
      loadNeverLoggedInUsers();
    }
    setShowNeverLoggedIn(!showNeverLoggedIn);
  };

  // Multi-column sorting for never-logged-in users
  // Each new column click adds to the sort chain - sorts within the already sorted results
  const handleNeverLoggedInSort = (key) => {
    setNeverLoggedInSortKeys(prev => {
      const existingIndex = prev.findIndex(s => s.key === key);

      if (existingIndex === -1) {
        // Add new sort key to the END of the chain (sorts within current sort)
        return [...prev, { key, direction: 'asc' }];
      } else {
        // Toggle direction or remove if already desc
        const existing = prev[existingIndex];
        if (existing.direction === 'asc') {
          // Change to desc
          const newKeys = [...prev];
          newKeys[existingIndex] = { key, direction: 'desc' };
          return newKeys;
        } else {
          // Remove from sort chain
          return prev.filter((_, i) => i !== existingIndex);
        }
      }
    });
  };

  const clearNeverLoggedInSort = () => {
    setNeverLoggedInSortKeys([]);
  };

  const getNeverLoggedInSortIndicator = (key) => {
    const sortItem = neverLoggedInSortKeys.find(s => s.key === key);
    if (!sortItem) return <span className="sort-indicator-inactive">↕</span>;
    const position = neverLoggedInSortKeys.indexOf(sortItem) + 1;
    return (
      <span className="sort-indicator-active">
        {sortItem.direction === 'asc' ? '↑' : '↓'}
        <span className="sort-position">{position}</span>
      </span>
    );
  };

  // Sort the never-logged-in users based on sort keys chain
  const sortedNeverLoggedInUsers = [...neverLoggedInUsers].sort((a, b) => {
    for (const { key, direction } of neverLoggedInSortKeys) {
      const aValue = (a[key] || '').toLowerCase();
      const bValue = (b[key] || '').toLowerCase();

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [usersResponse, troupesResponse] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/admin/troupes`, {
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
        await fetch(`${API_URL}/api/admin/users/${editingUser.id}`, {
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
        await fetch(`${API_URL}/api/admin/users`, {
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

  const handleDelete = (id) => {
    setConfirmAction({
      title: 'Delete user?',
      message: 'Are you sure you want to delete this user?',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const token = localStorage.getItem('token');
          await fetch(`${API_URL}/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          setSuccess('User deleted successfully!');
          loadData();
        } catch (err) {
          setError('Failed to delete user');
        }
      },
    });
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
      const response = await fetch(`${API_URL}/api/admin/users/import`, {
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

  const exportUsers = () => {
    const exportData = filteredUsers.map(u => ({
      District: u.troupe?.group?.district?.name || '',
      Groupe: u.troupe?.group?.name || '',
      Troupe: u.troupe?.name || '',
      Name: u.name || '',
      Email: u.email || '',
      Role: u.role || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'users_export.xlsx');
  };

  // Filter users based on search term
  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;

    const search = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search) ||
      u.role?.toLowerCase().includes(search) ||
      u.troupe?.name?.toLowerCase().includes(search) ||
      u.troupe?.group?.name?.toLowerCase().includes(search)
    );
  });

  // Sort users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aValue, bValue;

    switch (sortConfig.key) {
      case 'name':
        aValue = a.name?.toLowerCase() || '';
        bValue = b.name?.toLowerCase() || '';
        break;
      case 'email':
        aValue = a.email?.toLowerCase() || '';
        bValue = b.email?.toLowerCase() || '';
        break;
      case 'role':
        aValue = a.role?.toLowerCase() || '';
        bValue = b.role?.toLowerCase() || '';
        break;
      case 'group':
        aValue = a.troupe?.group?.name?.toLowerCase() || '';
        bValue = b.troupe?.group?.name?.toLowerCase() || '';
        break;
      case 'status':
        aValue = a.isActive ? 'active' : 'inactive';
        bValue = b.isActive ? 'active' : 'inactive';
        break;
      default:
        aValue = '';
        bValue = '';
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Handle sort
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Get sort indicator
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

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
            <button onClick={exportUsers} className="btn-secondary">
              Export Data
            </button>
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

        {/* Never Logged In Dashboard */}
        <div className="never-logged-in-section">
          <button
            onClick={toggleNeverLoggedIn}
            className={`btn-toggle-dashboard ${showNeverLoggedIn ? 'active' : ''}`}
          >
            {showNeverLoggedIn ? 'Masquer' : 'Afficher'} les utilisateurs jamais connectés
            {!showNeverLoggedIn && neverLoggedInUsers.length > 0 && (
              <span className="badge">{neverLoggedInUsers.length}</span>
            )}
          </button>

          {showNeverLoggedIn && (
            <div className="never-logged-in-dashboard">
              <div className="dashboard-header">
                <h3>Utilisateurs jamais connectés</h3>
                {neverLoggedInUsers.length > 0 && (
                  <button onClick={exportNeverLoggedInCSV} className="btn-export-csv">
                    Télécharger CSV
                  </button>
                )}
              </div>

              {loadingNeverLoggedIn ? (
                <div className="loading-inline">
                  <div className="spinner-small"></div>
                  <span>Chargement...</span>
                </div>
              ) : neverLoggedInUsers.length === 0 ? (
                <div className="empty-state-inline">
                  <span>Tous les utilisateurs se sont déjà connectés!</span>
                </div>
              ) : (
                <>
                  {neverLoggedInSortKeys.length > 0 && (
                    <div className="sort-info-bar">
                      <span>Tri: {neverLoggedInSortKeys.map((s, i) => (
                        <span key={s.key} className="sort-tag">
                          {i > 0 && ' → '}
                          {s.key === 'district' ? 'District' : s.key === 'group' ? 'Groupe' : s.key === 'name' ? 'Nom' : 'Email'}
                          {s.direction === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      ))}</span>
                      <button onClick={clearNeverLoggedInSort} className="btn-clear-sort">
                        Effacer tri
                      </button>
                    </div>
                  )}
                  <div className="never-logged-in-table-container">
                    <table className="never-logged-in-table">
                      <thead>
                        <tr>
                          <th className="sortable-header" onClick={() => handleNeverLoggedInSort('district')}>
                            District {getNeverLoggedInSortIndicator('district')}
                          </th>
                          <th className="sortable-header" onClick={() => handleNeverLoggedInSort('group')}>
                            Groupe {getNeverLoggedInSortIndicator('group')}
                          </th>
                          <th className="sortable-header" onClick={() => handleNeverLoggedInSort('name')}>
                            Nom {getNeverLoggedInSortIndicator('name')}
                          </th>
                          <th className="sortable-header" onClick={() => handleNeverLoggedInSort('email')}>
                            Email {getNeverLoggedInSortIndicator('email')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedNeverLoggedInUsers.map((u) => (
                          <tr key={u.id}>
                            <td>{u.district || '-'}</td>
                            <td>{u.group || '-'}</td>
                            <td>{u.name}</td>
                            <td>{u.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="dashboard-footer">
                <span className="count-label">
                  {neverLoggedInUsers.length} utilisateur{neverLoggedInUsers.length !== 1 ? 's' : ''} jamais connecté{neverLoggedInUsers.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, role, group, or troupe..."
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
                <th className="sortable" onClick={() => handleSort('name')}>
                  Name <span className="sort-indicator">{getSortIndicator('name')}</span>
                </th>
                <th className="sortable" onClick={() => handleSort('email')}>
                  Email <span className="sort-indicator">{getSortIndicator('email')}</span>
                </th>
                <th className="sortable" onClick={() => handleSort('role')}>
                  Role <span className="sort-indicator">{getSortIndicator('role')}</span>
                </th>
                <th className="sortable" onClick={() => handleSort('group')}>
                  Group / Troupe <span className="sort-indicator">{getSortIndicator('group')}</span>
                </th>
                <th className="sortable" onClick={() => handleSort('status')}>
                  Status <span className="sort-indicator">{getSortIndicator('status')}</span>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-badge ${u.role.toLowerCase()}`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {u.troupe ? (
                      <>
                        <span className="group-name">{u.troupe.group?.name || '-'}</span>
                        <span className="troupe-name">{u.troupe.name}</span>
                      </>
                    ) : '-'}
                  </td>
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
      <Modal
        isOpen={showModal}
        onClose={resetForm}
        title={editingUser ? 'Edit User' : 'Create New User'}
        size="medium"
      >
        <form onSubmit={handleSubmit}>
          <Modal.Body>
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
                        {group.name}
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
                        {troupe.name}
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
          </Modal.Body>
          <Modal.Actions>
            <button type="submit" className="primary">
              {editingUser ? 'Update' : 'Create'} User
            </button>
            <button type="button" onClick={resetForm} className="secondary">
              Cancel
            </button>
          </Modal.Actions>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        {...confirmAction}
      />
    </div>
  );
};

export default AdminUsers;
