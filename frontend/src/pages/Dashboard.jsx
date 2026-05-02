import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, schematicService, analyticsService } from '../services/api';
import Modal from '../components/Modal';
import { ToastContainer, useToast } from '../components/Toast';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pictures, setPictures] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    photosApproved: 0,
    schematicsApproved: 0,
    rejected: 0,
    photosToClassify: 0,
    photosToApprove: 0,
    schematicsToApprove: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [schematicStats, setSchematicStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  const [ctImageStats, setCtImageStats] = useState({
    unclassifiedPhotos: 0,
    schematics: 0,
  });
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    try {
      // Recent sets list (for the table below) — separate from the summary counts.
      const data = await pictureService.getAll({ limit: 50 });
      const listPictures = user?.role === 'CHEF_TROUPE'
        ? data.pictures.filter(p => p.uploadedBy?.id === user.id)
        : data.pictures;
      setPictures(listPictures);

      // Role-scoped summary (counts individual images, matches Statistiques page).
      try {
        const summary = await analyticsService.getDashboardSummary();
        setStats({
          total: summary.total || 0,
          pending: summary.pending || 0,
          photosApproved: summary.photosApproved || 0,
          schematicsApproved: summary.schematicsApproved || 0,
          rejected: summary.rejected || 0,
          photosToClassify: summary.photosToClassify || 0,
          photosToApprove: summary.photosToApprove || 0,
          schematicsToApprove: summary.schematicsToApprove || 0,
        });
      } catch (err) {
        console.error('Failed to load dashboard summary:', err);
      }

      // CT-only secondary stats (unclassified photos / schematics counts).
      if (user?.role === 'CHEF_TROUPE') {
        try {
          const imageStats = await pictureService.getMyTroupeStats();
          setCtImageStats(imageStats);
        } catch (err) {
          console.error('Failed to load CT image stats:', err);
        }
      }

      // Schematic stats for the action card.
      try {
        const schematicData = await schematicService.getStats();
        setSchematicStats(schematicData);
      } catch (err) {
        console.error('Failed to load schematic stats:', err);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if user can delete a picture set
  const canDelete = (picture) => {
    if (!user) return false;
    const isOwner = picture.uploadedBy?.id === user.id;
    const isAdmin = user.role === 'ADMIN';
    const isApproved = picture.status === 'APPROVED';

    // Admin can delete anything
    if (isAdmin) return true;
    // Owner can delete non-approved
    if (isOwner && !isApproved) return true;
    return false;
  };

  const handleDelete = async (pictureId) => {
    try {
      setDeleting(true);
      await pictureService.delete(pictureId);
      setDeleteConfirm(null);
      // Reload dashboard data
      await loadDashboardData();
    } catch (err) {
      console.error('Failed to delete picture set:', err);
      addToast(err.error || 'Failed to delete picture set', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="container">
        <div className="dashboard-header">
          <div>
            <h2>Dashboard</h2>
            <p className="text-muted">
              Welcome back, {user?.name}
            </p>
          </div>
        </div>

        {user?.role === 'CHEF_TROUPE' ? (
          <>
            {/* Top: Show photos (all uploads) */}
            <div className="quick-actions quick-actions-single">
              <Link to="/my-troupe-pictures" className="action-card my-troupe-action">
                <div className="action-icon">🏕️</div>
                <div className="action-content">
                  <h3>Photos de ma troupe</h3>
                  <p>Parcourir, modifier ou supprimer les séries</p>
                </div>
              </Link>
            </div>

            <div className="quick-actions-separator"></div>

            {/* Pictures: Upload + Classify */}
            <div className="quick-actions">
              <Link to="/upload" className="action-card upload-action">
                <div className="action-icon">📤</div>
                <div className="action-content">
                  <h3>Upload Pictures</h3>
                  <p>Add new installation photos</p>
                </div>
              </Link>
              <Link to="/classify" className="action-card classify-action">
                <div className="action-icon">🏷️</div>
                <div className="action-content">
                  <h3>Classify Pictures</h3>
                  <p>Add categories and details to pending pictures</p>
                </div>
              </Link>
            </div>

            <div className="quick-actions-separator"></div>

            {/* Schematics: Upload + Nodus Challenge Progress */}
            <div className="quick-actions">
              <Link to="/schematics/upload" className="action-card schematic-action">
                <div className="action-icon">📐</div>
                <div className="action-content">
                  <h3>Upload Schematic</h3>
                  <p>Add patrouille hand-drawn schematics</p>
                </div>
              </Link>
              <Link to="/schematics/progress" className="action-card progress-action">
                <div className="action-icon">📊</div>
                <div className="action-content">
                  <h3>Schematics "Nodus Challenge" Progress</h3>
                  <p>Track patrouille completion</p>
                </div>
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Quick Actions - Pictures (Branche/Admin) */}
            <div className="quick-actions">
              <Link to="/classify" className="action-card classify-action">
                <div className="action-icon">🏷️</div>
                <div className="action-content">
                  <h3>Classify Pictures</h3>
                  <p>Add categories and details to pending pictures</p>
                </div>
              </Link>
              <Link to="/review" className="action-card review-action">
                <div className="action-icon">✅</div>
                <div className="action-content">
                  <h3>Review Queue</h3>
                  <p>Approve or reject classified pictures</p>
                </div>
              </Link>
            </div>

            <div className="quick-actions-separator"></div>

            {/* Quick Actions - Schematics (Branche/Admin) */}
            <div className="quick-actions">
              <Link to="/schematics/progress" className="action-card progress-action">
                <div className="action-icon">📊</div>
                <div className="action-content">
                  <h3>Schematics "Nodus Challenge" Progress</h3>
                  <p>Track patrouille completion</p>
                </div>
              </Link>
              <Link to="/schematics/review" className="action-card schematic-review-action">
                <div className="action-icon">📋</div>
                <div className="action-content">
                  <h3>Review Schematics</h3>
                  <p>{schematicStats.pending} pending approval</p>
                </div>
              </Link>
              {user?.role === 'ADMIN' && (
                <Link to="/admin/dashboard#audit" className="action-card audit-action">
                  <div className="action-icon">🔍</div>
                  <div className="action-content">
                    <h3>Audit des approbations</h3>
                    <p>Who approved what, and edits after approval</p>
                  </div>
                </Link>
              )}
            </div>
          </>
        )}

        {/* Stats: Branche/Admin see the same approval-queue cards as the Statistiques page;
            CT keeps the 5-card image-count summary scoped to their troupe. */}
        {user?.role === 'CHEF_TROUPE' ? (
          <div className="stats-grid stats-grid-5">
            <div className="stat-card">
              <div className="stat-icon total">🖼️</div>
              <div className="stat-info">
                <h3>{stats.total}</h3>
                <p>Total uploads</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon pending">⏳</div>
              <div className="stat-info">
                <h3>{stats.pending}</h3>
                <p>Pending</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon approved">📷</div>
              <div className="stat-info">
                <h3>{stats.photosApproved}</h3>
                <p>Photos approuvées</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon approved">📐</div>
              <div className="stat-info">
                <h3>{stats.schematicsApproved}</h3>
                <p>Schémas approuvés</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon rejected">❌</div>
              <div className="stat-info">
                <h3>{stats.rejected}</h3>
                <p>Rejetés</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="approval-kpi-row approval-kpi-row--three">
            <Link to="/classify" className="approval-card approval-card--classify">
              <div className="approval-icon" aria-hidden="true">🏷️</div>
              <div className="approval-body">
                <div className="approval-value">{stats.photosToClassify}</div>
                <div className="approval-label">Photos à classer</div>
                <div className="approval-sublabel">
                  Tous districts{stats.photosToClassify > 0 && ' — ouvrir'}
                </div>
              </div>
            </Link>
            <Link to="/review" className="approval-card approval-card--photos">
              <div className="approval-icon" aria-hidden="true">📷</div>
              <div className="approval-body">
                <div className="approval-value">{stats.photosToApprove}</div>
                <div className="approval-label">Photos à approuver</div>
                <div className="approval-sublabel">
                  Tous districts{stats.photosToApprove > 0 && ' — ouvrir la file'}
                </div>
              </div>
            </Link>
            <Link to="/schematics/review" className="approval-card approval-card--schematics">
              <div className="approval-icon" aria-hidden="true">📐</div>
              <div className="approval-body">
                <div className="approval-value">{stats.schematicsToApprove}</div>
                <div className="approval-label">Schémas à approuver</div>
                <div className="approval-sublabel">
                  Tous districts{stats.schematicsToApprove > 0 && ' — ouvrir la file'}
                </div>
              </div>
            </Link>
          </div>
        )}

        {user?.role === 'CHEF_TROUPE' && (
          <div className="stats-grid stats-grid-2">
            <Link to="/classify" className="stat-card stat-card-link">
              <div className="stat-icon classified">🏷️</div>
              <div className="stat-info">
                <h3>{ctImageStats.unclassifiedPhotos}</h3>
                <p>Photos non classées</p>
              </div>
            </Link>

            <Link to="/schematics/progress" className="stat-card stat-card-link">
              <div className="stat-icon total">📐</div>
              <div className="stat-info">
                <h3>{ctImageStats.schematics}</h3>
                <p>Schémas</p>
              </div>
            </Link>
          </div>
        )}

        {/* Category breakdown moved to Statistiques — link there instead */}
        {(user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') && (
          <div className="stats-link-section">
            <Link to="/stats/users" className="stats-link-card">
              <div className="stats-link-icon" aria-hidden="true">📊</div>
              <div className="stats-link-body">
                <h3>Statistiques</h3>
                <p>Voir le détail complet par catégorie, troupe et district</p>
              </div>
              <span className="stats-link-arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        )}

        {/* Recent Pictures */}
        <div className="recent-pictures">
          <div className="pictures-header">
            <h3>{user?.role === 'CHEF_TROUPE' ? 'Your Pictures' : 'Recent Submissions'}</h3>
          </div>

          {pictures.length === 0 ? (
            <div className="empty-state">
              <p>No pictures yet</p>
              {user?.role === 'CHEF_TROUPE' && (
                <Link to="/upload" className="primary">
                  Upload Your First Picture
                </Link>
              )}
            </div>
          ) : (
            <div className="recent-table-wrapper">
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Groupe</th>
                    <th>Troupe</th>
                    <th>Set</th>
                    <th>Date</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {pictures.slice(0, 10).map((picture) => {
                    const district = picture.troupe?.group?.district?.name || '—';
                    const groupName = picture.troupe?.group?.name || '—';
                    const troupeName = picture.troupe?.name || '—';
                    return (
                      <tr
                        key={picture.id}
                        className="recent-row"
                        onClick={() => window.location.assign(`/picture/${picture.id}`)}
                      >
                        <td>{district}</td>
                        <td>{groupName}</td>
                        <td>{troupeName}</td>
                        <td className="recent-set">
                          <span className="recent-type" aria-hidden="true">
                            {picture.type === 'INSTALLATION_PHOTO' ? '📸' : '📐'}
                          </span>
                          {picture.title}
                        </td>
                        <td>{new Date(picture.uploadedAt).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-badge ${picture.status.toLowerCase()}`}>
                            {picture.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Picture Set?"
          variant="danger"
        >
          <Modal.Body>
            {deleteConfirm && (
              <>
                <p>
                  Are you sure you want to delete "<strong>{deleteConfirm.title}</strong>"?
                  This will permanently delete all {deleteConfirm.pictures?.length || 0} pictures.
                </p>
                <p className="warning-text">This action cannot be undone.</p>
              </>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={() => handleDelete(deleteConfirm?.id)}
              className="danger"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="secondary"
              disabled={deleting}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default Dashboard;
