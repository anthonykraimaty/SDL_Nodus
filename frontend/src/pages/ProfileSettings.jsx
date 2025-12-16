import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import './ProfileSettings.css';

const ProfileSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Name change state
  const [name, setName] = useState(user?.name || '');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');

  // Email change state
  const [email, setEmail] = useState(user?.email || '');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess('');

    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }

    if (name.trim() === user?.name) {
      setNameError('Name is the same as current');
      return;
    }

    try {
      setNameLoading(true);
      await authService.updateProfile({ name: name.trim() });
      setNameSuccess('Name updated successfully');
      // Reload user data
      window.location.reload();
    } catch (err) {
      setNameError(err.message || 'Failed to update name');
    } finally {
      setNameLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');

    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (email.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setEmailError('Email is the same as current');
      return;
    }

    try {
      setEmailLoading(true);
      await authService.updateProfile({ email: email.trim() });
      setEmailSuccess('Email updated successfully');
      // Reload user data
      window.location.reload();
    } catch (err) {
      setEmailError(err.message || 'Failed to update email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    try {
      setPasswordLoading(true);
      await authService.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Format role for display
  const formatRole = (role) => {
    if (!role) return '';
    return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="profile-settings-page">
      <div className="container">
        <div className="profile-settings-header">
          <button onClick={() => navigate(-1)} className="btn-back">
            ← Back
          </button>
          <h1>Profile Settings</h1>
        </div>

        <div className="profile-settings-content">
          {/* Profile Overview */}
          <div className="profile-card profile-overview">
            <div className="profile-avatar-xlarge">
              {getInitials(user?.name)}
            </div>
            <div className="profile-details">
              <h2>{user?.name}</h2>
              <p className="profile-email">{user?.email}</p>
              <span className="profile-role-badge">{formatRole(user?.role)}</span>
              {user?.troupe && (
                <p className="profile-troupe">
                  {user.troupe.name} - {user.troupe.group?.name}
                </p>
              )}
            </div>
          </div>

          {/* Change Name Form */}
          <div className="profile-card">
            <h3>Change Name</h3>
            <form onSubmit={handleNameSubmit} className="profile-form">
              {nameError && <div className="form-error">{nameError}</div>}
              {nameSuccess && <div className="form-success">{nameSuccess}</div>}

              <div className="form-group">
                <label htmlFor="name">Display Name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="form-input"
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={nameLoading}
              >
                {nameLoading ? 'Saving...' : 'Update Name'}
              </button>
            </form>
          </div>

          {/* Change Email Form */}
          <div className="profile-card">
            <h3>Change Email</h3>
            <form onSubmit={handleEmailSubmit} className="profile-form">
              {emailError && <div className="form-error">{emailError}</div>}
              {emailSuccess && <div className="form-success">{emailSuccess}</div>}

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="form-input"
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={emailLoading}
              >
                {emailLoading ? 'Saving...' : 'Update Email'}
              </button>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="profile-card">
            <h3>Change Password</h3>
            <form onSubmit={handlePasswordSubmit} className="profile-form">
              {passwordError && <div className="form-error">{passwordError}</div>}
              {passwordSuccess && <div className="form-success">{passwordSuccess}</div>}

              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="form-input"
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={passwordLoading}
              >
                {passwordLoading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
