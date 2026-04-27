import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { schematicService, organizationService } from '../services/api';
import { getImageUrl } from '../config/api';
import ImagePreviewer from '../components/ImagePreviewer';
import Modal from '../components/Modal';
import './SchematicProgress.css';

const SchematicProgress = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPatrouille = searchParams.get('patrouille');
  const initialView = searchParams.get('view');

  const [view, setView] = useState('troupe'); // 'troupe', 'all', 'detail', 'gallery'
  const [troupeProgress, setTroupeProgress] = useState(null);
  const [detailProgress, setDetailProgress] = useState(null);
  const [categoryStats, setCategoryStats] = useState(null);
  const [expandedCategorySets, setExpandedCategorySets] = useState({});
  const [selectedPatrouille, setSelectedPatrouille] = useState(initialPatrouille);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSets, setExpandedSets] = useState({});

  // Grouped view state for Branche/Admin "all" view
  const [groupedData, setGroupedData] = useState(null);
  const [expandedDistricts, setExpandedDistricts] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [districts, setDistricts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [allFilters, setAllFilters] = useState({
    districtId: '',
    groupId: '',
  });
  const [sortBy, setSortBy] = useState('completion');
  const [sortDir, setSortDir] = useState('desc');
  const [searchText, setSearchText] = useState('');
  const [searchDebounce, setSearchDebounce] = useState(null);

  // Gallery state
  const [gallerySchematics, setGallerySchematics] = useState([]);
  const [galleryDisabled, setGalleryDisabled] = useState(false);
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
  const [previewPictures, setPreviewPictures] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Pending review count (Branche/Admin only)
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // Delete state for CT users
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Completions modal (Branche/Admin)
  const [completionsOpen, setCompletionsOpen] = useState(false);
  const [completionsData, setCompletionsData] = useState(null);
  const [completionsLoading, setCompletionsLoading] = useState(false);
  const [completionsError, setCompletionsError] = useState('');
  const [expandedCompletionSets, setExpandedCompletionSets] = useState({});
  const [expandedCompletionItems, setExpandedCompletionItems] = useState({});
  const [completionsSearch, setCompletionsSearch] = useState('');

  const toggleSet = (setName) => {
    setExpandedSets((prev) => ({
      ...prev,
      [setName]: !prev[setName],
    }));
  };

  const toggleCategorySet = (setName) => {
    setExpandedCategorySets((prev) => ({
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
      loadGroupedProgress();
      loadCategoryStats();
      loadOrgData();
      loadPendingReviewCount();
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

  const loadGroupedProgress = async (filters = {}, sort = {}) => {
    try {
      setLoading(true);
      const params = {};
      if (filters.districtId) params.districtId = filters.districtId;
      if (filters.groupId) params.groupId = filters.groupId;
      if (filters.search) params.search = filters.search;
      params.sortBy = sort.sortBy || sortBy;
      params.sortDir = sort.sortDir || sortDir;
      const data = await schematicService.getGroupedProgress(params);
      setGroupedData(data);
      // Expand all districts and groups by default
      if (data.districts) {
        setExpandedDistricts(new Set(data.districts.map(d => d.id)));
        const allGroupIds = new Set();
        data.districts.forEach(d => d.groups.forEach(g => allGroupIds.add(g.id)));
        setExpandedGroups(allGroupIds);
      }
    } catch (err) {
      setError('Failed to load progress data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrgData = async () => {
    try {
      const [districtsData, groupsData] = await Promise.all([
        organizationService.getDistricts(),
        organizationService.getGroups(),
      ]);
      setDistricts(districtsData);
      setGroups(groupsData);
    } catch (err) {
      console.error('Failed to load organization data:', err);
    }
  };

  const loadCategoryStats = async () => {
    try {
      const data = await schematicService.getCategoryStats();
      setCategoryStats(data);
    } catch (err) {
      console.error('Failed to load category stats:', err);
    }
  };

  const loadPendingReviewCount = async () => {
    try {
      const data = await schematicService.getPending({ page: 1, limit: 1 });
      setPendingReviewCount(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load pending review count:', err);
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
      setGalleryDisabled(!!data.disabled);
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
    setPreviewPictures(pictureSet.pictures);
    setPreviewIndex(0);
  };

  const openGalleryPreview = (schematic, index = 0) => {
    setPreviewPictures(schematic.pictures);
    setPreviewIndex(index);
  };

  const closePreview = () => {
    setPreviewPictures([]);
    setPreviewIndex(0);
  };

  const handleDeleteSchematic = async (pictureSetId) => {
    try {
      setDeleteLoading(true);
      await schematicService.delete(pictureSetId);
      setDeleteConfirm(null);
      if (selectedPatrouille) {
        loadDetailProgress(selectedPatrouille);
      }
    } catch (err) {
      console.error('Failed to delete schematic:', err);
      setError(err.error || 'Failed to delete schematic');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openCompletionsModal = async () => {
    setCompletionsOpen(true);
    if (completionsData) return;
    try {
      setCompletionsLoading(true);
      setCompletionsError('');
      const data = await schematicService.getCompletions();
      setCompletionsData(data);
      const expanded = {};
      (data.sets || []).forEach((s) => { expanded[s.setName] = true; });
      setExpandedCompletionSets(expanded);
    } catch (err) {
      console.error('Failed to load completions:', err);
      setCompletionsError(err.message || 'Failed to load completions');
    } finally {
      setCompletionsLoading(false);
    }
  };

  const toggleCompletionSet = (setName) => {
    setExpandedCompletionSets((prev) => ({ ...prev, [setName]: !prev[setName] }));
  };

  const toggleCompletionItem = (itemKey) => {
    setExpandedCompletionItems((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }));
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
      loadGroupedProgress();
    }
  };

  const handleViewChange = (newView) => {
    setView(newView);
    if (newView === 'troupe' && user?.troupeId) {
      loadTroupeProgress(user.troupeId);
    } else if (newView === 'all') {
      loadGroupedProgress(allFilters);
      loadCategoryStats();
      loadOrgData();
      if (['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role)) {
        loadPendingReviewCount();
      }
    } else if (newView === 'gallery') {
      loadGalleryCategories();
      loadGallerySchematics();
    }
  };

  if (loading && !troupeProgress && !groupedData && !detailProgress && gallerySchematics.length === 0) {
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

        {/* All Patrouilles View - Grouped by District/Group */}
        {view === 'all' && groupedData && (
          <div className="all-progress">
            {/* Review CTA for Branche/Admin */}
            {['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role) && (
              <div className={`review-cta-banner ${pendingReviewCount > 0 ? 'has-pending' : ''}`}>
                <div className="review-cta-text">
                  {pendingReviewCount > 0 ? (
                    <>
                      <strong>{pendingReviewCount}</strong> schéma{pendingReviewCount !== 1 ? 's' : ''} en attente de validation
                    </>
                  ) : (
                    <>Aucun schéma en attente de validation</>
                  )}
                </div>
                <Link to="/schematics/review" className="btn-review-schematics">
                  Valider les schémas
                </Link>
              </div>
            )}

            {/* Toolbar: Filters + Search + Sort */}
            <div className="grouped-toolbar">
              <div className="toolbar-filters">
                <div className="filter-group">
                  <label>District</label>
                  <select
                    value={allFilters.districtId}
                    onChange={(e) => {
                      const newFilters = { districtId: e.target.value, groupId: '', search: searchText };
                      setAllFilters({ districtId: e.target.value, groupId: '' });
                      loadGroupedProgress(newFilters);
                    }}
                  >
                    <option value="">All Districts</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Group</label>
                  <select
                    value={allFilters.groupId}
                    onChange={(e) => {
                      const newFilters = { ...allFilters, groupId: e.target.value, search: searchText };
                      setAllFilters(prev => ({ ...prev, groupId: e.target.value }));
                      loadGroupedProgress(newFilters);
                    }}
                  >
                    <option value="">All Groups</option>
                    {(allFilters.districtId
                      ? groups.filter((g) => String(g.districtId) === allFilters.districtId)
                      : groups
                    ).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group search-group">
                  <label>Search</label>
                  <input
                    type="text"
                    placeholder="Search patrouille, group..."
                    value={searchText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchText(val);
                      if (searchDebounce) clearTimeout(searchDebounce);
                      setSearchDebounce(setTimeout(() => {
                        loadGroupedProgress({ ...allFilters, search: val });
                      }, 300));
                    }}
                  />
                </div>
              </div>
              <div className="toolbar-sort">
                <div className="filter-group">
                  <label>Sort by</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      loadGroupedProgress({ ...allFilters, search: searchText }, { sortBy: e.target.value, sortDir });
                    }}
                  >
                    <option value="completion">Completion %</option>
                    <option value="uploadCount">Uploads</option>
                    <option value="district">District</option>
                  </select>
                </div>
                <button
                  className="btn-sort-dir"
                  onClick={() => {
                    const newDir = sortDir === 'desc' ? 'asc' : 'desc';
                    setSortDir(newDir);
                    loadGroupedProgress({ ...allFilters, search: searchText }, { sortBy, sortDir: newDir });
                  }}
                  title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
                >
                  {sortDir === 'desc' ? '↓' : '↑'}
                </button>
                {(allFilters.districtId || allFilters.groupId || searchText) && (
                  <button
                    className="btn-clear-filters"
                    onClick={() => {
                      const newFilters = { districtId: '', groupId: '' };
                      setAllFilters(newFilters);
                      setSearchText('');
                      loadGroupedProgress(newFilters);
                    }}
                  >
                    Clear
                  </button>
                )}
                <button
                  className="btn-check-completed"
                  onClick={openCompletionsModal}
                  title="See which patrouilles completed which categories"
                >
                  Check Completed
                </button>
              </div>
            </div>

            {/* Summary Bar */}
            {groupedData.summary && (
              <div className="progress-summary-bar grouped-summary">
                <span>{groupedData.summary.totalDistricts} district{groupedData.summary.totalDistricts !== 1 ? 's' : ''}</span>
                <span>{groupedData.summary.totalGroups} group{groupedData.summary.totalGroups !== 1 ? 's' : ''}</span>
                <span>{groupedData.summary.totalPatrouilles} patrouille{groupedData.summary.totalPatrouilles !== 1 ? 's' : ''}</span>
                <span>{groupedData.summary.overallCompletion}% overall</span>
                <span>{groupedData.summary.totalPictureCount} picture{groupedData.summary.totalPictureCount !== 1 ? 's' : ''}</span>
                <span>{groupedData.summary.totalWinners} winner{groupedData.summary.totalWinners !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Category Stats Section for Branche/Admin */}
            {categoryStats && categoryStats.sets && (
              <div className="category-stats-section">
                <h3>Uploads by Category</h3>
                <div className="category-stats-accordion">
                  {categoryStats.sets.map((set) => {
                    const isExpanded = expandedCategorySets[set.setName];
                    return (
                      <div key={set.setName} className="category-stats-set">
                        <button
                          type="button"
                          className={`category-stats-header ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleCategorySet(set.setName)}
                        >
                          <span className="set-name">{set.setName}</span>
                          <span className="set-totals">
                            <span className="total-approved">{set.totalApproved} approved</span>
                            {set.totalPending > 0 && (
                              <span className="total-pending">{set.totalPending} pending</span>
                            )}
                            <span className="total-uploads">{set.totalUploads} total</span>
                          </span>
                          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                        </button>
                        {isExpanded && (
                          <div className="category-stats-items">
                            {set.items.map((item) => (
                              <div key={item.id} className="category-stats-item">
                                <span className="item-name">{item.itemName}</span>
                                <div className="item-counts">
                                  <span className="count approved" title="Approved">{item.approved}</span>
                                  {item.pending > 0 && (
                                    <span className="count pending" title="Pending">{item.pending}</span>
                                  )}
                                  {item.rejected > 0 && (
                                    <span className="count rejected" title="Rejected">{item.rejected}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grouped Hierarchy: District > Group > Patrouille */}
            {groupedData.districts.length === 0 ? (
              <div className="empty-state">
                <h3>No Results</h3>
                <p>No patrouilles match your current filters.</p>
              </div>
            ) : (
              <div className="grouped-hierarchy">
                {groupedData.districts.map((district) => (
                  <div key={district.id} className="district-section">
                    <button
                      type="button"
                      className={`district-header ${expandedDistricts.has(district.id) ? 'expanded' : ''}`}
                      onClick={() => {
                        setExpandedDistricts(prev => {
                          const next = new Set(prev);
                          if (next.has(district.id)) next.delete(district.id);
                          else next.add(district.id);
                          return next;
                        });
                      }}
                    >
                      <span className="expand-icon">{expandedDistricts.has(district.id) ? '▼' : '▶'}</span>
                      <span className="district-name">{district.name}</span>
                      <div className="aggregate-stats">
                        <span className="agg-completion">{district.aggregates.completionPercentage}%</span>
                        <span className="agg-pictures">{district.aggregates.pictureCount} pic{district.aggregates.pictureCount !== 1 ? 's' : ''}</span>
                        {district.aggregates.uploadCount > 0 && (
                          <span className="agg-uploads" title="Schémas uploadés (tous statuts)">
                            {district.aggregates.uploadCount} upload{district.aggregates.uploadCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="agg-patrouilles">{district.aggregates.totalPatrouilles} pat.</span>
                        {district.aggregates.winners > 0 && (
                          <span className="agg-winners">{district.aggregates.winners} winner{district.aggregates.winners !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </button>

                    {expandedDistricts.has(district.id) && (
                      <div className="district-content">
                        {district.groups.map((group) => (
                          <div key={group.id} className="group-section">
                            <button
                              type="button"
                              className={`group-header ${expandedGroups.has(group.id) ? 'expanded' : ''}`}
                              onClick={() => {
                                setExpandedGroups(prev => {
                                  const next = new Set(prev);
                                  if (next.has(group.id)) next.delete(group.id);
                                  else next.add(group.id);
                                  return next;
                                });
                              }}
                            >
                              <span className="expand-icon">{expandedGroups.has(group.id) ? '▼' : '▶'}</span>
                              <span className="group-name">{group.name}</span>
                              <div className="aggregate-stats">
                                <span className="agg-completion">{group.aggregates.completionPercentage}%</span>
                                <span className="agg-pictures">{group.aggregates.pictureCount} pic{group.aggregates.pictureCount !== 1 ? 's' : ''}</span>
                                {group.aggregates.uploadCount > 0 && (
                                  <span className="agg-uploads" title="Schémas uploadés (tous statuts)">
                                    {group.aggregates.uploadCount} upload{group.aggregates.uploadCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                <span className="agg-patrouilles">{group.aggregates.totalPatrouilles} pat.</span>
                                {group.aggregates.winners > 0 && (
                                  <span className="agg-winners">{group.aggregates.winners} winner{group.aggregates.winners !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </button>

                            {expandedGroups.has(group.id) && (
                              <div className="group-content">
                                {/* Per-set breakdown */}
                                {group.aggregates.perSet && group.aggregates.perSet.length > 0 && (
                                  <div className="per-set-breakdown">
                                    {group.aggregates.perSet.map((setData) => {
                                      const pct = setData.total > 0 ? Math.round((setData.completed / setData.total) * 100) : 0;
                                      return (
                                        <div key={setData.setName} className="set-chip" title={`${setData.setName}: ${setData.completed}/${setData.total}`}>
                                          <span className="set-chip-name">{setData.setName}</span>
                                          <div className="set-chip-bar">
                                            <div className="set-chip-fill" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="set-chip-fraction">{setData.completed}/{setData.total}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Patrouilles list */}
                                <div className="patrouilles-list">
                                  {group.patrouilles.map((pat, index) => (
                                    <div
                                      key={pat.id}
                                      className={`patrouille-row ${pat.isWinner ? 'winner' : ''}`}
                                      onClick={() => handlePatrouilleClick(pat.id)}
                                    >
                                      <div className="rank">#{index + 1}</div>
                                      <div className="patrouille-info">
                                        <div className="patrouille-name">
                                          {pat.name}
                                          {pat.isWinner && <span className="winner-tag">Winner</span>}
                                        </div>
                                        <div className="patrouille-details">
                                          {pat.troupeName} • {pat.totem}
                                        </div>
                                      </div>
                                      <div className="progress-bar-wrapper">
                                        <div className="progress-bar">
                                          <div
                                            className="progress-fill"
                                            style={{ width: `${pat.completionPercentage}%` }}
                                          />
                                        </div>
                                        <span className="progress-text">
                                          {pat.completionPercentage}%
                                        </span>
                                      </div>
                                      <div className="items-count">
                                        {pat.completedItems}/{pat.totalItems}
                                      </div>
                                      <div className="picture-count" title="Approved pictures">
                                        {pat.pictureCount} pic{pat.pictureCount !== 1 ? 's' : ''}
                                      </div>
                                      {pat.uploadCount > 0 && (
                                        <div className="upload-count" title="Schémas uploadés (tous statuts)">
                                          {pat.uploadCount} upload{pat.uploadCount !== 1 ? 's' : ''}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
                            {item.status === 'SUBMITTED' && ['BRANCHE_ECLAIREURS', 'ADMIN'].includes(user?.role) && item.pictureSet && (
                              <Link
                                to={`/schematics/review?pictureSetId=${item.pictureSet.id}`}
                                className="btn-go-validate"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Validate
                              </Link>
                            )}
                            {user?.role === 'CHEF_TROUPE' &&
                              item.pictureSet &&
                              ['SUBMITTED', 'REJECTED'].includes(item.status) && (
                              <button
                                className="btn-delete-small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm(item);
                                }}
                                title="Delete this schematic"
                              >
                                ×
                              </button>
                            )}
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
            {galleryDisabled && (
              <div className="public-view-disabled-banner">
                La galerie publique des schémas est temporairement désactivée par un administrateur.
              </div>
            )}
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
        {previewPictures.length > 0 && (
          <ImagePreviewer
            pictures={previewPictures}
            initialIndex={previewIndex}
            onClose={closePreview}
            user={user}
          />
        )}

        {/* Completions Modal */}
        <Modal
          isOpen={completionsOpen}
          onClose={() => setCompletionsOpen(false)}
          title="Completed schematics"
          size="large"
          closeOnOverlay
        >
          <Modal.Body>
            {completionsLoading ? (
              <div className="loading-container"><div className="spinner"></div></div>
            ) : completionsError ? (
              <div className="error-message">{completionsError}</div>
            ) : completionsData && completionsData.sets ? (
              <div className="completions-modal">
                <div className="completions-toolbar">
                  <input
                    type="text"
                    className="completions-search"
                    placeholder="Filter by patrouille, troupe, group, district..."
                    value={completionsSearch}
                    onChange={(e) => setCompletionsSearch(e.target.value)}
                  />
                </div>
                {(() => {
                  const q = completionsSearch.trim().toLowerCase();
                  const matches = (c) => !q || [
                    c.patrouilleName, c.totem, c.troupeName, c.groupName, c.districtName,
                  ].some((v) => v && v.toLowerCase().includes(q));
                  const filteredSets = completionsData.sets.map((s) => ({
                    ...s,
                    items: s.items.map((it) => ({
                      ...it,
                      filteredCompletions: it.completions.filter(matches),
                    })),
                  }));
                  const totalShown = filteredSets.reduce(
                    (acc, s) => acc + s.items.reduce((a, i) => a + i.filteredCompletions.length, 0),
                    0
                  );
                  return (
                    <>
                      {q && (
                        <div className="completions-result-count">
                          {totalShown} match{totalShown !== 1 ? 'es' : ''}
                        </div>
                      )}
                      <div className="completions-accordion">
                        {filteredSets.map((set) => {
                          const setOpen = expandedCompletionSets[set.setName];
                          const setShown = set.items.reduce((a, i) => a + i.filteredCompletions.length, 0);
                          if (q && setShown === 0) return null;
                          return (
                            <div key={set.setName} className="completions-set">
                              <button
                                type="button"
                                className={`completions-set-header ${setOpen ? 'expanded' : ''}`}
                                onClick={() => toggleCompletionSet(set.setName)}
                              >
                                <span className="set-name">{set.setName}</span>
                                <span className="set-total">
                                  {q ? `${setShown} shown` : `${set.totalCompletions} completion${set.totalCompletions !== 1 ? 's' : ''}`}
                                </span>
                                <span className="expand-icon">{setOpen ? '▼' : '▶'}</span>
                              </button>
                              {setOpen && (
                                <div className="completions-items">
                                  {set.items.map((item) => {
                                    const itemKey = `${set.setName}::${item.id}`;
                                    const itemOpen = expandedCompletionItems[itemKey];
                                    const list = q ? item.filteredCompletions : item.completions;
                                    if (q && list.length === 0) return null;
                                    return (
                                      <div key={itemKey} className="completions-item">
                                        <button
                                          type="button"
                                          className={`completions-item-header ${itemOpen ? 'expanded' : ''} ${list.length === 0 ? 'empty' : ''}`}
                                          onClick={() => toggleCompletionItem(itemKey)}
                                          disabled={list.length === 0}
                                        >
                                          <span className="item-name">{item.itemName}</span>
                                          <span className="item-count">
                                            {list.length} patrouille{list.length !== 1 ? 's' : ''}
                                          </span>
                                          {list.length > 0 && (
                                            <span className="expand-icon">{itemOpen ? '▼' : '▶'}</span>
                                          )}
                                        </button>
                                        {itemOpen && list.length > 0 && (
                                          <ul className="completions-list">
                                            {list.map((c) => (
                                              <li
                                                key={`${itemKey}-${c.patrouilleId}`}
                                                className="completion-row"
                                                onClick={() => {
                                                  setCompletionsOpen(false);
                                                  handlePatrouilleClick(c.patrouilleId);
                                                }}
                                                title="Open patrouille progress"
                                              >
                                                <span className="completion-patrouille">
                                                  {c.patrouilleName}
                                                  {c.totem && <span className="completion-totem"> · {c.totem}</span>}
                                                </span>
                                                <span className="completion-hierarchy">
                                                  {[c.districtName, c.groupName, c.troupeName].filter(Boolean).join(' › ')}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Actions>
            <button className="secondary" onClick={() => setCompletionsOpen(false)}>Close</button>
          </Modal.Actions>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Schematic?"
          variant="danger"
        >
          <Modal.Body>
            {deleteConfirm && (
              <>
                <p>
                  Are you sure you want to delete the schematic for <strong>{deleteConfirm.itemName}</strong>?
                </p>
                <p className="warning-text">This action cannot be undone.</p>
              </>
            )}
          </Modal.Body>
          <Modal.Actions>
            <button
              className="danger"
              onClick={() => handleDeleteSchematic(deleteConfirm?.pictureSet?.id)}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
            <button
              className="secondary"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleteLoading}
            >
              Cancel
            </button>
          </Modal.Actions>
        </Modal>
      </div>
    </div>
  );
};

export default SchematicProgress;
