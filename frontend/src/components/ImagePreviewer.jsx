import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';
import './ImagePreviewer.css';

const ImagePreviewer = ({ pictures, initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [showDetails, setShowDetails] = useState(true);

  const currentPicture = pictures[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pictures.length - 1));
    setZoom(1);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < pictures.length - 1 ? prev + 1 : 0));
    setZoom(1);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  if (!currentPicture) return null;

  return (
    <div className="image-previewer-overlay" onClick={onClose}>
      <div className="image-previewer" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="previewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {/* Navigation Controls */}
        <div className="previewer-controls">
          <button
            className="previewer-nav previewer-nav-left"
            onClick={handlePrevious}
            aria-label="Previous"
            disabled={pictures.length <= 1}
          >
            ‹
          </button>

          <button
            className="previewer-nav previewer-nav-right"
            onClick={handleNext}
            aria-label="Next"
            disabled={pictures.length <= 1}
          >
            ›
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="previewer-zoom-controls">
          <button onClick={handleZoomOut} disabled={zoom <= 0.5} aria-label="Zoom out">
            −
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= 3} aria-label="Zoom in">
            +
          </button>
          <button onClick={handleZoomReset} aria-label="Reset zoom">
            Reset
          </button>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="toggle-details"
            aria-label="Toggle details"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>

        {/* Image Display */}
        <div className="previewer-image-container">
          <img
            src={`${API_URL}/${currentPicture.filePath}`}
            alt={currentPicture.caption || `Picture ${currentIndex + 1}`}
            style={{ transform: `scale(${zoom})` }}
            className="previewer-image"
          />
        </div>

        {/* Picture Counter */}
        <div className="previewer-counter">
          {currentIndex + 1} / {pictures.length}
        </div>

        {/* Picture Details */}
        {showDetails && (
          <div className="previewer-details">
            <div className="details-grid">
              {currentPicture.caption && (
                <div className="detail-item">
                  <strong>Caption:</strong>
                  <span>{currentPicture.caption}</span>
                </div>
              )}

              {currentPicture.troupe && (
                <>
                  <div className="detail-item">
                    <strong>District:</strong>
                    <span>{currentPicture.troupe.group?.district?.name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Group:</strong>
                    <span>{currentPicture.troupe.group?.name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Troupe:</strong>
                    <span>{currentPicture.troupe.name}</span>
                  </div>
                </>
              )}

              {currentPicture.patrouille && (
                <div className="detail-item">
                  <strong>Patrouille:</strong>
                  <span>{currentPicture.patrouille.name}</span>
                </div>
              )}

              {currentPicture.pictureSet && (
                <>
                  {currentPicture.pictureSet.title && (
                    <div className="detail-item">
                      <strong>Title:</strong>
                      <span>{currentPicture.pictureSet.title}</span>
                    </div>
                  )}
                  {currentPicture.pictureSet.description && (
                    <div className="detail-item full-width">
                      <strong>Description:</strong>
                      <span>{currentPicture.pictureSet.description}</span>
                    </div>
                  )}
                  {currentPicture.pictureSet.location && (
                    <div className="detail-item">
                      <strong>Location:</strong>
                      <span>{currentPicture.pictureSet.location}</span>
                    </div>
                  )}
                  {currentPicture.pictureSet.uploadedAt && (
                    <div className="detail-item">
                      <strong>Date:</strong>
                      <span>{new Date(currentPicture.pictureSet.uploadedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </>
              )}

              {currentPicture.category && (
                <div className="detail-item">
                  <strong>Category:</strong>
                  <span>{currentPicture.category.name}</span>
                </div>
              )}

              {currentPicture.subCategory && (
                <div className="detail-item">
                  <strong>Sub-Category:</strong>
                  <span>{currentPicture.subCategory.name}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePreviewer;
