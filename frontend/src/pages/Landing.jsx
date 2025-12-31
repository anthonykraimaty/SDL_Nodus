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
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  // Parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-rotate gallery
  useEffect(() => {
    if (highlights.length > 0) {
      const timer = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % Math.min(highlights.length, 6));
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [highlights.length]);

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

  const newsAnnouncements = announcements.filter((a) => a.type === 'NEWS');
  const monthlyUpload = announcements.find((a) => a.type === 'MONTHLY_UPLOAD');
  const upcoming = announcements.find((a) => a.type === 'UPCOMING');

  if (loading) {
    return (
      <div className="landing-loader">
        <div className="loader-content">
          <div className="loader-logo">
            <span className="loader-letter" style={{ '--i': 0 }}>N</span>
            <span className="loader-letter" style={{ '--i': 1 }}>O</span>
            <span className="loader-letter" style={{ '--i': 2 }}>D</span>
            <span className="loader-letter" style={{ '--i': 3 }}>U</span>
            <span className="loader-letter" style={{ '--i': 4 }}>S</span>
          </div>
          <div className="loader-bar">
            <div className="loader-bar-fill"></div>
          </div>
        </div>
      </div>
    );
  }

  const currentHighlight = highlights[currentSlide];
  const ogImage = currentHighlight?.pictures?.[0]?.filePath
    ? getImageUrl(currentHighlight.pictures[0].filePath)
    : null;

  return (
    <div className="landing-modern">
      <SEO
        title="Accueil"
        description="Nodus - Plateforme de partage de photos d'installations scoutes des Scouts du Liban. Parcourez des milliers de photos de camps, constructions et schémas."
        image={ogImage}
        url="/"
        keywords={['les scouts du liban', 'installations scoutes', 'photos camp', 'froissartage', 'pionnier']}
      />

      {/* Hero Section - Full Screen */}
      <section id="hero" className="hero-section">
        <div className="hero-background">
          <div
            className="hero-gradient"
            style={{ transform: `translateY(${scrollY * 0.3}px)` }}
          ></div>
          <div className="hero-pattern"></div>
          <div className="hero-particles">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="particle" style={{ '--i': i }}></div>
            ))}
          </div>
          {/* Animated rope decorations */}
          <div className="hero-ropes">
            {/* Bowline Knot - Top Left */}
            <svg className="rope-knot rope-knot-1" viewBox="0 0 100 100" fill="none">
              <path className="rope-bowline" d="M30 80 C 30 60, 50 60, 50 40 C 50 20, 70 20, 70 40 C 70 55, 55 55, 55 40 C 55 30, 45 30, 45 40 L 45 80" stroke="rgba(212, 165, 116, 0.4)" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <circle className="rope-loop" cx="50" cy="40" r="12" stroke="rgba(212, 165, 116, 0.3)" strokeWidth="2" fill="none"/>
            </svg>

            {/* Figure 8 Knot - Top Right */}
            <svg className="rope-knot rope-knot-2" viewBox="0 0 100 100" fill="none">
              <path className="rope-figure8" d="M50 10 C 25 10, 25 45, 50 45 C 75 45, 75 80, 50 80 C 25 80, 25 45, 50 45 C 75 45, 75 10, 50 10" stroke="rgba(212, 165, 116, 0.45)" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
            </svg>

            {/* Square Lashing - Bottom Left */}
            <svg className="rope-knot rope-knot-3" viewBox="0 0 100 100" fill="none">
              <line className="rope-pole" x1="50" y1="10" x2="50" y2="90" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="6" strokeLinecap="round"/>
              <line className="rope-pole" x1="10" y1="50" x2="90" y2="50" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="6" strokeLinecap="round"/>
              <path className="rope-lashing" d="M35 35 L65 35 L65 65 L35 65 Z" stroke="rgba(212, 165, 116, 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <path className="rope-lashing-cross" d="M35 35 L65 65 M65 35 L35 65" stroke="rgba(212, 165, 116, 0.35)" strokeWidth="2" strokeLinecap="round"/>
            </svg>

            {/* Clove Hitch - Bottom Right */}
            <svg className="rope-knot rope-knot-4" viewBox="0 0 100 100" fill="none">
              <line className="rope-pole" x1="50" y1="15" x2="50" y2="85" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="8" strokeLinecap="round"/>
              <path className="rope-clove" d="M20 30 C 35 30, 35 45, 50 45 C 65 45, 65 30, 80 30 M20 55 C 35 55, 35 70, 50 70 C 65 70, 65 55, 80 55" stroke="rgba(212, 165, 116, 0.45)" strokeWidth="3" strokeLinecap="round" fill="none"/>
            </svg>

            {/* Overhand Knot - Center Top */}
            <svg className="rope-knot rope-knot-5" viewBox="0 0 100 100" fill="none">
              <path className="rope-overhand" d="M20 50 C 35 30, 50 70, 50 50 C 50 30, 65 70, 80 50" stroke="rgba(212, 165, 116, 0.35)" strokeWidth="3" strokeLinecap="round" fill="none"/>
            </svg>

            {/* Sheet Bend - Center Bottom */}
            <svg className="rope-knot rope-knot-6" viewBox="0 0 120 100" fill="none">
              <path className="rope-sheetbend-loop" d="M30 30 C 30 60, 60 60, 60 30 C 60 20, 30 20, 30 30" stroke="rgba(212, 165, 116, 0.3)" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path className="rope-sheetbend-line" d="M90 70 C 70 70, 50 50, 45 40 C 40 30, 50 25, 60 35 C 70 45, 60 55, 50 55 L 20 55" stroke="rgba(212, 165, 116, 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>

            {/* Reef/Square Knot - Far Left */}
            <svg className="rope-knot rope-knot-7" viewBox="0 0 100 80" fill="none">
              <path className="rope-reef1" d="M10 40 C 25 40, 35 25, 50 25 C 65 25, 75 40, 90 40" stroke="rgba(212, 165, 116, 0.4)" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path className="rope-reef2" d="M10 40 C 25 40, 35 55, 50 55 C 65 55, 75 40, 90 40" stroke="rgba(212, 165, 116, 0.35)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>

            {/* Tripod Lashing - Far Right */}
            <svg className="rope-knot rope-knot-8" viewBox="0 0 100 100" fill="none">
              <line className="rope-pole" x1="30" y1="90" x2="50" y2="20" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="4" strokeLinecap="round"/>
              <line className="rope-pole" x1="50" y1="20" x2="70" y2="90" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="4" strokeLinecap="round"/>
              <line className="rope-pole" x1="50" y1="20" x2="50" y2="90" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="4" strokeLinecap="round"/>
              <ellipse className="rope-tripod-wrap" cx="50" cy="35" rx="18" ry="8" stroke="rgba(212, 165, 116, 0.4)" strokeWidth="2" fill="none"/>
              <ellipse className="rope-tripod-wrap rope-tripod-wrap-2" cx="50" cy="45" rx="20" ry="8" stroke="rgba(212, 165, 116, 0.35)" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          {highlights.length > 0 && highlights[0]?.pictures?.[0] && (
            <img
              src={getImageUrl(highlights[0].pictures[0].filePath)}
              alt=""
              className="hero-bg-image"
              style={{ transform: `translateY(${scrollY * 0.5}px) scale(${1 + scrollY * 0.0005})` }}
            />
          )}
        </div>
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-badge">
              <span>Scouts du Liban</span>
            </div>
            <h1 className="hero-title">
              <span className="title-letter" style={{ '--delay': '0s' }}>N</span>
              <span className="title-letter" style={{ '--delay': '0.1s' }}>O</span>
              <span className="title-letter" style={{ '--delay': '0.2s' }}>D</span>
              <span className="title-letter" style={{ '--delay': '0.3s' }}>U</span>
              <span className="title-letter" style={{ '--delay': '0.4s' }}>S</span>
            </h1>
            <p className="hero-subtitle">
              <span className="subtitle-line">Lier les compétences.</span>
              <span className="subtitle-line">Archiver nos installations.</span>
            </p>
            
            <div className="hero-cta">
              <Link to="/browse" className="btn-hero-primary">
                <span>Explorer les Installations</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
              <a href="#about" className="btn-hero-secondary">
                <span>Découvrir</span>
              </a>
            </div>
          </div>
         
        </div>
      </section>

      {/* About Section - Origine du nom */}
      <section id="about" className="about-section">
        <div className="container">
          <div className="about-content">
            <div className="about-header">
              <span className="section-tag animate-tag">Origine du nom</span>
              <h2 className="section-title">Pourquoi Nodus ?</h2>
              <div className="title-underline"></div>
            </div>
            <div className="about-intro">
              <div className="about-quote">
                <svg className="quote-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                </svg>
                <blockquote>
                  <strong>Nodus</strong> vient du latin et signifie "nœud". Le nœud est
                  l'élément fondamental de toute installation scoute — sans lui, aucune
                  construction ne tient.
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Le Coin de Patrouille Section */}
      <section id="history" className="history-section">
        <div className="container">
          <div className="history-content">
            <div className="history-header">
              <span className="section-tag">Vie de Camp</span>
              <h2 className="section-title">Le Coin de Patrouille</h2>
              <div className="title-underline"></div>
              <p className="history-intro">
                Le coin de patrouille est bien plus qu'un simple espace au camp ou au local.
                C'est le cœur vivant de la patrouille, là où se construit l'esprit scout.
              </p>
            </div>
            <div className="heritage-grid">
              <div className="heritage-item" style={{ '--delay': '0s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                    <line x1="4" y1="22" x2="4" y2="15"/>
                  </svg>
                </div>
                <h4>Un espace d'identité</h4>
                <p>
                  Chaque coin de patrouille reflète l'âme de la patrouille : son <strong>totem</strong>,
                  son <strong>fanion</strong>, ses <strong>couleurs</strong> et son <strong>histoire</strong>.
                </p>
              </div>
              <div className="heritage-item" style={{ '--delay': '0.15s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <h4>Un lieu de responsabilité</h4>
                <p>
                  Les scouts y apprennent à <strong>s'organiser</strong>, à gérer le matériel,
                  à respecter les règles de vie commune et à prendre soin de leur espace.
                </p>
              </div>
              <div className="heritage-item" style={{ '--delay': '0.3s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <h4>Un terrain d'apprentissage</h4>
                <p>
                  <strong>Construction</strong>, installation, rangement, décoration : le coin de patrouille
                  développe l'habileté manuelle et le sens pratique.
                </p>
              </div>
              <div className="heritage-item" style={{ '--delay': '0.45s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h4>Un point de rassemblement</h4>
                <p>
                  C'est là que la patrouille se <strong>réunit</strong>, échange, rit, prie
                  et <strong>renforce ses liens</strong> fraternels.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Heritage Section - Le Froissartage */}
      <section id="heritage" className="heritage-section">
        <div className="container">
          <div className="heritage-content">
            <div className="heritage-main">
              <span className="section-tag">Le Savoir-Faire</span>
              <h2 className="section-title">L'Art de L'installation</h2>
              <div className="title-underline" style={{ margin: '0 0 2rem 0' }}></div>
              
            </div>
            <div className="heritage-grid">
              <div className="heritage-item" style={{ '--delay': '0s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <h4>Les Brelages</h4>
                <p>
                  <strong>Brelage carré</strong> pour les angles droits, <strong>diagonal</strong>
                  pour les croisements, et <strong>en huit</strong> pour les assemblages parallèles.
                  Chaque technique garantit solidité et durabilité.
                </p>
              </div>
              <div className="heritage-item" style={{ '--delay': '0.15s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
                    <path d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                  </svg>
                </div>
                <h4>Les Nœuds Essentiels</h4>
                <p>
                  Le <strong>nœud de chaise</strong> (bowline), le <strong>demi-clé</strong> (clove hitch),
                  et le <strong>nœud de cabestan</strong>. Maîtriser ces nœuds est la base de tout
                  projet de pionniérisme.
                </p>
              </div>
              <div className="heritage-item" style={{ '--delay': '0.3s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <h4>Structures de Base</h4>
                <p>
                  L'<strong>A-Frame</strong> (chevalet), le <strong>tréteau</strong> pour les ponts,
                  et le <strong>trépied</strong> pour les bases stables. Ces éléments modulaires
                  permettent de construire des projets complexes.
                </p>
              </div>
              <div className="heritage-item" style={{ '--delay': '0.45s' }}>
                <div className="heritage-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <h4>Projets Pratiques</h4>
                <p>
                  Des <strong>tables de camp</strong> aux <strong>tours d'observation</strong>,
                  des <strong>portiques</strong> aux <strong>ponts suspendus</strong>. Chaque
                  construction répond à un besoin réel du camp.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section id="values" className="values-section">
        <div className="container">
          <div className="values-header">
            <span className="section-tag">Nos Valeurs</span>
            <h2 className="section-title">L'Esprit Scout</h2>
            <div className="title-underline"></div>
            <p className="values-motto">"Toujours Prêt" — كن مستعداً — Be Prepared</p>
          </div>
          <div className="values-grid">
            <div className="value-card" style={{ '--delay': '0s' }}>
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <div className="value-number">01</div>
              <h3>Débrouillardise</h3>
              <p>
                Apprendre à utiliser ses mains et son esprit pour créer, réparer et
                innover avec les ressources disponibles dans la nature.
              </p>
            </div>
            <div className="value-card" style={{ '--delay': '0.1s' }}>
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div className="value-number">02</div>
              <h3>Travail d'Équipe</h3>
              <p>
                Chaque installation est le fruit d'une collaboration. Ensemble,
                nous construisons bien plus que des structures — nous forgeons des liens.
              </p>
            </div>
            <div className="value-card" style={{ '--delay': '0.2s' }}>
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="M12 8v4m0 4h.01"/>
                </svg>
              </div>
              <div className="value-number">03</div>
              <h3>Respect de la Nature</h3>
              <p>
                Utiliser les ressources naturelles de manière responsable, sans laisser
                de trace, en parfaite harmonie avec l'environnement.
              </p>
            </div>
            <div className="value-card" style={{ '--delay': '0.3s' }}>
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  <line x1="12" y1="6" x2="12" y2="10"/>
                  <line x1="12" y1="14" x2="12" y2="14"/>
                </svg>
              </div>
              <div className="value-number">04</div>
              <h3>Transmission</h3>
              <p>
                Partager nos connaissances et notre passion pour que ces traditions
                perdurent à travers les générations futures.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <div className="features-header">
            <span className="section-tag">Fonctionnalités</span>
            <h2 className="section-title">Ce que nous offrons</h2>
            <div className="title-underline"></div>
          </div>
          <div className="features-grid">
            <div className="feature-card" style={{ '--delay': '0s' }}>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <h3>Galerie Photos</h3>
              <p>Explorez des milliers de photos d'installations scoutes, organisées par catégorie et groupes.</p>
              <div className="feature-link">
                <Link to="/browse">Explorer</Link>
              </div>
            </div>
            <div className="feature-card" style={{ '--delay': '0.1s' }}>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <h3>Schémas Techniques</h3>
              <p>Accédez à une collection de schémas détaillés pour reproduire les techniques traditionnelles.</p>
              <div className="feature-link">
                <Link to="/browse?type=SCHEMATIC">Voir les schémas</Link>
              </div>
            </div>
            <div className="feature-card" style={{ '--delay': '0.2s' }}>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3>Communauté Active</h3>
              <p>Un site enrichi par nos groupes scouts et leurs installations à travers le Liban.</p>
              
            </div>
           
          </div>
        </div>
      </section>

      {/* Gallery Preview Section */}
      {highlights.length > 0 && (
        <section id="gallery" className="gallery-section">
          <div className="container">
            <div className="gallery-header">
              <span className="section-tag">Aperçu</span>
              <h2 className="section-title">Dernières Installations</h2>
              <div className="title-underline"></div>
            </div>
            <div className="gallery-showcase">
              <div className="gallery-main">
                {highlights.slice(0, 6).map((item, index) => (
                  <div
                    key={item.id}
                    className={`gallery-slide ${index === currentSlide ? 'active' : ''}`}
                  >
                    {item.pictures && item.pictures[0] && (
                      <img
                        src={getImageUrl(item.pictures[0].filePath)}
                        alt={item.title || 'Installation scout'}
                      />
                    )}
                    <div className="gallery-slide-info">
                      <h4>{item.title || 'Installation'}</h4>
                      <p>{item.troupe?.group?.name || ''}</p>
                    </div>
                  </div>
                ))}
                <div className="gallery-progress">
                  <div
                    className="gallery-progress-bar"
                    style={{ width: `${((currentSlide + 1) / Math.min(highlights.length, 6)) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="gallery-thumbnails">
                {highlights.slice(0, 6).map((item, index) => (
                  <button
                    key={item.id}
                    className={`gallery-thumb ${index === currentSlide ? 'active' : ''}`}
                    onClick={() => setCurrentSlide(index)}
                  >
                    {item.pictures && item.pictures[0] && (
                      <img
                        src={getImageUrl(item.pictures[0].filePath)}
                        alt=""
                      />
                    )}
                    <div className="thumb-overlay">
                      <span>{index + 1}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="gallery-cta">
              <Link to="/browse" className="btn-gallery">
                Voir toute la galerie
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Announcements Section */}
      {(monthlyUpload || upcoming || newsAnnouncements.length > 0) && (
        <section id="announcements" className="announcements-section">
          <div className="container">
            <div className="announcements-header">
              <span className="section-tag">Actualités</span>
              <h2 className="section-title">Annonces</h2>
              <div className="title-underline"></div>
            </div>
            <div className="announcements-grid">
              {monthlyUpload && (
                <div className="announcement-card featured" style={{ '--delay': '0s' }}>
                  <div className="announcement-badge">Ce mois</div>
                  <div className="announcement-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <h3>{monthlyUpload.title}</h3>
                  <p>{monthlyUpload.content}</p>
                  <Link to="/upload" className="announcement-link">
                    Participer maintenant
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </Link>
                </div>
              )}
              {upcoming && (
                <div className="announcement-card" style={{ '--delay': '0.1s' }}>
                  <div className="announcement-badge upcoming">Bientôt</div>
                  <div className="announcement-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <h3>{upcoming.title}</h3>
                  <p>{upcoming.content}</p>
                </div>
              )}
              {newsAnnouncements.slice(0, 2).map((news, index) => (
                <div
                  key={news.id}
                  className="announcement-card"
                  style={{ '--delay': `${0.2 + index * 0.1}s` }}
                >
                  <div className="announcement-badge news">Actualité</div>
                  <div className="announcement-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <h3>{news.title}</h3>
                  <p>{news.content}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA Section */}
      <section id="cta" className="cta-section">
        <div className="container">
          <div className="cta-content">
            <div className="cta-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <h2>Prêt à explorer?</h2>
            <p>
              Découvrez l'art des installations scoutes et partagez vos propres créations
              avec la communauté des Scouts du Liban.
            </p>
            <div className="cta-buttons">
              <Link to="/browse" className="btn-cta-primary">
                Parcourir la Galerie
              </Link>
              <Link to="/login" className="btn-cta-secondary">
                Se Connecter
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer decoration */}
      <div className="landing-footer-decoration">
        <div className="decoration-line"></div>
        <div className="decoration-logo">
          <span>NODUS</span>
          <small>Scouts du Liban</small>
        </div>
        <div className="decoration-line"></div>
      </div>
    </div>
  );
};

export default Landing;
