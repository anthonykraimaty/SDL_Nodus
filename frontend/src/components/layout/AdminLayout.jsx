import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AdminLayout.css';

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (user?.role !== 'ADMIN') {
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
      {/* Admin Sidebar */}
      <aside className="admin-sidebar">
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
