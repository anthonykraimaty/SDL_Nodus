import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import Modal from '../components/Modal';
import './Admin.css';

const AdminGroups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    districtId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load groups and districts in parallel
      const [groupsResponse, districtsResponse] = await Promise.all([
        fetch(`${API_URL}/api/groups`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/districts`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const groupsData = await groupsResponse.json();
      const districtsData = await districtsResponse.json();

      setGroups(Array.isArray(groupsData) ? groupsData : []);
      setDistricts(Array.isArray(districtsData) ? districtsData : []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setGroups([]);
      setDistricts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      code: '',
      districtId: '',
    });
    setShowModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      code: group.code,
      districtId: group.districtId.toString(),
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.code.trim() || !formData.districtId) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = editingGroup
        ? `${API_URL}/api/groups/${editingGroup.id}`
        : `${API_URL}/api/groups`;

      const method = editingGroup ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          code: formData.code.trim(),
          districtId: parseInt(formData.districtId),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save group');
      }

      await loadData();
      setShowModal(false);
      setFormData({ name: '', code: '', districtId: '' });
    } catch (error) {
      console.error('Error saving group:', error);
      alert(error.message);
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!confirm('Are you sure you want to delete this group? This will also delete all associated troupes and their data.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/groups/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete group');
      }

      await loadData();
    } catch (error) {
      console.error('Error deleting group:', error);
      alert(error.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/groups/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import groups');
      }

      const result = await response.json();
      alert(`Successfully imported ${result.count} groups`);
      await loadData();
    } catch (error) {
      console.error('Error importing groups:', error);
      alert(error.message);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Name', 'Code', 'District Code'].join(','),
      ...groups.map(g => [
        `"${g.name}"`,
        g.code,
        g.district?.code || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'groups.csv';
    a.click();
  };

  const getDistrictName = (districtId) => {
    const district = districts.find(d => d.id === districtId);
    return district ? district.name : 'Unknown';
  };

  if (loading) {
    return <div className="admin-container">Loading...</div>;
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Group Management</h1>
        <div className="admin-actions">
          <button onClick={handleAddGroup} className="btn-primary">
            + Add Group
          </button>
          <button onClick={handleExport} className="btn-secondary">
            Export CSV
          </button>
          <label className="btn-secondary">
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      <div className="admin-stats">
        <div className="stat-card">
          <h3>{groups.length}</h3>
          <p>Total Groups</p>
        </div>
        <div className="stat-card">
          <h3>{groups.reduce((sum, g) => sum + (g._count?.troupes || 0), 0)}</h3>
          <p>Total Troupes</p>
        </div>
        <div className="stat-card">
          <h3>{districts.length}</h3>
          <p>Districts</p>
        </div>
      </div>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>District</th>
              <th>Troupes</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                  No groups found. Create your first group!
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td><code>{group.code}</code></td>
                  <td>{getDistrictName(group.districtId)}</td>
                  <td>{group._count?.troupes || 0}</td>
                  <td>{new Date(group.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        onClick={() => handleEditGroup(group)}
                        className="btn-edit"
                        title="Edit group"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="btn-delete"
                        title="Delete group"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingGroup ? 'Edit Group' : 'Add New Group'}
        size="medium"
      >
        <form onSubmit={handleSubmit}>
          <Modal.Body>
            <div className="form-group">
              <label>Group Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Groupe Casablanca"
                required
              />
            </div>

            <div className="form-group">
              <label>Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., GC"
                maxLength="10"
                required
              />
              <small>Unique identifier for this group</small>
            </div>

            <div className="form-group">
              <label>District *</label>
              <select
                value={formData.districtId}
                onChange={(e) => setFormData({ ...formData, districtId: e.target.value })}
                required
              >
                <option value="">Select a district</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name} ({district.code})
                  </option>
                ))}
              </select>
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button type="submit" className="primary">
              {editingGroup ? 'Update Group' : 'Create Group'}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="secondary">
              Cancel
            </button>
          </Modal.Actions>
        </form>
      </Modal>
    </div>
  );
};

export default AdminGroups;
