import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileDropdown from '../ProfileDropdown';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          <img src="/logo_nodus-transparent.png" alt="Nodus" className="brand-logo" />
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
                  <Link to="/admin" className="nav-link" onClick={closeMobileMenu}>Admin Panel</Link>
                  <ProfileDropdown closeMobileMenu={closeMobileMenu} />
                </>
              ) : (
                <>
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
                  <ProfileDropdown closeMobileMenu={closeMobileMenu} />
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
