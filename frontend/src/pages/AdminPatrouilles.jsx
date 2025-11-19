import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import './AdminManagement.css';

const AdminPatrouilles = () => {
  const { user } = useAuth();
  const [patrouilles, setPatrouilles] = useState([]);
  const [troupes, setTroupes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPatrouille, setEditingPatrouille] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const [patrouilleForm, setPatrouilleForm] = useState({
    name: '',
    totem: '',
    cri: '',
    troupeId: '',
  });

  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [patrouillesRes, troupesRes] = await Promise.all([
        fetch('http://localhost:3001/api/patrouilles', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('http://localhost:3001/api/troupes', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (!patrouillesRes.ok || !troupesRes.ok) {
        throw new Error('Failed to load data');
      }

      const patrouillesData = await patrouillesRes.json();
      const troupesData = await troupesRes.json();

      setPatrouilles(patrouillesData);
      setTroupes(troupesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const getTotemCounts = () => {
    const counts = {};
    patrouilles.forEach(p => {
      counts[p.totem] = (counts[p.totem] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const getCriCounts = () => {
    const counts = {};
    patrouilles.forEach(p => {
      counts[p.cri] = (counts[p.cri] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const url = editingPatrouille
        ? `http://localhost:3001/api/patrouilles/${editingPatrouille.id}`
        : 'http://localhost:3001/api/patrouilles';

      const response = await fetch(url, {
        method: editingPatrouille ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(patrouilleForm),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save patrouille');
      }

      setSuccess(editingPatrouille ? 'Patrouille updated successfully!' : 'Patrouille created successfully!');
      resetForm();
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (patrouille) => {
    setEditingPatrouille(patrouille);
    setPatrouilleForm({
      name: patrouille.name,
      totem: patrouille.totem,
      cri: patrouille.cri,
      troupeId: patrouille.troupeId,
    });

    // Pre-select district and group if editing
    if (patrouille.troupe) {
      setSelectedDistrict(patrouille.troupe.group.districtId.toString());
      setSelectedGroup(patrouille.troupe.groupId.toString());
    }

    setShowModal(true);
  };

  // Get unique districts from troupes
  const getDistricts = () => {
    const districtsMap = new Map();
    troupes.forEach(troupe => {
      if (troupe.group?.district) {
        const district = troupe.group.district;
        if (!districtsMap.has(district.id)) {
          districtsMap.set(district.id, district);
        }
      }
    });
    return Array.from(districtsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get groups for selected district
  const getGroupsForDistrict = () => {
    if (!selectedDistrict) return [];
    const groupsMap = new Map();
    troupes.forEach(troupe => {
      if (troupe.group?.districtId === parseInt(selectedDistrict)) {
        if (!groupsMap.has(troupe.group.id)) {
          groupsMap.set(troupe.group.id, troupe.group);
        }
      }
    });
    return Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get troupes for selected group
  const getTroupesForGroup = () => {
    if (!selectedGroup) return [];
    return troupes
      .filter(troupe => troupe.groupId === parseInt(selectedGroup))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Handle district change
  const handleDistrictChange = (districtId) => {
    setSelectedDistrict(districtId);
    setSelectedGroup('');
    setPatrouilleForm({ ...patrouilleForm, troupeId: '' });
  };

  // Handle group change
  const handleGroupChange = (groupId) => {
    setSelectedGroup(groupId);
    setPatrouilleForm({ ...patrouilleForm, troupeId: '' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this patrouille?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/patrouilles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete patrouille');
      }

      setSuccess('Patrouille deleted successfully!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setPatrouilleForm({ name: '', totem: '', cri: '', troupeId: '' });
    setSelectedDistrict('');
    setSelectedGroup('');
    setEditingPatrouille(null);
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
        const patrouilles = data.map((row, index) => ({
          name: row.Name || row.name || '',
          totem: row.Totem || row.totem || '',
          cri: row.Cri || row.cri || '',
          troupe: row.Troupe || row.troupe || '',
          rowNumber: index + 2,
        }));

        setImportPreview(patrouilles);
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
      const response = await fetch('http://localhost:3001/api/patrouilles/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ patrouilles: importPreview }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import patrouilles');
      }

      const result = await response.json();

      if (result.errors.length > 0) {
        setError(`Import completed with ${result.errors.length} errors. Check console for details.`);
        console.error('Import errors:', result.details.errors);
      }

      if (result.success > 0) {
        setSuccess(`Successfully imported ${result.success} patrouilles!`);
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
      { Name: 'Renards', Totem: 'Renard Rusé', Cri: 'Ouah!', Troupe: 'TSG' },
      { Name: 'Aigles', Totem: 'Aigle Royal', Cri: 'Caaaw!', Troupe: 'TSG' },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patrouilles');
    XLSX.writeFile(wb, 'patrouilles_template.xlsx');
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
          <h1>Patrouille Management</h1>
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
              Add New Patrouille
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Statistics Section */}
        <div className="stats-container">
          {/* Total Count */}
          <div className="stats-box total-count">
            <h3>Total Patrouilles</h3>
            <div className="count-number">{patrouilles.length}</div>
          </div>

          {/* Totem Counts */}
          <div className="stats-box">
            <h3>Totems Distribution</h3>
            <div className="stats-table-wrapper">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Totem</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {getTotemCounts().length > 0 ? (
                    getTotemCounts().map(([totem, count], idx) => (
                      <tr key={idx}>
                        <td>{totem}</td>
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

          {/* Cri Counts */}
          <div className="stats-box">
            <h3>Cris Distribution</h3>
            <div className="stats-table-wrapper">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Cri</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {getCriCounts().length > 0 ? (
                    getCriCounts().map(([cri, count], idx) => (
                      <tr key={idx}>
                        <td><em>{cri}</em></td>
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
        </div>

        {/* Import Preview */}
        {importPreview && (
          <div className="import-preview">
            <div className="import-preview-header">
              <h3>Import Preview ({importPreview.length} patrouilles)</h3>
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
                    <th>Totem</th>
                    <th>Cri</th>
                    <th>Troupe</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((patrouille, idx) => (
                    <tr key={idx} className={!patrouille.name || !patrouille.totem || !patrouille.cri || !patrouille.troupe ? 'error-row' : ''}>
                      <td>{patrouille.rowNumber}</td>
                      <td>{patrouille.name || <span className="missing">Missing</span>}</td>
                      <td>{patrouille.totem || <span className="missing">Missing</span>}</td>
                      <td>{patrouille.cri || <span className="missing">Missing</span>}</td>
                      <td>{patrouille.troupe || <span className="missing">Missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Patrouilles Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Totem</th>
                <th>Cri</th>
                <th>Troupe</th>
                <th>Group</th>
                <th>District</th>
                <th>Pictures</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patrouilles.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">
                    No patrouilles found. Create one or import from Excel.
                  </td>
                </tr>
              ) : (
                patrouilles.map((patrouille) => (
                  <tr key={patrouille.id}>
                    <td><strong>{patrouille.name}</strong></td>
                    <td>{patrouille.totem}</td>
                    <td><em>{patrouille.cri}</em></td>
                    <td>{patrouille.troupe?.name || '-'}</td>
                    <td>{patrouille.troupe?.group?.name || '-'}</td>
                    <td>{patrouille.troupe?.group?.district?.name || '-'}</td>
                    <td>{patrouille._count?.pictureSets || 0}</td>
                    <td className="actions">
                      <button onClick={() => handleEdit(patrouille)} className="btn-icon btn-edit">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(patrouille.id)} className="btn-icon btn-delete">
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

      {/* Patrouille Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingPatrouille ? 'Edit Patrouille' : 'Create New Patrouille'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={patrouilleForm.name}
                  onChange={(e) => setPatrouilleForm({ ...patrouilleForm, name: e.target.value })}
                  required
                  placeholder="e.g., Renards"
                />
              </div>

              <div className="form-group">
                <label>Totem *</label>
                <input
                  type="text"
                  value={patrouilleForm.totem}
                  onChange={(e) => setPatrouilleForm({ ...patrouilleForm, totem: e.target.value })}
                  required
                  placeholder="e.g., Renard Rusé"
                />
              </div>

              <div className="form-group">
                <label>Cri *</label>
                <input
                  type="text"
                  value={patrouilleForm.cri}
                  onChange={(e) => setPatrouilleForm({ ...patrouilleForm, cri: e.target.value })}
                  required
                  placeholder="e.g., Ouah!"
                />
              </div>

              <div className="form-group">
                <label>District *</label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  required
                >
                  <option value="">Select District</option>
                  {getDistricts().map((district) => (
                    <option key={district.id} value={district.id}>
                      {district.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Group *</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  required
                  disabled={!selectedDistrict}
                >
                  <option value="">Select Group</option>
                  {getGroupsForDistrict().map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                {!selectedDistrict && (
                  <small>Please select a district first</small>
                )}
              </div>

              <div className="form-group">
                <label>Troupe *</label>
                <select
                  value={patrouilleForm.troupeId}
                  onChange={(e) => setPatrouilleForm({ ...patrouilleForm, troupeId: e.target.value })}
                  required
                  disabled={!selectedGroup}
                >
                  <option value="">Select Troupe</option>
                  {getTroupesForGroup().map((troupe) => (
                    <option key={troupe.id} value={troupe.id}>
                      {troupe.name}
                    </option>
                  ))}
                </select>
                {!selectedGroup && (
                  <small>Please select a group first</small>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" onClick={resetForm} className="btn-cancel">
                  Cancel
                </button>
                <button type="submit" className="btn-submit primary">
                  {editingPatrouille ? 'Update' : 'Create'} Patrouille
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPatrouilles;
