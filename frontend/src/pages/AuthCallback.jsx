import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthCallback.css';

/**
 * Where Keycloak's round trip lands: /auth/callback?kc=<ticket>&next=<path>
 *
 * The backend has already verified the Keycloak tokens, found or created the
 * nodus account and applied the access rules. All that is left is to trade the
 * one-time ticket for the nodus token — the token itself never travels in a URL.
 */
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeKeycloakLogin } = useAuth();
  const [error, setError] = useState('');
  // The ticket is single use: React may mount this twice in dev (StrictMode),
  // and the second exchange would fail on an already-claimed ticket.
  const started = useRef(false);

  const ticket = searchParams.get('kc');
  const next = searchParams.get('next') || '/dashboard';

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!ticket) {
      navigate('/login?error=keycloak-error', { replace: true });
      return;
    }

    completeKeycloakLogin(ticket)
      .then((result) => {
        // A chief whose Inscription unit matched no nodus troupe cannot upload
        // yet: send them to the dashboard, which explains what to do.
        navigate(result?.needsTroupe ? '/dashboard?needsTroupe=1' : next, {
          replace: true,
        });
      })
      .catch((err) => {
        setError(err.message || 'Échec de la connexion');
      });
  }, [ticket, next, completeKeycloakLogin, navigate]);

  if (error) {
    return (
      <div className="auth-callback">
        <div className="auth-callback-card">
          <h2>Connexion interrompue</h2>
          <p className="auth-callback-error">{error}</p>
          <button className="primary" onClick={() => navigate('/login', { replace: true })}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-callback">
      <div className="auth-callback-card">
        <div className="auth-callback-spinner" aria-hidden="true" />
        <h2>Connexion en cours…</h2>
        <p>Nous vérifions votre compte Scouts du Liban.</p>
      </div>
    </div>
  );
};

export default AuthCallback;
