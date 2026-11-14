import { useState, useEffect } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Icon';
import '../../admin/admin-theme.css';
import './AdminLayout.css';

const NAV = [
  {
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/admin/users', label: 'Users', icon: 'users' },
      { to: '/admin/roles', label: 'District Access', icon: 'key' },
      { to: '/admin/access', label: 'Accès Keycloak', icon: 'idCard' },
      { to: '/admin/categories', label: 'Categories', icon: 'folder' },
      { to: '/admin/organizations', label: 'Organizations', icon: 'office' },
      { to: '/admin/pictures', label: 'Pictures', icon: 'photo' },
      { to: '/admin/recovered', label: 'Recovered', icon: 'recycle' },
      { to: '/admin/audit', label: 'Audit Log', icon: 'history' },
    ],
  },
  {
    title: 'Data management',
    items: [
      { to: '/admin/districts', label: 'Districts', icon: 'map' },
      { to: '/admin/groups', label: 'Groups', icon: 'home' },
      { to: '/admin/troupes', label: 'Troupes', icon: 'tent' },
      { to: '/admin/patrouilles', label: 'Patrouilles', icon: 'flag' },
    ],
  },
];

/**
 * Bootstrap is only wanted inside the admin: the public site has its own
 * global element styles that Bootstrap's would fight. So the compiled subset
 * is injected as a <style> while this layout is mounted and removed when it
 * unmounts. It is prepended to <head> so every app stylesheet still wins on
 * equal specificity.
 */
const useAdminBootstrap = () => {
  const [ready, setReady] = useState(
    () => typeof document !== 'undefined' && !!document.getElementById('admin-bootstrap')
  );

  useEffect(() => {
    let cancelled = false;
    let style = document.getElementById('admin-bootstrap');
    let owned = false;

    if (!style) {
      import('../../admin/admin-bootstrap.scss?inline')
        .then(({ default: css }) => {
          if (cancelled) return;
          style = document.createElement('style');
          style.id = 'admin-bootstrap';
          style.textContent = css;
          document.head.prepend(style);
          owned = true;
          setReady(true);
        })
        // Never block the admin on a styling chunk.
        .catch(() => !cancelled && setReady(true));
    }

    return () => {
      cancelled = true;
      if (owned) style?.remove();
    };
  }, []);

  return ready;
};

const AdminLayout = () => {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const bootstrapReady = useAdminBootstrap();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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

  const initials = (user?.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  return (
    <div className="admin-layout">
      {/* Mobile top bar */}
      <header className="admin-topbar d-lg-none">
        <button
          type="button"
          className="admin-icon-btn"
          onClick={() => setMobileSidebarOpen((v) => !v)}
          aria-label="Ouvrir le menu"
          aria-expanded={mobileSidebarOpen}
        >
          <Icon name={mobileSidebarOpen ? 'cross' : 'menu'} size={20} />
        </button>
        <span className="admin-topbar-title">Nodus Admin</span>
      </header>

      {mobileSidebarOpen && (
        <div
          className="admin-sidebar-backdrop d-lg-none"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`admin-sidebar ${mobileSidebarOpen ? 'is-open' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-mark">N</span>
          <div className="lh-sm">
            <div className="admin-brand-name">Nodus</div>
            <div className="admin-brand-sub">Administration</div>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Administration">
          {NAV.map((section, i) => (
            <div key={i} className="admin-nav-section">
              {section.title && <div className="admin-nav-title">{section.title}</div>}
              <ul className="nav flex-column">
                {section.items.map((item) => (
                  <li className="nav-item" key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
                    >
                      <Icon name={item.icon} size={18} />
                      <span className="text-truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/" className="admin-nav-link">
            <Icon name="arrowLeft" size={18} />
            <span>Retour au site</span>
          </Link>
          <div className="admin-user">
            <span className="admin-avatar" aria-hidden="true">{initials}</span>
            <div className="flex-grow-1 lh-sm overflow-hidden">
              <div className="admin-user-name text-truncate">{user?.name}</div>
              <div className="admin-user-role">Administrateur</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="admin-icon-btn"
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        {bootstrapReady ? (
          <div className="admin-shell-page">
            <Outlet />
          </div>
        ) : (
          <div className="admin-boot" role="status" aria-label="Chargement" />
        )}
      </main>
    </div>
  );
};

export default AdminLayout;
