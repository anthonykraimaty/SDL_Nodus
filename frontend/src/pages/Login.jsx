import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import ChangePassword from '../components/ChangePassword';
import './Login.css';

// What the backend may send back on ?error=… , in the chief's own language.
const ERROR_MESSAGES = {
  'no-access': "Votre compte Scouts du Liban n'a pas accès à Nodus. Contactez votre commissaire de branche.",
  denied: 'Connexion annulée.',
  disabled: 'Ce compte a été désactivé.',
  'keycloak-off': "La connexion par compte Scouts du Liban n'est pas configurée sur ce serveur.",
  'keycloak-down': "Le service de connexion Scouts du Liban est injoignable. Réessayez dans quelques minutes.",
  'keycloak-error': 'La connexion a échoué. Réessayez.',
  'server-error': 'Une erreur est survenue pendant la connexion. Réessayez.',
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const { login, methods } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get redirect path from query params (used by share-target)
  const redirectPath = searchParams.get('redirect') || searchParams.get('next') || '/dashboard';

  const ssoTried = searchParams.get('sso') === '0';
  const silentAttempted = useRef(false);

  // Surface whatever the Keycloak round trip reported.
  useEffect(() => {
    const code = searchParams.get('error');
    if (code) setError(ERROR_MESSAGES[code] || ERROR_MESSAGES['keycloak-error']);
  }, [searchParams]);

  /**
   * First visit with Keycloak on and nothing to show yet: ask Keycloak
   * silently (prompt=none). A chief who is already signed in to the
   * registration portal lands on their dashboard without a click; anyone else
   * comes back to ?sso=0 and sees the button.
   */
  useEffect(() => {
    if (!methods?.keycloak) return;
    if (ssoTried || silentAttempted.current) return;
    if (searchParams.get('error') || searchParams.get('signedout')) return;
    silentAttempted.current = true;
    window.location.href = authService.keycloakLoginUrl({
      returnTo: redirectPath,
      silent: true,
    });
  }, [methods, ssoTried, searchParams, redirectPath]);

  const startKeycloak = () => {
    setError('');
    window.location.href = authService.keycloakLoginUrl({ returnTo: redirectPath });
  };

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
      // The API tells us when an account should be using Keycloak instead.
      const code = err?.body?.code;
      if (code === 'USE_KEYCLOAK') {
        setError('Ce compte se connecte avec un compte Scouts du Liban — utilisez le bouton ci-dessus.');
      } else if (code === 'PASSWORD_LOGIN_DISABLED') {
        setError('La connexion par mot de passe est désactivée. Utilisez votre compte Scouts du Liban.');
      } else {
        setError(err.message || 'Échec de connexion');
      }
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

  // While we don't yet know what this server offers, don't flash the wrong form.
  const keycloakOn = methods?.keycloak === true;
  // The password form is the only way in when Keycloak is off; otherwise it is
  // kept behind a link for the break-glass administrator.
  const passwordIsPrimary = methods ? !keycloakOn : false;
  const passwordAvailable = methods ? methods.password || methods.breakGlass : true;
  const passwordVisible = passwordIsPrimary || showPasswordForm;

  // A silent SSO attempt is about to navigate away — don't paint the form first.
  const awaitingSilentSso = keycloakOn && !ssoTried && !searchParams.get('error') &&
    !searchParams.get('signedout');

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

          {error && <div className="error-message login-error">{error}</div>}

          {!methods || awaitingSilentSso ? (
            <p className="login-checking">Vérification de votre session…</p>
          ) : (
            <>
              {keycloakOn && (
                <div className="login-sso">
                  <button type="button" className="btn-sso primary" onClick={startKeycloak}>
                    Continuer avec mon compte Scouts du Liban
                  </button>
                  <p className="login-sso-hint">
                    Le même identifiant que le portail d'inscription.
                  </p>
                </div>
              )}

              {keycloakOn && passwordAvailable && !passwordVisible && (
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPasswordForm(true)}
                >
                  Connexion de secours
                </button>
              )}

              {passwordVisible && passwordAvailable && (
                <>
                  {keycloakOn && <div className="login-separator"><span>ou</span></div>}
                  <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                      <label htmlFor="email">Email</label>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="votre.email@exemple.com"
                        required
                        autoFocus={passwordIsPrimary}
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
                </>
              )}
            </>
          )}

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
