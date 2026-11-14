import { useCallback, useEffect, useMemo, useState } from 'react';
import { accessService } from '../services/api';
import './AdminAccess.css';

/**
 * Admin → Accès: the Keycloak rules.
 *
 *   Connexion     who may sign in with a Scouts du Liban account
 *   Administration who becomes an administrator
 *   Approbation   who may approve pictures, for which branche and districts
 *   Chefs         who may upload for their troupe
 *
 * A rule entry is a Keycloak group path ("/CU"), a realm role ("realm:Read_QG")
 * or a role on nodus's own client ("admin"). The entries pinned in the server's
 * environment are shown read-only — they always count and cannot be removed
 * here, so nobody can lock themselves out of their own instance.
 */

// One editable list of strings, with a datalist of suggestions.
const EntryList = ({ label, hint, values, suggestions, placeholder, onChange, listId }) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <div className="access-field">
      <label>{label}</label>
      {hint && <p className="access-hint">{hint}</p>}

      {values.length > 0 && (
        <ul className="access-chips">
          {values.map((v) => (
            <li key={v}>
              <span>{v}</span>
              <button
                type="button"
                aria-label={`Retirer ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="access-add">
        <input
          type="text"
          value={draft}
          list={listId}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} disabled={!draft.trim()}>
          Ajouter
        </button>
      </div>

      {suggestions?.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
};

// What the environment pins, shown so an admin understands the effective rules.
const EnvPinned = ({ entries, what }) =>
  entries?.length ? (
    <p className="access-env">
      Fixé par la configuration du serveur ({what}) : <code>{entries.join(', ')}</code>
    </p>
  ) : null;

const AdminAccess = () => {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await accessService.get();
      setData(payload);
      setSettings(payload.settings);
      // The directory is optional: without a service account the page falls
      // back to free text plus whatever signed-in accounts already carry.
      setDirectory(await accessService.directory().catch(() => null));
    } catch (err) {
      setError(err.message || "Échec du chargement des règles d'accès");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshDirectory = async () => {
    setError('');
    try {
      setDirectory(await accessService.directory(true));
    } catch (err) {
      setError(err.message || 'Échec de la lecture du realm');
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await accessService.save(settings);
      setSettings(res.settings);
      setSuccess('Règles enregistrées. Elles s\'appliquent à la prochaine connexion de chacun.');
    } catch (err) {
      setError(err.message || "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  // Group paths and realm roles to suggest in the inputs.
  const groupOptions = useMemo(() => {
    const live = directory?.groups || [];
    const seen = directory?.seen?.groups || [];
    return [...new Set([...live, ...seen])];
  }, [directory]);

  const roleOptions = useMemo(() => {
    const live = directory?.realmRoles || [];
    const seen = directory?.seen?.realmRoles || [];
    return [...new Set([...live, ...seen])];
  }, [directory]);

  const patch = (path, value) =>
    setSettings((prev) => {
      const next = structuredClone(prev);
      let node = next;
      for (let i = 0; i < path.length - 1; i += 1) node = node[path[i]];
      node[path[path.length - 1]] = value;
      return next;
    });

  if (loading) return <div className="admin-access"><p>Chargement…</p></div>;
  if (!settings || !data) {
    return (
      <div className="admin-access">
        <div className="access-error">{error || 'Règles indisponibles'}</div>
      </div>
    );
  }

  const kc = data.keycloak;

  return (
    <div className="admin-access">
      <header className="access-header">
        <div>
          <h1>Accès</h1>
          <p className="access-sub">
            Qui peut se connecter avec un compte Scouts du Liban, qui peut approuver, et pour
            quelle branche.
          </p>
        </div>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </header>

      {error && <div className="access-error">{error}</div>}
      {success && <div className="access-success">{success}</div>}

      {!kc.enabled && (
        <div className="access-warning">
          Keycloak n'est pas configuré sur ce serveur : ces règles sont enregistrées mais ne
          s'appliqueront qu'une fois <code>KEYCLOAK_URL</code> renseigné.
        </div>
      )}

      {kc.enabled && (
        <p className="access-realm">
          Realm : <code>{kc.issuer}</code> — client <code>{kc.clientId}</code>
          {!kc.directoryEnabled && (
            <>
              {' · '}
              <span className="access-muted">
                sans compte de service : saisie libre
              </span>
            </>
          )}
          {kc.directoryEnabled && (
            <>
              {' · '}
              <button type="button" className="access-link" onClick={refreshDirectory}>
                Recharger depuis Keycloak
              </button>
            </>
          )}
        </p>
      )}

      {directory && directory.available === false && directory.reason && (
        <div className="access-warning">
          Les listes du realm ne sont pas lisibles : {directory.reason}
        </div>
      )}

      {/* --- 1. Connexion --- */}
      <section className="access-section">
        <h2>Qui peut se connecter</h2>
        <label className="access-check">
          <input
            type="checkbox"
            checked={settings.login.everyone}
            onChange={(e) => patch(['login', 'everyone'], e.target.checked)}
          />
          <span>
            Tout compte du realm peut se connecter
            <small>
              Décochez pour limiter la connexion aux groupes ou rôles listés ci-dessous. Les
              administrateurs et les approbateurs entrent toujours.
            </small>
          </span>
        </label>

        {!settings.login.everyone && (
          <div className="access-grid">
            <EntryList
              listId="login-groups"
              label="Groupes autorisés"
              hint="Chemin complet du groupe, par ex. /CU. Un sous-groupe compte aussi."
              placeholder="/CU"
              values={settings.login.groups}
              suggestions={groupOptions}
              onChange={(v) => patch(['login', 'groups'], v)}
            />
            <EntryList
              listId="login-roles"
              label="Rôles realm autorisés"
              placeholder="Read_Group"
              values={settings.login.realmRoles}
              suggestions={roleOptions}
              onChange={(v) => patch(['login', 'realmRoles'], v)}
            />
          </div>
        )}
        <EnvPinned entries={kc.env.loginRoles} what="KEYCLOAK_LOGIN_ROLES" />
      </section>

      {/* --- 2. Administration --- */}
      <section className="access-section">
        <h2>Administrateurs</h2>
        <p className="access-hint">
          Un compte qui détient l'une de ces entrées devient administrateur à sa prochaine
          connexion. Keycloak peut promouvoir, jamais rétrograder : un rôle donné à la main
          dans Utilisateurs est conservé.
        </p>
        <div className="access-grid">
          <EntryList
            listId="admin-groups"
            label="Groupes"
            placeholder="/Admin"
            values={settings.admin.groups}
            suggestions={groupOptions}
            onChange={(v) => patch(['admin', 'groups'], v)}
          />
          <EntryList
            listId="admin-roles"
            label="Rôles realm"
            placeholder="Manage_QG"
            values={settings.admin.realmRoles}
            suggestions={roleOptions}
            onChange={(v) => patch(['admin', 'realmRoles'], v)}
          />
        </div>
        <EnvPinned entries={kc.env.adminRoles} what="KEYCLOAK_ADMIN_ROLES" />
      </section>

      {/* --- 3. Approbation, par branche --- */}
      <section className="access-section">
        <h2>Qui peut approuver</h2>
        <p className="access-hint">
          Une règle par équipe de branche. Chaque règle dit qui (groupe ou rôle), pour quelle
          ou quelles branches, et sur quels districts. Sans district coché, la règle couvre
          tous les districts.
        </p>

        {settings.approvers.length === 0 && (
          <p className="access-empty">
            Aucune règle : personne ne devient approbateur par Keycloak. Les comptes Branche
            existants gardent leurs accès.
          </p>
        )}

        {settings.approvers.map((rule, i) => (
          <div className="access-rule" key={i}>
            <div className="access-rule-head">
              <input
                type="text"
                className="access-rule-match"
                value={rule.match}
                list="approver-match"
                placeholder="/QG_Eclaireurs ou realm:Read_QG"
                onChange={(e) => {
                  const next = structuredClone(settings.approvers);
                  next[i].match = e.target.value;
                  patch(['approvers'], next);
                }}
              />
              <button
                type="button"
                className="access-rule-remove"
                onClick={() =>
                  patch(['approvers'], settings.approvers.filter((_, j) => j !== i))
                }
              >
                Supprimer
              </button>
            </div>

            <div className="access-rule-body">
              <fieldset>
                <legend>Branches</legend>
                <div className="access-boxes">
                  {data.branches.map((b) => (
                    <label key={b}>
                      <input
                        type="checkbox"
                        checked={rule.branches.includes(b)}
                        onChange={(e) => {
                          const next = structuredClone(settings.approvers);
                          next[i].branches = e.target.checked
                            ? [...next[i].branches, b]
                            : next[i].branches.filter((x) => x !== b);
                          patch(['approvers'], next);
                        }}
                      />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
                {rule.branches.length === 0 && (
                  <p className="access-warn-inline">
                    Aucune branche cochée : cette règle ne donnera accès à rien.
                  </p>
                )}
              </fieldset>

              <fieldset>
                <legend>
                  Districts <small>(aucun = tous)</small>
                </legend>
                <div className="access-boxes access-boxes-dense">
                  {data.districts.map((d) => (
                    <label key={d.id} title={d.name}>
                      <input
                        type="checkbox"
                        checked={rule.districts.includes(d.code)}
                        onChange={(e) => {
                          const next = structuredClone(settings.approvers);
                          next[i].districts = e.target.checked
                            ? [...next[i].districts, d.code]
                            : next[i].districts.filter((x) => x !== d.code);
                          patch(['approvers'], next);
                        }}
                      />
                      <span>{d.code}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        ))}

        <datalist id="approver-match">
          {groupOptions.map((g) => (
            <option key={g} value={g} />
          ))}
          {roleOptions.map((r) => (
            <option key={r} value={`realm:${r}`} />
          ))}
        </datalist>

        <button
          type="button"
          className="access-add-rule"
          onClick={() =>
            patch(['approvers'], [
              ...settings.approvers,
              { match: '', branches: [], districts: [] },
            ])
          }
        >
          + Ajouter une règle d'approbation
        </button>

        <EnvPinned entries={kc.env.approveRoles} what="KEYCLOAK_APPROVE_ROLES — toutes branches" />
      </section>

      {/* --- 4. Chefs de troupe --- */}
      <section className="access-section">
        <h2>Chefs de troupe</h2>
        <p className="access-hint">
          Qui peut déposer des photos pour sa troupe. La troupe elle-même est reliée
          automatiquement depuis Inscription à la première connexion.
        </p>
        <div className="access-grid">
          <EntryList
            listId="chef-groups"
            label="Groupes"
            placeholder="/CU"
            values={settings.chefs.groups}
            suggestions={groupOptions}
            onChange={(v) => patch(['chefs', 'groups'], v)}
          />
          <EntryList
            listId="chef-roles"
            label="Rôles realm"
            placeholder="Read_Unit"
            values={settings.chefs.realmRoles}
            suggestions={roleOptions}
            onChange={(v) => patch(['chefs', 'realmRoles'], v)}
          />
        </div>
        <EnvPinned entries={kc.env.chefRoles} what="KEYCLOAK_CHEF_ROLES" />
      </section>

      <footer className="access-footer">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <p className="access-hint">
          Les règles s'appliquent à la prochaine connexion de chaque personne — elles ne
          changent pas les sessions déjà ouvertes.
        </p>
      </footer>
    </div>
  );
};

export default AdminAccess;
