import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService, designGroupService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { ToastContainer, useToast } from '../components/Toast';
import DesignGroupPicker from '../components/DesignGroupPicker';
import ZoomableImage from '../components/ZoomableImage';
import './Classify.css';

const Classify = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user can create/manage design groups
  const canManageGroups = user && (user.role === 'ADMIN' || user.role === 'BRANCHE_ECLAIREURS' || user.role === 'CHEF_TROUPE');

  const [pictureSets, setPictureSets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPicture, setSelectedPicture] = useState(null);
  const [classificationData, setClassificationData] = useState({});

  // Bulk selection state
  const [selectedPictures, setSelectedPictures] = useState(new Set());
  const [bulkClassification, setBulkClassification] = useState({
    categoryId: '',
    takenAtMonth: '',
    takenAtYear: '',
    designGroupId: null,
    createNewGroup: false,
    newGroupName: '',
  });
  const [bulkClassifying, setBulkClassifying] = useState(false);
  const [viewingGroup, setViewingGroup] = useState(null);
  const [viewingGroupIndex, setViewingGroupIndex] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load sets with unclassified pictures (PENDING or CLASSIFIED status)
      const [pictureSetsData, categoriesData] = await Promise.all([
        pictureService.getAll({ status: 'PENDING,CLASSIFIED', type: 'INSTALLATION_PHOTO', classificationFilter: 'unclassified' }),
        categoryService.getAll({}),
      ]);

      // Filter each set's pictures to show only unclassified ones
      const setsWithUnclassified = (pictureSetsData.pictures || []).map(set => ({
        ...set,
        pictures: set.pictures?.filter(pic => !pic.categoryId) || [],
      })).filter(set => set.pictures.length > 0);

      setPictureSets(setsWithUnclassified);
      // Filter out categories where uploads are disabled
      setCategories(categoriesData.filter(cat => !cat.isUploadDisabled).sort((a, b) => a.name.localeCompare(b.name)));

      // Initialize classification data for each picture
      const initialData = {};
      setsWithUnclassified.forEach(set => {
        set.pictures?.forEach(pic => {
          initialData[pic.id] = {
            categoryId: '',
            takenAt: '',
          };
        });
      });
      setClassificationData(initialData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load pictures');
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

  // Organize pictures in a set into design groups and ungrouped
  const getGroupedPictures = (pictures) => {
    if (!pictures) return { groups: [], ungrouped: [] };
    const groupMap = new Map();
    const ungrouped = [];
    pictures.forEach(pic => {
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

  const handleClassifyPicture = async (pictureSet, picture) => {
    try {
      const data = classificationData[picture.id];

      if (!data.categoryId) {
        addToast('Please select a category', 'warning');
        return;
      }

      // Use classify-bulk for per-picture classification
      await pictureService.classifyBulk(pictureSet.id, {
        classifications: [{
          pictureId: picture.id,
          categoryId: data.categoryId,
          takenAt: data.takenAt || null,
        }],
      });

      // Reload data after classification
      await loadData();
      addToast('Picture classified successfully!');
    } catch (err) {
      console.error('Classification error:', err);
      addToast('Failed to classify picture', 'error');
    }
  };

  const handleRemoveFromGroup = async (groupId, pictureId) => {
    try {
      const result = await designGroupService.removePicture(groupId, pictureId);
      if (result.groupDeleted || viewingGroup?.pictures?.length <= 2) {
        setViewingGroup(null);
      } else {
        setViewingGroupIndex(prev => prev >= viewingGroup.pictures.length - 1 ? Math.max(0, prev - 1) : prev);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to remove from group:', err);
    }
  };

  const handleArchivePicture = (setId, pictureId) => {
    setConfirmAction({
      title: 'Archive picture?',
      message: 'Archive this picture? You can restore it later from the archive.',
      confirmText: 'Archive',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await pictureService.archivePicture(setId, pictureId);
          await loadData();
        } catch (err) {
          console.error('Archive error:', err);
          setError(err.message || 'Failed to archive picture');
        }
      },
    });
  };

  const handleBulkArchive = () => {
    setConfirmAction({
      title: 'Archive pictures?',
      message: `Archive ${selectedPictures.size} picture(s)?`,
      confirmText: 'Archive All',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          for (const key of selectedPictures) {
            const [setId, pictureId] = key.split(':');
            await pictureService.archivePicture(parseInt(setId), parseInt(pictureId));
          }
          setSelectedPictures(new Set());
          await loadData();
        } catch (err) {
          console.error('Bulk archive error:', err);
          setError(err.message || 'Failed to archive pictures');
        }
      },
    });
  };

  // Toggle picture selection for bulk classification
  const togglePictureSelection = (pictureId, setId) => {
    setSelectedPictures(prev => {
      const newSet = new Set(prev);
      const key = `${setId}:${pictureId}`;
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Check if a picture is selected
  const isPictureSelected = (pictureId, setId) => {
    return selectedPictures.has(`${setId}:${pictureId}`);
  };

  // Select all pictures in a set
  const selectAllInSet = (set) => {
    setSelectedPictures(prev => {
      const newSet = new Set(prev);
      set.pictures?.forEach(pic => {
        newSet.add(`${set.id}:${pic.id}`);
      });
      return newSet;
    });
  };

  // Deselect all pictures in a set
  const deselectAllInSet = (set) => {
    setSelectedPictures(prev => {
      const newSet = new Set(prev);
      set.pictures?.forEach(pic => {
        newSet.delete(`${set.id}:${pic.id}`);
      });
      return newSet;
    });
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedPictures(new Set());
    setBulkClassification({ categoryId: '', takenAtMonth: '', takenAtYear: '', designGroupId: null, createNewGroup: false, newGroupName: '' });
  };

  // Handle bulk classification
  const handleBulkClassify = async () => {
    if (selectedPictures.size === 0) {
      addToast('Please select at least one picture', 'warning');
      return;
    }

    if (!bulkClassification.categoryId) {
      addToast('Please select a category for bulk classification', 'warning');
      return;
    }

    setBulkClassifying(true);
    let successCount = 0;
    let failCount = 0;

    // Build takenAt date if month and year are provided
    let takenAt = null;
    if (bulkClassification.takenAtMonth && bulkClassification.takenAtYear) {
      takenAt = `${bulkClassification.takenAtYear}-${String(bulkClassification.takenAtMonth).padStart(2, '0')}-01`;
    }

    // Group selections by set ID
    const selectionsBySet = {};
    const allPictureIds = [];
    selectedPictures.forEach(key => {
      const [setId, pictureId] = key.split(':');
      if (!selectionsBySet[setId]) {
        selectionsBySet[setId] = [];
      }
      selectionsBySet[setId].push(parseInt(pictureId));
      allPictureIds.push(parseInt(pictureId));
    });

    // Classify each set using per-picture classification
    for (const setId of Object.keys(selectionsBySet)) {
      try {
        const classifications = selectionsBySet[setId].map(pictureId => ({
          pictureId,
          categoryId: bulkClassification.categoryId,
          takenAt: takenAt,
        }));
        await pictureService.classifyBulk(parseInt(setId), { classifications });
        successCount++;
      } catch (err) {
        console.error(`Failed to classify set ${setId}:`, err);
        failCount++;
      }
    }

    // Handle design group creation/assignment after classification
    if (allPictureIds.length >= 2) {
      try {
        if (bulkClassification.createNewGroup && bulkClassification.newGroupName) {
          // Create a new design group with these pictures
          await designGroupService.create({
            name: bulkClassification.newGroupName,
            pictureIds: allPictureIds,
          });
        } else if (bulkClassification.designGroupId) {
          // Add pictures to existing design group
          await designGroupService.addPictures(bulkClassification.designGroupId, allPictureIds);
        }
      } catch (err) {
        console.error('Failed to create/assign design group:', err);
        // Don't fail the whole operation if group creation fails
      }
    }

    setBulkClassifying(false);

    if (failCount > 0) {
      addToast(`Classification complete: ${successCount} sets classified, ${failCount} failed`, 'warning');
    } else {
      addToast(`Successfully classified ${successCount} picture set(s)!`);
    }

    // Clear selections and reload
    clearAllSelections();
    await loadData();
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user || (user.role !== 'CHEF_TROUPE' && user.role !== 'BRANCHE_ECLAIREURS' && user.role !== 'ADMIN')) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>Only Chef Troupe and Branche members can classify pictures</p>
        </div>
      </div>
    );
  }

  return (
    <div className="classify-page">
      <div className="container">
        <div className="classify-header">
          <h1>Classify Pictures</h1>
          <p>Add categories and dates to your uploaded pictures</p>
          <Link to="/archive" className="btn-archive-link">View Archive</Link>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Classification Instructions / Bulk Classification Panel */}
        <div className={`classification-panel ${selectedPictures.size > 0 ? 'bulk-mode' : ''}`}>
          {selectedPictures.size === 0 ? (
            // Instructions when no pictures selected
            <div className="classification-instructions">
              <div className="instruction-icon">📋</div>
              <div className="instruction-content">
                <h3>How to Classify Pictures</h3>
                <div className="instruction-methods">
                  <div className="method">
                    <span className="method-icon">1️⃣</span>
                    <div>
                      <strong>Individual Classification</strong>
                      <p>Use the category and date selectors below each picture to classify them one by one.</p>
                    </div>
                  </div>
                  <div className="method">
                    <span className="method-icon">2️⃣</span>
                    <div>
                      <strong>Bulk Classification</strong>
                      <p>Click on pictures to select them (blue border appears), then use the bulk classification panel that appears here to classify multiple pictures at once with the same category and date.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Bulk classification panel when pictures are selected
            <div className="bulk-classification">
              <div className="bulk-header">
                <div className="bulk-info">
                  <span className="bulk-icon">✅</span>
                  <span className="bulk-count">{selectedPictures.size} picture(s) selected</span>
                </div>
                <button onClick={clearAllSelections} className="btn-clear-selection">
                  Clear Selection
                </button>
              </div>
              {/* Design Group Picker - on its own row above controls */}
              {canManageGroups && selectedPictures.size >= 2 && (
                <div className="bulk-group-row">
                  <DesignGroupPicker
                    categoryId={bulkClassification.categoryId ? parseInt(bulkClassification.categoryId) : null}
                    selectedGroupId={null}
                    onSelectGroup={() => {}}
                    onCreateGroup={(groupName) => setBulkClassification(prev => ({
                      ...prev,
                      designGroupId: null,
                      createNewGroup: true,
                      newGroupName: groupName,
                    }))}
                    disabled={bulkClassifying}
                    createOnly={true}
                  />
                </div>
              )}
              <div className="bulk-controls">
                <div className="bulk-form-group">
                  <label>Category *</label>
                  <select
                    value={bulkClassification.categoryId}
                    onChange={(e) => setBulkClassification(prev => ({ ...prev, categoryId: e.target.value }))}
                    className="form-select"
                  >
                    <option value="">Select Category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bulk-form-group">
                  <label>Date Taken (Optional)</label>
                  <div className="bulk-date-picker">
                    <select
                      value={bulkClassification.takenAtMonth}
                      onChange={(e) => setBulkClassification(prev => ({ ...prev, takenAtMonth: e.target.value }))}
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
                    <select
                      value={bulkClassification.takenAtYear}
                      onChange={(e) => setBulkClassification(prev => ({ ...prev, takenAtYear: e.target.value }))}
                      className="form-select"
                    >
                      <option value="">Year</option>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleBulkClassify}
                  className="btn-bulk-classify"
                  disabled={!bulkClassification.categoryId || bulkClassifying}
                >
                  {bulkClassifying ? 'Classifying...' : `Classify ${selectedPictures.size} Picture(s)`}
                </button>
              </div>
            </div>
          )}
        </div>

        {pictureSets.length === 0 ? (
          <div className="empty-state">
            <h2>📸 No Pending Pictures</h2>
            <p>All your pictures have been classified!</p>
            <button onClick={() => navigate('/upload')} className="btn-primary">
              Upload More Pictures
            </button>
          </div>
        ) : (
          <div className="picture-sets">
            {pictureSets.map(set => (
              <div key={set.id} className="picture-set-card">
                <div className="set-header">
                  <div>
                    <h2>{set.title}</h2>
                    {set.description && (
                      <p className="set-description">{set.description}</p>
                    )}
                  </div>
                  <div className="set-header-actions">
                    <span className="set-badge">{set.pictures?.length || 0} pictures</span>
                    <div className="set-selection-actions">
                      <button
                        onClick={() => selectAllInSet(set)}
                        className="btn-select-all"
                        title="Select all pictures in this set"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => deselectAllInSet(set)}
                        className="btn-deselect-all"
                        title="Deselect all pictures in this set"
                      >
                        Deselect All
                      </button>
                    </div>
                    <button
                      onClick={() => navigate(`/classify/${set.id}`)}
                      className="btn-view"
                    >
                      View & Classify
                    </button>
                  </div>
                </div>

                <div className="pictures-grid">
                  {(() => {
                    const { groups, ungrouped } = getGroupedPictures(set.pictures);
                    return (
                      <>
                        {/* Grouped pictures (stacked) */}
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
                                      <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  onClick={() => handleClassifyPicture(set, group.pictures[0])}
                                  className="btn-classify"
                                  disabled={!groupCategoryId}
                                >
                                  Classify Group
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Ungrouped pictures (normal cards) */}
                        {ungrouped.map(picture => {
                          const isSelected = isPictureSelected(picture.id, set.id);
                          return (
                            <div
                              key={picture.id}
                              className={`picture-card ${isSelected ? 'selected' : ''}`}
                            >
                              <div className="picture-preview">
                                <img
                                  src={getImageUrl(picture.filePath)}
                                  alt={`Picture ${picture.displayOrder}`}
                                  onClick={() => setSelectedPicture(picture)}
                                />
                                <div className="picture-overlay">
                                  <span>Picture #{picture.displayOrder}</span>
                                </div>
                                {/* Selection checkbox */}
                                <div
                                  className={`picture-select-checkbox ${isSelected ? 'checked' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePictureSelection(picture.id, set.id);
                                  }}
                                >
                                  {isSelected ? '✓' : ''}
                                </div>
                                {/* Archive icon */}
                                <button
                                  className="picture-archive-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchivePicture(set.id, picture.id);
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
                              </div>

                              {/* Show individual controls only when NOT selected */}
                              {!isSelected ? (
                                <div className="picture-controls">
                                  <div className="form-group">
                                    <label htmlFor={`category-${picture.id}`}>Category</label>
                                    <select
                                      id={`category-${picture.id}`}
                                      value={classificationData[picture.id]?.categoryId || ''}
                                      onChange={(e) => handleClassificationChange(picture.id, 'categoryId', e.target.value)}
                                      className="form-select"
                                    >
                                      <option value="">Select Category</option>
                                      {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>
                                          {cat.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="form-group">
                                    <label htmlFor={`date-${picture.id}`}>Date Taken (Optional)</label>
                                    <div className="date-picker-container">
                                      <select
                                        id={`month-${picture.id}`}
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
                                      <select
                                        id={`year-${picture.id}`}
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

                                  <button
                                    onClick={() => handleClassifyPicture(set, picture)}
                                    className="btn-classify"
                                    disabled={!classificationData[picture.id]?.categoryId}
                                  >
                                    Classify
                                  </button>
                                </div>
                              ) : (
                                <div className="picture-selected-indicator">
                                  <span className="selected-badge">Selected for bulk classification</span>
                                  <div className="selected-actions-row">
                                    <button
                                      className="btn-deselect"
                                      onClick={() => togglePictureSelection(picture.id, set.id)}
                                    >
                                      Deselect
                                    </button>
                                    <button
                                      className="btn-archive-selected"
                                      onClick={() => handleArchivePicture(set.id, picture.id)}
                                      title="Archive this picture"
                                    >
                                      🗑
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}

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

        {/* Image Preview Modal */}
        <Modal
          isOpen={!!selectedPicture}
          onClose={() => setSelectedPicture(null)}
          variant="image"
          size="fullscreen"
        >
          {selectedPicture && (
            <ZoomableImage
              src={getImageUrl(selectedPicture.filePath)}
              alt="Full size preview"
              style={{ width: '100%', maxHeight: '85vh', borderRadius: '8px' }}
            />
          )}
        </Modal>

        <ConfirmModal
          isOpen={!!confirmAction}
          onCancel={() => setConfirmAction(null)}
          {...confirmAction}
        />

        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </div>
    </div>
  );
};

export default Classify;
