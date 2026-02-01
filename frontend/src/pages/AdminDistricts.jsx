import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import Modal from '../components/Modal';
import * as XLSX from 'xlsx';
import './AdminManagement.css';

const AdminDistricts = () => {
  const { user } = useAuth();
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const [districtForm, setDistrictForm] = useState({
    name: '',
    code: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/districts`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to load districts');

      const data = await response.json();
      setDistricts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const url = editingDistrict
        ? `${API_URL}/api/districts/${editingDistrict.id}`
        : `${API_URL}/api/districts`;

      const response = await fetch(url, {
        method: editingDistrict ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(districtForm),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save district');
      }

      setSuccess(editingDistrict ? 'District updated successfully!' : 'District created successfully!');
      resetForm();
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (district) => {
    setEditingDistrict(district);
    setDistrictForm({
      name: district.name,
      code: district.code,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this district? This will also delete all groups and troupes within it.')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/districts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete district');
      }

      setSuccess('District deleted successfully!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setDistrictForm({ name: '', code: '' });
    setEditingDistrict(null);
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
        const districts = data.map((row, index) => ({
          name: row.Name || row.name || '',
          code: row.Code || row.code || '',
          rowNumber: index + 2, // Excel rows start at 2 (after header)
        }));

        setImportPreview(districts);
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
      const response = await fetch(`${API_URL}/api/districts/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ districts: importPreview }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import districts');
      }

      const result = await response.json();

      if (result.errors.length > 0) {
        setError(`Import completed with ${result.errors.length} errors. Check console for details.`);
        console.error('Import errors:', result.details.errors);
      }

      if (result.success > 0) {
        setSuccess(`Successfully imported ${result.success} districts!`);
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
      { Name: 'Example District', Code: 'EX_DIST' },
      { Name: 'Another District', Code: 'AN_DIST' },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Districts');
    XLSX.writeFile(wb, 'districts_template.xlsx');
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
          <h1>District Management</h1>
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
              Add New District
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Import Preview */}
        {importPreview && (
          <div className="import-preview">
            <div className="import-preview-header">
              <h3>Import Preview ({importPreview.length} districts)</h3>
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
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((district, idx) => (
                    <tr key={idx} className={!district.name || !district.code ? 'error-row' : ''}>
                      <td>{district.rowNumber}</td>
                      <td>{district.name || <span className="missing">Missing</span>}</td>
                      <td>{district.code || <span className="missing">Missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Districts Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Groups</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {districts.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No districts found. Create one or import from Excel.
                  </td>
                </tr>
              ) : (
                districts.map((district) => (
                  <tr key={district.id}>
                    <td>{district.name}</td>
                    <td><code>{district.code}</code></td>
                    <td>{district._count?.groups || 0}</td>
                    <td className="actions">
                      <button onClick={() => handleEdit(district)} className="btn-icon btn-edit">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(district.id)} className="btn-icon btn-delete">
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

      {/* District Modal */}
      <Modal
        isOpen={showModal}
        onClose={resetForm}
        title={editingDistrict ? 'Edit District' : 'Create New District'}
        size="medium"
      >
        <form onSubmit={handleSubmit}>
          <Modal.Body>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={districtForm.name}
                onChange={(e) => setDistrictForm({ ...districtForm, name: e.target.value })}
                required
                placeholder="e.g., Vieux Bruxelles"
              />
            </div>

            <div className="form-group">
              <label>Code *</label>
              <input
                type="text"
                value={districtForm.code}
                onChange={(e) => setDistrictForm({ ...districtForm, code: e.target.value.toUpperCase() })}
                required
                placeholder="e.g., VB"
              />
              <small>Unique identifier (will be converted to uppercase)</small>
            </div>
          </Modal.Body>
          <Modal.Actions>
            <button type="submit" className="primary">
              {editingDistrict ? 'Update' : 'Create'} District
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

export default AdminDistricts;
