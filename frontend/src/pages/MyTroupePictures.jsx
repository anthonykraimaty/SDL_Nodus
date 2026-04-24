import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import { ToastContainer, useToast } from '../components/Toast';
import './MyTroupePictures.css';

const STATUS_LABELS = {
  PENDING: 'En attente',
  CLASSIFIED: 'Classé',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
};

// Secondary filter keys
const STATE_ALL = 'all';
const STATE_APPROVED = 'approved';
const STATE_PENDING_APPROVAL = 'pending_approval'; // set is CLASSIFIED, awaiting branche
const STATE_NEEDS_CLASSIFICATION = 'needs_classification'; // picture has no category
const STATE_REJECTED = 'rejected';

const matchesState = (pic, state) => {
  const setStatus = pic.pictureSet?.status;
  switch (state) {
    case STATE_ALL: return true;
    case STATE_APPROVED: return setStatus === 'APPROVED';
    case STATE_PENDING_APPROVAL: return setStatus === 'CLASSIFIED';
    case STATE_NEEDS_CLASSIFICATION:
      return (setStatus === 'PENDING' || setStatus === 'CLASSIFIED') && !pic.categoryId;
    case STATE_REJECTED: return setStatus === 'REJECTED';
    default: return true;
  }
};

const MyTroupePictures = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('myTroupe.viewMode') || 'list');
  const [typeFilter, setTypeFilter] = useState('all'); // all | INSTALLATION_PHOTO | SCHEMATIC
  const [stateFilter, setStateFilter] = useState(STATE_ALL);
  const [search, setSearch] = useState('');
  const [thumbSize, setThumbSize] = useState(() => {
    const saved = parseInt(localStorage.getItem('myTroupe.thumbSize'), 10);
    return Number.isFinite(saved) && saved >= 48 && saved <= 200 ? saved : 96;
  });

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    localStorage.setItem('myTroupe.viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('myTroupe.thumbSize', String(thumbSize));
  }, [thumbSize]);

  useEffect(() => {
    if (!user || user.role !== 'CHEF_TROUPE') return;
    loadPictures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadPictures = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await pictureService.getMyTroupePictures({ limit: 500 });
      setPictures(data.pictures || []);
    } catch (err) {
      console.error('Failed to load troupe pictures:', err);
      setError("Impossible de charger les photos de la troupe.");
    } finally {
      setLoading(false);
    }
  };

  const canEdit = (pic) => pic.pictureSet?.status !== 'APPROVED';
  const canDelete = (pic) => {
    if (!user) return false;
    const set = pic.pictureSet;
    if (!set || set.status === 'APPROVED') return false;
    const isOwner = set.uploadedBy?.id === user.id;
    return isOwner || user.role === 'ADMIN';
  };

  // Counts for the tab headers (computed from unfiltered pictures,
  // but respecting the current *type* filter so the secondary tabs stay in sync).
  const byType = useMemo(() => {
    return pictures.filter((p) => {
      if (typeFilter === 'all') return true;
      return p.type === typeFilter;
    });
  }, [pictures, typeFilter]);

  const typeCounts = useMemo(() => ({
    all: pictures.length,
    INSTALLATION_PHOTO: pictures.filter((p) => p.type === 'INSTALLATION_PHOTO').length,
    SCHEMATIC: pictures.filter((p) => p.type === 'SCHEMATIC').length,
  }), [pictures]);

  const stateCounts = useMemo(() => ({
    [STATE_ALL]: byType.length,
    [STATE_APPROVED]: byType.filter((p) => matchesState(p, STATE_APPROVED)).length,
    [STATE_PENDING_APPROVAL]: byType.filter((p) => matchesState(p, STATE_PENDING_APPROVAL)).length,
    [STATE_NEEDS_CLASSIFICATION]: byType.filter((p) => matchesState(p, STATE_NEEDS_CLASSIFICATION)).length,
    [STATE_REJECTED]: byType.filter((p) => matchesState(p, STATE_REJECTED)).length,
  }), [byType]);

  const filteredPictures = useMemo(() => {
    const term = search.trim().toLowerCase();
    return byType.filter((p) => {
      if (!matchesState(p, stateFilter)) return false;
      if (term) {
        const set = p.pictureSet || {};
        const haystack = [
          set.title,
          set.uploadedBy?.name,
          set.patrouille?.totem,
          p.category?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [byType, stateFilter, search]);

  const handleDelete = async (pic) => {
    if (!pic) return;
    try {
      setDeleting(true);
      await pictureService.deletePicture(pic.pictureSet.id, pic.id);
      setDeleteConfirm(null);
      addToast('Photo supprimée', 'success');
      await loadPictures();
    } catch (err) {
      console.error('Failed to delete picture:', err);
      addToast(err.error || err.message || 'Échec de la suppression', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!user || user.role !== 'CHEF_TROUPE') {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Accès refusé</h2>
          <p>Cette page est réservée aux chefs de troupe.</p>
        </div>
      </div>
    );
  }

  if (!user.troupeId) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Aucune troupe assignée</h2>
          <p>Votre compte n'est pas rattaché à une troupe. Contactez un administrateur.</p>
        </div>
      </div>
    );
  }

  const typeTabs = [
    { key: 'all', label: 'Tout', count: typeCounts.all },
    { key: 'INSTALLATION_PHOTO', label: 'Photos', count: typeCounts.INSTALLATION_PHOTO },
    { key: 'SCHEMATIC', label: 'Schémas', count: typeCounts.SCHEMATIC },
  ];

  const stateTabs = [
    { key: STATE_ALL, label: 'Tout' },
    { key: STATE_APPROVED, label: 'Approuvé' },
    { key: STATE_PENDING_APPROVAL, label: 'En attente de validation' },
    { key: STATE_NEEDS_CLASSIFICATION, label: 'À classer' },
    { key: STATE_REJECTED, label: 'Rejeté' },
  ];

  return (
    <div className="my-troupe-pictures" style={{ '--mtp-thumb': `${thumbSize}px` }}>
      <div className="container">
        <div className="mtp-header">
          <div>
            <h2>Photos de ma troupe</h2>
            <p className="text-muted">
              {user.troupe?.name ? `${user.troupe.name} — ` : ''}
              Toutes les photos uploadées pour la troupe, tous statuts confondus.
            </p>
          </div>
          <Link to="/upload" className="btn-primary-action">
            <span>📤</span> Uploader une série
          </Link>
        </div>

        {/* Primary tabs: type */}
        <div className="mtp-tabs mtp-tabs-primary" role="tablist">
          {typeTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={typeFilter === t.key}
              className={`mtp-tab ${typeFilter === t.key ? 'active' : ''}`}
              onClick={() => setTypeFilter(t.key)}
            >
              {t.label}
              <span className="mtp-tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Secondary tabs: state */}
        <div className="mtp-tabs mtp-tabs-secondary" role="tablist">
          {stateTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={stateFilter === t.key}
              className={`mtp-subtab mtp-subtab-${t.key} ${stateFilter === t.key ? 'active' : ''}`}
              onClick={() => setStateFilter(t.key)}
            >
              {t.label}
              <span className="mtp-tab-count">{stateCounts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="mtp-controls">
          <input
            type="text"
            placeholder="Rechercher par catégorie, titre, patrouille…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mtp-search"
          />
          <label className="mtp-size-slider" title="Taille des miniatures">
            <span className="mtp-size-icon mtp-size-icon-sm">▫</span>
            <input
              type="range"
              min="48"
              max="200"
              step="4"
              value={thumbSize}
              onChange={(e) => setThumbSize(parseInt(e.target.value, 10))}
              aria-label="Taille des miniatures"
            />
            <span className="mtp-size-icon mtp-size-icon-lg">▣</span>
          </label>
          <div className="mtp-view-toggle" role="group" aria-label="Mode d'affichage">
            <button
              className={`mtp-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Vue tableau"
              aria-label="Vue tableau"
            >
              ☰
            </button>
            <button
              className={`mtp-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Vue grille"
              aria-label="Vue grille"
            >
              ▦
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div></div>
        ) : error ? (
          <div className="empty-state"><p>{error}</p></div>
        ) : filteredPictures.length === 0 ? (
          <div className="empty-state">
            <p>Aucune photo ne correspond à ces filtres.</p>
            {pictures.length === 0 && (
              <Link to="/upload" className="primary">Uploader votre première série</Link>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <PictureTable
            pictures={filteredPictures}
            onEdit={(pic) => navigate(`/classify/${pic.pictureSet.id}`)}
            onDelete={(pic) => setDeleteConfirm(pic)}
            canEdit={canEdit}
            canDelete={canDelete}
            thumbSize={thumbSize}
          />
        ) : (
          <div className="mtp-grid">
            {filteredPictures.map((pic) => (
              <PictureCard
                key={pic.id}
                pic={pic}
                canEdit={canEdit(pic)}
                canDelete={canDelete(pic)}
                onEdit={() => navigate(`/classify/${pic.pictureSet.id}`)}
                onDelete={() => setDeleteConfirm(pic)}
              />
            ))}
          </div>
        )}

        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Supprimer la photo ?"
          variant="danger"
        >
          <Modal.Body>
            {deleteConfirm && (
              <>
                <p>
                  Supprimer cette photo de la série « <strong>{deleteConfirm.pictureSet?.title}</strong> » ?
                </p>
                <p className="warning-text">Cette action est irréversible.</p>
              </>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              onClick={() => handleDelete(deleteConfirm)}
              className="danger"
              disabled={deleting}
            >
              {deleting ? 'Suppression…' : 'Oui, supprimer'}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="secondary"
              disabled={deleting}
            >
              Annuler
            </button>
          </Modal.Actions>
        </Modal>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

const StatusBadge = ({ status }) => (
  <span className={`status-badge ${(status || '').toLowerCase()}`}>
    {STATUS_LABELS[status] || status}
  </span>
);

const PictureTable = ({ pictures, onEdit, onDelete, canEdit, canDelete, thumbSize = 96 }) => (
  <div className="mtp-table-wrap" style={{ '--mtp-thumb': `${thumbSize}px` }}>
    <table className="mtp-table">
      <thead>
        <tr>
          <th className="col-thumb"></th>
          <th className="col-category">Catégorie</th>
          <th className="col-status">Statut</th>
          <th className="col-title">Nom de la série</th>
          <th className="col-date">Date</th>
          <th className="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        {pictures.map((pic) => {
          const set = pic.pictureSet || {};
          return (
            <tr key={pic.id} className="mtp-tr">
              <td className="col-thumb">
                <Link to={`/picture/${set.id}`} className="mtp-row-thumb">
                  <img src={getImageUrl(pic.filePath)} alt={set.title || 'Photo'} loading="lazy" />
                </Link>
              </td>
              <td className="col-category">
                {pic.category?.name
                  ? <span className="mtp-category-cell">{pic.category.name}</span>
                  : <span className="mtp-category-cell mtp-category-empty">À classer</span>}
              </td>
              <td className="col-status">
                <StatusBadge status={set.status} />
                {pic.type === 'SCHEMATIC' && <span className="mtp-type-tag" title="Schéma">📐</span>}
              </td>
              <td className="col-title">
                <Link to={`/picture/${set.id}`} className="mtp-row-title">
                  {set.title || 'Sans titre'}
                </Link>
                {set.patrouille?.totem && (
                  <div className="mtp-row-sub">🏕️ {set.patrouille.totem}</div>
                )}
                {set.status === 'REJECTED' && set.rejectionReason && (
                  <div className="mtp-row-sub mtp-rejection-text" title={set.rejectionReason}>
                    Motif : {set.rejectionReason}
                  </div>
                )}
              </td>
              <td className="col-date">
                {new Date(pic.uploadedAt || set.uploadedAt).toLocaleDateString()}
              </td>
              <td className="col-actions">
                <Link to={`/picture/${set.id}`} className="mtp-btn-view small" title="Voir">👁️</Link>
                {canEdit(pic) && (
                  <button className="mtp-btn-edit small" onClick={() => onEdit(pic)} title="Modifier">✏️</button>
                )}
                {canDelete(pic) && (
                  <button className="mtp-btn-delete small" onClick={() => onDelete(pic)} title="Supprimer">🗑️</button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const PictureCard = ({ pic, canEdit, canDelete, onEdit, onDelete }) => {
  const set = pic.pictureSet || {};
  return (
    <div className="mtp-card">
      <Link to={`/picture/${set.id}`} className="mtp-card-thumb">
        <img src={getImageUrl(pic.filePath)} alt={set.title || 'Photo'} />
        <span className="mtp-type-badge">
          {pic.type === 'SCHEMATIC' ? '📐' : '📸'}
        </span>
      </Link>
      <div className="mtp-card-body">
        <div className="mtp-card-category">
          {pic.category?.name || <span className="mtp-category-empty">À classer</span>}
        </div>
        <div className="mtp-card-meta">
          <StatusBadge status={set.status} />
          <span className="mtp-card-date">{new Date(pic.uploadedAt || set.uploadedAt).toLocaleDateString()}</span>
        </div>
        <h4 className="mtp-card-title" title={set.title}>{set.title || 'Sans titre'}</h4>
        <div className="mtp-card-sub">
          {set.patrouille?.totem && <span>🏕️ {set.patrouille.totem}</span>}
        </div>
        {set.status === 'REJECTED' && set.rejectionReason && (
          <div className="mtp-rejection" title={set.rejectionReason}>
            Motif : {set.rejectionReason}
          </div>
        )}
        <div className="mtp-card-actions">
          <Link to={`/picture/${set.id}`} className="mtp-btn-view">Détails</Link>
          {canEdit && (
            <button className="mtp-btn-edit" onClick={onEdit} title="Modifier la classification">
              ✏️ Modifier
            </button>
          )}
          {canDelete && (
            <button className="mtp-btn-delete" onClick={onDelete} title="Supprimer cette photo">
              🗑️
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyTroupePictures;
