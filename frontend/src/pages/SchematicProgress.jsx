import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schematicService } from '../services/api';
import { getImageUrl } from '../config/api';
import ImagePreviewer from '../components/ImagePreviewer';
import './SchematicProgress.css';

const SchematicProgress = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPatrouille = searchParams.get('patrouille');
  const initialView = searchParams.get('view');

  const [view, setView] = useState('troupe'); // 'troupe', 'all', 'detail', 'gallery'
  const [troupeProgress, setTroupeProgress] = useState(null);
  const [allProgress, setAllProgress] = useState(null);
  const [detailProgress, setDetailProgress] = useState(null);
  const [selectedPatrouille, setSelectedPatrouille] = useState(initialPatrouille);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSets, setExpandedSets] = useState({});

  // Gallery state
  const [gallerySchematics, setGallerySchematics] = useState([]);
  const [galleryCategories, setGalleryCategories] = useState([]);
  const [galleryFilters, setGalleryFilters] = useState({
    setName: '',
    itemId: '',
  });
  const [galleryPagination, setGalleryPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Image preview
  const [previewImages, setPreviewImages] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const toggleSet = (setName) => {
    setExpandedSets((prev) => ({
      ...prev,
      [setName]: !prev[setName],
    }));
  };

  useEffect(() => {
    if (initialPatrouille) {
      setSelectedPatrouille(initialPatrouille);
      setView('detail');
    } else if (initialView === 'gallery') {
      setView('gallery');
      loadGalleryCategories();
      loadGallerySchematics();
    } else if (user?.role === 'CHEF_TROUPE' && user?.troupeId) {
      loadTroupeProgress(user.troupeId);
    } else if (['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role)) {
      setView('all');
      loadAllProgress();
    } else {
      // Public user - show gallery by default
      setView('gallery');
      loadGalleryCategories();
      loadGallerySchematics();
    }
  }, [user, initialPatrouille, initialView]);

  useEffect(() => {
    if (selectedPatrouille && view === 'detail') {
      loadDetailProgress(selectedPatrouille);
    }
  }, [selectedPatrouille, view]);

  useEffect(() => {
    if (view === 'gallery') {
      loadGallerySchematics();
    }
  }, [galleryFilters, galleryPagination.page, view]);

  const loadTroupeProgress = async (troupeId) => {
    try {
      setLoading(true);
      setError('');
      console.log('Loading troupe progress for troupeId:', troupeId);
      const data = await schematicService.getTroupeProgress(troupeId);
      console.log('Troupe progress data:', data);
      setTroupeProgress(data);
      setView('troupe');
    } catch (err) {
      console.error('Failed to load troupe progress:', err);
      setError('Failed to load troupe progress: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const loadAllProgress = async () => {
    try {
      setLoading(true);
      const data = await schematicService.getAllProgress();
      setAllProgress(data);
    } catch (err) {
      setError('Failed to load progress data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetailProgress = async (patrouilleId) => {
    try {
      setLoading(true);
      const data = await schematicService.getProgress(patrouilleId);
      setDetailProgress(data);
    } catch (err) {
      setError('Failed to load patrouille progress');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGalleryCategories = async () => {
    try {
      const data = await schematicService.getCategories();
      setGalleryCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadGallerySchematics = async () => {
    try {
      setLoading(true);
      const params = {
        page: galleryPagination.page,
        limit: galleryPagination.limit,
      };

      if (galleryFilters.itemId) {
        params.itemId = galleryFilters.itemId;
      } else if (galleryFilters.setName) {
        params.setName = galleryFilters.setName;
      }

      const data = await schematicService.getGallery(params);
      setGallerySchematics(data.schematics);
      setGalleryPagination((prev) => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }));
    } catch (err) {
      setError('Failed to load schematics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetFilterChange = (setName) => {
    setGalleryFilters({ setName, itemId: '' });
    setGalleryPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleItemFilterChange = (itemId) => {
    setGalleryFilters((prev) => ({ ...prev, itemId }));
    setGalleryPagination((prev) => ({ ...prev, page: 1 }));
  };

  const getItemsForSet = (setName) => {
    const set = galleryCategories.find((c) => c.setName === setName);
    return set?.items || [];
  };

  const openPreview = (pictureSet) => {
    if (!pictureSet?.pictures) return;
    const images = pictureSet.pictures.map((p) => ({
      url: getImageUrl(p.filePath),
      caption: p.caption,
    }));
    setPreviewImages(images);
    setPreviewIndex(0);
  };

  const openGalleryPreview = (schematic, index = 0) => {
    const images = schematic.pictures.map((p) => ({
      url: getImageUrl(p.filePath),
      caption: `${schematic.schematicCategory?.setName} - ${schematic.schematicCategory?.itemName}`,
    }));
    setPreviewImages(images);
    setPreviewIndex(index);
  };

  const closePreview = () => {
    setPreviewImages([]);
    setPreviewIndex(0);
  };

  const handlePatrouilleClick = (patrouilleId) => {
    setSelectedPatrouille(patrouilleId);
    setView('detail');
  };

  const handleBackToList = () => {
    setSelectedPatrouille(null);
    setDetailProgress(null);
    if (user?.role === 'CHEF_TROUPE') {
      setView('troupe');
      loadTroupeProgress(user.troupeId);
    } else {
      setView('all');
      loadAllProgress();
    }
  };

  const handleViewChange = (newView) => {
    setView(newView);
    if (newView === 'troupe' && user?.troupeId) {
      loadTroupeProgress(user.troupeId);
    } else if (newView === 'all') {
      loadAllProgress();
    } else if (newView === 'gallery') {
      loadGalleryCategories();
      loadGallerySchematics();
    }
  };

  if (loading && !troupeProgress && !allProgress && !detailProgress && gallerySchematics.length === 0) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="schematic-progress-page">
      <div className="container">
        <div className="progress-header">
          <div className="header-content">
            {view === 'detail' && (
              <button className="btn-back" onClick={handleBackToList}>
                ← Back to List
              </button>
            )}
            <h2>
              {view === 'gallery' ? 'Schematic Gallery' : 'Schematic Progress'}
            </h2>
            <p>
              {view === 'gallery'
                ? 'Browse approved hand-drawn schematics from all patrouilles'
                : view === 'detail'
                ? 'Detailed progress for patrouille'
                : 'Track patrouille completion across all schematic sets'}
            </p>
          </div>

          {/* View Toggle */}
          {view !== 'detail' && (
            <div className="view-toggle">
              {user?.troupeId && (
                <button
                  className={view === 'troupe' ? 'active' : ''}
                  onClick={() => handleViewChange('troupe')}
                >
                  My Troupe
                </button>
              )}
              {['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role) && (
                <button
                  className={view === 'all' ? 'active' : ''}
                  onClick={() => handleViewChange('all')}
                >
                  All Patrouilles
                </button>
              )}
              <button
                className={view === 'gallery' ? 'active' : ''}
                onClick={() => handleViewChange('gallery')}
              >
                Gallery
              </button>
            </div>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Troupe View */}
        {view === 'troupe' && troupeProgress && (
          <div className="troupe-progress">
            <div className="troupe-info">
              <h3>{troupeProgress.troupe.name}</h3>
              <span className="troupe-group">
                {troupeProgress.troupe.group?.name} -{' '}
                {troupeProgress.troupe.group?.district?.name}
              </span>
            </div>

            {troupeProgress.patrouilles.length === 0 ? (
              <div className="empty-state">
                <h3>No Patrouilles Found</h3>
                <p>This troupe doesn't have any patrouilles yet.</p>
                <p className="text-muted">Please contact an administrator to add patrouilles to your troupe.</p>
              </div>
            ) : (
              <div className="patrouilles-grid">
                {troupeProgress.patrouilles.map((item) => (
                  <div
                    key={item.patrouille.id}
                    className={`patrouille-card ${item.isWinner ? 'winner' : ''}`}
                    onClick={() => handlePatrouilleClick(item.patrouille.id)}
                  >
                    {item.isWinner && <div className="winner-badge">Winner!</div>}
                    <div className="patrouille-header">
                      <h4>{item.patrouille.name}</h4>
                      <span className="totem">{item.patrouille.totem}</span>
                    </div>
                    <div className="progress-circle">
                      <svg viewBox="0 0 36 36">
                        <path
                          className="circle-bg"
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="circle-fill"
                          strokeDasharray={`${item.completionPercentage}, 100`}
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <text x="18" y="20.35" className="percentage">
                          {item.completionPercentage}%
                        </text>
                      </svg>
                    </div>
                    <div className="progress-stats">
                      <span>
                        {item.completedItems}/{item.totalItems} items
                      </span>
                      {item.pendingReview > 0 && (
                        <span className="pending">
                          {item.pendingReview} pending review
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Patrouilles View */}
        {view === 'all' && allProgress && (
          <div className="all-progress">
            <div className="progress-summary-bar">
              <span>
                {allProgress.patrouilles.filter((p) => p.isWinner).length} winner
                {allProgress.patrouilles.filter((p) => p.isWinner).length !== 1
                  ? 's'
                  : ''}
              </span>
              <span>{allProgress.patrouilles.length} patrouilles total</span>
            </div>

            <div className="patrouilles-list">
              {allProgress.patrouilles.map((item, index) => (
                <div
                  key={item.patrouille.id}
                  className={`patrouille-row ${item.isWinner ? 'winner' : ''}`}
                  onClick={() => handlePatrouilleClick(item.patrouille.id)}
                >
                  <div className="rank">#{index + 1}</div>
                  <div className="patrouille-info">
                    <div className="patrouille-name">
                      {item.patrouille.name}
                      {item.isWinner && <span className="winner-tag">Winner</span>}
                    </div>
                    <div className="patrouille-details">
                      {item.patrouille.troupe?.name} •{' '}
                      {item.patrouille.troupe?.group?.name}
                    </div>
                  </div>
                  <div className="progress-bar-wrapper">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${item.completionPercentage}%` }}
                      />
                    </div>
                    <span className="progress-text">
                      {item.completionPercentage}%
                    </span>
                  </div>
                  <div className="items-count">
                    {item.completedItems}/{item.totalItems}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detail View */}
        {view === 'detail' && detailProgress && (
          <div className="detail-progress">
            <div className="detail-header">
              <div className="patrouille-big-info">
                <h3>{detailProgress.patrouille.name}</h3>
                <span className="totem-cri">
                  {detailProgress.patrouille.totem} - "{detailProgress.patrouille.cri}"
                </span>
                <span className="troupe-name">
                  {detailProgress.patrouille.troupe?.name}
                </span>
              </div>
              <div className="overall-progress">
                <div className="progress-circle large">
                  <svg viewBox="0 0 36 36">
                    <path
                      className="circle-bg"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="circle-fill"
                      strokeDasharray={`${detailProgress.completionPercentage}, 100`}
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <text x="18" y="20.35" className="percentage">
                      {detailProgress.completionPercentage}%
                    </text>
                  </svg>
                </div>
                <div className="progress-label">
                  {detailProgress.completedSets}/{detailProgress.totalSets} sets complete
                  {detailProgress.isWinner && (
                    <span className="winner-badge-large">All Complete!</span>
                  )}
                </div>
              </div>
            </div>

            <div className="category-accordion">
              {detailProgress.sets.map((set) => {
                const isExpanded = expandedSets[set.setName];
                return (
                  <div key={set.setName} className="category-set">
                    <button
                      type="button"
                      className={`category-set-header ${isExpanded ? 'expanded' : ''} ${set.isComplete ? 'complete' : ''}`}
                      onClick={() => toggleSet(set.setName)}
                    >
                      <span className="set-name">{set.setName}</span>
                      <span className="set-progress">
                        {set.completedItems}/{set.totalItems}
                        {set.isComplete && ' ✅'}
                      </span>
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    </button>

                    {isExpanded && (
                      <div className="category-items">
                        {set.items.map((item) => (
                          <div
                            key={item.id}
                            className={`category-item ${item.status.toLowerCase()}`}
                          >
                            <span className="item-name">{item.itemName}</span>
                            {item.pictureSet && item.pictureSet.pictures?.[0] && (
                              <div
                                className="item-thumbnail"
                                onClick={() => openPreview(item.pictureSet)}
                                title="Click to view images"
                              >
                                <img
                                  src={getImageUrl(item.pictureSet.pictures[0].filePath)}
                                  alt={item.itemName}
                                />
                              </div>
                            )}
                            <span className={`item-status-badge status-${item.status.toLowerCase()}`}>
                              <span className="status-icon">
                                {item.status === 'APPROVED' && '✓'}
                                {item.status === 'SUBMITTED' && '⏳'}
                                {item.status === 'REJECTED' && '✗'}
                                {item.status === 'PENDING' && '○'}
                              </span>
                              {item.status === 'APPROVED' && 'Done'}
                              {item.status === 'SUBMITTED' && 'Pending'}
                              {item.status === 'REJECTED' && 'Rejected'}
                              {item.status === 'PENDING' && 'Not uploaded'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Upload Action for Chef Troupe */}
            {user?.role === 'CHEF_TROUPE' &&
              user?.troupeId === detailProgress.patrouille.troupeId && (
                <div className="upload-cta">
                  <Link to="/schematics/upload" className="btn-upload-schematic">
                    Upload Schematic for this Patrouille
                  </Link>
                </div>
              )}
          </div>
        )}

        {/* Gallery View */}
        {view === 'gallery' && (
          <div className="gallery-section">
            {/* Filters */}
            <div className="gallery-filters">
              <div className="filter-group">
                <label>Category Set</label>
                <select
                  value={galleryFilters.setName}
                  onChange={(e) => handleSetFilterChange(e.target.value)}
                >
                  <option value="">All Sets</option>
                  {galleryCategories.map((set) => (
                    <option key={set.setName} value={set.setName}>
                      {set.setName}
                    </option>
                  ))}
                </select>
              </div>

              {galleryFilters.setName && (
                <div className="filter-group">
                  <label>Item</label>
                  <select
                    value={galleryFilters.itemId}
                    onChange={(e) => handleItemFilterChange(e.target.value)}
                  >
                    <option value="">All Items</option>
                    {getItemsForSet(galleryFilters.setName).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(galleryFilters.setName || galleryFilters.itemId) && (
                <button
                  className="btn-clear-filters"
                  onClick={() => {
                    setGalleryFilters({ setName: '', itemId: '' });
                    setGalleryPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
              </div>
            ) : gallerySchematics.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📐</div>
                <h3>No Schematics Found</h3>
                <p>
                  {galleryFilters.setName || galleryFilters.itemId
                    ? 'No approved schematics match your filters'
                    : 'No approved schematics yet'}
                </p>
              </div>
            ) : (
              <>
                <div className="results-count">
                  {galleryPagination.total} schematic{galleryPagination.total !== 1 ? 's' : ''} found
                </div>

                <div className="schematics-grid">
                  {gallerySchematics.map((schematic) => (
                    <div key={schematic.id} className="schematic-gallery-card">
                      <div
                        className="schematic-image"
                        onClick={() => openGalleryPreview(schematic)}
                      >
                        <img
                          src={getImageUrl(schematic.pictures[0]?.filePath)}
                          alt={schematic.schematicCategory?.itemName}
                        />
                        {schematic.pictures.length > 1 && (
                          <div className="image-count">
                            +{schematic.pictures.length - 1}
                          </div>
                        )}
                      </div>

                      <div className="schematic-card-content">
                        <div className="schematic-category-info">
                          <span className="gallery-category-set">
                            {schematic.schematicCategory?.setName}
                          </span>
                          <span className="gallery-category-item">
                            {schematic.schematicCategory?.itemName}
                          </span>
                        </div>

                        <div className="schematic-patrouille">
                          <span className="schematic-patrouille-name">
                            {schematic.patrouille?.name}
                          </span>
                          <span className="schematic-patrouille-totem">
                            {schematic.patrouille?.totem}
                          </span>
                        </div>

                        <div className="schematic-troupe">
                          {schematic.patrouille?.troupe?.group?.name} •{' '}
                          {schematic.patrouille?.troupe?.name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {galleryPagination.totalPages > 1 && (
                  <div className="gallery-pagination">
                    <button
                      onClick={() =>
                        setGalleryPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                      }
                      disabled={galleryPagination.page === 1}
                    >
                      Previous
                    </button>
                    <span>
                      Page {galleryPagination.page} of {galleryPagination.totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setGalleryPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                      }
                      disabled={galleryPagination.page === galleryPagination.totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Image Preview */}
        {previewImages.length > 0 && (
          <ImagePreviewer
            images={previewImages}
            initialIndex={previewIndex}
            onClose={closePreview}
          />
        )}
      </div>
    </div>
  );
};

export default SchematicProgress;
