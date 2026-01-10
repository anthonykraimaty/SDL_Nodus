import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_URL, getImageUrl } from '../config/api';
import ImagePreviewer from '../components/ImagePreviewer';
import SEO from '../components/SEO';
import './CategoryView.css';

const CategoryView = () => {
  const { categoryId } = useParams();
  const [category, setCategory] = useState(null);
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPictureIndex, setSelectedPictureIndex] = useState(null);

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [woodCountMin, setWoodCountMin] = useState('');
  const [woodCountMax, setWoodCountMax] = useState('');

  useEffect(() => {
    loadCategoryPictures();
  }, [categoryId]);

  const loadCategoryPictures = async (filters = {}) => {
    try {
      setLoading(true);

      // Build query params from filter state
      const params = new URLSearchParams();

      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.woodCountMin) params.append('woodCountMin', filters.woodCountMin);
      if (filters.woodCountMax) params.append('woodCountMax', filters.woodCountMax);

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

  const handleApplyFilters = () => {
    loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax });
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setWoodCountMin('');
    setWoodCountMax('');
    loadCategoryPictures({});
  };

  const hasActiveFilters = dateFrom || dateTo || woodCountMin || woodCountMax;

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
            ← Retour à Explorer
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

        {/* Filters Section */}
        <div className="filters-section">
          <button
            className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <span className="filter-icon">⚙</span>
            Filtres
            {hasActiveFilters && <span className="filter-badge">●</span>}
          </button>

          {showFilters && (
            <div className="filters-panel">
              <div className="filter-group">
                <label>Période</label>
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="Du"
                  />
                  <span className="date-separator">au</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="Au"
                  />
                </div>
              </div>

              <div className="filter-group">
                <label>Nombre de bois</label>
                <div className="wood-count-inputs">
                  <input
                    type="number"
                    min="0"
                    value={woodCountMin}
                    onChange={(e) => setWoodCountMin(e.target.value)}
                    placeholder="Min"
                  />
                  <span className="wood-separator">-</span>
                  <input
                    type="number"
                    min="0"
                    value={woodCountMax}
                    onChange={(e) => setWoodCountMax(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="filter-actions">
                <button className="btn-apply-filters" onClick={handleApplyFilters}>
                  Appliquer
                </button>
                {hasActiveFilters && (
                  <button className="btn-clear-filters" onClick={handleClearFilters}>
                    Effacer
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

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
