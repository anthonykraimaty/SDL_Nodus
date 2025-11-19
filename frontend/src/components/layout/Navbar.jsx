import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
    navigate('/');
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <nav className="navbar">
      <div className="container navbar-content">
        <Link to="/" className="navbar-brand" onClick={closeMobileMenu}>
          <span className="brand-icon">🏕️</span>
          <span className="brand-text">Nodus</span>
        </Link>

        <button
          className={`mobile-menu-toggle ${mobileMenuOpen ? 'open' : ''}`}
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className={`navbar-links ${mobileMenuOpen ? 'open' : ''}`}>
          <Link to="/" className="nav-link" onClick={closeMobileMenu}>Home</Link>
          <Link to="/browse" className="nav-link" onClick={closeMobileMenu}>Browse</Link>

          {isAuthenticated() ? (
            <>
              {user?.role === 'ADMIN' ? (
                <>
                  {/* Admin users only see admin link */}
                  <Link to="/admin" className="nav-link" onClick={closeMobileMenu}>Admin Panel</Link>

                  <div className="navbar-user">
                    <span className="user-name">{user?.name}</span>
                    <span className="user-role">Administrator</span>
                    <button onClick={handleLogout} className="btn-logout">
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Non-admin users see normal pages */}
                  {user?.role === 'CHEF_TROUPE' && (
                    <>
                      <Link to="/upload" className="nav-link" onClick={closeMobileMenu}>Upload</Link>
                      <Link to="/classify" className="nav-link" onClick={closeMobileMenu}>Classify</Link>
                    </>
                  )}
                  {user?.role === 'BRANCHE_ECLAIREURS' && (
                    <>
                      <Link to="/classify" className="nav-link" onClick={closeMobileMenu}>Classify</Link>
                      <Link to="/review" className="nav-link" onClick={closeMobileMenu}>Review Queue</Link>
                    </>
                  )}
                  <Link to="/dashboard" className="nav-link" onClick={closeMobileMenu}>Dashboard</Link>

                  <div className="navbar-user">
                    <span className="user-name">{user?.name}</span>
                    <span className="user-role">{user?.role?.replace('_', ' ')}</span>
                    <button onClick={handleLogout} className="btn-logout">
                      Logout
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <Link to="/login" className="btn-login" onClick={closeMobileMenu}>
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
