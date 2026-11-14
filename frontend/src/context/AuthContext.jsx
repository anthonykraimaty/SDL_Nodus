import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Which ways in this server offers: { keycloak, password, breakGlass, realm }.
  // Null while unknown — the login page waits for it before drawing.
  const [methods, setMethods] = useState(null);

  // Check if user is logged in on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  // Ask the API how people may sign in (Keycloak, password, or both).
  // Failing softly matters: if this call fails the login page still shows the
  // password form rather than nothing at all.
  useEffect(() => {
    authService
      .getMethods()
      .then(setMethods)
      .catch(() => setMethods({ keycloak: false, password: true, breakGlass: false }));
  }, []);

  const loadUser = async () => {
    try {
      const userData = await authService.getMe();
      setUser(userData);
      setError(null);
    } catch (err) {
      console.error('Failed to load user:', err);
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await authService.login(email, password);
      localStorage.setItem('token', response.token);
      setUser(response.user);
      return {
        user: response.user,
        forcePasswordChange: response.forcePasswordChange,
      };
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  /**
   * Finish a Keycloak sign-in: trade the one-time ticket the backend put in
   * ?kc=… for the nodus token. The ticket is single use and lives 60 s, so a
   * refreshed callback page fails cleanly instead of signing in twice.
   */
  const completeKeycloakLogin = async (ticket) => {
    setError(null);
    const response = await authService.keycloakExchange(ticket);
    localStorage.setItem('token', response.token);
    setUser(response.user);
    return response;
  };

  const logout = async () => {
    // Was this a Keycloak session? Decide before the user is cleared.
    const viaKeycloak = user?.provider === 'KEYCLOAK';
    try {
      await authService.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('token');
      setUser(null);
    }
    // End the Keycloak session too, otherwise the next "Continue with…" signs
    // the same person straight back in without asking for a password.
    if (viaKeycloak) {
      window.location.href = authService.keycloakLogoutUrl();
    }
  };

  const isAdmin = () =>
    user?.role === 'ADMIN' ||
    (user?.role === 'BRANCHE_ECLAIREURS' && user?.isAdmin === true);
  const isChefTroupe = () => user?.role === 'CHEF_TROUPE';
  const isBrancheEclaireurs = () => user?.role === 'BRANCHE_ECLAIREURS';
  const isAuthenticated = () => !!user;
  // Signed in with a Scouts du Liban account: no nodus password to change,
  // and name/email are read-only (they come from the realm).
  const isKeycloakUser = () => user?.provider === 'KEYCLOAK';
  /**
   * The branches this user reviews. An empty array means every branche —
   * that is the case for ADMIN and for Branche accounts that predate the
   * branche split, so nothing they could do before is hidden from them.
   */
  const myBranches = () => (user?.role === 'ADMIN' ? [] : user?.branches || []);

  const value = {
    user,
    loading,
    error,
    methods,
    login,
    completeKeycloakLogin,
    logout,
    isAdmin,
    isChefTroupe,
    isBrancheEclaireurs,
    isAuthenticated,
    isKeycloakUser,
    myBranches,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
