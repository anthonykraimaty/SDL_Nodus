import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { pictureService, categoryService, organizationService } from '../services/api';
import './Browse.css';

const Browse = () => {
  const [pictures, setPictures] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filters, setFilters] = useState({
    type: '',
    categoryId: '',
    groupId: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadFiltersData();
  }, []);

  useEffect(() => {
    loadPictures();
  }, [filters, page]);

  const loadFiltersData = async () => {
    try {
      const [groupsData, categoriesData] = await Promise.all([
        organizationService.getGroups(),
        categoryService.getAll(),
      ]);
      setGroups(groupsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load filter data:', error);
    }
  };

  const loadPictures = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 12, ...filters, status: 'APPROVED' };
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null) delete params[key];
      });

      const data = await pictureService.getAll(params);
      setPictures(data.pictures || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to load pictures:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      type: '',
      categoryId: '',
      groupId: '',
      startDate: '',
      endDate: '',
    });
    setPage(1);
  };

  // Group pictures count
  const getGroupPictureCount = (groupId) => {
    return pictures.filter(p => p.troupe?.groupId === groupId).length;
  };

  return (
    <div className="browse">
      <div className="container">
        <div className="browse-layout">
          {/* Sidebar Filters */}
          <aside className="filters-sidebar">
            <div className="filters-header">
              <h3>Filters</h3>
              <button onClick={clearFilters} className="btn-clear">
                Clear All
              </button>
            </div>

            {/* Type Filter */}
            <div className="filter-section">
              <h4>Type</h4>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
              >
                <option value="">All Types</option>
                <option value="INSTALLATION_PHOTO">Installation Photos</option>
                <option value="SCHEMATIC">Schematics</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="filter-section">
              <h4>Category</h4>
              <select
                value={filters.categoryId}
                onChange={(e) => handleFilterChange('categoryId', e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category._count?.pictures || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Group Filter with Counts */}
            <div className="filter-section">
              <h4>Groups</h4>
              <div className="group-list">
                <button
                  className={`group-item ${!filters.groupId ? 'active' : ''}`}
                  onClick={() => handleFilterChange('groupId', '')}
                >
                  <span>All Groups</span>
                  <span className="count">{pictures.length}</span>
                </button>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    className={`group-item ${filters.groupId === String(group.id) ? 'active' : ''}`}
                    onClick={() => handleFilterChange('groupId', String(group.id))}
                  >
                    <span>{group.name}</span>
                    <span className="count">{getGroupPictureCount(group.id)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Filter */}
            <div className="filter-section">
              <h4>Date Range</h4>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                placeholder="Start Date"
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                placeholder="End Date"
              />
            </div>
          </aside>

          {/* Main Content */}
          <div className="browse-content">
            <div className="browse-header">
              <h2>Browse Installations</h2>
              <p className="result-count">
                {loading ? 'Loading...' : `${pictures.length} pictures found`}
              </p>
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
              </div>
            ) : pictures.length === 0 ? (
              <div className="empty-state">
                <p>No pictures found matching your filters</p>
                <button onClick={clearFilters} className="primary">
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                <div className="pictures-grid">
                  {pictures.map((picture) => (
                    <Link
                      key={picture.id}
                      to={`/picture/${picture.id}`}
                      className="picture-card"
                    >
                      <div className="picture-image">
                        <img
                          src={`http://localhost:3001/${picture.pictures?.[0]?.filePath || 'placeholder.jpg'}`}
                          alt={picture.title}
                        />
                        <div className="picture-type">
                          {picture.type === 'INSTALLATION_PHOTO' ? '📸' : '📐'}
                        </div>
                      </div>
                      <div className="picture-info">
                        <h3>{picture.title}</h3>
                        <p className="picture-group">
                          {picture.troupe?.group?.name}
                        </p>
                        {picture.category && (
                          <span className="picture-category">
                            {picture.category.name}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </button>
                    <span className="page-info">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Browse;
