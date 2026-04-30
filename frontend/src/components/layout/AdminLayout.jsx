import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AdminLayout.css';

const AdminLayout = () => {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const toggleMobileSidebar = () => setMobileSidebarOpen((prev) => !prev);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (!isAdmin()) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only administrators can access this section</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <button
        className={`mobile-admin-toggle ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={toggleMobileSidebar}
        aria-label="Toggle admin menu"
      >
        {mobileSidebarOpen ? '✕' : '☰'}
      </button>

      {mobileSidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Admin Sidebar */}
      <aside className={`admin-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="admin-brand">
          <span className="brand-icon">🏕️</span>
          <span className="brand-text">Nodus Admin</span>
        </div>

        <nav className="admin-nav">
          <Link
            to="/admin"
            className={`admin-nav-link ${isActive('/admin') && location.pathname === '/admin' ? 'active' : ''}`}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">Dashboard</span>
          </Link>

          <Link
            to="/admin/users"
            className={`admin-nav-link ${isActive('/admin/users') ? 'active' : ''}`}
          >
            <span className="nav-icon">👥</span>
            <span className="nav-text">Users</span>
          </Link>

          <Link
            to="/admin/roles"
            className={`admin-nav-link ${isActive('/admin/roles') ? 'active' : ''}`}
          >
            <span className="nav-icon">🔐</span>
            <span className="nav-text">District Access</span>
          </Link>

          <Link
            to="/admin/categories"
            className={`admin-nav-link ${isActive('/admin/categories') ? 'active' : ''}`}
          >
            <span className="nav-icon">📁</span>
            <span className="nav-text">Categories</span>
          </Link>

          <Link
            to="/admin/organizations"
            className={`admin-nav-link ${isActive('/admin/organizations') ? 'active' : ''}`}
          >
            <span className="nav-icon">🏢</span>
            <span className="nav-text">Organizations</span>
          </Link>

          <Link
            to="/admin/pictures"
            className={`admin-nav-link ${isActive('/admin/pictures') ? 'active' : ''}`}
          >
            <span className="nav-icon">🖼️</span>
            <span className="nav-text">Pictures</span>
          </Link>

          <Link
            to="/admin/recovered"
            className={`admin-nav-link ${isActive('/admin/recovered') ? 'active' : ''}`}
          >
            <span className="nav-icon">♻️</span>
            <span className="nav-text">Recovered</span>
          </Link>

          <Link
            to="/admin/audit"
            className={`admin-nav-link ${isActive('/admin/audit') ? 'active' : ''}`}
          >
            <span className="nav-icon">📜</span>
            <span className="nav-text">Audit Log</span>
          </Link>

          <div className="nav-separator"></div>
          <div className="nav-section-title">Data Management</div>

          <Link
            to="/admin/districts"
            className={`admin-nav-link ${isActive('/admin/districts') ? 'active' : ''}`}
          >
            <span className="nav-icon">🗺️</span>
            <span className="nav-text">Districts</span>
          </Link>

          <Link
            to="/admin/groups"
            className={`admin-nav-link ${isActive('/admin/groups') ? 'active' : ''}`}
          >
            <span className="nav-icon">🏘️</span>
            <span className="nav-text">Groups</span>
          </Link>

          <Link
            to="/admin/troupes"
            className={`admin-nav-link ${isActive('/admin/troupes') ? 'active' : ''}`}
          >
            <span className="nav-icon">⛺</span>
            <span className="nav-text">Troupes</span>
          </Link>

          <Link
            to="/admin/patrouilles"
            className={`admin-nav-link ${isActive('/admin/patrouilles') ? 'active' : ''}`}
          >
            <span className="nav-icon">🦅</span>
            <span className="nav-text">Patrouilles</span>
          </Link>
        </nav>

        <div className="admin-user">
          <div className="admin-user-info">
            <span className="admin-user-name">{user?.name}</span>
            <span className="admin-user-role">Administrator</span>
          </div>
          <button onClick={handleLogout} className="btn-admin-logout">
            Logout
          </button>
        </div>
      </aside>

      {/* Admin Content */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
