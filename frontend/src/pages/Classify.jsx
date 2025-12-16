import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService } from '../services/api';
import { getImageUrl } from '../config/api';
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load all pending and classified picture sets
      const [pictureSetsData, categoriesData] = await Promise.all([
        pictureService.getAll({ status: 'PENDING' }),
        categoryService.getAll({}),
      ]);

      setPictureSets(pictureSetsData.pictures || []);
      setCategories(categoriesData);

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
                    <button
                      onClick={() => navigate(`/classify/${set.id}`)}
                      className="btn-view"
                    >
                      View & Classify
                    </button>
                  </div>
                </div>

                <div className="pictures-grid">
                  {set.pictures?.map(picture => (
                    <div key={picture.id} className="picture-card">
                      <div className="picture-preview">
                        <img
                          src={getImageUrl(picture.filePath)}
                          alt={`Picture ${picture.displayOrder}`}
                          onClick={() => setSelectedPicture(picture)}
                        />
                        <div className="picture-overlay">
                          <span>Picture #{picture.displayOrder}</span>
                        </div>
                      </div>

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
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image Preview Modal */}
        {selectedPicture && (
          <div className="modal-overlay" onClick={() => setSelectedPicture(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedPicture(null)}>
                ×
              </button>
              <img
                src={getImageUrl(selectedPicture.filePath)}
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

export default Classify;
