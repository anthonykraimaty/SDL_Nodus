import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import Modal from '../components/Modal';
import './Upload.css';

// Helper to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const abortControllerRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Progress state
  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    loaded: 0,
    total: 0,
  });

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
    setUploadProgress({ percent: 0, loaded: 0, total: 0 });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      if (!files || files.length === 0) {
        throw new Error('Please select at least one file');
      }

      const uploadData = new FormData();

      // Append all files
      files.forEach((file) => {
        uploadData.append('pictures', file);
      });

      // Always upload as installation photo - schematics use separate flow
      uploadData.append('type', 'INSTALLATION_PHOTO');

      // Use upload with progress tracking
      await pictureService.uploadWithProgress(
        uploadData,
        (progress) => {
          setUploadProgress(progress);
        },
        abortControllerRef.current.signal
      );

      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      if (err.message !== 'Upload cancelled') {
        setError(err.message || 'Failed to upload pictures');
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
            <h2>Upload Installation Photos</h2>
            <p>Upload installation photos (up to 100 pictures at once)</p>
            <p className="text-muted">Title will be automatically generated. Other details can be added during classification.</p>
            <p className="text-muted">For schematics, use the <Link to="/schematics/upload">Schematic Upload</Link> page instead.</p>
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

            <div className="info-box">
              <strong>ℹ️ What happens next?</strong>
              <ul>
                <li>Your pictures will be uploaded with an auto-generated title</li>
                <li>You can then classify them by adding categories and dates</li>
                <li>After classification, they'll be reviewed by Branche Éclaireurs</li>
                <li>Once approved, they'll be publicly visible</li>
              </ul>
            </div>

            {/* Terms and Conditions Checkbox */}
            <div className="terms-checkbox">
              <label className="terms-label">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  required
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    className="terms-link"
                    onClick={() => setShowTermsModal(true)}
                  >
                    terms and conditions
                  </button>
                </span>
              </label>
            </div>

            {/* Progress Bar - shown during upload */}
            {loading && (
              <div className="upload-progress-container">
                <div className="upload-progress-header">
                  <span className="upload-progress-title">Uploading {files.length} file{files.length !== 1 ? 's' : ''}...</span>
                  <span className="upload-progress-percent">{uploadProgress.percent}%</span>
                </div>
                <div className="upload-progress-bar">
                  <div
                    className="upload-progress-fill"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <div className="upload-progress-details">
                  <span>{formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}</span>
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
              disabled={loading || files.length === 0 || !agreedToTerms}
            >
              {loading ? `Uploading... ${uploadProgress.percent}%` : `Upload ${files.length || 0} Picture${files.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        </div>
      </div>

      {/* Terms and Conditions Modal */}
      <Modal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Terms and Conditions"
        size="large"
      >
        <Modal.Body>
          <p>By submitting your design to Nodus, you agree to the following terms:</p>
          <ol className="terms-list">
            <li>
              <strong>Grant of Rights:</strong> You grant the Association a worldwide, irrevocable, perpetual, non-exclusive, and royalty-free license to use, reproduce, modify, display, and distribute the Work in connection with its website and wood craft activities.
            </li>
            <li>
              <strong>Public Disclosure:</strong> You understand and agree that the Work will be made available to the public. You waive any expectation of privacy regarding the Work.
            </li>
            <li>
              <strong>Waiver of Compensation:</strong> You expressly acknowledge that You are submitting the Work as a volunteer contribution. You waive any right to royalties, fees, commissions, or other material benefits resulting from the Association's display of the Work.
            </li>
            <li>
              <strong>Release and Indemnity:</strong> You hereby release, discharge, and agree to hold harmless the Association, its officers, and volunteers from any and all claims, demands, or causes of action that you have or may have in the future regarding the use of the Work.
            </li>
            <li>
              <strong>Warranty of Ownership:</strong> You warrant that You are the sole creator and owner of the Work and have the full legal right to grant these permissions.
            </li>
          </ol>
        </Modal.Body>
        <Modal.Actions>
          <button className="btn-primary" onClick={() => setShowTermsModal(false)}>
            Close
          </button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default Upload;
