import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import Modal from '../components/Modal';
import './AdminRoles.css';

const AdminRoles = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedDistricts, setSelectedDistricts] = useState([]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [usersResponse, districtsResponse] = await Promise.all([
        fetch(`${API_URL}/api/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
        fetch(`${API_URL}/api/districts`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
      ]);

      if (!usersResponse.ok) throw new Error('Failed to load users');
      if (!districtsResponse.ok) throw new Error('Failed to load districts');

      const usersData = await usersResponse.json();
      const districtsData = await districtsResponse.json();

      // Filter only Branche members
      const brancheMembers = usersData.filter(u => u.role === 'BRANCHE_ECLAIREURS');

      setUsers(brancheMembers);
      setDistricts(districtsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditAccess = (userToEdit) => {
    setSelectedUser(userToEdit);
    // Get current district IDs for this user
    const currentDistrictIds = userToEdit.districtAccess?.map(da => da.districtId) || [];
    setSelectedDistricts(currentDistrictIds);
    setError('');
    setSuccess('');
  };

  const handleToggleDistrict = (districtId) => {
    setSelectedDistricts(prev => {
      if (prev.includes(districtId)) {
        return prev.filter(id => id !== districtId);
      } else {
        return [...prev, districtId];
      }
    });
  };

  const handleSaveAccess = async () => {
    if (!selectedUser) return;

    try {
      setError('');
      setSuccess('');
      const token = localStorage.getItem('token');

      const response = await fetch(
        `${API_URL}/api/users/${selectedUser.id}/district-access`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            districtIds: selectedDistricts,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update district access');
      }

      setSuccess(`Successfully updated district access for ${selectedUser.name}`);
      setSelectedUser(null);
      setSelectedDistricts([]);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setSelectedUser(null);
    setSelectedDistricts([]);
    setError('');
    setSuccess('');
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
    <div className="admin-roles">
      <div className="container">
        <div className="page-header">
          <h2>🔐 Branche Member Access Management</h2>
          <p className="header-description">
            Manage which districts Branche Éclaireurs members can access for picture classification
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="districts-grid">
          {districts.map((district) => {
            // Get users assigned to this district
            const assignedUsers = users.filter(user =>
              user.districtAccess?.some(da => da.districtId === district.id)
            );

            return (
              <div key={district.id} className="district-box">
                <div className="district-box-header">
                  <h3>{district.name}</h3>
                  <span className="district-code">{district.code}</span>
                </div>

                <div className="district-box-body">
                  {assignedUsers.length === 0 ? (
                    <div className="no-users">
                      <p>No Branche members assigned</p>
                    </div>
                  ) : (
                    <div className="users-list">
                      {assignedUsers.map((userItem) => (
                        <div key={userItem.id} className="user-card">
                          <div className="user-card-header">
                            <span className="user-name">{userItem.name}</span>
                            <button
                              onClick={() => handleEditAccess(userItem)}
                              className="btn-edit-small"
                              title="Edit Access"
                            >
                              ✏️
                            </button>
                          </div>
                          <div className="user-card-details">
                            <p className="user-email">{userItem.email}</p>
                            {userItem.troupe && (
                              <p className="user-troupe">
                                {userItem.troupe.name}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {districts.length === 0 && (
          <div className="empty-state">
            <p>No districts found</p>
          </div>
        )}
      </div>

      {/* Edit Access Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={handleCancel}
        title={`District Access - ${selectedUser?.name || ''}`}
        size="medium"
      >
        <Modal.Body>
          <p className="modal-subtitle">Select districts for picture classification</p>

          <div className="access-toolbar">
            <span className="access-count">
              {selectedDistricts.length} / {districts.length} selected
            </span>
            <div className="access-quick-actions">
              <button
                type="button"
                onClick={() => setSelectedDistricts(districts.map(d => d.id))}
                className="btn-quick"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedDistricts([])}
                className="btn-quick"
              >
                None
              </button>
            </div>
          </div>

          <div className="districts-list">
            {districts.map((district) => (
              <label key={district.id} className="district-item">
                <input
                  type="checkbox"
                  checked={selectedDistricts.includes(district.id)}
                  onChange={() => handleToggleDistrict(district.id)}
                />
                <div className="district-info">
                  <span className="district-name">{district.name}</span>
                  <span className="district-meta">
                    {district.code} • {district.groups?.length || 0} groups
                  </span>
                </div>
              </label>
            ))}
          </div>
        </Modal.Body>
        <Modal.Actions>
          <button onClick={handleSaveAccess} className="primary">
            Save Changes
          </button>
          <button onClick={handleCancel} className="secondary">
            Cancel
          </button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default AdminRoles;
