import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { categoryService } from '../services/api';
import './Browse.css';

const Browse = () => {
  const [categories, setCategories] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Filter states
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadCategories();
  }, [typeFilter, districtFilter, groupFilter, dateFromFilter, dateToFilter]);

  const loadInitialData = async () => {
    try {
      setLoadingFilters(true);

      // Load districts for filter
      const districtsResponse = await fetch('http://localhost:3001/api/districts');
      if (districtsResponse.ok) {
        const districtsData = await districtsResponse.json();
        setDistricts(Array.isArray(districtsData) ? districtsData : []);
      } else {
        setDistricts([]);
      }

      // Load groups for filter
      const groupsResponse = await fetch('http://localhost:3001/api/groups');
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        setGroups(Array.isArray(groupsData) ? groupsData : []);
      } else {
        setGroups([]);
      }

      setLoadingFilters(false);

      // Load categories
      await loadCategories();
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setDistricts([]);
      setGroups([]);
      setLoadingFilters(false);
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      setLoading(true);

      // Build query params for filtering
      const params = new URLSearchParams();
      if (typeFilter) params.append('type', typeFilter);
      if (districtFilter) params.append('districtId', districtFilter);
      if (groupFilter) params.append('groupId', groupFilter);
      if (dateFromFilter) params.append('dateFrom', dateFromFilter);
      if (dateToFilter) params.append('dateTo', dateToFilter);

      const queryString = params.toString();
      const url = `http://localhost:3001/api/categories${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to load categories');
      }

      const data = await response.json();
      // Only show parent categories (not subcategories)
      const parentCategories = data.filter(cat => !cat.parentId);
      setCategories(parentCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeFilter = (type) => {
    setTypeFilter(type);
  };

  const handleClearFilters = () => {
    setDistrictFilter('');
    setGroupFilter('');
    setDateFromFilter('');
    setDateToFilter('');
  };

  const hasActiveFilters = districtFilter || groupFilter || dateFromFilter || dateToFilter;

  // Filter categories based on search term (client-side for category name/description)
  const getFilteredCategories = () => {
    if (!searchTerm) return categories;
    return categories.filter(cat =>
      cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredCategories = getFilteredCategories();

  // Filter groups based on selected district
  const availableGroups = districtFilter
    ? groups.filter(g => g.districtId === parseInt(districtFilter))
    : groups;

  return (
    <div className="browse">
      <div className="container">
        <div className="browse-header">
          <h1>Browse Installations</h1>
          <p className="subtitle">
            Explore scout installations organized by category
          </p>
        </div>

        <div className="browse-layout">
          {/* Main Content */}
          <div className="browse-main">
            {/* Search Bar */}
            <div className="search-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Filters */}
            <div className="type-filters">
              <button
                className={`type-filter ${typeFilter === '' ? 'active' : ''}`}
                onClick={() => handleTypeFilter('')}
              >
                All
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
                📐 Schematics
              </button>
            </div>

            {/* Grid Display */}
            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="empty-state">
                <p>
                  {searchTerm || hasActiveFilters
                    ? 'No categories found matching your search and filters'
                    : 'No categories found'}
                </p>
              </div>
            ) : (
              <div className="categories-grid">
                {filteredCategories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/category/${category.id}?${new URLSearchParams({
                      ...(districtFilter && { districtId: districtFilter }),
                      ...(groupFilter && { groupId: groupFilter }),
                      ...(dateFromFilter && { dateFrom: dateFromFilter }),
                      ...(dateToFilter && { dateTo: dateToFilter }),
                    }).toString()}`}
                    className="category-card"
                  >
                    <div className="category-image">
                      {category.mainPicture ? (
                        <img
                          src={`http://localhost:3001/${category.mainPicture.filePath}`}
                          alt={category.name}
                        />
                      ) : (
                        <div className="placeholder-image">
                          <span className="placeholder-icon">
                            {category.type === 'INSTALLATION_PHOTO' ? '📸' : '📐'}
                          </span>
                        </div>
                      )}
                      <div className="category-overlay">
                        <div className="category-count">
                          {category._count?.pictureSets || 0} {category._count?.pictureSets === 1 ? 'set' : 'sets'}
                        </div>
                      </div>
                    </div>
                    <div className="category-info">
                      <h3>{category.name}</h3>
                      {category.description && (
                        <p className="category-desc">{category.description}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Filter Sidebar */}
          <div className={`filter-sidebar ${showFilters ? 'show' : ''}`}>
            <div className="filter-header">
              <h3>Filters</h3>
              {hasActiveFilters && (
                <button className="clear-filters" onClick={handleClearFilters}>
                  Clear All
                </button>
              )}
            </div>

            <div className="filter-section">
              <label className="filter-label">District</label>
              <select
                className="filter-select"
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setGroupFilter(''); // Reset group when district changes
                }}
              >
                <option value="">All Districts</option>
                {districts.map(district => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-section">
              <label className="filter-label">Group</label>
              <select
                className="filter-select"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                disabled={!districtFilter && groups.length > 20}
              >
                <option value="">
                  {districtFilter ? 'All Groups' : 'Select a district first'}
                </option>
                {availableGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-section">
              <label className="filter-label">Date Range</label>
              <div className="date-range">
                <input
                  type="date"
                  className="filter-date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  placeholder="From"
                />
                <span className="date-separator">to</span>
                <input
                  type="date"
                  className="filter-date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  placeholder="To"
                />
              </div>
            </div>
          </div>

          {/* Mobile Filter Toggle */}
          <button
            className="filter-toggle-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? '✕ Close Filters' : '🔍 Show Filters'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Browse;
