import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { API_URL, getImageUrl } from '../config/api';
import ImagePreviewer from '../components/ImagePreviewer';
import SEO from '../components/SEO';
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
      const url = `${API_URL}/api/categories/${categoryId}/pictures${queryString ? `?${queryString}` : ''}`;

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

  // Generate descriptive alt text for images
  const getImageAlt = (picture, index) => {
    const parts = [];

    if (category?.name) parts.push(category.name);
    if (picture.troupe?.group?.district?.name) parts.push(picture.troupe.group.district.name);
    if (picture.troupe?.group?.name) parts.push(picture.troupe.group.name);
    if (picture.troupe?.name) parts.push(picture.troupe.name);
    if (picture.pictureSet?.location) parts.push(picture.pictureSet.location);

    if (parts.length === 0) {
      return `Installation scout - Photo ${index + 1} - Scouts du Liban`;
    }

    return `${parts.join(' - ')} - Scouts du Liban`;
  };

  // First picture for OG image
  const firstPicture = pictures[0];
  const ogImage = firstPicture ? getImageUrl(firstPicture.filePath) : null;

  // SEO description
  const seoDescription = category
    ? `${pictures.length} photos d'installations ${category.name} des Scouts du Liban. Découvrez les constructions et aménagements de camp scout.`
    : 'Photos d\'installations scoutes des Scouts du Liban';

  return (
    <div className="category-view">
      <SEO
        title={category?.name ? `${category.name} - Installations Scoutes` : 'Catégorie'}
        description={seoDescription}
        image={ogImage}
        url={`/category/${categoryId}`}
        keywords={[category?.name, 'installations scoutes', 'photos camp', 'constructions scoutes'].filter(Boolean)}
      />
      <div className="container">
        {/* Header */}
        <header className="category-header">
          <nav aria-label="Breadcrumb">
            <Link to="/browse" className="btn-back">
              ← Retour aux Catégories
            </Link>
          </nav>
          <h1>{category?.name}</h1>
          {category?.description && <p className="category-description">{category.description}</p>}
          <p className="pictures-count">
            {pictures.length} {pictures.length === 1 ? 'photo' : 'photos'}
          </p>
        </header>

        {/* Pictures Grid */}
        {pictures.length === 0 ? (
          <div className="empty-state">
            <p>Aucune photo trouvée dans cette catégorie.</p>
            <Link to="/browse" className="btn-primary">
              Parcourir d'autres Catégories
            </Link>
          </div>
        ) : (
          <section className="pictures-grid" aria-label={`Photos de ${category?.name}`}>
            {pictures.map((picture, index) => (
              <article
                key={picture.id}
                className="picture-thumbnail"
                onClick={() => handlePictureClick(index)}
                role="button"
                tabIndex={0}
                aria-label={`Voir ${getImageAlt(picture, index)}`}
                onKeyDown={(e) => e.key === 'Enter' && handlePictureClick(index)}
              >
                <figure className="thumbnail-image">
                  <img
                    src={getImageUrl(picture.filePath)}
                    alt={getImageAlt(picture, index)}
                    loading="lazy"
                  />
                  <figcaption className="thumbnail-overlay">
                    <div className="thumbnail-info">
                      {picture.troupe && (
                        <>
                          {picture.troupe.group?.name && (
                            <span className="thumbnail-group">{picture.troupe.group.name}</span>
                          )}
                          <span className="thumbnail-troupe">{picture.troupe.name}</span>
                        </>
                      )}
                      {picture.pictureSet?.location && (
                        <span className="thumbnail-location">{picture.pictureSet.location}</span>
                      )}
                    </div>
                  </figcaption>
                </figure>
              </article>
            ))}
          </section>
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
