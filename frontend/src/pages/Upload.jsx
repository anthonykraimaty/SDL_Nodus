import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import './Upload.css';

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    type: 'INSTALLATION_PHOTO',
    patrouilleId: '',
  });

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [patrouilles, setPatrouilles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Load patrouilles from user's troupe
    if (user?.troupe?.patrouilles) {
      setPatrouilles(user.troupe.patrouilles);
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset patrouille when switching to installation photo
      ...(name === 'type' && value === 'INSTALLATION_PHOTO' ? { patrouilleId: '' } : {}),
    }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      if (selectedFiles.length > 100) {
        setError('Maximum 100 files allowed');
        return;
      }

      setFiles(selectedFiles);

      // Create previews for all files
      const newPreviews = [];
      let loadedCount = 0;

      selectedFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result);
          loadedCount++;
          if (loadedCount === selectedFiles.length) {
            setPreviews(newPreviews);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!files || files.length === 0) {
        throw new Error('Please select at least one file');
      }

      // Validate patrouille for schematics
      if (formData.type === 'SCHEMATIC' && !formData.patrouilleId) {
        throw new Error('Patrouille is required for schematics');
      }

      const uploadData = new FormData();

      // Append all files
      files.forEach((file) => {
        uploadData.append('pictures', file);
      });

      uploadData.append('type', formData.type);
      if (formData.patrouilleId) {
        uploadData.append('patrouilleId', formData.patrouilleId);
      }

      const result = await pictureService.upload(uploadData);

      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to upload pictures');
    } finally {
      setLoading(false);
    }
  };

  if (!user?.role === 'CHEF_TROUPE') {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Chef Troupe members can upload pictures</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container">
        <div className="success-page">
          <div className="success-icon">✅</div>
          <h2>Upload Successful!</h2>
          <p>Your {files.length} picture{files.length !== 1 ? 's have' : ' has'} been uploaded successfully.</p>
          <p className="text-muted">You can now classify them to add categories and metadata.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <div className="container">
        <div className="upload-container">
          <div className="upload-header">
            <h2>Upload Pictures</h2>
            <p>Upload installation photos or schematics (up to 100 pictures at once)</p>
            <p className="text-muted">Title will be automatically generated. Other details can be added during classification.</p>
          </div>

          <form onSubmit={handleSubmit} className="upload-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* File Upload */}
            <div className="form-group file-upload-group">
              <label>Pictures (up to 100) *</label>
              <div className="file-upload-area">
                {previews.length > 0 ? (
                  <div className="preview-container">
                    <div className="preview-grid">
                      {previews.slice(0, 12).map((preview, index) => (
                        <img key={index} src={preview} alt={`Preview ${index + 1}`} className="preview-image-small" />
                      ))}
                      {previews.length > 12 && (
                        <div className="preview-more">
                          +{previews.length - 12} more
                        </div>
                      )}
                    </div>
                    <p className="text-muted">{files.length} file(s) selected</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFiles([]);
                        setPreviews([]);
                        document.getElementById('file-input').value = '';
                      }}
                      className="btn-remove"
                    >
                      Remove All
                    </button>
                  </div>
                ) : (
                  <label htmlFor="file-input" className="file-upload-label">
                    <div className="upload-icon">📸</div>
                    <p>Click to select images (multiple selection supported)</p>
                    <p className="text-muted">PNG, JPG, GIF up to 10MB each, max 100 files</p>
                  </label>
                )}
                <input
                  type="file"
                  id="file-input"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  multiple
                  required
                />
              </div>
            </div>

            {/* Type */}
            <div className="form-group">
              <label htmlFor="type">Type *</label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                required
              >
                <option value="INSTALLATION_PHOTO">📸 Installation Photo</option>
                <option value="SCHEMATIC">📐 Schematic</option>
              </select>
            </div>

            {/* Patrouille - Only for Schematics */}
            {formData.type === 'SCHEMATIC' && (
              <div className="form-group">
                <label htmlFor="patrouilleId">Patrouille *</label>
                <select
                  id="patrouilleId"
                  name="patrouilleId"
                  value={formData.patrouilleId}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select a patrouille</option>
                  {patrouilles.map((p) => (
                    <option key={p.id} value={p.id}>
                      ⚜️ {p.name} - {p.totem}
                    </option>
                  ))}
                </select>
                <p className="field-help">Schematics must be associated with a patrouille</p>
              </div>
            )}

            <div className="info-box">
              <strong>ℹ️ What happens next?</strong>
              <ul>
                <li>Your pictures will be uploaded with an auto-generated title</li>
                <li>You can then classify them by adding categories and dates</li>
                <li>After classification, they'll be reviewed by Branche Éclaireurs</li>
                <li>Once approved, they'll be publicly visible</li>
              </ul>
            </div>

            <button
              type="submit"
              className="btn-submit primary"
              disabled={loading}
            >
              {loading ? 'Uploading...' : `Upload ${files.length || 0} Picture${files.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Upload;
