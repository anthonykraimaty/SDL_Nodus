import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { API_URL, getImageUrl } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import ImagePreviewer from '../components/ImagePreviewer';
import ImageEditor from '../components/ImageEditor';
import Modal from '../components/Modal';
import SEO from '../components/SEO';
import './CategoryView.css';

const CategoryView = () => {
  const { categoryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = searchParams.get('type') || '';
  const { user } = useAuth();

  const [category, setCategory] = useState(null);
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPictureIndex, setSelectedPictureIndex] = useState(null);

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

  // Selection mode for approve/reject
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPictures, setSelectedPictures] = useState(new Set());
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Image editing
  const [editingPicture, setEditingPicture] = useState(null);

  // Check if user can approve/reject
  const canReview = user && (user.role === 'BRANCHE_ECLAIREURS' || user.role === 'ADMIN');

  useEffect(() => {
    loadCategoryPictures();
  }, [categoryId, typeFilter, sortBy, sortOrder]);

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
    // Update URL search params
    if (type) {
      setSearchParams({ type });
    } else {
      setSearchParams({});
    }
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

  // Selection handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedPictures(new Set());
  };

  const togglePictureSelection = (pictureId, e) => {
    e.stopPropagation();
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
    setSelectedPictures(new Set(pictures.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedPictures(new Set());
  };

  // Group selected pictures by pictureSetId
  const getSelectedPicturesBySet = () => {
    const bySet = {};
    pictures.forEach(pic => {
      if (selectedPictures.has(pic.id)) {
        const setId = pic.pictureSetId;
        if (!bySet[setId]) {
          bySet[setId] = [];
        }
        bySet[setId].push(pic.id);
      }
    });
    return bySet;
  };

  // Approve selected pictures
  const handleApproveSelected = async (asHighlight = false) => {
    try {
      setError('');
      setSuccess('');

      const bySet = getSelectedPicturesBySet();
      const setIds = Object.keys(bySet);

      if (setIds.length === 0) {
        setError('Aucune image sélectionnée');
        return;
      }

      // Approve each set, excluding non-selected pictures from that set
      for (const setId of setIds) {
        const selectedInSet = bySet[setId];
        // Get all pictures in this set
        const allInSet = pictures.filter(p => p.pictureSetId === parseInt(setId)).map(p => p.id);
        // Excluded = all in set minus selected
        const excludedIds = allInSet.filter(id => !selectedInSet.includes(id));

        await pictureService.approve(parseInt(setId), asHighlight, excludedIds);
      }

      setSuccess(`${selectedPictures.size} image(s) approuvée(s)${asHighlight ? ' comme highlight' : ''}`);
      setSelectionMode(false);
      setSelectedPictures(new Set());
      loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax, dateDoneMonth, dateDoneYear });
    } catch (err) {
      console.error('Approval error:', err);
      setError('Échec de l\'approbation');
    }
  };

  // Reject selected pictures
  const handleRejectSelected = async () => {
    try {
      setError('');
      setSuccess('');

      if (!rejectionReason.trim()) {
        alert('Veuillez fournir une raison de rejet');
        return;
      }

      const bySet = getSelectedPicturesBySet();
      const setIds = Object.keys(bySet);

      if (setIds.length === 0) {
        setError('Aucune image sélectionnée');
        return;
      }

      // Reject each set
      for (const setId of setIds) {
        await pictureService.reject(parseInt(setId), rejectionReason);
      }

      setSuccess(`${setIds.length} set(s) rejeté(s)`);
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectionMode(false);
      setSelectedPictures(new Set());
      loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax, dateDoneMonth, dateDoneYear });
    } catch (err) {
      console.error('Rejection error:', err);
      setError('Échec du rejet');
    }
  };

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

        {/* Review Controls - Only for authorized users */}
        {canReview && pictures.length > 0 && (
          <div className="review-controls">
            <button
              className={`btn-selection-mode ${selectionMode ? 'active' : ''}`}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? '✕ Annuler la sélection' : '☑ Mode sélection'}
            </button>

            {selectionMode && (
              <>
                <div className="selection-actions">
                  <button className="btn-select-all" onClick={selectAll}>
                    Tout sélectionner
                  </button>
                  <button className="btn-deselect-all" onClick={deselectAll}>
                    Tout désélectionner
                  </button>
                  <span className="selection-count">
                    {selectedPictures.size} sélectionnée(s)
                  </span>
                </div>

                <div className="review-actions-inline">
                  <button
                    className="btn-approve"
                    onClick={() => handleApproveSelected(false)}
                    disabled={selectedPictures.size === 0}
                  >
                    ✓ Approuver
                  </button>
                  <button
                    className="btn-highlight"
                    onClick={() => handleApproveSelected(true)}
                    disabled={selectedPictures.size === 0}
                  >
                    ★ Approuver comme Highlight
                  </button>
                  <button
                    className="btn-reject"
                    onClick={() => setShowRejectModal(true)}
                    disabled={selectedPictures.size === 0}
                  >
                    ✕ Rejeter
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Type Filters */}
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
        ) : (
          <section
            className="pictures-grid"
            aria-label={`Photos de ${category?.name}`}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${200 + thumbnailSize * 3}px, 1fr))` }}
          >
            {pictures.map((picture, index) => (
              <article
                key={picture.id}
                className={`picture-thumbnail ${selectionMode && selectedPictures.has(picture.id) ? 'selected' : ''}`}
                onClick={() => selectionMode ? togglePictureSelection(picture.id, { stopPropagation: () => {} }) : handlePictureClick(index)}
                role="button"
                tabIndex={0}
                aria-label={`Voir ${getImageAlt(picture, index)}`}
                onKeyDown={(e) => e.key === 'Enter' && (selectionMode ? togglePictureSelection(picture.id, { stopPropagation: () => {} }) : handlePictureClick(index))}
              >
                <figure className="thumbnail-image">
                  <img
                    src={getImageUrl(picture.filePath)}
                    alt={getImageAlt(picture, index)}
                    loading="lazy"
                  />

                  {/* Selection checkbox in selection mode */}
                  {selectionMode && (
                    <div
                      className={`picture-selection-badge ${selectedPictures.has(picture.id) ? 'selected' : ''}`}
                      onClick={(e) => togglePictureSelection(picture.id, e)}
                    >
                      {selectedPictures.has(picture.id) ? '✓' : ''}
                    </div>
                  )}

                  {/* Edit button for authorized users */}
                  {canReview && !selectionMode && (
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
        />
      )}

      {/* Rejection Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectionReason('');
        }}
        title="Rejeter les images sélectionnées"
        variant="danger"
        size="medium"
      >
        <Modal.Body>
          <p>Veuillez fournir une raison pour le rejet de ces images:</p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Raison du rejet..."
            rows="4"
            className="rejection-textarea"
            autoFocus
          />
        </Modal.Body>
        <Modal.Actions>
          <button
            onClick={handleRejectSelected}
            className="danger"
            disabled={!rejectionReason.trim()}
          >
            Confirmer le rejet
          </button>
          <button
            onClick={() => {
              setShowRejectModal(false);
              setRejectionReason('');
            }}
            className="secondary"
          >
            Annuler
          </button>
        </Modal.Actions>
      </Modal>

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
    </div>
  );
};

export default CategoryView;
