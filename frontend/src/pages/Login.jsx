import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ChangePassword from '../components/ChangePassword';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      // Check if password change is required
      if (result.forcePasswordChange) {
        setShowChangePassword(true);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSuccess = () => {
    setShowChangePassword(false);
    navigate('/dashboard');
  };

  const handlePasswordChangeCancel = () => {
    // Logout user if they cancel password change
    localStorage.removeItem('token');
    setShowChangePassword(false);
    setError('Password change is required to continue');
  };

  return (
    <div className="login-page">
      <div className="container">
        <div className="login-container">
          <div className="login-header">
            <div className="login-icon">🏕️</div>
            <h2>Welcome to Nodus</h2>
            <p>Login to manage your scout installations</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn-login-submit primary"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="login-footer">
            <p className="text-muted">
              Don't have an account? Contact your administrator.
            </p>
          </div>
        </div>
      </div>

      {showChangePassword && (
        <ChangePassword
          onSuccess={handlePasswordChangeSuccess}
          onCancel={handlePasswordChangeCancel}
        />
      )}
    </div>
  );
};

export default Login;
