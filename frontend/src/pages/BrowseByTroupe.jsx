import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, organizationService } from '../services/api';
import { getThumbnailUrl, getImageUrl } from '../config/api';
import './BrowseByTroupe.css';

const STATUS_LABELS = {
  PENDING: 'En attente',
  CLASSIFIED: 'Classé',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
};

const TYPE_OPTIONS = [
  { value: '', label: 'Tous types' },
  { value: 'INSTALLATION_PHOTO', label: 'Photos' },
  { value: 'SCHEMATIC', label: 'Schémas' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tous statuts' },
  { value: 'APPROVED', label: 'Approuvés' },
  { value: 'CLASSIFIED', label: 'Classés' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'REJECTED', label: 'Rejetés' },
];

const BrowseByTroupe = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [troupes, setTroupes] = useState([]);
  const [pictures, setPictures] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingPictures, setLoadingPictures] = useState(false);
  const [error, setError] = useState(null);

  const districtId = searchParams.get('districtId') || '';
  const groupId = searchParams.get('groupId') || '';
  const troupeId = searchParams.get('troupeId') || '';
  const type = searchParams.get('type') || '';
  const status = searchParams.get('status') || 'APPROVED';

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // Reset downstream selections when a parent changes
    if (key === 'districtId') {
      next.delete('groupId');
      next.delete('troupeId');
    } else if (key === 'groupId') {
      next.delete('troupeId');
    }
    setSearchParams(next, { replace: true });
  };

  // Load troupes once for the cascading filter
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingFilters(true);
        const data = await organizationService.getTroupes();
        if (!cancelled) setTroupes(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load troupes:', err);
        if (!cancelled) setError("Impossible de charger la liste des troupes.");
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Reload pictures when filters change
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingPictures(true);
        setError(null);
        const params = { limit: 200 };
        if (status) params.status = status;
        if (type) params.type = type;
        if (districtId) params.districtId = districtId;
        if (groupId) params.groupId = groupId;
        if (troupeId) params.troupeId = troupeId;
        const data = await pictureService.getAll(params);
        if (cancelled) return;
        // Flatten sets → individual pictures so each tile has its own category.
        const flat = [];
        for (const set of data.pictures || []) {
          for (const pic of set.pictures || []) {
            flat.push({
              id: pic.id,
              setId: set.id,
              filePath: pic.filePath,
              type: pic.type,
              category: pic.category || null,
              status: set.status,
              uploadedAt: pic.uploadedAt || set.uploadedAt,
              troupe: set.troupe,
              patrouille: set.patrouille,
              setTitle: set.title,
            });
          }
        }
        setPictures(flat);
      } catch (err) {
        console.error('Failed to load pictures:', err);
        if (!cancelled) setError("Impossible de charger les photos.");
      } finally {
        if (!cancelled) setLoadingPictures(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, status, type, districtId, groupId, troupeId]);

  const { districts, groupsForDistrict, troupesForGroup } = useMemo(() => {
    const districtMap = new Map();
    const groupMap = new Map();
    for (const t of troupes) {
      const d = t.group?.district;
      const g = t.group;
      if (!d || !g) continue;
      if (!districtMap.has(d.id)) districtMap.set(d.id, { id: d.id, name: d.name });
      if (!groupMap.has(g.id)) groupMap.set(g.id, { id: g.id, name: g.name, districtId: d.id });
    }
    const districts = [...districtMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const groupsForDistrict = districtId
      ? [...groupMap.values()]
          .filter(g => g.districtId === parseInt(districtId))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    const troupesForGroup = groupId
      ? troupes
          .filter(t => t.groupId === parseInt(groupId))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    return { districts, groupsForDistrict, troupesForGroup };
  }, [troupes, districtId, groupId]);

  // Group tiles by troupe label so the user can see them grouped together.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const pic of pictures) {
      const tId = pic.troupe?.id ?? 'unknown';
      const label = pic.troupe
        ? `${pic.troupe.group?.district?.name || '—'} • ${pic.troupe.group?.name || '—'} • ${pic.troupe.name}`
        : 'Troupe inconnue';
      if (!map.has(tId)) map.set(tId, { label, pictures: [] });
      map.get(tId).pictures.push(pic);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [pictures]);

  if (!user || (user.role !== 'BRANCHE_ECLAIREURS' && user.role !== 'ADMIN')) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Accès refusé</h2>
          <p>Cette page est réservée aux membres Branche et aux administrateurs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="browse-troupe">
      <div className="container">
        <div className="bt-header">
          <div>
            <h2>Photos par troupe</h2>
            <p className="text-muted">
              Parcourir les photos uploadées, filtrables par district, groupe et troupe.
            </p>
          </div>
          <Link to="/dashboard" className="bt-back">← Dashboard</Link>
        </div>

        <div className="bt-filters">
          <label className="bt-filter">
            <span>District</span>
            <select
              value={districtId}
              onChange={(e) => updateParam('districtId', e.target.value)}
              disabled={loadingFilters}
            >
              <option value="">Tous les districts</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <label className="bt-filter">
            <span>Groupe</span>
            <select
              value={groupId}
              onChange={(e) => updateParam('groupId', e.target.value)}
              disabled={!districtId || loadingFilters}
            >
              <option value="">Tous les groupes</option>
              {groupsForDistrict.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

          <label className="bt-filter">
            <span>Troupe</span>
            <select
              value={troupeId}
              onChange={(e) => updateParam('troupeId', e.target.value)}
              disabled={!groupId || loadingFilters}
            >
              <option value="">Toutes les troupes</option>
              {troupesForGroup.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="bt-filter">
            <span>Type</span>
            <select value={type} onChange={(e) => updateParam('type', e.target.value)}>
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="bt-filter">
            <span>Statut</span>
            <select value={status} onChange={(e) => updateParam('status', e.target.value)}>
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="bt-error">{error}</div>}

        {loadingPictures ? (
          <div className="loading-container"><div className="spinner"></div></div>
        ) : grouped.length === 0 ? (
          <div className="empty-state">
            <p>Aucune photo ne correspond à ces filtres.</p>
          </div>
        ) : (
          grouped.map(({ label, pictures: groupPics }) => (
            <section key={label} className="bt-troupe-section">
              <h3 className="bt-troupe-label">
                {label}
                <span className="bt-troupe-count">{groupPics.length}</span>
              </h3>
              <div className="bt-grid">
                {groupPics.map(pic => (
                  <Link
                    key={pic.id}
                    to={`/picture/${pic.setId}`}
                    className="bt-tile"
                    title={pic.setTitle || ''}
                  >
                    <div className="bt-tile-thumb">
                      <img
                        src={getThumbnailUrl(pic.filePath) || getImageUrl(pic.filePath)}
                        alt={pic.category?.name || 'Photo'}
                        loading="lazy"
                      />
                      <span className="bt-tile-type" aria-hidden="true">
                        {pic.type === 'SCHEMATIC' ? '📐' : '📸'}
                      </span>
                      {pic.status && pic.status !== 'APPROVED' && (
                        <span className={`bt-tile-status status-${pic.status.toLowerCase()}`}>
                          {STATUS_LABELS[pic.status] || pic.status}
                        </span>
                      )}
                    </div>
                    <div className="bt-tile-category">
                      {pic.category?.name || <span className="bt-tile-empty">Sans catégorie</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
};

export default BrowseByTroupe;
