import { useEffect, useMemo, useState } from 'react';
import {
  recoveredService,
  organizationService,
  categoryService,
} from '../services/api';
import './AdminRecovered.css';

const STATUS_TABS = [
  { key: 'PENDING', label: 'À classer' },
  { key: 'PROMOTED', label: 'Restaurés' },
  { key: 'DISCARDED', label: 'Écartés' },
];

const AdminRecovered = () => {
  const [activeStatus, setActiveStatus] = useState('PENDING');
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ PENDING: 0, PROMOTED: 0, DISCARDED: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reference data
  const [districts, setDistricts] = useState([]);
  const [categories, setCategories] = useState([]);

  // Per-row form state, keyed by recovered file id
  const [forms, setForms] = useState({});
  const [busyId, setBusyId] = useState(null);

  // Lightbox preview
  const [previewItem, setPreviewItem] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          organizationService.getDistricts(),
          categoryService.getAll({}),
        ]);
        setDistricts(d || []);
        setCategories(c || []);
      } catch (err) {
        console.error('Failed to load reference data', err);
      }
    })();
  }, []);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, pagination.page]);

  const loadList = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await recoveredService.list({
        status: activeStatus,
        page: pagination.page,
        limit: pagination.limit,
      });
      setItems(data.items || []);
      setCounts(data.counts || { PENDING: 0, PROMOTED: 0, DISCARDED: 0 });
      setPagination((p) => ({ ...p, ...data.pagination }));

      // Seed forms from hints
      setForms((prev) => {
        const next = { ...prev };
        for (const it of data.items || []) {
          if (!next[it.id]) {
            next[it.id] = {
              type: 'INSTALLATION_PHOTO',
              districtId: it.hintTroupe?.group?.district ? '' : '',
              groupId: '',
              troupeId: it.hintTroupeId ? String(it.hintTroupeId) : '',
              patrouilleId: '',
              categoryId: '',
              title: '',
              patrouilles: [],
              groups: [],
              troupes: [],
            };
          }
        }
        return next;
      });
    } catch (err) {
      setError(err.message || 'Failed to load recovered files');
    } finally {
      setLoading(false);
    }
  };

  // Build flat lookup maps from districts → groups → troupes for cascading dropdowns
  const districtIndex = useMemo(() => {
    const groupsByDistrict = new Map();
    const troupesByGroup = new Map();
    const troupeById = new Map();
    for (const d of districts) {
      groupsByDistrict.set(String(d.id), d.groups || []);
      for (const g of d.groups || []) {
        troupesByGroup.set(String(g.id), g.troupes || []);
        for (const t of g.troupes || []) {
          troupeById.set(String(t.id), { ...t, group: g, district: d });
        }
      }
    }
    return { groupsByDistrict, troupesByGroup, troupeById };
  }, [districts]);

  // When a hint troupeId is set but the dropdowns haven't been touched, auto-populate
  // district/group selections so the admin sees the cascade pre-filled.
  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const f = next[it.id];
        if (!f) continue;
        if (f.troupeId && !f.districtId) {
          const t = districtIndex.troupeById.get(String(f.troupeId));
          if (t) {
            f.districtId = String(t.district.id);
            f.groupId = String(t.group.id);
          }
        }
      }
      return next;
    });
  }, [items, districtIndex]);

  const updateForm = (id, patch) => {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const onDistrictChange = (id, districtId) => {
    updateForm(id, { districtId, groupId: '', troupeId: '', patrouilleId: '' });
  };
  const onGroupChange = (id, groupId) => {
    updateForm(id, { groupId, troupeId: '', patrouilleId: '' });
  };
  const onTroupeChange = async (id, troupeId) => {
    updateForm(id, { troupeId, patrouilleId: '' });
    // Lazy-load patrouilles for this troupe — we already have them in districts payload
    const t = districtIndex.troupeById.get(String(troupeId));
    if (t && t.patrouilles) {
      updateForm(id, { patrouilles: t.patrouilles });
    } else {
      updateForm(id, { patrouilles: [] });
    }
  };

  const handlePromote = async (item) => {
    const f = forms[item.id];
    if (!f) return;
    if (!f.troupeId) {
      setError('Sélectionne un troupe avant de restaurer');
      return;
    }
    if (f.type === 'SCHEMATIC' && !f.patrouilleId) {
      setError('Une patrouille est requise pour un schéma');
      return;
    }
    try {
      setBusyId(item.id);
      setError('');
      const res = await recoveredService.promote(item.id, {
        type: f.type,
        troupeId: parseInt(f.troupeId),
        patrouilleId: f.patrouilleId ? parseInt(f.patrouilleId) : null,
        categoryId: f.categoryId ? parseInt(f.categoryId) : null,
        title: f.title || undefined,
      });
      setSuccess(`Restauré dans "${res.pictureSet.title}"`);
      await loadList();
    } catch (err) {
      setError(err.message || 'Échec de la restauration');
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (item) => {
    if (!confirm('Écarter ce fichier ? Le fichier reste sur B2 — tu peux le restaurer plus tard.')) return;
    try {
      setBusyId(item.id);
      setError('');
      await recoveredService.discard(item.id);
      setSuccess('Écarté');
      await loadList();
    } catch (err) {
      setError(err.message || 'Échec');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestorePending = async (item) => {
    try {
      setBusyId(item.id);
      setError('');
      await recoveredService.restorePending(item.id);
      setSuccess('Remis en attente');
      await loadList();
    } catch (err) {
      setError(err.message || 'Échec');
    } finally {
      setBusyId(null);
    }
  };

  const formatBytes = (n) => {
    if (!n && n !== 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="admin-recovered">
      <div className="admin-container">
        <div className="page-header">
          <h1>Photos récupérées</h1>
          <p>
            Fichiers présents sur B2 mais déconnectés de la base de données.
            Choisis un type, un troupe et une catégorie, puis restaure-les comme un nouveau set.
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="status-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`status-tab ${activeStatus === tab.key ? 'active' : ''}`}
              onClick={() => {
                setActiveStatus(tab.key);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            >
              {tab.label} <span className="count">{counts[tab.key] || 0}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="empty">Aucun fichier dans cet état.</div>
        ) : (
          <div className="recovered-grid">
            {items.map((item) => {
              const f = forms[item.id] || {};
              const groups = f.districtId ? districtIndex.groupsByDistrict.get(f.districtId) || [] : [];
              const troupes = f.groupId ? districtIndex.troupesByGroup.get(f.groupId) || [] : [];
              const patrouilles = f.patrouilles || [];

              return (
                <div key={item.id} className="recovered-card">
                  <div
                    className="recovered-thumb"
                    onClick={() => setPreviewItem(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <img
                      src={item.thumbUrl || item.fileUrl}
                      alt={item.fileKey}
                      loading="lazy"
                    />
                  </div>

                  <div className="recovered-meta">
                    <div className="meta-row">
                      <span className="meta-label">Clé:</span>
                      <code className="meta-key" title={item.fileKey}>
                        {item.fileKey.replace(/^pictures\//, '')}
                      </code>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Taille:</span>
                      <span>{formatBytes(item.sizeBytes)}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Sur B2 depuis:</span>
                      <span>{formatDate(item.lastModifiedB2)}</span>
                    </div>
                    {item.hintTroupe && (
                      <div className="meta-row meta-hint">
                        <span className="meta-label">Indice:</span>
                        <span>
                          {item.hintTroupe.group?.district?.name} ·{' '}
                          {item.hintTroupe.group?.name} · {item.hintTroupe.name}
                          {item.hintAction ? ` (${item.hintAction})` : ''}
                          {item.hintAuditAt ? ` — ${formatDate(item.hintAuditAt)}` : ''}
                        </span>
                      </div>
                    )}
                    {item.hintUploader && (
                      <div className="meta-row meta-hint">
                        <span className="meta-label">Uploader:</span>
                        <span>{item.hintUploader.name} ({item.hintUploader.email})</span>
                      </div>
                    )}
                  </div>

                  {activeStatus === 'PENDING' && (
                    <div className="recovered-form">
                      <div className="form-row">
                        <label>Type</label>
                        <select
                          value={f.type || 'INSTALLATION_PHOTO'}
                          onChange={(e) => updateForm(item.id, { type: e.target.value })}
                        >
                          <option value="INSTALLATION_PHOTO">Photo d'installation</option>
                          <option value="SCHEMATIC">Schéma</option>
                        </select>
                      </div>

                      <div className="form-row">
                        <label>District</label>
                        <select
                          value={f.districtId || ''}
                          onChange={(e) => onDistrictChange(item.id, e.target.value)}
                        >
                          <option value="">— choisir —</option>
                          {districts.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label>Groupe</label>
                        <select
                          value={f.groupId || ''}
                          onChange={(e) => onGroupChange(item.id, e.target.value)}
                          disabled={!f.districtId}
                        >
                          <option value="">— choisir —</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label>Troupe</label>
                        <select
                          value={f.troupeId || ''}
                          onChange={(e) => onTroupeChange(item.id, e.target.value)}
                          disabled={!f.groupId}
                        >
                          <option value="">— choisir —</option>
                          {troupes.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label>Patrouille {f.type === 'SCHEMATIC' ? '*' : ''}</label>
                        <select
                          value={f.patrouilleId || ''}
                          onChange={(e) => updateForm(item.id, { patrouilleId: e.target.value })}
                          disabled={!f.troupeId}
                        >
                          <option value="">{f.type === 'SCHEMATIC' ? '— requis —' : '— optionnel —'}</option>
                          {patrouilles.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.totem})</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label>Catégorie</label>
                        <select
                          value={f.categoryId || ''}
                          onChange={(e) => updateForm(item.id, { categoryId: e.target.value })}
                        >
                          <option value="">— optionnel —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label>Titre (auto si vide)</label>
                        <input
                          type="text"
                          value={f.title || ''}
                          onChange={(e) => updateForm(item.id, { title: e.target.value })}
                          placeholder="Recovered_District_Group_Troupe_…"
                        />
                      </div>

                      <div className="form-actions">
                        <button
                          className="btn btn-primary"
                          disabled={busyId === item.id}
                          onClick={() => handlePromote(item)}
                        >
                          {busyId === item.id ? '…' : 'Restaurer'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === item.id}
                          onClick={() => handleDiscard(item)}
                        >
                          Écarter
                        </button>
                      </div>
                    </div>
                  )}

                  {activeStatus === 'PROMOTED' && (
                    <div className="recovered-result">
                      <span className="badge badge-success">Restauré</span>
                      <div className="meta-row">
                        <span className="meta-label">Set ID:</span>
                        <span>{item.promotedSetId}</span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-label">Le:</span>
                        <span>{formatDate(item.promotedAt)}</span>
                      </div>
                    </div>
                  )}

                  {activeStatus === 'DISCARDED' && (
                    <div className="recovered-result">
                      <span className="badge badge-muted">Écarté</span>
                      <div className="meta-row">
                        <span className="meta-label">Le:</span>
                        <span>{formatDate(item.discardedAt)}</span>
                      </div>
                      <button
                        className="btn btn-secondary"
                        disabled={busyId === item.id}
                        onClick={() => handleRestorePending(item)}
                      >
                        Remettre en attente
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="pagination">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            >
              ←
            </button>
            <span>Page {pagination.page} / {pagination.totalPages}</span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            >
              →
            </button>
          </div>
        )}
      </div>

      {previewItem && (
        <div className="lightbox" onClick={() => setPreviewItem(null)}>
          <img src={previewItem.fileUrl} alt={previewItem.fileKey} />
        </div>
      )}
    </div>
  );
};

export default AdminRecovered;
