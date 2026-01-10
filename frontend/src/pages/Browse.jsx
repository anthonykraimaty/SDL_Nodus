import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, getImageUrl } from '../config/api';
import SEO from '../components/SEO';
import './Browse.css';

// Normalize text by removing accents (é->e, â->a, etc.)
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const Browse = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('photos'); // 'default', 'name', 'photos'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'

  useEffect(() => {
    loadCategories();
  }, [typeFilter]);

  const loadCategories = async () => {
    try {
      setLoading(true);

      // Build query params for filtering
      const params = new URLSearchParams();
      if (typeFilter) params.append('type', typeFilter);

      const queryString = params.toString();
      const url = `${API_URL}/api/categories${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to load categories');
      }

      const data = await response.json();
      // Only show parent categories (not subcategories) and exclude hidden ones
      const parentCategories = data.filter(cat => !cat.parentId && !cat.isHiddenFromBrowse);
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

  // Filter and sort categories
  const getFilteredAndSortedCategories = () => {
    let result = categories;

    // Filter by search term (accent-insensitive)
    if (searchTerm) {
      const normalizedSearch = normalizeText(searchTerm);
      result = result.filter(cat =>
        normalizeText(cat.name).includes(normalizedSearch) ||
        normalizeText(cat.description).includes(normalizedSearch)
      );
    }

    // Sort categories
    if (sortBy === 'name') {
      result = [...result].sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    } else if (sortBy === 'photos') {
      result = [...result].sort((a, b) => {
        const comparison = (a._count?.pictures || 0) - (b._count?.pictures || 0);
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }
    // 'default' keeps the original displayOrder from API (admin-configured order)

    return result;
  };

  const filteredCategories = getFilteredAndSortedCategories();

  const seoTitle = 'Les Installations Scoutes';
  const seoDescription = 'Parcourez toutes les catégories d\'installations scoutes: mâts, tentes, ponts, tours et plus. Photos et schémas des Scouts du Liban.';

  return (
    <div className="browse">
      <SEO
        title={seoTitle}
        description={seoDescription}
        url="/browse"
        keywords={['installations scoutes', 'photos camp', 'constructions']}
      />
      <div className="container">
        <header className="browse-header">
          <h1>Les Installations</h1>
          <p className="subtitle">
            Explorez les installations scoutes organisées par catégorie
          </p>
        </header>

        <div className="browse-content">
          {/* Search Bar */}
          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="clear-search"
                onClick={() => setSearchTerm('')}
                aria-label="Effacer la recherche"
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
              className={`sort-btn ${sortBy === 'default' ? 'active' : ''}`}
              onClick={() => setSortBy('default')}
            >
              Défaut
            </button>
            <button
              className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
              onClick={() => {
                if (sortBy === 'name') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy('name');
                  setSortOrder('asc');
                }
              }}
            >
              Nom {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              className={`sort-btn ${sortBy === 'photos' ? 'active' : ''}`}
              onClick={() => {
                if (sortBy === 'photos') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy('photos');
                  setSortOrder('desc'); // Default to most photos first
                }
              }}
            >
              Photos {sortBy === 'photos' && (sortOrder === 'asc' ? '↑' : '↓')}
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
                {searchTerm
                  ? 'Aucune catégorie trouvée pour cette recherche'
                  : typeFilter === 'SCHEMATIC'
                    ? 'Aucune catégorie de schémas disponible'
                    : 'Aucune catégorie trouvée'}
              </p>
            </div>
          ) : (
            <section className="categories-grid" aria-label="Categories d'installations">
              {filteredCategories.map((category) => (
                <article key={category.id} className="category-card-wrapper">
                  <Link
                    to={`/category/${category.id}`}
                    className="category-card"
                    aria-label={`Voir les installations de type ${category.name}`}
                  >
                    <figure className="category-image">
                      {category.thumbnailPictures && category.thumbnailPictures.length > 0 ? (
                        <div className={`thumbnail-grid thumbnails-${Math.min(category.thumbnailPictures.length, 4)}`}>
                          {category.thumbnailPictures.slice(0, 4).map((pic, idx) => (
                            <div key={pic.id} className="thumbnail-cell">
                              <img
                                src={getImageUrl(pic.filePath)}
                                alt={`${category.name} - aperçu ${idx + 1}`}
                                loading="lazy"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="placeholder-image" role="img" aria-label={`Catégorie ${category.name}`}>
                          <div className="placeholder-content">
                            <svg className="placeholder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <span className="placeholder-text">Pas encore d'images</span>
                          </div>
                        </div>
                      )}
                      <figcaption className="category-overlay">
                        <span className="category-count">
                          {category._count?.pictures || 0} {category._count?.pictures === 1 ? 'photo' : 'photos'}
                        </span>
                      </figcaption>
                    </figure>
                    <div className="category-info">
                      <h2>{category.name}</h2>
                      {category.description && (
                        <p className="category-desc">{category.description}</p>
                      )}
                    </div>
                  </Link>
                </article>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default Browse;
