import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService, designGroupService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import DesignGroupPicker from '../components/DesignGroupPicker';
import './Classify.css';

const Classify = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load all pending installation photos (not schematics - those use separate workflow)
      const [pictureSetsData, categoriesData] = await Promise.all([
        pictureService.getAll({ status: 'PENDING', type: 'INSTALLATION_PHOTO' }),
        categoryService.getAll({}),
      ]);

      setPictureSets(pictureSetsData.pictures || []);
      // Filter out categories where uploads are disabled
      setCategories(categoriesData.filter(cat => !cat.isUploadDisabled));

      // Initialize classification data for each picture
      const initialData = {};
      pictureSetsData.pictures?.forEach(set => {
        set.pictures?.forEach(pic => {
          initialData[pic.id] = {
            categoryId: set.categoryId || '',
            takenAt: set.uploadedAt ? new Date(set.uploadedAt).toISOString().split('T')[0] : '',
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

  const handleClassifyPicture = async (pictureSet, picture) => {
    try {
      const data = classificationData[picture.id];

      if (!data.categoryId) {
        alert('Please select a category');
        return;
      }

      await pictureService.classify(pictureSet.id, {
        categoryId: data.categoryId,
        takenAt: data.takenAt || null,
      });

      // Reload data after classification
      await loadData();
      alert('Picture classified successfully!');
    } catch (err) {
      console.error('Classification error:', err);
      alert('Failed to classify picture');
    }
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
      alert('Please select at least one picture');
      return;
    }

    if (!bulkClassification.categoryId) {
      alert('Please select a category for bulk classification');
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
      selectionsBySet[setId].push(key);
      allPictureIds.push(parseInt(pictureId));
    });

    // Classify each set
    for (const setId of Object.keys(selectionsBySet)) {
      try {
        await pictureService.classify(parseInt(setId), {
          categoryId: bulkClassification.categoryId,
          takenAt: takenAt,
        });
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
      alert(`Classification complete: ${successCount} sets classified, ${failCount} failed`);
    } else {
      alert(`Successfully classified ${successCount} picture set(s)!`);
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

  if (!user || (user.role !== 'CHEF_TROUPE' && user.role !== 'BRANCHE_ECLAIREURS')) {
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

                {/* Design Group Picker - only show when 2+ pictures selected and category chosen */}
                {selectedPictures.size >= 2 && bulkClassification.categoryId && (
                  <div className="bulk-form-group bulk-form-group-wide">
                    <DesignGroupPicker
                      categoryId={parseInt(bulkClassification.categoryId)}
                      selectedGroupId={bulkClassification.designGroupId}
                      onSelectGroup={(groupId) => setBulkClassification(prev => ({
                        ...prev,
                        designGroupId: groupId,
                        createNewGroup: false,
                        newGroupName: '',
                      }))}
                      onCreateGroup={(groupName) => setBulkClassification(prev => ({
                        ...prev,
                        designGroupId: null,
                        createNewGroup: true,
                        newGroupName: groupName,
                      }))}
                      disabled={bulkClassifying}
                    />
                  </div>
                )}
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
                  {set.pictures?.map(picture => {
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
                            <button
                              className="btn-deselect"
                              onClick={() => togglePictureSelection(picture.id, set.id)}
                            >
                              Deselect
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image Preview Modal */}
        <Modal
          isOpen={!!selectedPicture}
          onClose={() => setSelectedPicture(null)}
          variant="image"
          size="fullscreen"
        >
          {selectedPicture && (
            <img
              src={getImageUrl(selectedPicture.filePath)}
              alt="Full size preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          )}
        </Modal>
      </div>
    </div>
  );
};

export default Classify;
