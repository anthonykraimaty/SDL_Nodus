import { useState, useEffect, useMemo, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import './AdminAudit.css';

const ACTION_LABELS = {
  UPLOADED: 'Uploaded',
  UPLOADED_REPLACEMENT: 'Replaced (edit)',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
  DELETED: 'Deleted',
  EXCLUDED_ON_APPROVE: 'Excluded on approve',
  SPLIT_INTO_NEW_SET: 'Split into new set',
  SET_DELETED_ON_LAST_ARCHIVE: 'Set deleted (last archive)',
  SET_DELETED: 'Set deleted',
};

const ACTION_CLASS = {
  UPLOADED: 'ok',
  UPLOADED_REPLACEMENT: 'info',
  ARCHIVED: 'warn',
  RESTORED: 'ok',
  DELETED: 'bad',
  EXCLUDED_ON_APPROVE: 'bad',
  SPLIT_INTO_NEW_SET: 'info',
  SET_DELETED_ON_LAST_ARCHIVE: 'bad',
  SET_DELETED: 'bad',
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

function formatAbsolute(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString();
}

function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

const AdminAudit = () => {
  const { isAdmin } = useAuth();

  const [audits, setAudits] = useState([]);
  const [users, setUsers] = useState([]);
  const [troupes, setTroupes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [filters, setFilters] = useState({
    uploaderId: '',
    troupeId: '',
    pictureId: '',
    pictureSetId: '',
    actorId: '',
    action: [], // multi-select
    from: '',
    to: '',
    limit: 200,
  });

  useEffect(() => {
    if (!isAdmin()) return;
    // Load dropdown data once
    const token = localStorage.getItem('token');
    (async () => {
      try {
        const [usersRes, troupesRes] = await Promise.all([
          fetch(`${API_URL}/api/users`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/admin/troupes`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (usersRes.ok) setUsers(await usersRes.json());
        if (troupesRes.ok) setTroupes(await troupesRes.json());
      } catch (err) {
        console.error('Failed to load filter data', err);
      }
    })();
    // And load an initial audit page
    fetchAudits(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAudits = async (f) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const qs = new URLSearchParams();
      if (f.uploaderId) qs.set('uploaderId', f.uploaderId);
      if (f.troupeId) qs.set('troupeId', f.troupeId);
      if (f.pictureId) qs.set('pictureId', f.pictureId);
      if (f.pictureSetId) qs.set('pictureSetId', f.pictureSetId);
      if (f.actorId) qs.set('actorId', f.actorId);
      if (f.action && f.action.length > 0) qs.set('action', f.action.join(','));
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', f.to);
      if (f.limit) qs.set('limit', f.limit);

      const res = await fetch(`${API_URL}/api/admin/audit/picture-lifecycle?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load audit log');
      }
      const data = await res.json();
      setAudits(data.audits || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (e) => {
    e.preventDefault();
    fetchAudits(filters);
  };

  const handleReset = () => {
    const empty = {
      uploaderId: '',
      troupeId: '',
      pictureId: '',
      pictureSetId: '',
      actorId: '',
      action: [],
      from: '',
      to: '',
      limit: 200,
    };
    setFilters(empty);
    fetchAudits(empty);
  };

  const toggleAction = (a) => {
    setFilters((f) => {
      const has = f.action.includes(a);
      return { ...f, action: has ? f.action.filter((x) => x !== a) : [...f.action, a] };
    });
  };

  const userOptions = useMemo(
    () => [...users].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [users]
  );

  const troupeOptions = useMemo(
    () => [...troupes].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [troupes]
  );

  const userName = (id) => users.find((u) => u.id === id)?.name || `User #${id}`;
  const troupeName = (id) => troupes.find((t) => t.id === id)?.name || `Troupe #${id}`;

  if (!isAdmin()) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only administrators can access this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-audit">
      <div className="container">
        <div className="page-header">
          <h2>📜 Picture Lifecycle Audit</h2>
          <p className="header-description">
            Track who archived, deleted, or excluded pictures — useful for diagnosing disappearances
            that are not rejections.
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form className="audit-filters" onSubmit={handleApply}>
          <div className="filter-row">
            <label className="filter-field">
              <span>Uploader</span>
              <select
                value={filters.uploaderId}
                onChange={(e) => setFilters({ ...filters, uploaderId: e.target.value })}
              >
                <option value="">— any —</option>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span>Troupe</span>
              <select
                value={filters.troupeId}
                onChange={(e) => setFilters({ ...filters, troupeId: e.target.value })}
              >
                <option value="">— any —</option>
                {troupeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span>Actor (who acted)</span>
              <select
                value={filters.actorId}
                onChange={(e) => setFilters({ ...filters, actorId: e.target.value })}
              >
                <option value="">— any —</option>
                {userOptions
                  .filter((u) => u.role !== 'CHEF_TROUPE')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="filter-row">
            <label className="filter-field filter-field-small">
              <span>Picture ID</span>
              <input
                type="number"
                value={filters.pictureId}
                onChange={(e) => setFilters({ ...filters, pictureId: e.target.value })}
                placeholder="#"
              />
            </label>

            <label className="filter-field filter-field-small">
              <span>Set ID</span>
              <input
                type="number"
                value={filters.pictureSetId}
                onChange={(e) => setFilters({ ...filters, pictureSetId: e.target.value })}
                placeholder="#"
              />
            </label>

            <label className="filter-field">
              <span>From</span>
              <input
                type="datetime-local"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              />
            </label>

            <label className="filter-field">
              <span>To</span>
              <input
                type="datetime-local"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </label>

            <label className="filter-field filter-field-small">
              <span>Limit</span>
              <select
                value={filters.limit}
                onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
              >
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </label>
          </div>

          <div className="action-chips">
            <span className="chips-label">Actions:</span>
            {ALL_ACTIONS.map((a) => {
              const active = filters.action.includes(a);
              return (
                <button
                  type="button"
                  key={a}
                  className={`chip ${ACTION_CLASS[a] || ''} ${active ? 'active' : ''}`}
                  onClick={() => toggleAction(a)}
                >
                  {ACTION_LABELS[a]}
                </button>
              );
            })}
          </div>

          <div className="filter-actions">
            <button type="submit" className="btn-apply" disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
            <button type="button" className="btn-reset" onClick={handleReset} disabled={loading}>
              Reset
            </button>
            <span className="result-count">
              {audits.length} result{audits.length === 1 ? '' : 's'}
            </span>
          </div>
        </form>

        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Picture</th>
                <th>Set</th>
                <th>Uploader / Troupe</th>
                <th>Actor</th>
                <th>Status at action</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="empty-row">
                    No audit entries match these filters.
                  </td>
                </tr>
              )}
              {audits.map((a) => {
                const isOpen = expandedId === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr className={isOpen ? 'row-open' : ''}>
                      <td title={formatAbsolute(a.createdAt)}>{formatRelative(a.createdAt)}</td>
                      <td>
                        <span className={`action-badge ${ACTION_CLASS[a.action] || ''}`}>
                          {ACTION_LABELS[a.action] || a.action}
                        </span>
                      </td>
                      <td className="mono">#{a.pictureId ?? '—'}</td>
                      <td className="mono">#{a.pictureSetId ?? '—'}</td>
                      <td>
                        <div className="two-line">
                          <span>{a.uploaderId ? userName(a.uploaderId) : '—'}</span>
                          <span className="muted">
                            {a.troupeId ? troupeName(a.troupeId) : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        {a.actor ? (
                          <div className="two-line">
                            <span>{a.actor.name}</span>
                            <span className="muted">{a.actorRole || a.actor.role}</span>
                          </div>
                        ) : (
                          <span className="muted">{a.actorRole || '—'}</span>
                        )}
                      </td>
                      <td>
                        {a.pictureSetStatusAtAction ? (
                          <span className={`status-pill status-${a.pictureSetStatusAtAction.toLowerCase()}`}>
                            {a.pictureSetStatusAtAction}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn-expand"
                          onClick={() => setExpandedId(isOpen ? null : a.id)}
                        >
                          {isOpen ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={8}>
                          <dl className="detail-grid">
                            <div>
                              <dt>Audit ID</dt>
                              <dd className="mono">#{a.id}</dd>
                            </div>
                            <div>
                              <dt>Timestamp</dt>
                              <dd>{formatAbsolute(a.createdAt)}</dd>
                            </div>
                            <div className="detail-wide">
                              <dt>File path (snapshot)</dt>
                              <dd className="mono wrap">{a.filePath || '—'}</dd>
                            </div>
                            <div className="detail-wide">
                              <dt>Details</dt>
                              <dd className="mono wrap">{a.details || '—'}</dd>
                            </div>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminAudit;
