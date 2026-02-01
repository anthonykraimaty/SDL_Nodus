import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import './ShareTarget.css';

// IndexedDB helper for retrieving shared files
const DB_NAME = 'nodus-share-target';
const STORE_NAME = 'shared-files';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getStoredFiles() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      // Convert stored data back to File objects
      const files = request.result.map((item) => {
        const blob = new Blob([item.data], { type: item.type });
        return new File([blob], item.name, {
          type: item.type,
          lastModified: item.lastModified,
        });
      });
      resolve(files);
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearStoredFiles() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Helper to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const ShareTarget = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const abortControllerRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [status, setStatus] = useState('loading'); // loading, no-files, auth-required, uploading, success, error
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    loaded: 0,
    total: 0,
  });

  // Load files from IndexedDB on mount
  useEffect(() => {
    const loadFiles = async () => {
      const shared = searchParams.get('shared');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setStatus('error');
        setError(
          errorParam === 'no-files'
            ? 'No files were received. Please try sharing again.'
            : 'Error processing shared files. Please try again.'
        );
        return;
      }

      if (shared === 'true') {
        try {
          const storedFiles = await getStoredFiles();
          if (storedFiles.length === 0) {
            setStatus('no-files');
            return;
          }

          setFiles(storedFiles);

          // Create previews
          const newPreviews = await Promise.all(
            storedFiles.map(
              (file) =>
                new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(file);
                })
            )
          );
          setPreviews(newPreviews);
          setStatus('ready');
        } catch (err) {
          console.error('Error loading files:', err);
          setStatus('error');
          setError('Failed to load shared files.');
        }
      } else {
        // Check if there are pending files from a previous share (before login)
        try {
          const storedFiles = await getStoredFiles();
          if (storedFiles.length > 0) {
            setFiles(storedFiles);
            const newPreviews = await Promise.all(
              storedFiles.map(
                (file) =>
                  new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                  })
              )
            );
            setPreviews(newPreviews);
            setStatus('ready');
          } else {
            setStatus('no-files');
          }
        } catch {
          setStatus('no-files');
        }
      }
    };

    loadFiles();
  }, [searchParams]);

  // Handle upload when user is authenticated and files are ready
  useEffect(() => {
    if (authLoading) return;

    if (status === 'ready' && files.length > 0) {
      if (!user) {
        setStatus('auth-required');
      } else if (user.role !== 'CHEF_TROUPE') {
        setStatus('error');
        setError('Only Chef Troupe members can upload pictures.');
      } else {
        // Auto-start upload
        handleUpload();
      }
    }
  }, [authLoading, user, status, files]);

  const handleUpload = async () => {
    if (!user || files.length === 0) return;

    setStatus('uploading');
    setUploadProgress({ percent: 0, loaded: 0, total: 0 });
    abortControllerRef.current = new AbortController();

    try {
      const uploadData = new FormData();
      files.forEach((file) => {
        uploadData.append('pictures', file);
      });
      uploadData.append('type', 'INSTALLATION_PHOTO');

      await pictureService.uploadWithProgress(
        uploadData,
        (progress) => {
          setUploadProgress(progress);
        },
        abortControllerRef.current.signal
      );

      // Clear stored files after successful upload
      await clearStoredFiles();

      setStatus('success');
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      if (err.message !== 'Upload cancelled') {
        setStatus('error');
        setError(err.message || 'Failed to upload pictures');
      }
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus('ready');
      setUploadProgress({ percent: 0, loaded: 0, total: 0 });
    }
  };

  const handleClearAndClose = async () => {
    await clearStoredFiles();
    navigate('/');
  };

  // Loading state
  if (authLoading || status === 'loading') {
    return (
      <div className="share-target-page">
        <div className="container">
          <div className="share-target-container">
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading shared files...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No files state
  if (status === 'no-files') {
    return (
      <div className="share-target-page">
        <div className="container">
          <div className="share-target-container">
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h2>No Files to Upload</h2>
              <p>No shared files were found. Try sharing photos from another app.</p>
              <Link to="/" className="btn-primary">
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Auth required state
  if (status === 'auth-required') {
    return (
      <div className="share-target-page">
        <div className="container">
          <div className="share-target-container">
            <div className="auth-required-state">
              <div className="auth-icon">🔐</div>
              <h2>Login Required</h2>
              <p>Please log in to upload your {files.length} photo{files.length !== 1 ? 's' : ''}.</p>
              <p className="text-muted">Your photos will be uploaded after you log in.</p>

              {previews.length > 0 && (
                <div className="preview-strip">
                  {previews.slice(0, 4).map((preview, index) => (
                    <img key={index} src={preview} alt={`Preview ${index + 1}`} className="preview-thumb" />
                  ))}
                  {previews.length > 4 && <span className="preview-more">+{previews.length - 4}</span>}
                </div>
              )}

              <div className="auth-actions">
                <Link to="/login?redirect=/share-target" className="btn-primary">
                  Log In
                </Link>
                <button onClick={handleClearAndClose} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="share-target-page">
        <div className="container">
          <div className="share-target-container">
            <div className="error-state">
              <div className="error-icon">❌</div>
              <h2>Upload Failed</h2>
              <p>{error}</p>
              <div className="error-actions">
                {files.length > 0 && user?.role === 'CHEF_TROUPE' && (
                  <button onClick={handleUpload} className="btn-primary">
                    Try Again
                  </button>
                )}
                <button onClick={handleClearAndClose} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="share-target-page">
        <div className="container">
          <div className="share-target-container">
            <div className="success-state">
              <div className="success-icon">✅</div>
              <h2>Upload Successful!</h2>
              <p>
                Your {files.length} photo{files.length !== 1 ? 's have' : ' has'} been uploaded.
              </p>
              <p className="text-muted">Redirecting to dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Uploading state
  if (status === 'uploading') {
    return (
      <div className="share-target-page">
        <div className="container">
          <div className="share-target-container">
            <div className="uploading-state">
              <h2>Uploading Photos</h2>
              <p>
                Uploading {files.length} photo{files.length !== 1 ? 's' : ''}...
              </p>

              {previews.length > 0 && (
                <div className="preview-strip uploading">
                  {previews.slice(0, 6).map((preview, index) => (
                    <img key={index} src={preview} alt={`Preview ${index + 1}`} className="preview-thumb" />
                  ))}
                  {previews.length > 6 && <span className="preview-more">+{previews.length - 6}</span>}
                </div>
              )}

              <div className="upload-progress-container">
                <div className="upload-progress-header">
                  <span className="upload-progress-percent">{uploadProgress.percent}%</span>
                </div>
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${uploadProgress.percent}%` }} />
                </div>
                <div className="upload-progress-details">
                  <span>
                    {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
                  </span>
                </div>
              </div>

              <button onClick={handleCancelUpload} className="btn-cancel">
                Cancel Upload
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ready state (should auto-upload, but shown briefly)
  return (
    <div className="share-target-page">
      <div className="container">
        <div className="share-target-container">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Preparing upload...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareTarget;
