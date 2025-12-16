import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { announcementService, pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import SEO from '../components/SEO';
import './Landing.css';

const Landing = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [announcementsData, picturesData] = await Promise.all([
        announcementService.getAll(),
        pictureService.getAll({ status: 'APPROVED', limit: 20 }),
      ]);
      setAnnouncements(announcementsData);
      setHighlights(picturesData.pictures || []);
    } catch (error) {
      console.error('Failed to load landing data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (highlights.length > 0) {
      const timer = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % highlights.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [highlights.length]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % highlights.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + highlights.length) % highlights.length);
  };

  const newsAnnouncements = announcements.filter((a) => a.type === 'NEWS');
  const monthlyUpload = announcements.find((a) => a.type === 'MONTHLY_UPLOAD');
  const upcoming = announcements.find((a) => a.type === 'UPCOMING');

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  // Get current highlight for SEO image
  const currentHighlight = highlights[currentSlide];
  const ogImage = currentHighlight?.pictures?.[0]?.filePath
    ? getImageUrl(currentHighlight.pictures[0].filePath)
    : null;

  return (
    <div className="landing">
      <SEO
        title="Accueil"
        description="Nodus - Plateforme de partage de photos d'installations scoutes des Scouts du Liban. Parcourez des milliers de photos de camps, constructions et schémas."
        image={ogImage}
        url="/"
        keywords={['scouts du liban', 'installations scoutes', 'photos camp', 'froissartage', 'pionnier']}
      />
      {/* Hero Carousel */}
      <section className="hero-carousel" aria-label="Photos en vedette">
        <div className="container">
          <div className="carousel-wrapper">
            {highlights.length > 0 ? (
              <>
                <div className="carousel-content">
                  {highlights[currentSlide].pictures && highlights[currentSlide].pictures.length > 0 ? (
                    <img
                      src={getImageUrl(highlights[currentSlide].pictures[0].filePath)}
                      alt={`Installation scout ${highlights[currentSlide].title || ''} - ${highlights[currentSlide].troupe?.group?.district?.name || ''} ${highlights[currentSlide].troupe?.group?.name || ''} - Scouts du Liban`}
                      className="carousel-image"
                    />
                  ) : (
                    <div className="carousel-placeholder" role="img" aria-label="Photo en vedette">
                      <span aria-hidden="true">📸</span>
                    </div>
                  )}
                  <div className="carousel-overlay">
                    <h2>{highlights[currentSlide].title}</h2>
                    <p>{highlights[currentSlide].description || 'Installation scoute'}</p>
                    <Link to={`/picture/${highlights[currentSlide].id}`} className="btn-view">
                      Voir les détails
                    </Link>
                  </div>
                </div>
                <button className="carousel-btn carousel-btn-prev" onClick={prevSlide} aria-label="Photo précédente">
                  ‹
                </button>
                <button className="carousel-btn carousel-btn-next" onClick={nextSlide} aria-label="Photo suivante">
                  ›
                </button>
                <nav className="carousel-indicators" aria-label="Navigation du carousel">
                  {highlights.map((_, index) => (
                    <button
                      key={index}
                      className={`indicator ${index === currentSlide ? 'active' : ''}`}
                      onClick={() => setCurrentSlide(index)}
                      aria-label={`Photo ${index + 1}`}
                      aria-current={index === currentSlide ? 'true' : 'false'}
                    />
                  ))}
                </nav>
              </>
            ) : (
              <div className="carousel-empty">
                <h2>🏕️ Bienvenue sur Nodus</h2>
                <p>Installations, Noeuds et plus</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Announcements */}
      <section className="announcements">
        <div className="container">
          <div className="announcement-grid">
            {/* Monthly Upload */}
            {monthlyUpload && (
              <div className="announcement-card featured">
                <div className="announcement-icon">📅</div>
                <h3>This Month's Challenge</h3>
                <h4>{monthlyUpload.title}</h4>
                <p>{monthlyUpload.content}</p>
                <Link to="/upload" className="btn-upload primary">
                  Upload Now
                </Link>
              </div>
            )}

            {/* Upcoming */}
            {upcoming && (
              <div className="announcement-card">
                <div className="announcement-icon">🔜</div>
                <h3>Coming Soon</h3>
                <h4>{upcoming.title}</h4>
                <p>{upcoming.content}</p>
              </div>
            )}

            {/* News */}
            {newsAnnouncements.slice(0, 2).map((news) => (
              <div key={news.id} className="announcement-card">
                <div className="announcement-icon">📢</div>
                <h3>News</h3>
                <h4>{news.title}</h4>
                <p>{news.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="cta">
        <div className="container">
          <h2>Explore Scout Installations</h2>
          <p>Browse through our collection of camp installations and schematics from scouts around the region</p>
          <Link to="/browse" className="btn-browse primary">
            Browse Gallery
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Landing;
