import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { announcementService, pictureService } from '../services/api';
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

  return (
    <div className="landing">
      {/* Hero Carousel */}
      <section className="hero-carousel">
        <div className="container">
          <div className="carousel-wrapper">
            {highlights.length > 0 ? (
              <>
                <div className="carousel-content">
                  {highlights[currentSlide].pictures && highlights[currentSlide].pictures.length > 0 ? (
                    <img
                      src={`http://localhost:3001/${highlights[currentSlide].pictures[0].filePath}`}
                      alt={highlights[currentSlide].title}
                      className="carousel-image"
                    />
                  ) : (
                    <div className="carousel-placeholder">
                      <span>📸</span>
                    </div>
                  )}
                  <div className="carousel-overlay">
                    <h2>{highlights[currentSlide].title}</h2>
                    <p>{highlights[currentSlide].description || 'No description available'}</p>
                    <Link to={`/picture/${highlights[currentSlide].id}`} className="btn-view">
                      View Details
                    </Link>
                  </div>
                </div>
                <button className="carousel-btn carousel-btn-prev" onClick={prevSlide}>
                  ‹
                </button>
                <button className="carousel-btn carousel-btn-next" onClick={nextSlide}>
                  ›
                </button>
                <div className="carousel-indicators">
                  {highlights.map((_, index) => (
                    <button
                      key={index}
                      className={`indicator ${index === currentSlide ? 'active' : ''}`}
                      onClick={() => setCurrentSlide(index)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="carousel-empty">
                <h2>🏕️ Welcome to Nodus</h2>
                <p>Installation, Noeuds et plus</p>
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
