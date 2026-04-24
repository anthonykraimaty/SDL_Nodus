import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schematicService, patrouilleService, pictureService } from '../services/api';

// Shared IndexedDB store written by the service worker on a Web Share Target hit
const SHARE_DB_NAME = 'nodus-share-target';
const SHARE_STORE_NAME = 'shared-files';

function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getSharedFiles() {
  const db = await openShareDB();
  const tx = db.transaction(SHARE_STORE_NAME, 'readonly');
  const store = tx.objectStore(SHARE_STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () =>
      resolve(
        req.result.map((item) => {
          const blob = new Blob([item.data], { type: item.type });
          return new File([blob], item.name, {
            type: item.type,
            lastModified: item.lastModified,
          });
        })
      );
    req.onerror = () => reject(req.error);
  });
}

async function clearSharedFiles() {
  const db = await openShareDB();
  const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
  tx.objectStore(SHARE_STORE_NAME).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ImageEditor from '../components/ImageEditor';
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
  const [searchParams] = useSearchParams();
  const fromShare = searchParams.get('from') === 'share';
  const abortControllerRef = useRef(null);

  // Step: 'upload' or 'classify'
  const [step, setStep] = useState('upload');

  const [formData, setFormData] = useState({
    patrouilleId: '',
    categoryId: '',
  });

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [patrouilles, setPatrouilles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [expandedSet, setExpandedSet] = useState(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Upload result - the created PictureSet (single-set flow)
  const [uploadedPictureSet, setUploadedPictureSet] = useState(null);

  // Per-picture classification flow: list of { id, filePath, categoryId, saving, saved }
  const [batchSets, setBatchSets] = useState([]);
  const [batchMode, setBatchMode] = useState(false); // true when >1 file + no batch category

  // Classify loading
  const [classifyLoading, setClassifyLoading] = useState(false);

  // Image editor state
  const [editingPicture, setEditingPicture] = useState(null);

  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    loaded: 0,
    total: 0,
  });

  // Unclassified schematics for this troupe
  const [unclassified, setUnclassified] = useState([]);
  const [loadingUnclassified, setLoadingUnclassified] = useState(false);

  // Delete state for unclassified schematics
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Classify modal for unclassified schematics
  const [classifyModal, setClassifyModal] = useState({ open: false, schematic: null });
  const [classifyModalCategory, setClassifyModalCategory] = useState('');
  const [classifyModalExpandedSet, setClassifyModalExpandedSet] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, [user]);

  // Hydrate from the Web Share Target: pick up files the service worker stashed
  useEffect(() => {
    if (!fromShare) return;

    let cancelled = false;
    (async () => {
      try {
        const shared = await getSharedFiles();
        if (cancelled || shared.length === 0) return;

        if (shared.length > 10) {
          setError('Maximum 10 files allowed per schematic. Only the first 10 were kept.');
        }
        const capped = shared.slice(0, 10);
        setFiles(capped);

        const newPreviews = [];
        let loadedCount = 0;
        capped.forEach((file) => {
          if (file.type === 'application/pdf') {
            newPreviews.push({ type: 'pdf', name: file.name });
            loadedCount++;
            if (loadedCount === capped.length && !cancelled) setPreviews([...newPreviews]);
          } else {
            const reader = new FileReader();
            reader.onloadend = () => {
              newPreviews.push({ type: 'image', src: reader.result });
              loadedCount++;
              if (loadedCount === capped.length && !cancelled) setPreviews([...newPreviews]);
            };
            reader.readAsDataURL(file);
          }
        });

        // Consume the shared-files store so we don't re-hydrate on back-nav
        await clearSharedFiles();
      } catch (err) {
        console.error('Failed to hydrate shared files:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromShare]);

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

      // Load patrouilles
      if (user?.troupe?.patrouilles && user.troupe.patrouilles.length > 0) {
        setPatrouilles(user.troupe.patrouilles);
      } else if (user?.troupeId) {
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

      // Load unclassified schematics
      loadUnclassified();
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const loadUnclassified = async () => {
    try {
      setLoadingUnclassified(true);
      const data = await schematicService.getUnclassified();
      setUnclassified(data.schematics || []);
    } catch (err) {
      console.error('Failed to load unclassified:', err);
      setUnclassified([]);
    } finally {
      setLoadingUnclassified(false);
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
      categoryId: categoryId,
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
        if (file.type === 'application/pdf') {
          // For PDFs, use a placeholder
          newPreviews.push({ type: 'pdf', name: file.name });
          loadedCount++;
          if (loadedCount === selectedFiles.length) {
            setPreviews([...newPreviews]);
          }
        } else {
          const reader = new FileReader();
          reader.onloadend = () => {
            newPreviews.push({ type: 'image', src: reader.result });
            loadedCount++;
            if (loadedCount === selectedFiles.length) {
              setPreviews([...newPreviews]);
            }
          };
          reader.readAsDataURL(file);
        }
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

      // Per-picture classification: if multiple files AND no batch category,
      // upload each file as its own PictureSet so each can be classified separately.
      const useBatchClassify = !formData.categoryId && files.length > 1;

      if (useBatchClassify) {
        const created = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fd = new FormData();
          fd.append('pictures', file);
          fd.append('patrouilleId', formData.patrouilleId);

          const r = await schematicService.uploadWithProgress(
            fd,
            (p) => {
              // Aggregate: count the current file's percent against the whole batch
              const overall = Math.round(((i + p.percent / 100) / files.length) * 100);
              setUploadProgress({ percent: overall, loaded: i + 1, total: files.length });
            },
            abortControllerRef.current.signal
          );
          created.push(r.pictureSet);
        }

        setBatchSets(
          created.map((s) => ({
            id: s.id,
            filePath: s.pictures?.[0]?.filePath || null,
            pictureId: s.pictures?.[0]?.id || null,
            categoryId: '',
            saving: false,
            saved: false,
          }))
        );
        setBatchMode(true);
        setStep('batchClassify');
      } else {
        const uploadData = new FormData();
        files.forEach((file) => {
          uploadData.append('pictures', file);
        });
        uploadData.append('patrouilleId', formData.patrouilleId);
        if (formData.categoryId) {
          uploadData.append('categoryId', formData.categoryId);
        }

        const result = await schematicService.uploadWithProgress(
          uploadData,
          (progress) => {
            setUploadProgress(progress);
          },
          abortControllerRef.current.signal
        );

        setUploadedPictureSet(result.pictureSet);

        // If category was already selected, go straight to success
        if (formData.categoryId) {
          setStep('success');
        } else {
          // Show classify step
          setStep('classify');
        }
      }
    } catch (err) {
      if (err.message !== 'Upload cancelled') {
        setError(err.message || 'Failed to upload schematic');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleClassify = async () => {
    if (!formData.categoryId || !uploadedPictureSet) return;

    setClassifyLoading(true);
    setError('');

    try {
      const result = await schematicService.classify(uploadedPictureSet.id, parseInt(formData.categoryId));
      setUploadedPictureSet(result.pictureSet);
      setStep('success');
    } catch (err) {
      setError(err.message || 'Failed to classify schematic');
    } finally {
      setClassifyLoading(false);
    }
  };

  const openClassifyModal = (schematic) => {
    setClassifyModal({ open: true, schematic });
    setClassifyModalCategory('');
    setClassifyModalExpandedSet(null);
    // Load progress for this schematic's patrouille if not already loaded
    if (schematic.patrouilleId && schematic.patrouilleId !== parseInt(formData.patrouilleId)) {
      loadPatrouilleProgress(schematic.patrouilleId);
    }
  };

  const handleClassifyModalSubmit = async () => {
    if (!classifyModalCategory || !classifyModal.schematic) return;

    setClassifyLoading(true);
    setError('');

    try {
      await schematicService.classify(classifyModal.schematic.id, parseInt(classifyModalCategory));
      setUnclassified(prev => prev.filter(s => s.id !== classifyModal.schematic.id));
      setClassifyModal({ open: false, schematic: null });
      setClassifyModalCategory('');
    } catch (err) {
      setError(err.message || 'Failed to classify schematic');
    } finally {
      setClassifyLoading(false);
    }
  };

  const handleClassifyModalCategorySelect = (categoryId) => {
    setClassifyModalCategory(String(categoryId));
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setUploadProgress({ percent: 0, loaded: 0, total: 0 });
    }
  };

  const handleSkipClassify = () => {
    setStep('success');
  };

  const updateBatchCategory = (setId, categoryId) => {
    setBatchSets((prev) =>
      prev.map((b) => (b.id === setId ? { ...b, categoryId } : b))
    );
  };

  const saveBatchRow = async (setId) => {
    const row = batchSets.find((b) => b.id === setId);
    if (!row || !row.categoryId || row.saved) return;
    setBatchSets((prev) => prev.map((b) => (b.id === setId ? { ...b, saving: true } : b)));
    try {
      await schematicService.classify(setId, parseInt(row.categoryId));
      setBatchSets((prev) =>
        prev.map((b) => (b.id === setId ? { ...b, saving: false, saved: true } : b))
      );
    } catch (err) {
      setBatchSets((prev) => prev.map((b) => (b.id === setId ? { ...b, saving: false } : b)));
      setError(err.message || 'Failed to classify schematic');
    }
  };

  const saveAllBatch = async () => {
    setClassifyLoading(true);
    setError('');
    try {
      for (const row of batchSets) {
        if (!row.categoryId || row.saved) continue;
        await schematicService.classify(row.id, parseInt(row.categoryId));
      }
      setBatchSets((prev) =>
        prev.map((b) => (b.categoryId ? { ...b, saved: true, saving: false } : b))
      );
    } catch (err) {
      setError(err.message || 'Failed to classify some schematics');
    } finally {
      setClassifyLoading(false);
    }
  };

  const deleteBatchRow = async (setId) => {
    try {
      await schematicService.delete(setId);
      setBatchSets((prev) => prev.filter((b) => b.id !== setId));
    } catch (err) {
      setError(err.message || 'Failed to delete schematic');
    }
  };

  const finishBatch = () => {
    setBatchSets([]);
    setBatchMode(false);
    setStep('success');
    loadUnclassified();
  };

  const handleNewUpload = () => {
    setStep('upload');
    setFiles([]);
    setPreviews([]);
    setFormData(prev => ({ ...prev, categoryId: '' }));
    setUploadedPictureSet(null);
    setError('');
    setAgreedToTerms(false);
    // Reload progress for selected patrouille
    if (formData.patrouilleId) {
      loadPatrouilleProgress(formData.patrouilleId);
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

  const handleImageEditorSave = async (blob, pictureId) => {
    try {
      await pictureService.editImage(pictureId, blob);
      setEditingPicture(null);
      loadUnclassified();
    } catch (err) {
      console.error('Failed to save edited image:', err);
      setError('Failed to save edited image');
    }
  };

  const handleDeleteSchematic = async (schematicId) => {
    try {
      setDeleteLoading(true);
      await schematicService.delete(schematicId);
      setDeleteConfirm(null);
      loadUnclassified();
    } catch (err) {
      console.error('Failed to delete schematic:', err);
      setError(err.error || 'Failed to delete schematic');
    } finally {
      setDeleteLoading(false);
    }
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

  // Success step
  if (step === 'success') {
    return (
      <div className="container">
        <div className="success-page">
          <div className="success-icon">&#x2705;</div>
          <h2>Upload Successful!</h2>
          <p>
            {uploadedPictureSet?.categoryId
              ? 'Your schematic has been uploaded and classified. It is pending review by Branche.'
              : 'Your schematic has been uploaded. You can classify it later from this page.'}
          </p>
          <div className="success-actions">
            <button className="btn-submit primary" onClick={handleNewUpload}>
              Upload Another
            </button>
            <button
              className="btn-submit secondary"
              onClick={() => navigate('/schematics/progress')}
            >
              View Progress
            </button>
          </div>
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

  // Classify step (after upload without category)
  if (step === 'classify') {
    return (
      <div className="schematic-upload-page">
        <div className="container">
          <div className="upload-container">
            <div className="upload-header">
              <h2>Classify Schematic</h2>
              <p>Select the set and category for your uploaded schematic</p>
            </div>

            <div className="upload-form">
              {error && <div className="error-message">{error}</div>}

              {/* Show uploaded images */}
              {uploadedPictureSet?.pictures && (
                <div className="uploaded-preview">
                  <label>Uploaded Images</label>
                  <div className="preview-grid">
                    {uploadedPictureSet.pictures.map((pic, index) => {
                      const isPdf = pic.filePath?.toLowerCase().endsWith('.pdf');
                      return (
                        <div key={pic.id} className="preview-item">
                          {isPdf ? (
                            <div className="pdf-preview-thumb">
                              <span className="pdf-icon">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={getImageUrl(pic.filePath)}
                              alt={`Uploaded ${index + 1}`}
                              className="preview-image-small"
                            />
                          )}
                          {!isPdf && (
                            <button
                              type="button"
                              className="btn-edit-image"
                              onClick={() => setEditingPicture(pic)}
                              title="Edit image"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category Selection */}
              <div className="form-group">
                <label>Select Category *</label>
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
                              {setProgress.isComplete && ' &#x2705;'}
                            </span>
                          )}
                          <span className="expand-icon">{isExpanded ? '&#x25BC;' : '&#x25B6;'}</span>
                        </button>

                        {isExpanded && (
                          <div className="category-items">
                            {set.items.map((item) => {
                              const status = getItemStatus(item.id);
                              const disabled = isItemDisabled(item.id);
                              const selected =
                                formData.categoryId === String(item.id);

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
                                      {status === 'APPROVED' && '\u2713'}
                                      {status === 'SUBMITTED' && '\u23F3'}
                                      {status === 'REJECTED' && '\u2717'}
                                      {(!status || status === 'PENDING') && '\u25CB'}
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
                {formData.categoryId && (
                  <p className="field-help selected-category">
                    Selected:{' '}
                    {categories
                      .flatMap((s) => s.items)
                      .find((i) => String(i.id) === formData.categoryId)
                      ?.itemName || 'Unknown'}
                  </p>
                )}
              </div>

              <div className="classify-actions">
                <button
                  className="btn-submit primary"
                  onClick={handleClassify}
                  disabled={!formData.categoryId || classifyLoading}
                >
                  {classifyLoading ? 'Classifying...' : 'Classify Schematic'}
                </button>
                <button
                  className="btn-submit secondary"
                  onClick={handleSkipClassify}
                >
                  Classify Later
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Image Editor Modal */}
        {editingPicture && (
          <div className="image-editor-overlay">
            <ImageEditor
              pictureId={editingPicture.id}
              imageUrl={getImageUrl(editingPicture.filePath)}
              onSave={handleImageEditorSave}
              onCancel={() => setEditingPicture(null)}
            />
          </div>
        )}
      </div>
    );
  }

  // Per-picture classification step (after batch upload without category)
  if (step === 'batchClassify') {
    const allCategoryOptions = categories.flatMap((set) =>
      set.items.map((item) => ({
        id: item.id,
        label: `${set.setName} — ${item.itemName}`,
      }))
    );
    const remaining = batchSets.filter((b) => !b.saved).length;
    const readyToSave = batchSets.filter((b) => !b.saved && b.categoryId).length;

    return (
      <div className="schematic-upload-page">
        <div className="container">
          <div className="upload-container">
            <div className="upload-header">
              <h2>Classifier chaque schéma</h2>
              <p>
                Choisissez la catégorie pour chacune des {batchSets.length} images
                uploadées. Les schémas non classifiés resteront dans « Schémas à
                classifier » sur cette page.
              </p>
            </div>

            <div className="upload-form">
              {error && <div className="error-message">{error}</div>}

              <div className="batch-classify-toolbar">
                <span className="batch-counter">
                  {remaining} restant{remaining !== 1 ? 's' : ''} — {readyToSave} prêt{readyToSave !== 1 ? 's' : ''} à sauvegarder
                </span>
                <button
                  type="button"
                  className="btn-submit primary"
                  onClick={saveAllBatch}
                  disabled={classifyLoading || readyToSave === 0}
                >
                  {classifyLoading ? 'Sauvegarde…' : `Sauvegarder tout (${readyToSave})`}
                </button>
                <button
                  type="button"
                  className="btn-submit secondary"
                  onClick={finishBatch}
                >
                  Terminer
                </button>
              </div>

              <div className="batch-classify-grid">
                {batchSets.map((row) => {
                  const isPdf = row.filePath?.toLowerCase().endsWith('.pdf');
                  return (
                    <div
                      key={row.id}
                      className={`batch-classify-item ${row.saved ? 'saved' : ''}`}
                    >
                      <div className="batch-thumb">
                        {isPdf ? (
                          <div className="pdf-preview-thumb">
                            <span className="pdf-icon">PDF</span>
                          </div>
                        ) : (
                          <img src={getImageUrl(row.filePath)} alt="Schematic" />
                        )}
                      </div>
                      <div className="batch-controls">
                        <select
                          value={row.categoryId}
                          onChange={(e) => updateBatchCategory(row.id, e.target.value)}
                          disabled={row.saved}
                        >
                          <option value="">— Choisir une catégorie —</option>
                          {allCategoryOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="batch-row-actions">
                          <button
                            type="button"
                            className="btn-submit primary small"
                            onClick={() => saveBatchRow(row.id)}
                            disabled={!row.categoryId || row.saving || row.saved}
                          >
                            {row.saved
                              ? '✓ Classifié'
                              : row.saving
                              ? 'Sauvegarde…'
                              : 'Sauvegarder'}
                          </button>
                          {!row.saved && (
                            <button
                              type="button"
                              className="btn-submit secondary small"
                              onClick={() => deleteBatchRow(row.id)}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Upload step (default)
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

            {/* Category Selection (Optional) */}
            <div className="form-group">
              <label>
                Schematic Category{' '}
                <span className="optional-tag">
                  (optional — laissez vide pour classifier chaque image séparément après l'upload)
                </span>
              </label>
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
                              formData.categoryId === String(item.id);

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
              {formData.categoryId && (
                <p className="field-help selected-category">
                  Selected:{' '}
                  {categories
                    .flatMap((s) => s.items)
                    .find((i) => String(i.id) === formData.categoryId)
                    ?.itemName || 'Unknown'}
                </p>
              )}
            </div>

            {/* File Upload */}
            <div className="form-group file-upload-group">
              <label>Schematic File(s) * (max 10)</label>
              <div className="file-upload-area">
                {previews.length > 0 ? (
                  <div className="preview-container">
                    <div className="preview-grid">
                      {previews.map((preview, index) => (
                        <div key={index} className="preview-item">
                          {preview.type === 'pdf' ? (
                            <div className="pdf-preview-thumb">
                              <span className="pdf-icon">PDF</span>
                              <span className="pdf-name">{preview.name}</span>
                            </div>
                          ) : (
                            <img
                              src={preview.src}
                              alt={`Preview ${index + 1}`}
                              className="preview-image-small"
                            />
                          )}
                        </div>
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
                    <p>Click to select schematic files</p>
                    <p className="text-muted">PNG, JPG, PDF up to 10MB each</p>
                  </label>
                )}
                <input
                  type="file"
                  id="file-input"
                  accept="image/*,.pdf"
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
                <li>Optionally choose the category now, or classify later</li>
                <li>Upload the hand-drawn schematic image(s) or PDF</li>
                <li>You can edit (crop/rotate) images after upload</li>
                <li>Branche will review and approve the submission</li>
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
                !agreedToTerms
              }
            >
              {loading
                ? `Uploading... ${uploadProgress.percent}%`
                : formData.categoryId
                  ? 'Upload & Classify'
                  : 'Upload Schematic'}
            </button>
          </form>

          {/* Unclassified Schematics Section */}
          {unclassified.length > 0 && (
            <div className="unclassified-section">
              <h3>Unclassified Schematics</h3>
              <p className="text-muted">These schematics need to be classified with a category.</p>
              <div className="unclassified-list">
                {unclassified.map((schematic) => (
                  <div key={schematic.id} className="unclassified-card">
                    <div className="unclassified-images">
                      {schematic.pictures?.slice(0, 2).map((pic) => {
                        const isPdf = pic.filePath?.toLowerCase().endsWith('.pdf');
                        return isPdf ? (
                          <div key={pic.id} className="pdf-preview-thumb small">
                            <span className="pdf-icon">PDF</span>
                          </div>
                        ) : (
                          <img
                            key={pic.id}
                            src={getImageUrl(pic.filePath)}
                            alt="Schematic"
                            className="unclassified-thumb"
                          />
                        );
                      })}
                    </div>
                    <div className="unclassified-info">
                      <span className="unclassified-patrouille">
                        {schematic.patrouille?.name}
                      </span>
                      <span className="unclassified-date">
                        {new Date(schematic.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="unclassified-actions">
                      <button
                        className="btn-classify-small"
                        onClick={() => openClassifyModal(schematic)}
                      >
                        Classify
                      </button>
                      <button
                        className="btn-delete-small"
                        onClick={() => setDeleteConfirm(schematic)}
                        title="Delete this schematic"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* Classify Modal */}
      <Modal
        isOpen={classifyModal.open}
        onClose={() => setClassifyModal({ open: false, schematic: null })}
        title="Classify Schematic"
        size="medium"
      >
        <Modal.Body>
          {/* Show the schematic images */}
          {classifyModal.schematic?.pictures && (
            <div className="classify-modal-preview">
              {classifyModal.schematic.pictures.slice(0, 3).map((pic) => {
                const isPdf = pic.filePath?.toLowerCase().endsWith('.pdf');
                return isPdf ? (
                  <div key={pic.id} className="pdf-preview-thumb small">
                    <span className="pdf-icon">PDF</span>
                  </div>
                ) : (
                  <img
                    key={pic.id}
                    src={getImageUrl(pic.filePath)}
                    alt="Schematic"
                    className="classify-modal-thumb"
                  />
                );
              })}
            </div>
          )}

          <p className="classify-modal-info">
            <strong>{classifyModal.schematic?.patrouille?.name}</strong>
            {' - '}
            {classifyModal.schematic?.uploadedAt && new Date(classifyModal.schematic.uploadedAt).toLocaleDateString()}
          </p>

          {/* Category Selection */}
          <div className="category-accordion">
            {categories.map((set) => {
              const isExpanded = classifyModalExpandedSet === set.setName;

              return (
                <div key={set.setName} className="category-set">
                  <button
                    type="button"
                    className={`category-set-header ${isExpanded ? 'expanded' : ''}`}
                    onClick={() =>
                      setClassifyModalExpandedSet(isExpanded ? null : set.setName)
                    }
                  >
                    <span className="set-name">{set.setName}</span>
                    <span className="expand-icon">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  </button>

                  {isExpanded && (
                    <div className="category-items">
                      {set.items.map((item) => {
                        const selected = classifyModalCategory === String(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`category-item ${selected ? 'selected' : ''}`}
                            onClick={() => handleClassifyModalCategorySelect(item.id)}
                          >
                            <span className="item-name">{item.itemName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {classifyModalCategory && (
            <p className="field-help selected-category">
              Selected:{' '}
              {categories
                .flatMap((s) => s.items)
                .find((i) => String(i.id) === classifyModalCategory)
                ?.itemName || 'Unknown'}
            </p>
          )}
        </Modal.Body>
        <Modal.Actions>
          <button
            className="primary"
            onClick={handleClassifyModalSubmit}
            disabled={!classifyModalCategory || classifyLoading}
          >
            {classifyLoading ? 'Classifying...' : 'Classify'}
          </button>
          <button
            className="secondary"
            onClick={() => setClassifyModal({ open: false, schematic: null })}
          >
            Cancel
          </button>
        </Modal.Actions>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Schematic?"
        variant="danger"
      >
        <Modal.Body>
          {deleteConfirm && (
            <>
              <p>
                Are you sure you want to delete this schematic
                {deleteConfirm.patrouille?.name ? ` for ${deleteConfirm.patrouille.name}` : ''}?
              </p>
              <p className="warning-text">This action cannot be undone.</p>
            </>
          )}
        </Modal.Body>
        <Modal.Actions>
          <button
            className="danger"
            onClick={() => handleDeleteSchematic(deleteConfirm?.id)}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </button>
          <button
            className="secondary"
            onClick={() => setDeleteConfirm(null)}
            disabled={deleteLoading}
          >
            Cancel
          </button>
        </Modal.Actions>
      </Modal>

      {/* Image Editor */}
      {editingPicture && (
        <div className="image-editor-overlay">
          <ImageEditor
            pictureId={editingPicture.id}
            imageUrl={getImageUrl(editingPicture.filePath)}
            onSave={handleImageEditorSave}
            onCancel={() => setEditingPicture(null)}
          />
        </div>
      )}
    </div>
  );
};

export default SchematicUpload;
