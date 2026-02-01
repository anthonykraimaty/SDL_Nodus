import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import Modal from '../components/Modal';
import * as XLSX from 'xlsx';
import './AdminManagement.css';

const AdminTroupes = () => {
  const { user } = useAuth();
  const [troupes, setTroupes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTroupe, setEditingTroupe] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const [troupeForm, setTroupeForm] = useState({
    name: '',
    code: '',
    groupId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [troupesRes, districtsRes] = await Promise.all([
        fetch(`${API_URL}/api/troupes`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/districts`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (!troupesRes.ok || !districtsRes.ok) {
        throw new Error('Failed to load data');
      }

      const troupesData = await troupesRes.json();
      const districtsData = await districtsRes.json();

      setTroupes(troupesData);
      setDistricts(districtsData);

      // Extract all groups from districts
      const allGroups = [];
      districtsData.forEach(district => {
        district.groups.forEach(group => {
          allGroups.push({
            ...group,
            districtName: district.name,
          });
        });
      });
      setGroups(allGroups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate troupes count by district
  const getDistrictCounts = () => {
    const counts = {};
    troupes.forEach(troupe => {
      const districtName = troupe.group?.district?.name || 'Unknown';
      counts[districtName] = (counts[districtName] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const url = editingTroupe
        ? `${API_URL}/api/troupes/${editingTroupe.id}`
        : `${API_URL}/api/troupes`;

      const response = await fetch(url, {
        method: editingTroupe ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(troupeForm),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save troupe');
      }

      setSuccess(editingTroupe ? 'Troupe updated successfully!' : 'Troupe created successfully!');
      resetForm();
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (troupe) => {
    setEditingTroupe(troupe);
    setTroupeForm({
      name: troupe.name,
      code: troupe.code,
      groupId: troupe.groupId,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this troupe?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/troupes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete troupe');
      }

      setSuccess('Troupe deleted successfully!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setTroupeForm({ name: '', code: '', groupId: '' });
    setEditingTroupe(null);
    setShowModal(false);
  };

  // Excel Import Functions
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Validate and transform data
        const troupes = data.map((row, index) => ({
          name: row.Name || row.name || '',
          code: row.Code || row.code || '',
          district: row.District || row.district || '',
          group: row.Group || row.group || '',
          rowNumber: index + 2,
        }));

        setImportPreview(troupes);
      } catch (err) {
        setError('Failed to parse Excel file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (!importPreview || importPreview.length === 0) return;

    setImporting(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/troupes/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ troupes: importPreview }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import troupes');
      }

      const result = await response.json();

      if (result.errors.length > 0) {
        setError(`Import completed with ${result.errors.length} errors. Check console for details.`);
        console.error('Import errors:', result.details.errors);
      }

      if (result.success > 0) {
        setSuccess(`Successfully imported ${result.success} troupes!`);
      }

      setImportPreview(null);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      { Name: 'Example Troupe', Code: 'EX_TROOP', District: 'Vieux Bruxelles', Group: 'Group A' },
      { Name: 'Another Troupe', Code: 'AN_TROOP', District: 'VB', Group: 'Group B' },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Troupes');
    XLSX.writeFile(wb, 'troupes_template.xlsx');
  };

  if (loading) {
    return (
      <div className="admin-management">
        <div className="container loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-management">
      <div className="admin-container">
        <div className="page-header">
          <h1>Troupe Management</h1>
          <div className="header-actions">
            <button onClick={downloadTemplate} className="btn-secondary">
              Download Template
            </button>
            <label className="btn-secondary file-upload-btn">
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button onClick={() => setShowModal(true)} className="btn-add primary">
              Add New Troupe
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Statistics Section */}
        <div className="stats-container">
          {/* Total Count */}
          <div className="stats-box total-count">
            <h3>Total Troupes</h3>
            <div className="count-number">{troupes.length}</div>
          </div>

          {/* District Counts */}
          <div className="stats-box">
            <h3>Troupes by District</h3>
            <div className="stats-table-wrapper">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {getDistrictCounts().length > 0 ? (
                    getDistrictCounts().map(([district, count], idx) => (
                      <tr key={idx}>
                        <td>{district}</td>
                        <td><strong>{count}</strong></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="2" style={{ textAlign: 'center', color: '#999' }}>No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Empty box to maintain grid layout */}
          <div className="stats-box" style={{ visibility: 'hidden' }}></div>
        </div>

        {/* Import Preview */}
        {importPreview && (
          <div className="import-preview">
            <div className="import-preview-header">
              <h3>Import Preview ({importPreview.length} troupes)</h3>
              <div className="import-actions">
                <button onClick={() => setImportPreview(null)} className="btn-cancel">
                  Cancel
                </button>
                <button onClick={handleImport} className="btn-primary" disabled={importing}>
                  {importing ? 'Importing...' : 'Confirm Import'}
                </button>
              </div>
            </div>
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Code</th>
                    <th>District</th>
                    <th>Group</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((troupe, idx) => (
                    <tr key={idx} className={!troupe.name || !troupe.code || !troupe.district || !troupe.group ? 'error-row' : ''}>
                      <td>{troupe.rowNumber}</td>
                      <td>{troupe.name || <span className="missing">Missing</span>}</td>
                      <td>{troupe.code || <span className="missing">Missing</span>}</td>
                      <td>{troupe.district || <span className="missing">Missing</span>}</td>
                      <td>{troupe.group || <span className="missing">Missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Troupes Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Group</th>
                <th>District</th>
                <th>Patrouilles</th>
                <th>Users</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {troupes.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No troupes found. Create one or import from Excel.
                  </td>
                </tr>
              ) : (
                troupes.map((troupe) => (
                  <tr key={troupe.id}>
                    <td>{troupe.name}</td>
                    <td><code>{troupe.code}</code></td>
                    <td>{troupe.group?.name || '-'}</td>
                    <td>{troupe.group?.district?.name || '-'}</td>
                    <td>{troupe._count?.patrouilles || 0}</td>
                    <td>{troupe._count?.users || 0}</td>
                    <td className="actions">
                      <button onClick={() => handleEdit(troupe)} className="btn-icon btn-edit">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(troupe.id)} className="btn-icon btn-delete">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Troupe Modal */}
      <Modal
        isOpen={showModal}
        onClose={resetForm}
        title={editingTroupe ? 'Edit Troupe' : 'Create New Troupe'}
        size="medium"
      >
        <form onSubmit={handleSubmit}>
          <Modal.Body>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={troupeForm.name}
                onChange={(e) => setTroupeForm({ ...troupeForm, name: e.target.value })}
                required
                placeholder="e.g., Troupe Saint-Georges"
              />
            </div>

            <div className="form-group">
              <label>Code *</label>
              <input
                type="text"
                value={troupeForm.code}
                onChange={(e) => setTroupeForm({ ...troupeForm, code: e.target.value.toUpperCase() })}
                required
                placeholder="e.g., TSG"
              />
              <small>Unique identifier (will be converted to uppercase)</small>
            </div>

            <div className="form-group">
              <label>Group *</label>
              <select
                value={troupeForm.groupId}
                onChange={(e) => setTroupeForm({ ...troupeForm, groupId: e.target.value })}
                required
              >
                <option value="">Select Group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.districtName} - {group.name}
                  </option>
                ))}
              </select>
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button type="submit" className="primary">
              {editingTroupe ? 'Update' : 'Create'} Troupe
            </button>
            <button type="button" onClick={resetForm} className="secondary">
              Cancel
            </button>
          </Modal.Actions>
        </form>
      </Modal>
    </div>
  );
};

export default AdminTroupes;
