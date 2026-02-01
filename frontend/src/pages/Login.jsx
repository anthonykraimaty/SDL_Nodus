import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();

  // Get redirect path from query params (used by share-target)
  const redirectPath = searchParams.get('redirect') || '/dashboard';

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
        navigate(redirectPath);
      }
    } catch (err) {
      setError(err.message || 'Échec de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSuccess = () => {
    setShowChangePassword(false);
    navigate(redirectPath);
  };

  const handlePasswordChangeCancel = () => {
    // Logout user if they cancel password change
    localStorage.removeItem('token');
    setShowChangePassword(false);
    setError('Le changement de mot de passe est requis pour continuer');
  };

  return (
    <div className="login-page">
      <div className="container">
        <div className="login-container">
          <div className="login-header">
            <div className="login-icon">
              <img src="/logo_nodus-transparent.png" alt="Nodus" className="login-logo" />
            </div>
            <h2>Bienvenue à Nodus</h2>
            <p>Connectez-vous pour gérer vos installations scoutes</p>
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
                placeholder="votre.email@exemple.com"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez votre mot de passe"
                required
              />
            </div>

            <button
              type="submit"
              className="btn-login-submit primary"
              disabled={loading}
            >
              {loading ? 'Connexion...' : 'Me connecter'}
            </button>
          </form>

          <div className="login-footer">
            <p className="text-muted">
              Pas sûr de votre compte ? Contactez votre commissaire.
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
