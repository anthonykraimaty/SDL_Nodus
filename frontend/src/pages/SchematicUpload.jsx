import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schematicService, patrouilleService } from '../services/api';
import { getImageUrl } from '../config/api';
import './SchematicUpload.css';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const SchematicUpload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const abortControllerRef = useRef(null);

  const [formData, setFormData] = useState({
    patrouilleId: '',
    schematicCategoryId: '',
  });

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [patrouilles, setPatrouilles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expandedSet, setExpandedSet] = useState(null);

  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    loaded: 0,
    total: 0,
  });

  useEffect(() => {
    loadInitialData();
  }, [user]);

  useEffect(() => {
    if (formData.patrouilleId) {
      loadPatrouilleProgress(formData.patrouilleId);
    } else {
      setProgress(null);
    }
  }, [formData.patrouilleId]);

  const loadInitialData = async () => {
    try {
      setLoadingData(true);

      // Load patrouilles - first try from user object, then fetch from API
      if (user?.troupe?.patrouilles && user.troupe.patrouilles.length > 0) {
        setPatrouilles(user.troupe.patrouilles);
      } else if (user?.troupeId) {
        // Fetch patrouilles from API if not in user object
        try {
          const patrouillesData = await patrouilleService.getMyTroupe();
          setPatrouilles(patrouillesData);
        } catch (err) {
          console.error('Failed to load patrouilles from API:', err);
        }
      }

      // Load schematic categories
      const categoriesData = await schematicService.getCategories();
      setCategories(categoriesData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const loadPatrouilleProgress = async (patrouilleId) => {
    try {
      const data = await schematicService.getProgress(patrouilleId);
      setProgress(data);
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCategorySelect = (categoryId) => {
    setFormData((prev) => ({
      ...prev,
      schematicCategoryId: categoryId,
    }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      if (selectedFiles.length > 10) {
        setError('Maximum 10 files allowed per schematic');
        return;
      }

      setFiles(selectedFiles);

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
    setUploadProgress({ percent: 0, loaded: 0, total: 0 });

    abortControllerRef.current = new AbortController();

    try {
      if (!files || files.length === 0) {
        throw new Error('Please select at least one file');
      }

      if (!formData.patrouilleId) {
        throw new Error('Please select a patrouille');
      }

      if (!formData.schematicCategoryId) {
        throw new Error('Please select a schematic category');
      }

      const uploadData = new FormData();

      files.forEach((file) => {
        uploadData.append('pictures', file);
      });

      uploadData.append('patrouilleId', formData.patrouilleId);
      uploadData.append('schematicCategoryId', formData.schematicCategoryId);

      await schematicService.uploadWithProgress(
        uploadData,
        (progress) => {
          setUploadProgress(progress);
        },
        abortControllerRef.current.signal
      );

      setSuccess(true);
      setTimeout(() => {
        navigate('/schematics/progress');
      }, 2000);
    } catch (err) {
      if (err.message !== 'Upload cancelled') {
        setError(err.message || 'Failed to upload schematic');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setUploadProgress({ percent: 0, loaded: 0, total: 0 });
    }
  };

  const getItemStatus = (categoryId) => {
    if (!progress) return null;
    for (const set of progress.sets) {
      const item = set.items.find((i) => i.id === categoryId);
      if (item) return item.status;
    }
    return 'PENDING';
  };

  const isItemDisabled = (categoryId) => {
    const status = getItemStatus(categoryId);
    return status === 'APPROVED' || status === 'SUBMITTED';
  };

  if (!user?.role === 'CHEF_TROUPE') {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Chef Troupe members can upload schematics</p>
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
          <p>
            Your schematic has been uploaded and is pending review by Branche.
          </p>
          <p className="text-muted">
            Redirecting to progress page...
          </p>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="schematic-upload-page">
      <div className="container">
        <div className="upload-container">
          <div className="upload-header">
            <h2>Upload Schematic</h2>
            <p>Upload hand-drawn schematics for your patrouille</p>
          </div>

          <form onSubmit={handleSubmit} className="upload-form">
            {error && <div className="error-message">{error}</div>}

            {/* Patrouille Selection */}
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
                    {p.name} - {p.totem}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress Summary for Selected Patrouille */}
            {progress && (
              <div className="progress-summary">
                <div className="progress-header">
                  <span>Progress: {progress.completionPercentage}%</span>
                  <span>
                    {progress.completedSets}/{progress.totalSets} sets complete
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progress.completionPercentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Category Selection */}
            <div className="form-group">
              <label>Schematic Category *</label>
              <div className="category-accordion">
                {categories.map((set) => {
                  const setProgress = progress?.sets?.find(
                    (s) => s.setName === set.setName
                  );
                  const isExpanded = expandedSet === set.setName;

                  return (
                    <div key={set.setName} className="category-set">
                      <button
                        type="button"
                        className={`category-set-header ${isExpanded ? 'expanded' : ''}`}
                        onClick={() =>
                          setExpandedSet(isExpanded ? null : set.setName)
                        }
                      >
                        <span className="set-name">{set.setName}</span>
                        {setProgress && (
                          <span className="set-progress">
                            {setProgress.completedItems}/{setProgress.totalItems}
                            {setProgress.isComplete && ' ✅'}
                          </span>
                        )}
                        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                      </button>

                      {isExpanded && (
                        <div className="category-items">
                          {set.items.map((item) => {
                            const status = getItemStatus(item.id);
                            const disabled = isItemDisabled(item.id);
                            const selected =
                              formData.schematicCategoryId === String(item.id);

                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`category-item ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${status?.toLowerCase() || ''}`}
                                onClick={() =>
                                  !disabled && handleCategorySelect(String(item.id))
                                }
                                disabled={disabled}
                              >
                                <span className="item-name">{item.itemName}</span>
                                <span className={`item-status-badge status-${status?.toLowerCase() || 'pending'}`}>
                                  <span className="status-icon">
                                    {status === 'APPROVED' && '✓'}
                                    {status === 'SUBMITTED' && '⏳'}
                                    {status === 'REJECTED' && '✗'}
                                    {(!status || status === 'PENDING') && '○'}
                                  </span>
                                  {status === 'APPROVED' && 'Done'}
                                  {status === 'SUBMITTED' && 'Pending'}
                                  {status === 'REJECTED' && 'Rejected'}
                                  {(!status || status === 'PENDING') && 'Not uploaded'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {formData.schematicCategoryId && (
                <p className="field-help selected-category">
                  Selected:{' '}
                  {categories
                    .flatMap((s) => s.items)
                    .find((i) => String(i.id) === formData.schematicCategoryId)
                    ?.itemName || 'Unknown'}
                </p>
              )}
            </div>

            {/* File Upload */}
            <div className="form-group file-upload-group">
              <label>Schematic Image(s) * (max 10)</label>
              <div className="file-upload-area">
                {previews.length > 0 ? (
                  <div className="preview-container">
                    <div className="preview-grid">
                      {previews.map((preview, index) => (
                        <img
                          key={index}
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          className="preview-image-small"
                        />
                      ))}
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
                    <div className="upload-icon">📐</div>
                    <p>Click to select schematic images</p>
                    <p className="text-muted">PNG, JPG up to 10MB each</p>
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

            {/* Info Box */}
            <div className="info-box">
              <strong>How it works:</strong>
              <ul>
                <li>Select the patrouille that completed this schematic</li>
                <li>Choose the correct category (set and item)</li>
                <li>Upload the hand-drawn schematic image(s)</li>
                <li>Branche will review and approve the submission</li>
                <li>
                  Complete all items in all 7 sets to win!
                </li>
              </ul>
            </div>

            {/* Progress Bar */}
            {loading && (
              <div className="upload-progress-container">
                <div className="upload-progress-header">
                  <span className="upload-progress-title">Uploading...</span>
                  <span className="upload-progress-percent">
                    {uploadProgress.percent}%
                  </span>
                </div>
                <div className="upload-progress-bar">
                  <div
                    className="upload-progress-fill"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <div className="upload-progress-details">
                  <span>
                    {formatBytes(uploadProgress.loaded)} /{' '}
                    {formatBytes(uploadProgress.total)}
                  </span>
                  <button
                    type="button"
                    className="btn-cancel-upload"
                    onClick={handleCancelUpload}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn-submit primary"
              disabled={
                loading ||
                files.length === 0 ||
                !formData.patrouilleId ||
                !formData.schematicCategoryId
              }
            >
              {loading
                ? `Uploading... ${uploadProgress.percent}%`
                : 'Upload Schematic'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SchematicUpload;
