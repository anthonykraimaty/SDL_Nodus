import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService } from '../services/api';
import { getImageUrl } from '../config/api';
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
  const [woodCount, setWoodCount] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);

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
      setCategories(categoriesData);

      // Initialize wood count from picture set
      if (pictureSetData.woodCount) {
        setWoodCount(pictureSetData.woodCount.toString());
      }

      // Initialize classification data for each picture
      const initialData = {};
      pictureSetData.pictures?.forEach(pic => {
        initialData[pic.id] = {
          categoryId: pic.categoryId || '',
          takenAt: pic.takenAt ? new Date(pic.takenAt).toISOString().split('T')[0] : '',
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
      };
    });

    setClassificationData(prev => ({
      ...prev,
      ...updates,
    }));

    setBulkCategory('');
    setBulkMonth('');
    setBulkYear('');
    setSuccess('Bulk classification applied! Click "Save All Classifications" to save.');
  };

  // Count classified pictures
  const getClassifiedCount = () => {
    return pictureSet?.pictures?.filter(pic => classificationData[pic.id]?.categoryId).length || 0;
  };

  const getUnclassifiedCount = () => {
    return (pictureSet?.pictures?.length || 0) - getClassifiedCount();
  };

  const handleSaveAll = async () => {
    try {
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
        const proceed = window.confirm(
          `${unclassifiedCount} picture(s) are not classified and will be excluded from approval.\n\nDo you want to continue?`
        );
        if (!proceed) return;
      }

      // Classify each picture individually
      const classifications = picturesToClassify.map(pic => ({
        pictureId: pic.id,
        categoryId: classificationData[pic.id].categoryId,
        takenAt: classificationData[pic.id].takenAt || null,
      }));

      await pictureService.classifyBulk(id, {
        classifications,
        woodCount: woodCount ? parseInt(woodCount) : null,
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

        {/* Bulk Actions */}
        <div className="bulk-actions-card">
          <h2>Bulk Classification</h2>
          <p>Select multiple pictures and apply the same category and date to all of them at once</p>

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
                disabled={selectedPictures.size === 0}
              >
                Apply to Selected ({selectedPictures.size})
              </button>
            </div>
          </div>
        </div>

        {/* Wood Count Section */}
        <div className="wood-count-card">
          <div className="wood-count-header">
            <h3>Installation Details</h3>
            <p>This information applies to the entire picture set</p>
          </div>
          <div className="wood-count-input-group">
            <label htmlFor="woodCount">Number of Wood Pieces Used</label>
            <input
              type="number"
              id="woodCount"
              min="0"
              value={woodCount}
              onChange={(e) => setWoodCount(e.target.value)}
              placeholder="e.g., 12"
              className="form-input wood-count-input"
            />
          </div>
        </div>

        {/* Pictures Grid */}
        <div className="pictures-grid">
          {pictureSet.pictures?.map(picture => (
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
                {classificationData[picture.id]?.categoryId ? (
                  <div className="picture-classified-badge">✓</div>
                ) : (
                  <div className="picture-unclassified-badge">!</div>
                )}
              </div>

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
              </div>
            </div>
          ))}
        </div>

        {/* Save Button */}
        <div className="save-actions">
          <button onClick={handleSaveAll} className="btn-save-all">
            Save All Classifications
          </button>
        </div>

        {/* Image Modal */}
        {selectedImage && (
          <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedImage(null)}>
                ×
              </button>
              <img
                src={getImageUrl(selectedImage.filePath)}
                alt="Full size preview"
                className="modal-image"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageClassifier;
