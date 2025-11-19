import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import ImagePreviewer from '../components/ImagePreviewer';
import './CategoryView.css';

const CategoryView = () => {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState(null);
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPictureIndex, setSelectedPictureIndex] = useState(null);

  useEffect(() => {
    loadCategoryPictures();
  }, [categoryId, searchParams]);

  const loadCategoryPictures = async () => {
    try {
      setLoading(true);

      // Build query params from URL search params (filters from Browse page)
      const params = new URLSearchParams();
      const districtId = searchParams.get('districtId');
      const groupId = searchParams.get('groupId');
      const dateFrom = searchParams.get('dateFrom');
      const dateTo = searchParams.get('dateTo');

      if (districtId) params.append('districtId', districtId);
      if (groupId) params.append('groupId', groupId);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      const queryString = params.toString();
      const url = `http://localhost:3001/api/categories/${categoryId}/pictures${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to load category pictures');
      }

      const data = await response.json();
      setCategory(data.category);
      setPictures(data.pictures);
    } catch (err) {
      console.error('Error loading category pictures:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePictureClick = (index) => {
    setSelectedPictureIndex(index);
  };

  const handleClosePreviewer = () => {
    setSelectedPictureIndex(null);
  };

  if (loading) {
    return (
      <div className="category-view">
        <div className="container loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="category-view">
        <div className="container">
          <div className="error-message">{error}</div>
          <Link to="/browse" className="btn-back">
            ← Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="category-view">
      <div className="container">
        {/* Header */}
        <div className="category-header">
          <Link to="/browse" className="btn-back">
            ← Back to Categories
          </Link>
          <h1>{category?.name}</h1>
          {category?.description && <p className="category-description">{category.description}</p>}
          <p className="pictures-count">
            {pictures.length} {pictures.length === 1 ? 'picture' : 'pictures'}
          </p>
        </div>

        {/* Pictures Grid */}
        {pictures.length === 0 ? (
          <div className="empty-state">
            <p>No pictures found in this category yet.</p>
            <Link to="/browse" className="btn-primary">
              Browse Other Categories
            </Link>
          </div>
        ) : (
          <div className="pictures-grid">
            {pictures.map((picture, index) => (
              <div
                key={picture.id}
                className="picture-thumbnail"
                onClick={() => handlePictureClick(index)}
              >
                <div className="thumbnail-image">
                  <img
                    src={`http://localhost:3001/${picture.filePath}`}
                    alt={picture.caption || `Picture ${index + 1}`}
                    loading="lazy"
                  />
                </div>
                <div className="thumbnail-overlay">
                  <div className="thumbnail-info">
                    {picture.troupe && (
                      <div className="thumbnail-troupe">
                        {picture.troupe.name}
                      </div>
                    )}
                    {picture.pictureSet?.location && (
                      <div className="thumbnail-location">
                        📍 {picture.pictureSet.location}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Previewer Modal */}
      {selectedPictureIndex !== null && (
        <ImagePreviewer
          pictures={pictures}
          initialIndex={selectedPictureIndex}
          onClose={handleClosePreviewer}
        />
      )}
    </div>
  );
};

export default CategoryView;
