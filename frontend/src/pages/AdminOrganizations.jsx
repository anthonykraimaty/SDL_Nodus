import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { settingsService } from '../services/api';
import './AdminOrganizations.css';

const FLAG_LABELS = {
  photosPublicViewEnabled: {
    title: 'Vue publique — Photos',
    description: 'Affiche les photos approuvées aux visiteurs non connectés.',
  },
  schematicsPublicViewEnabled: {
    title: 'Vue publique — Schémas',
    description: "Affiche la galerie de schémas aux visiteurs non connectés.",
  },
  photoApprovalEnabled: {
    title: 'Approbation des photos',
    description: "Permet à la Branche d'approuver les photos. Désactive le bouton Approve.",
  },
  schematicApprovalEnabled: {
    title: 'Approbation des schémas',
    description: "Permet à la Branche d'approuver les schémas. Désactive le bouton Approve.",
  },
};

const AdminOrganizations = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsService.get();
      setSettings(data);
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (key) => {
    const nextValue = !settings[key];
    // Optimistic update
    setSettings((prev) => ({ ...prev, [key]: nextValue }));
    setSavingKey(key);
    try {
      const res = await settingsService.update({ [key]: nextValue });
      setSettings(res.settings);
    } catch (err) {
      // Revert on error
      setSettings((prev) => ({ ...prev, [key]: !nextValue }));
      setError(err.message || 'Failed to update setting');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="admin-organizations">
      <div className="admin-container">
        <div className="page-header">
          <h1>🏢 Organization Management</h1>
          <p>Gérer l'organisation et les réglages globaux de la plateforme</p>
        </div>

        {/* Org links */}
        <div className="org-links-grid">
          <Link to="/admin/districts" className="org-link-card">
            <span className="org-link-icon">🗺️</span>
            <div>
              <h3>Districts</h3>
              <p>Créer, renommer, supprimer les districts</p>
            </div>
          </Link>
          <Link to="/admin/groups" className="org-link-card">
            <span className="org-link-icon">🏘️</span>
            <div>
              <h3>Groupes</h3>
              <p>Gérer les groupes par district</p>
            </div>
          </Link>
          <Link to="/admin/troupes" className="org-link-card">
            <span className="org-link-icon">⛺</span>
            <div>
              <h3>Troupes</h3>
              <p>Gérer les troupes par groupe</p>
            </div>
          </Link>
          <Link to="/admin/patrouilles" className="org-link-card">
            <span className="org-link-icon">🧭</span>
            <div>
              <h3>Patrouilles</h3>
              <p>Gérer les patrouilles par troupe</p>
            </div>
          </Link>
        </div>

        {/* Feature flags */}
        <div className="settings-section">
          <div className="section-header">
            <h2>⚙️ Réglages de la plateforme</h2>
            <span className="section-subtitle">
              Activer ou désactiver des fonctionnalités au niveau global
            </span>
          </div>

          {error && <div className="settings-error">{error}</div>}

          {loading || !settings ? (
            <div className="settings-loading">Chargement…</div>
          ) : (
            <div className="settings-grid">
              {Object.keys(FLAG_LABELS).map((key) => {
                const meta = FLAG_LABELS[key];
                const checked = !!settings[key];
                const saving = savingKey === key;
                return (
                  <div
                    key={key}
                    className={`setting-row ${checked ? 'setting-on' : 'setting-off'}`}
                  >
                    <div className="setting-info">
                      <h4>{meta.title}</h4>
                      <p>{meta.description}</p>
                    </div>
                    <label className={`toggle-switch ${saving ? 'saving' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(key)}
                        disabled={saving}
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-label">
                        {checked ? 'Activé' : 'Désactivé'}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminOrganizations;
