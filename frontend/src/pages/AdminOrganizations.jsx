import './AdminOrganizations.css';

const AdminOrganizations = () => {
  return (
    <div className="admin-organizations">
      <div className="admin-container">
        <div className="page-header">
          <h1>🏢 Organization Management</h1>
          <p>Manage districts, groups, and troupes</p>
        </div>

        <div className="coming-soon">
          <span className="coming-soon-icon">🚧</span>
          <h2>Coming Soon</h2>
          <p>Organization management features will be available in a future update.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminOrganizations;
