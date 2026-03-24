import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { API_URL, getImageUrl } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { pictureService, categoryService, designGroupService } from '../services/api';
import ImagePreviewer from '../components/ImagePreviewer';
import ImageEditor from '../components/ImageEditor';
import DesignGroupStack from '../components/DesignGroupStack';
import DesignGroupModal from '../components/DesignGroupModal';
import Modal from '../components/Modal';
import SEO from '../components/SEO';
import { getImageAlt, buildPhotoTitle, buildPhotoDescription, buildPhotoKeywords } from '../utils/imageAlt';
import './CategoryView.css';

const CategoryView = () => {
  const { categoryId, pictureId } = useParams();
  const navigate = useNavigate();
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

  // Grouping state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPictures, setSelectedPictures] = useState(new Set());
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddToGroup, setShowAddToGroup] = useState(false);
  const [existingGroups, setExistingGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupActionLoading, setGroupActionLoading] = useState(false);

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

  // Auto-open previewer when pictureId is in the URL (shared link)
  useEffect(() => {
    if (pictureId && pictures.length > 0 && !loading) {
      const index = pictures.findIndex(p => String(p.id) === String(pictureId));
      if (index !== -1) {
        setSelectedPictureIndex(index);
      }
    }
  }, [pictureId, pictures, loading]);

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
    if (pictures[index]) {
      navigate(`/category/${categoryId}/photo/${pictures[index].id}`, { replace: true });
    }
  };

  const handleClosePreviewer = () => {
    setSelectedPictureIndex(null);
    navigate(`/category/${categoryId}`, { replace: true });
  };

  const handlePictureChange = useCallback((newPictureId) => {
    navigate(`/category/${categoryId}/photo/${newPictureId}`, { replace: true });
  }, [navigate, categoryId]);

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

  // Reset selection when context changes
  useEffect(() => {
    setSelectedPictures(new Set());
    setSelectionMode(false);
  }, [categoryId, viewMode, typeFilter]);

  // Grouping handlers
  const reloadPictures = () => {
    loadCategoryPictures({ dateFrom, dateTo, woodCountMin, woodCountMax, dateDoneMonth, dateDoneYear });
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectedPictures(new Set());
    }
    setSelectionMode(prev => !prev);
  };

  const togglePictureSelection = (pictureId, e) => {
    e.stopPropagation();
    setSelectedPictures(prev => {
      const next = new Set(prev);
      if (next.has(pictureId)) {
        next.delete(pictureId);
      } else {
        next.add(pictureId);
      }
      return next;
    });
  };

  const handleCreateGroupClick = () => {
    if (selectedPictures.size < 2) {
      setError('Sélectionnez au moins 2 photos pour créer un groupe');
      return;
    }
    setNewGroupName('');
    setShowCreateGroup(true);
  };

  const handleCreateGroupConfirm = async () => {
    try {
      setGroupActionLoading(true);
      const pictureIds = Array.from(selectedPictures);
      await designGroupService.create({ name: newGroupName || null, pictureIds });
      setSuccess(`Groupe créé avec ${pictureIds.length} photos`);
      setShowCreateGroup(false);
      setSelectedPictures(new Set());
      setSelectionMode(false);
      reloadPictures();
    } catch (err) {
      console.error('Failed to create design group:', err);
      setError(err.message || 'Échec de la création du groupe');
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleAddToGroupClick = async () => {
    if (selectedPictures.size === 0) {
      setError('Sélectionnez au moins 1 photo');
      return;
    }
    try {
      const data = await designGroupService.getAll({ limit: 100 });
      setExistingGroups(data.designGroups || []);
      setSelectedGroupId(null);
      setShowAddToGroup(true);
    } catch (err) {
      console.error('Failed to load design groups:', err);
      setError('Échec du chargement des groupes');
    }
  };

  const handleAddToGroupConfirm = async () => {
    if (!selectedGroupId) {
      setError('Veuillez sélectionner un groupe');
      return;
    }
    try {
      setGroupActionLoading(true);
      const pictureIds = Array.from(selectedPictures);
      await designGroupService.addPictures(selectedGroupId, pictureIds);
      setSuccess(`${pictureIds.length} photo(s) ajoutée(s) au groupe`);
      setShowAddToGroup(false);
      setSelectedPictures(new Set());
      setSelectionMode(false);
      reloadPictures();
    } catch (err) {
      console.error('Failed to add pictures to group:', err);
      setError(err.message || "Échec de l'ajout au groupe");
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleRemoveFromGroups = async () => {
    const picturesInGroups = pictures.filter(p => selectedPictures.has(p.id) && p.designGroupId);
    if (picturesInGroups.length === 0) {
      setError("Aucune des photos sélectionnées n'appartient à un groupe");
      return;
    }
    try {
      setGroupActionLoading(true);
      let removed = 0;
      for (const pic of picturesInGroups) {
        try {
          await designGroupService.removePicture(pic.designGroupId, pic.id);
          removed++;
        } catch (err) {
          console.error(`Failed to remove picture ${pic.id} from group:`, err);
        }
      }
      setSuccess(`${removed} photo(s) retirée(s) de leur groupe`);
      setSelectedPictures(new Set());
      setSelectionMode(false);
      reloadPictures();
    } catch (err) {
      console.error('Failed to remove pictures from groups:', err);
      setError(err.message || 'Échec du retrait des photos');
    } finally {
      setGroupActionLoading(false);
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

  // First picture for OG image
  const firstPicture = pictures[0];
  const ogImage = firstPicture ? getImageUrl(firstPicture.filePath) : null;

  // SEO description for category page
  const seoDescription = category
    ? `${pictures.length} photos d'installations ${category.name} des Scouts du Liban. Découvrez les constructions et aménagements de camp scout.`
    : 'Photos d\'installations scoutes des Scouts du Liban';

  // Selected photo for SEO
  const selectedPhoto = selectedPictureIndex !== null ? pictures[selectedPictureIndex] : null;

  // Base URL for absolute URLs in structured data
  const baseUrl = 'https://nodus.scoutsduliban.org';

  // JSON-LD structured data
  const jsonLd = selectedPhoto
    ? {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        name: buildPhotoTitle(selectedPhoto, category),
        description: buildPhotoDescription(selectedPhoto, category),
        contentUrl: getImageUrl(selectedPhoto.filePath),
        thumbnailUrl: getImageUrl(selectedPhoto.filePath),
        url: `${baseUrl}/category/${categoryId}/photo/${selectedPhoto.id}`,
        author: { '@type': 'Organization', name: 'Scouts du Liban' },
        ...(selectedPhoto.troupe?.group?.name && {
          creator: { '@type': 'Organization', name: selectedPhoto.troupe.group.name },
        }),
        ...(selectedPhoto.pictureSet?.uploadedAt && {
          datePublished: selectedPhoto.pictureSet.uploadedAt,
        }),
        contentLocation: {
          '@type': 'Place',
          name: selectedPhoto.pictureSet?.location || 'Liban',
        },
        isPartOf: {
          '@type': 'ImageGallery',
          name: category?.name,
          url: `${baseUrl}/category/${categoryId}`,
        },
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'ImageGallery',
        name: category?.name,
        description: seoDescription,
        url: `${baseUrl}/category/${categoryId}`,
        numberOfItems: pictures.length,
        image: pictures.slice(0, 10).map(p => getImageUrl(p.filePath)),
      };

  return (
    <div className="category-view">
      {selectedPhoto ? (
        <SEO
          title={buildPhotoTitle(selectedPhoto, category)}
          description={buildPhotoDescription(selectedPhoto, category)}
          image={getImageUrl(selectedPhoto.filePath)}
          url={`/category/${categoryId}/photo/${selectedPhoto.id}`}
          type="article"
          keywords={buildPhotoKeywords(selectedPhoto, category)}
          jsonLd={jsonLd}
        />
      ) : (
        <SEO
          title={category?.name ? `${category.name} - Installations Scoutes` : 'Catégorie'}
          description={seoDescription}
          image={ogImage}
          url={`/category/${categoryId}`}
          keywords={[category?.name, 'installations scoutes', 'photos camp', 'constructions scoutes'].filter(Boolean)}
          jsonLd={jsonLd}
        />
      )}
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

          {/* Selection Mode Toggle */}
          {canReview && (
            <button
              className={`btn-selection-mode ${selectionMode ? 'active' : ''}`}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? 'Quitter Sélection' : 'Sélectionner'}
            </button>
          )}

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

        {/* Bulk Actions Bar */}
        {selectionMode && selectedPictures.size > 0 && (
          <div className="bulk-actions-bar">
            <span className="bulk-count">{selectedPictures.size} photo(s) sélectionnée(s)</span>
            <div className="bulk-buttons">
              <button
                className="btn-bulk-group"
                onClick={handleCreateGroupClick}
                disabled={selectedPictures.size < 2 || groupActionLoading}
              >
                Créer Groupe
              </button>
              <button
                className="btn-bulk-group"
                onClick={handleAddToGroupClick}
                disabled={groupActionLoading}
              >
                Ajouter au Groupe
              </button>
              <button
                className="btn-bulk-ungroup"
                onClick={handleRemoveFromGroups}
                disabled={groupActionLoading}
              >
                Retirer des Groupes
              </button>
              <button
                className="btn-bulk-clear"
                onClick={() => { setSelectedPictures(new Set()); setSelectionMode(false); }}
              >
                Annuler
              </button>
            </div>
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
                  className={`picture-thumbnail ${selectionMode && selectedPictures.has(picture.id) ? 'selected' : ''}`}
                  onClick={() => selectionMode ? togglePictureSelection(picture.id, { stopPropagation: () => {} }) : handlePictureClick(pictureIndex)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Voir ${getImageAlt(picture, category)}`}
                  onKeyDown={(e) => e.key === 'Enter' && (selectionMode ? togglePictureSelection(picture.id, { stopPropagation: () => {} }) : handlePictureClick(pictureIndex))}
                >
                  <figure className="thumbnail-image">
                    <img
                      src={getImageUrl(picture.filePath)}
                      alt={getImageAlt(picture, category)}
                      loading="lazy"
                    />

                    {/* Selection checkbox */}
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
                className={`picture-thumbnail ${selectionMode && selectedPictures.has(picture.id) ? 'selected' : ''}`}
                onClick={() => selectionMode ? togglePictureSelection(picture.id, { stopPropagation: () => {} }) : handlePictureClick(index)}
                role="button"
                tabIndex={0}
                aria-label={`Voir ${getImageAlt(picture, category)}`}
                onKeyDown={(e) => e.key === 'Enter' && (selectionMode ? togglePictureSelection(picture.id, { stopPropagation: () => {} }) : handlePictureClick(index))}
              >
                <figure className="thumbnail-image">
                  <img
                    src={getImageUrl(picture.filePath)}
                    alt={getImageAlt(picture, category)}
                    loading="lazy"
                  />

                  {/* Selection checkbox */}
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
          onPictureChange={handlePictureChange}
          category={category}
          user={user}
          categories={allCategories}
          onPictureUpdate={handlePictureUpdate}
          onPictureArchived={(pictureId) => {
            setPictures(prev => prev.filter(p => p.id !== pictureId));
            setUngroupedPictures(prev => prev.filter(p => p.id !== pictureId));
            setDesignGroups(prev => prev.map(group => ({
              ...group,
              pictures: group.pictures.filter(p => p.id !== pictureId),
            })).filter(group => group.pictures.length > 0));
          }}
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
        canEdit={canReview}
        onRemovePicture={async (groupId, pictureId) => {
          await designGroupService.removePicture(groupId, pictureId);
          reloadPictures();
        }}
      />

      {/* Create Design Group Modal */}
      <Modal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        title="Créer un Groupe"
        size="small"
      >
        <Modal.Body>
          <div className="create-group-modal">
            <p>Créer un groupe avec <strong>{selectedPictures.size}</strong> photo(s).</p>
            <div className="form-group">
              <label>Nom du groupe (optionnel)</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="ex: Mat Double, Tour Standard"
                className="form-input"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroupConfirm()}
              />
            </div>
          </div>
        </Modal.Body>
        <Modal.Actions>
          <button onClick={handleCreateGroupConfirm} className="primary" disabled={groupActionLoading}>
            {groupActionLoading ? 'Création...' : 'Créer Groupe'}
          </button>
          <button onClick={() => setShowCreateGroup(false)} className="secondary" disabled={groupActionLoading}>
            Annuler
          </button>
        </Modal.Actions>
      </Modal>

      {/* Add to Existing Group Modal */}
      <Modal
        isOpen={showAddToGroup}
        onClose={() => setShowAddToGroup(false)}
        title="Ajouter au Groupe"
        size="medium"
      >
        <Modal.Body>
          <div className="add-to-group-modal">
            <p>Ajouter <strong>{selectedPictures.size}</strong> photo(s) à un groupe existant.</p>
            {existingGroups.length === 0 ? (
              <div className="no-groups-message">
                <p>Aucun groupe existant. Créez un nouveau groupe.</p>
              </div>
            ) : (
              <div className="existing-groups-list">
                {existingGroups.map(group => (
                  <div
                    key={group.id}
                    className={`group-option ${selectedGroupId === group.id ? 'selected' : ''}`}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <div className="group-option-preview">
                      {group.primaryPicture ? (
                        <img src={getImageUrl(group.primaryPicture.filePath)} alt={group.name || 'Group'} />
                      ) : group.pictures?.[0] ? (
                        <img src={getImageUrl(group.pictures[0].filePath)} alt={group.name || 'Group'} />
                      ) : (
                        <span className="no-preview">-</span>
                      )}
                    </div>
                    <div className="group-option-info">
                      <span className="group-option-name">{group.name || `Groupe #${group.id}`}</span>
                      <span className="group-option-count">{group._count?.pictures || 0} photo(s)</span>
                      {group.category && <span className="group-option-category">{group.category.name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Actions>
          <button
            onClick={handleAddToGroupConfirm}
            className="primary"
            disabled={groupActionLoading || !selectedGroupId || existingGroups.length === 0}
          >
            {groupActionLoading ? 'Ajout...' : 'Ajouter au Groupe'}
          </button>
          <button onClick={() => setShowAddToGroup(false)} className="secondary" disabled={groupActionLoading}>
            Annuler
          </button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default CategoryView;
