import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService, designGroupService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ImageEditor from '../components/ImageEditor';
import './ImageClassifier.css';

const ImageClassifier = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pictureSet, setPictureSet] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPictures, setSelectedPictures] = useState(new Set());
  const [classificationData, setClassificationData] = useState({});
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkMonth, setBulkMonth] = useState('');
  const [bulkYear, setBulkYear] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [pictureType, setPictureType] = useState('');
  const [showSchematicWarning, setShowSchematicWarning] = useState(false);
  const [editingPicture, setEditingPicture] = useState(null);
  const [createNewGroup, setCreateNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [viewingGroup, setViewingGroup] = useState(null);
  const [viewingGroupIndex, setViewingGroupIndex] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pictureSetData, categoriesData] = await Promise.all([
        pictureService.getById(id),
        categoryService.getAll({}),
      ]);

      setPictureSet(pictureSetData);
      setCategories([...categoriesData].sort((a, b) => a.name.localeCompare(b.name)));
      setPictureType(pictureSetData.type || 'INSTALLATION_PHOTO');

      // Initialize classification data for each picture (including woodCount)
      const initialData = {};
      pictureSetData.pictures?.forEach(pic => {
        initialData[pic.id] = {
          categoryId: pic.categoryId || '',
          takenAt: pic.takenAt ? new Date(pic.takenAt).toISOString().split('T')[0] : '',
          woodCount: pic.woodCount ? pic.woodCount.toString() : '',
        };
      });
      setClassificationData(initialData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load picture set');
    } finally {
      setLoading(false);
    }
  };

  const handleClassificationChange = (pictureId, field, value) => {
    setClassificationData(prev => ({
      ...prev,
      [pictureId]: {
        ...prev[pictureId],
        [field]: value,
      },
    }));
  };

  // Update category for all pictures in a design group at once
  const handleGroupCategoryChange = (group, value) => {
    setClassificationData(prev => {
      const updates = { ...prev };
      group.pictures.forEach(pic => {
        updates[pic.id] = {
          ...updates[pic.id],
          categoryId: value,
        };
      });
      return updates;
    });
  };

  const togglePictureSelection = (pictureId) => {
    setSelectedPictures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pictureId)) {
        newSet.delete(pictureId);
      } else {
        newSet.add(pictureId);
      }
      return newSet;
    });
  };

  const handleArchivePicture = (pictureId) => {
    setConfirmAction({
      title: 'Archive picture?',
      message: 'Archive this picture? You can restore it later from the archive.',
      confirmText: 'Archive',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await pictureService.archivePicture(id, pictureId);
          await loadData();
        } catch (err) {
          console.error('Archive error:', err);
          setError(err.message || 'Failed to archive picture');
        }
      },
    });
  };

  const selectAll = () => {
    if (selectedPictures.size === pictureSet.pictures.length) {
      setSelectedPictures(new Set());
    } else {
      setSelectedPictures(new Set(pictureSet.pictures.map(p => p.id)));
    }
  };

  const applyBulkClassification = () => {
    if (selectedPictures.size === 0) {
      alert('Please select at least one picture');
      return;
    }

    const updates = {};
    selectedPictures.forEach(pictureId => {
      updates[pictureId] = {
        categoryId: bulkCategory || classificationData[pictureId]?.categoryId || '',
        takenAt: (bulkMonth && bulkYear)
          ? `${bulkYear}-${bulkMonth.padStart(2, '0')}-01`
          : classificationData[pictureId]?.takenAt || '',
        woodCount: classificationData[pictureId]?.woodCount || '', // Keep existing woodCount (per-picture)
      };
    });

    setClassificationData(prev => ({
      ...prev,
      ...updates,
    }));

    // Clear selection and bulk inputs after applying
    setSelectedPictures(new Set());
    setBulkCategory('');
    setBulkMonth('');
    setBulkYear('');
    setSuccess('Bulk classification applied! Click "Save All Classifications" to save.');
  };

  const handleCreateGroup = async () => {
    if (selectedPictures.size < 2) {
      setError('Select at least 2 pictures to create a group');
      return;
    }
    try {
      setCreatingGroup(true);
      setError('');
      const pictureIds = Array.from(selectedPictures);
      await designGroupService.create({
        name: newGroupName || undefined,
        pictureIds,
      });
      setSuccess('Design group created successfully!');
      setShowGroupForm(false);
      setNewGroupName('');
      setSelectedPictures(new Set());
    } catch (err) {
      console.error('Failed to create group:', err);
      setError('Failed to create design group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleRemoveFromGroup = async (groupId, pictureId) => {
    try {
      setError('');
      const result = await designGroupService.removePicture(groupId, pictureId);
      if (result.groupDeleted || viewingGroup?.pictures?.length <= 2) {
        setViewingGroup(null);
      } else {
        // Adjust index if needed
        setViewingGroupIndex(prev => prev >= viewingGroup.pictures.length - 1 ? Math.max(0, prev - 1) : prev);
      }
      await loadData();
      setSuccess('Picture removed from group');
    } catch (err) {
      console.error('Failed to remove from group:', err);
      setError('Failed to remove picture from group');
    }
  };

  // Count classified pictures
  const getClassifiedCount = () => {
    return pictureSet?.pictures?.filter(pic => classificationData[pic.id]?.categoryId).length || 0;
  };

  const getUnclassifiedCount = () => {
    return (pictureSet?.pictures?.length || 0) - getClassifiedCount();
  };

  // Organize pictures into design groups and ungrouped
  const getGroupedPictures = () => {
    if (!pictureSet?.pictures) return { groups: [], ungrouped: [] };
    const groupMap = new Map();
    const ungrouped = [];
    pictureSet.pictures.forEach(pic => {
      if (pic.designGroupId && pic.designGroup) {
        if (!groupMap.has(pic.designGroupId)) {
          groupMap.set(pic.designGroupId, {
            id: pic.designGroupId,
            name: pic.designGroup.name,
            pictures: [],
          });
        }
        groupMap.get(pic.designGroupId).pictures.push(pic);
      } else {
        ungrouped.push(pic);
      }
    });
    return { groups: Array.from(groupMap.values()), ungrouped };
  };

  const doSaveClassifications = async (picturesToClassify) => {
    try {
      const classifications = picturesToClassify.map(pic => ({
        pictureId: pic.id,
        categoryId: classificationData[pic.id].categoryId,
        takenAt: classificationData[pic.id].takenAt || null,
        woodCount: classificationData[pic.id].woodCount || null,
      }));

      await pictureService.classifyBulk(id, {
        classifications,
        type: pictureType,
      });

      setSuccess(`${picturesToClassify.length} picture(s) classified successfully!`);
      setTimeout(() => {
        navigate('/classify');
      }, 1500);
    } catch (err) {
      console.error('Classification error:', err);
      setError('Failed to save classifications');
    }
  };

  const handleSaveAll = async () => {
    setError('');
    setSuccess('');

    // Get all pictures that have a category assigned
    const picturesToClassify = pictureSet.pictures.filter(pic =>
      classificationData[pic.id]?.categoryId
    );

    if (picturesToClassify.length === 0) {
      setError('Please assign categories to at least one picture');
      return;
    }

    // Warn if not all pictures are classified
    const unclassifiedCount = pictureSet.pictures.length - picturesToClassify.length;
    if (unclassifiedCount > 0) {
      setConfirmAction({
        title: 'Unclassified pictures',
        message: `${unclassifiedCount} picture(s) are not classified and will be excluded from approval. Do you want to continue?`,
        confirmText: 'Continue',
        variant: 'warning',
        onConfirm: async () => {
          setConfirmAction(null);
          await doSaveClassifications(picturesToClassify);
        },
      });
      return;
    }

    await doSaveClassifications(picturesToClassify);
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!pictureSet) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Picture Set Not Found</h2>
          <button onClick={() => navigate('/classify')} className="btn-primary">
            Back to Classify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="image-classifier-page">
      <div className="container">
        <div className="classifier-header">
          <div className="header-content">
            <button onClick={() => navigate('/classify')} className="btn-back">
              ← Back
            </button>
            <div>
              <h1>{pictureSet.title}</h1>
              {pictureSet.description && <p>{pictureSet.description}</p>}
            </div>
          </div>
          <div className="header-info">
            <span className="badge">{pictureSet.pictures?.length || 0} pictures</span>
            <span className="badge classified-badge">
              {getClassifiedCount()} / {pictureSet.pictures?.length || 0} classified
            </span>
            <span className="badge">{selectedPictures.size} selected</span>
          </div>
        </div>

        {/* Classification Progress */}
        <div className="classification-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(getClassifiedCount() / (pictureSet.pictures?.length || 1)) * 100}%` }}
            ></div>
          </div>
          <div className="progress-text">
            {getClassifiedCount() === pictureSet.pictures?.length ? (
              <span className="progress-complete">All pictures classified - ready to save!</span>
            ) : (
              <span>{getUnclassifiedCount()} picture(s) still need classification</span>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Type Selection */}
        <div className="type-selection-card">
          <h2>Type de contenu</h2>
          <p>Sélectionnez le type de contenu pour ce set</p>
          <div className="type-buttons">
            <button
              className={`type-btn ${pictureType === 'INSTALLATION_PHOTO' ? 'active' : ''}`}
              onClick={() => setPictureType('INSTALLATION_PHOTO')}
            >
              📸 Photos d'Installation
            </button>
            <button
              className={`type-btn ${pictureType === 'SCHEMATIC' ? 'active' : ''}`}
              onClick={() => {
                if (pictureType !== 'SCHEMATIC') {
                  setShowSchematicWarning(true);
                }
              }}
            >
              📐 Schémas
            </button>
          </div>
          {pictureType === 'SCHEMATIC' && (
            <div className="schematic-disclaimer">
              <p>
                <strong>FR:</strong> Les schémas pour Nodus 2026 "Scalpe de Patrouille" doivent être téléversés depuis la page "Téléverser Schémas" afin d'être liés à chaque patrouille et suivre leur progression. Utilisez ce bouton uniquement pour les schémas de troupe.
              </p>
              <p>
                <strong>EN:</strong> Schematics for Nodus 2026 "Scalpe de Patrouille" should be uploaded from the "Upload Schematics" page so they can be linked to each patrouille and track progress. Use this button here only for troupe schematics.
              </p>
            </div>
          )}
        </div>

        {/* Schematic Warning Modal */}
        <Modal
          isOpen={showSchematicWarning}
          onClose={() => setShowSchematicWarning(false)}
          title="⚠️ Attention / Warning"
          variant="warning"
          size="large"
        >
          <Modal.Body>
            <p>
              <strong>FR:</strong> Les schémas pour Nodus 2026 "Scalpe de Patrouille" doivent être téléversés depuis la page <strong>"Téléverser Schémas"</strong> afin d'être liés à chaque patrouille et suivre leur progression.
            </p>
            <p>
              <strong>EN:</strong> Schematics for Nodus 2026 "Scalpe de Patrouille" should be uploaded from the <strong>"Upload Schematics"</strong> page so they can be linked to each patrouille and track progress.
            </p>
            <p style={{ textAlign: 'center', marginTop: '16px', color: 'var(--accent)', fontWeight: 600 }}>
              Voulez-vous continuer avec un schéma de troupe?<br />
              Do you want to continue with a troupe schematic?
            </p>
          </Modal.Body>
          <Modal.Actions className="modal__actions--centered">
            <button
              className="primary"
              onClick={() => {
                setPictureType('SCHEMATIC');
                setShowSchematicWarning(false);
              }}
            >
              Oui, continuer
            </button>
            <button
              className="secondary"
              onClick={() => setShowSchematicWarning(false)}
            >
              Annuler
            </button>
          </Modal.Actions>
        </Modal>

        {/* Bulk Actions */}
        <div className={`bulk-actions-card ${selectedPictures.size > 0 ? 'bulk-mode' : ''}`}>
          {selectedPictures.size === 0 ? (
            // Instructions when no pictures selected
            <div className="bulk-instructions">
              <div className="bulk-instructions-icon">📋</div>
              <div className="bulk-instructions-content">
                <h3>How to Classify Pictures</h3>
                <div className="bulk-instructions-methods">
                  <div className="bulk-method">
                    <span className="bulk-method-icon">1️⃣</span>
                    <div>
                      <strong>Individual Classification</strong>
                      <p>Use the category and date selectors below each picture to classify them one by one.</p>
                    </div>
                  </div>
                  <div className="bulk-method">
                    <span className="bulk-method-icon">2️⃣</span>
                    <div>
                      <strong>Bulk Classification</strong>
                      <p>Click checkboxes on pictures to select them, then the bulk classification controls will appear here to classify multiple pictures at once.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Bulk classification controls when pictures are selected
            <>
              <div className="bulk-header">
                <div className="bulk-header-info">
                  <span className="bulk-header-icon">✅</span>
                  <h2>{selectedPictures.size} picture(s) selected</h2>
                </div>
                <button onClick={() => setSelectedPictures(new Set())} className="btn-clear-selection">
                  Clear Selection
                </button>
              </div>

              {selectedPictures.size >= 2 && (
                <div className="create-group-inline">
                  {!showGroupForm ? (
                    <button
                      onClick={() => setShowGroupForm(true)}
                      className="btn-create-group"
                    >
                      + Create Group for Selected ({selectedPictures.size})
                    </button>
                  ) : (
                    <div className="create-group-form-inline">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Group name (optional)"
                        className="form-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateGroup();
                          }
                        }}
                      />
                      <button
                        onClick={handleCreateGroup}
                        className="btn-primary"
                        disabled={creatingGroup}
                      >
                        {creatingGroup ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        onClick={() => { setShowGroupForm(false); setNewGroupName(''); }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="bulk-actions-controls">
                <button onClick={selectAll} className="btn-secondary">
                  {selectedPictures.size === pictureSet.pictures.length ? 'Deselect All' : 'Select All'}
                </button>

                <div className="bulk-inputs">
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                      className="form-select"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Month</label>
                    <select
                      value={bulkMonth}
                      onChange={(e) => setBulkMonth(e.target.value)}
                      className="form-select"
                    >
                      <option value="">Month</option>
                      <option value="1">January</option>
                      <option value="2">February</option>
                      <option value="3">March</option>
                      <option value="4">April</option>
                      <option value="5">May</option>
                      <option value="6">June</option>
                      <option value="7">July</option>
                      <option value="8">August</option>
                      <option value="9">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Year</label>
                    <select
                      value={bulkYear}
                      onChange={(e) => setBulkYear(e.target.value)}
                      className="form-select"
                    >
                      <option value="">Year</option>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={applyBulkClassification}
                    className="btn-primary"
                  >
                    Apply to Selected ({selectedPictures.size})
                  </button>
                </div>

              </div>
            </>
          )}
        </div>

        {/* Pictures Grid */}
        <div className="pictures-grid">
          {/* Grouped pictures (stacked) */}
          {(() => {
            const { groups, ungrouped } = getGroupedPictures();
            return (
              <>
                {groups.map(group => {
                  const previewPics = group.pictures.slice(0, 3);
                  const groupCategoryId = classificationData[group.pictures[0]?.id]?.categoryId || '';
                  return (
                    <div key={`group-${group.id}`} className="picture-card grouped-card">
                      <div
                        className="picture-preview stacked-preview"
                        onClick={() => { setViewingGroup(group); setViewingGroupIndex(0); }}
                        title="Click to view group"
                      >
                        {previewPics.length >= 3 && (
                          <div className="stack-card stack-card-3">
                            <img src={getImageUrl(previewPics[2].filePath)} alt="" />
                          </div>
                        )}
                        {previewPics.length >= 2 && (
                          <div className="stack-card stack-card-2">
                            <img src={getImageUrl(previewPics[1].filePath)} alt="" />
                          </div>
                        )}
                        <div className="stack-card stack-card-1">
                          <img
                            src={getImageUrl(previewPics[0].filePath)}
                            alt={group.name || 'Group'}
                          />
                        </div>
                        <div className="stack-count-badge">
                          {group.pictures.length} photos
                        </div>
                        {groupCategoryId ? (
                          <div className="picture-classified-badge">✓</div>
                        ) : (
                          <div className="picture-unclassified-badge">!</div>
                        )}
                      </div>
                      <div className="picture-controls">
                        {group.name && (
                          <div className="group-name-label">{group.name}</div>
                        )}
                        <div className="form-group">
                          <label>Category * (shared)</label>
                          <select
                            value={groupCategoryId}
                            onChange={(e) => handleGroupCategoryChange(group, e.target.value)}
                            className="form-select"
                          >
                            <option value="">Select Category</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Ungrouped pictures (normal cards) */}
                {ungrouped.map(picture => (
                  <div
                    key={picture.id}
                    className={`picture-card ${selectedPictures.has(picture.id) ? 'selected' : ''}`}
                  >
                    <div className="picture-preview">
                      <input
                        type="checkbox"
                        className="picture-checkbox"
                        checked={selectedPictures.has(picture.id)}
                        onChange={() => togglePictureSelection(picture.id)}
                      />
                      <img
                        src={getImageUrl(picture.filePath)}
                        alt={`Picture ${picture.displayOrder}`}
                        onClick={() => setSelectedImage(picture)}
                      />
                      <div className="picture-overlay">
                        <span>#{picture.displayOrder}</span>
                      </div>
                      <button
                        className="picture-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPicture(picture);
                        }}
                        title="Edit image (crop/rotate)"
                      >
                        ✎
                      </button>
                      <button
                        className="picture-archive-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchivePicture(picture.id);
                        }}
                        title="Archive this picture"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                      {classificationData[picture.id]?.categoryId ? (
                        <div className="picture-classified-badge">✓</div>
                      ) : (
                        <div className="picture-unclassified-badge">!</div>
                      )}
                    </div>

                    {!selectedPictures.has(picture.id) ? (
                      <div className="picture-controls">
                        <div className="form-group">
                          <label>Category *</label>
                          <select
                            value={classificationData[picture.id]?.categoryId || ''}
                            onChange={(e) => handleClassificationChange(picture.id, 'categoryId', e.target.value)}
                            className="form-select"
                          >
                            <option value="">Select Category</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Date</label>
                          <div className="date-picker-container">
                            <select
                              value={classificationData[picture.id]?.takenAt ? new Date(classificationData[picture.id].takenAt).getMonth() + 1 : ''}
                              onChange={(e) => {
                                const month = e.target.value;
                                const year = classificationData[picture.id]?.takenAt
                                  ? new Date(classificationData[picture.id].takenAt).getFullYear()
                                  : new Date().getFullYear();
                                if (month) {
                                  handleClassificationChange(picture.id, 'takenAt', `${year}-${month.padStart(2, '0')}-01`);
                                } else {
                                  handleClassificationChange(picture.id, 'takenAt', '');
                                }
                              }}
                              className="form-select date-select"
                            >
                              <option value="">Month</option>
                              <option value="1">Jan</option>
                              <option value="2">Feb</option>
                              <option value="3">Mar</option>
                              <option value="4">Apr</option>
                              <option value="5">May</option>
                              <option value="6">Jun</option>
                              <option value="7">Jul</option>
                              <option value="8">Aug</option>
                              <option value="9">Sep</option>
                              <option value="10">Oct</option>
                              <option value="11">Nov</option>
                              <option value="12">Dec</option>
                            </select>
                            <select
                              value={classificationData[picture.id]?.takenAt ? new Date(classificationData[picture.id].takenAt).getFullYear() : ''}
                              onChange={(e) => {
                                const year = e.target.value;
                                const month = classificationData[picture.id]?.takenAt
                                  ? new Date(classificationData[picture.id].takenAt).getMonth() + 1
                                  : new Date().getMonth() + 1;
                                if (year) {
                                  handleClassificationChange(picture.id, 'takenAt', `${year}-${String(month).padStart(2, '0')}-01`);
                                } else {
                                  handleClassificationChange(picture.id, 'takenAt', '');
                                }
                              }}
                              className="form-select date-select"
                            >
                              <option value="">Year</option>
                              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                <option key={year} value={year}>{year}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Nombre de bois</label>
                          <input
                            type="number"
                            min="0"
                            value={classificationData[picture.id]?.woodCount || ''}
                            onChange={(e) => handleClassificationChange(picture.id, 'woodCount', e.target.value)}
                            placeholder="e.g., 12"
                            className="form-input picture-wood-input"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="picture-selected-indicator">
                        <span className="selected-badge">Selected for bulk classification</span>
                        <div className="form-group">
                          <label>Nombre de bois</label>
                          <input
                            type="number"
                            min="0"
                            value={classificationData[picture.id]?.woodCount || ''}
                            onChange={(e) => handleClassificationChange(picture.id, 'woodCount', e.target.value)}
                            placeholder="e.g., 12"
                            className="form-input picture-wood-input"
                          />
                        </div>
                        <button
                          className="btn-deselect"
                          onClick={() => togglePictureSelection(picture.id)}
                        >
                          Deselect
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            );
          })()}
        </div>

        {/* Save Button */}
        <div className="save-actions">
          <button onClick={handleSaveAll} className="btn-save-all">
            Save All Classifications
          </button>
        </div>

        {/* Image Modal */}
        <Modal.ImageViewer
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          images={pictureSet?.pictures?.map(p => ({
            id: p.id,
            src: getImageUrl(p.filePath),
            alt: `Picture ${p.displayOrder}`,
            displayOrder: p.displayOrder,
          })) || []}
          currentIndex={selectedImage ? pictureSet?.pictures?.findIndex(p => p.id === selectedImage.id) || 0 : 0}
          onNavigate={(index) => setSelectedImage(pictureSet?.pictures?.[index])}
          renderInfo={(img, index) => (
            <span>#{img.displayOrder} of {pictureSet?.pictures?.length}</span>
          )}
        />

        {/* Group Viewer Modal */}
        <Modal.ImageViewer
          isOpen={!!viewingGroup}
          onClose={() => setViewingGroup(null)}
          images={viewingGroup?.pictures?.map(p => ({
            id: p.id,
            src: getImageUrl(p.filePath),
            alt: `#${p.displayOrder}`,
            displayOrder: p.displayOrder,
          })) || []}
          currentIndex={viewingGroupIndex}
          onNavigate={(index) => setViewingGroupIndex(index)}
          renderInfo={(img, index) => (
            <div className="group-viewer-info">
              <span>{viewingGroup?.name || 'Group'} - #{index + 1} of {viewingGroup?.pictures?.length}</span>
              <button
                className="btn-remove-from-group"
                onClick={() => handleRemoveFromGroup(viewingGroup.id, img.id)}
              >
                Remove from Group
              </button>
            </div>
          )}
        />

        {/* Image Editor Modal */}
        <Modal
          isOpen={!!editingPicture}
          onClose={() => setEditingPicture(null)}
          title={`Edit Image #${editingPicture?.displayOrder || ''}`}
          size="fullscreen"
          closeOnOverlay={false}
        >
          {editingPicture && (
            <ImageEditor
              imageUrl={getImageUrl(editingPicture.filePath)}
              pictureId={editingPicture.id}
              onCancel={() => setEditingPicture(null)}
              onSave={async (blob, pictureId) => {
                try {
                  const result = await pictureService.editImage(pictureId, blob);
                  setSuccess('Image updated successfully!');
                  setEditingPicture(null);
                  // Update just the picture's filePath in state — preserves form dropdowns
                  setPictureSet(prev => ({
                    ...prev,
                    pictures: prev.pictures.map(pic =>
                      pic.id === pictureId ? { ...pic, filePath: result.picture.filePath } : pic
                    ),
                  }));
                } catch (err) {
                  console.error('Failed to save edited image:', err);
                  setError('Failed to save edited image: ' + err.message);
                }
              }}
            />
          )}
        </Modal>

        <ConfirmModal
          isOpen={!!confirmAction}
          onCancel={() => setConfirmAction(null)}
          {...confirmAction}
        />
      </div>
    </div>
  );
};

export default ImageClassifier;
