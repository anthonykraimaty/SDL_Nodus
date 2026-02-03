import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { API_URL, getImageUrl } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService } from '../services/api';
import ImagePreviewer from '../components/ImagePreviewer';
import ImageEditor from '../components/ImageEditor';
import DesignGroupStack from '../components/DesignGroupStack';
import DesignGroupModal from '../components/DesignGroupModal';
import Modal from '../components/Modal';
import SEO from '../components/SEO';
import './CategoryView.css';

const CategoryView = () => {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || '';
  const { user } = useAuth();

  const [category, setCategory] = useState(null);
  const [pictures, setPictures] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPictureIndex, setSelectedPictureIndex] = useState(null);

  // Grouped view state
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'flat'
  const [designGroups, setDesignGroups] = useState([]);
  const [ungroupedPictures, setUngroupedPictures] = useState([]);
  const [selectedDesignGroup, setSelectedDesignGroup] = useState(null);

  // Type filter state
  const [typeFilter, setTypeFilter] = useState(initialType);

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [woodCountMin, setWoodCountMin] = useState('');
  const [woodCountMax, setWoodCountMax] = useState('');
  const [dateDoneMonth, setDateDoneMonth] = useState('');
  const [dateDoneYear, setDateDoneYear] = useState('');

  // Sort states
  const [sortBy, setSortBy] = useState('uploadDate'); // 'uploadDate', 'woodCount', 'dateDone'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'

  // Thumbnail size state (0-100, default 50)
  const [thumbnailSize, setThumbnailSize] = useState(50);

  // Image editing
  const [editingPicture, setEditingPicture] = useState(null);

  // Check if user can approve/reject
  const canReview = user && (user.role === 'BRANCHE_ECLAIREURS' || user.role === 'ADMIN');

  // Load all categories for the edit dropdown (only for authorized users)
  useEffect(() => {
    if (canReview) {
      categoryService.getAll().then(setAllCategories).catch(console.error);
    }
  }, [canReview]);

  useEffect(() => {
    loadCategoryPictures();
  }, [categoryId, typeFilter, sortBy, sortOrder, viewMode]);

  const loadCategoryPictures = async (filters = {}) => {
    try {
      setLoading(true);

      // Build query params from filter state
      const params = new URLSearchParams();

      if (typeFilter) params.append('type', typeFilter);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.woodCountMin) params.append('woodCountMin', filters.woodCountMin);
      if (filters.woodCountMax) params.append('woodCountMax', filters.woodCountMax);
      if (filters.dateDoneMonth) params.append('dateDoneMonth', filters.dateDoneMonth);
      if (filters.dateDoneYear) params.append('dateDoneYear', filters.dateDoneYear);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);

      // Add grouped parameter based on view mode
      if (viewMode === 'grouped') {
        params.append('grouped', 'true');
      }

      const queryString = params.toString();
      const url = `${API_URL}/api/categories/${categoryId}/pictures${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to load category pictures');
      }

      const data = await response.json();
      setCategory(data.category);

      // Handle grouped vs flat response
      if (data.grouped) {
        setDesignGroups(data.designGroups || []);
        setUngroupedPictures(data.ungroupedPictures || []);
        // Combine all pictures for total count and previewer
        const allPics = [
          ...(data.designGroups || []).flatMap(g => g.pictures || []),
          ...(data.ungroupedPictures || []),
        ];
        setPictures(allPics);
      } else {
        setPictures(data.pictures || []);
        setDesignGroups([]);
        setUngroupedPictures([]);
      }
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
    loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax, dateDoneMonth, dateDoneYear });
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setWoodCountMin('');
    setWoodCountMax('');
    setDateDoneMonth('');
    setDateDoneYear('');
    loadCategoryPictures({});
  };

  const handleTypeFilter = (type) => {
    setTypeFilter(type);
    // Note: We don't update URL params here - the filter is local to CategoryView
    // and shouldn't affect the Browse page filter (stored in sessionStorage)
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const hasActiveFilters = dateFrom || dateTo || woodCountMin || woodCountMax || dateDoneMonth || dateDoneYear;

  // Generate year options (last 10 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);

  // Image editing handlers
  const handleEditPicture = (picture, e) => {
    e.stopPropagation();
    setEditingPicture(picture);
  };

  const handleSaveEdit = async (blob, pictureId) => {
    try {
      await pictureService.editImage(pictureId, blob);
      setSuccess('Image modifiée avec succès');
      setEditingPicture(null);
      loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax, dateDoneMonth, dateDoneYear });
    } catch (err) {
      console.error('Failed to save edited image:', err);
      setError('Échec de la sauvegarde: ' + err.message);
    }
  };

  // Handler for when picture metadata is updated in the previewer
  const handlePictureUpdate = () => {
    setSuccess('Image mise à jour avec succès');
    loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax, dateDoneMonth, dateDoneYear });
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

        {/* Success/Error Messages */}
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Type Filters and View Mode Toggle */}
        <div className="filters-row">
          <div className="type-filters">
            <button
              className={`type-filter ${typeFilter === '' ? 'active' : ''}`}
              onClick={() => handleTypeFilter('')}
            >
              Tout
            </button>
            <button
              className={`type-filter ${typeFilter === 'INSTALLATION_PHOTO' ? 'active' : ''}`}
              onClick={() => handleTypeFilter('INSTALLATION_PHOTO')}
            >
              📸 Photos
            </button>
            <button
              className={`type-filter ${typeFilter === 'SCHEMATIC' ? 'active' : ''}`}
              onClick={() => handleTypeFilter('SCHEMATIC')}
            >
              📐 Schémas
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <span className="view-label">Vue:</span>
            <button
              className={`view-mode-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              onClick={() => setViewMode('grouped')}
              title="Afficher les photos groupées par design"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
              </svg>
              Groupée
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'flat' ? 'active' : ''}`}
              onClick={() => setViewMode('flat')}
              title="Afficher toutes les photos individuellement"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              Liste
            </button>
          </div>
        </div>

        {/* Sort Options */}
        <div className="sort-options">
          <span className="sort-label">Trier:</span>
          <button
            className={`sort-btn ${sortBy === 'uploadDate' ? 'active' : ''}`}
            onClick={() => handleSort('uploadDate')}
          >
            Date d'ajout {sortBy === 'uploadDate' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'woodCount' ? 'active' : ''}`}
            onClick={() => handleSort('woodCount')}
          >
            Nb. de bois {sortBy === 'woodCount' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'dateDone' ? 'active' : ''}`}
            onClick={() => handleSort('dateDone')}
          >
            Date réalisée {sortBy === 'dateDone' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>

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
                <label>Date d'ajout</label>
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

              <div className="filter-group">
                <label>Date réalisée</label>
                <div className="date-done-inputs">
                  <select
                    value={dateDoneMonth}
                    onChange={(e) => setDateDoneMonth(e.target.value)}
                  >
                    <option value="">Mois</option>
                    <option value="1">Janvier</option>
                    <option value="2">Février</option>
                    <option value="3">Mars</option>
                    <option value="4">Avril</option>
                    <option value="5">Mai</option>
                    <option value="6">Juin</option>
                    <option value="7">Juillet</option>
                    <option value="8">Août</option>
                    <option value="9">Septembre</option>
                    <option value="10">Octobre</option>
                    <option value="11">Novembre</option>
                    <option value="12">Décembre</option>
                  </select>
                  <select
                    value={dateDoneYear}
                    onChange={(e) => setDateDoneYear(e.target.value)}
                  >
                    <option value="">Année</option>
                    {yearOptions.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
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

        {/* Thumbnail Size Slider */}
        {pictures.length > 0 && (
          <div className="thumbnail-size-control">
            <span className="size-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={thumbnailSize}
              onChange={(e) => setThumbnailSize(parseInt(e.target.value))}
              className="size-slider"
              aria-label="Taille des miniatures"
            />
            <span className="size-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <rect x="2" y="2" width="20" height="20" rx="2" />
              </svg>
            </span>
          </div>
        )}

        {/* Pictures Grid */}
        {pictures.length === 0 ? (
          <div className="empty-state">
            <p>Aucune photo trouvée dans cette catégorie.</p>
            <Link to="/browse" className="btn-primary">
              Parcourir d'autres Catégories
            </Link>
          </div>
        ) : viewMode === 'grouped' ? (
          /* Grouped View - Show design group stacks and ungrouped pictures */
          <section
            className="pictures-grid grouped-view"
            aria-label={`Photos de ${category?.name}`}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${200 + thumbnailSize * 3}px, 1fr))` }}
          >
            {/* Render Design Group Stacks */}
            {designGroups.map((group) => (
              <DesignGroupStack
                key={`group-${group.id}`}
                designGroup={group}
                thumbnailSize={thumbnailSize}
                onClick={() => setSelectedDesignGroup(group)}
              />
            ))}

            {/* Render Ungrouped Pictures */}
            {ungroupedPictures.map((picture) => {
              // Find the index in the full pictures array for the previewer
              const pictureIndex = pictures.findIndex(p => p.id === picture.id);
              return (
                <article
                  key={picture.id}
                  className="picture-thumbnail"
                  onClick={() => handlePictureClick(pictureIndex)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Voir ${getImageAlt(picture, pictureIndex)}`}
                  onKeyDown={(e) => e.key === 'Enter' && handlePictureClick(pictureIndex)}
                >
                  <figure className="thumbnail-image">
                    <img
                      src={getImageUrl(picture.filePath)}
                      alt={getImageAlt(picture, pictureIndex)}
                      loading="lazy"
                    />

                    {/* Edit button for authorized users */}
                    {canReview && (
                      <button
                        className="picture-edit-btn"
                        onClick={(e) => handleEditPicture(picture, e)}
                        title="Modifier l'image (recadrer/rotation)"
                      >
                        ✎
                      </button>
                    )}

                    {/* Category label on the image */}
                    {picture.category && (
                      <div className="picture-category-label">{picture.category.name}</div>
                    )}

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
              );
            })}
          </section>
        ) : (
          /* Flat View - Show all pictures individually */
          <section
            className="pictures-grid"
            aria-label={`Photos de ${category?.name}`}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${200 + thumbnailSize * 3}px, 1fr))` }}
          >
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

                  {/* Edit button for authorized users */}
                  {canReview && (
                    <button
                      className="picture-edit-btn"
                      onClick={(e) => handleEditPicture(picture, e)}
                      title="Modifier l'image (recadrer/rotation)"
                    >
                      ✎
                    </button>
                  )}

                  {/* Category label on the image */}
                  {picture.category && (
                    <div className="picture-category-label">{picture.category.name}</div>
                  )}

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
          user={user}
          categories={allCategories}
          onPictureUpdate={handlePictureUpdate}
        />
      )}

      {/* Image Editor Modal */}
      <Modal
        isOpen={!!editingPicture}
        onClose={() => setEditingPicture(null)}
        title={`Modifier l'image`}
        size="fullscreen"
        closeOnOverlay={false}
      >
        {editingPicture && (
          <ImageEditor
            imageUrl={getImageUrl(editingPicture.filePath)}
            pictureId={editingPicture.id}
            onCancel={() => setEditingPicture(null)}
            onSave={handleSaveEdit}
          />
        )}
      </Modal>

      {/* Design Group Modal */}
      <DesignGroupModal
        isOpen={!!selectedDesignGroup}
        onClose={() => setSelectedDesignGroup(null)}
        designGroupId={selectedDesignGroup?.id}
        initialData={selectedDesignGroup}
      />
    </div>
  );
};

export default CategoryView;
