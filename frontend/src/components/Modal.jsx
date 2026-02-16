import { useEffect, useState, useRef, useCallback } from 'react';
import ZoomableImage from './ZoomableImage';
import './Modal.css';

/**
 * Reusable Modal Component
 *
 * Usage:
 * <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="My Title" variant="warning">
 *   <p>Modal content here</p>
 *   <Modal.Actions>
 *     <button onClick={handleConfirm}>Confirm</button>
 *     <button onClick={onClose}>Cancel</button>
 *   </Modal.Actions>
 * </Modal>
 *
 * For image viewer:
 * <Modal isOpen={showImage} onClose={onClose} variant="image">
 *   <img src={imageUrl} alt="Preview" />
 * </Modal>
 */

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  variant = 'default', // 'default' | 'warning' | 'danger' | 'success' | 'image'
  size = 'medium', // 'small' | 'medium' | 'large' | 'fullscreen'
  showClose = true,
  closeOnOverlay = true,
}) => {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isImageViewer = variant === 'image';

  return (
    <div
      className={`modal-backdrop ${isImageViewer ? 'modal-backdrop--dark' : ''}`}
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        className={`modal ${isImageViewer ? 'modal--image' : ''} modal--${size} modal--${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showClose && (
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}

        {!isImageViewer && title && (
          <div className="modal__header">
            <h3 className="modal__title">{title}</h3>
          </div>
        )}

        <div className={`modal__content ${isImageViewer ? 'modal__content--image' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

// Sub-component for modal actions/buttons
Modal.Actions = ({ children, className = '' }) => (
  <div className={`modal__actions ${className}`}>
    {children}
  </div>
);

// Sub-component for modal body text
Modal.Body = ({ children, className = '' }) => (
  <div className={`modal__body ${className}`}>
    {children}
  </div>
);

// Image viewer with navigation, zoom, and swipe
const SWIPE_THRESHOLD = 50;

Modal.ImageViewer = ({
  isOpen,
  onClose,
  images = [],
  currentIndex = 0,
  onNavigate,
  renderInfo,
}) => {
  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;
  const [currentZoom, setCurrentZoom] = useState(1);
  const swipeStartX = useRef(null);
  const swipeStartY = useRef(null);
  const isSwiping = useRef(false);

  // Reset zoom tracking when image changes
  useEffect(() => {
    setCurrentZoom(1);
  }, [currentIndex]);

  const handlePrev = useCallback(() => {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    onNavigate(prevIndex);
  }, [currentIndex, images.length, onNavigate]);

  const handleNext = useCallback(() => {
    const nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    onNavigate(nextIndex);
  }, [currentIndex, images.length, onNavigate]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext]);

  // Swipe touch handlers
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1 && currentZoom <= 1) {
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      isSwiping.current = true;
    }
  }, [currentZoom]);

  const handleTouchMove = useCallback((e) => {
    if (!isSwiping.current || swipeStartX.current === null) return;
    if (e.touches.length !== 1) {
      isSwiping.current = false;
      return;
    }
    const dx = e.touches[0].clientX - swipeStartX.current;
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isSwiping.current = false;
    } else if (Math.abs(dx) > 10) {
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (isSwiping.current && swipeStartX.current !== null && e.changedTouches.length > 0) {
      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      const dy = e.changedTouches[0].clientY - swipeStartY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > SWIPE_THRESHOLD && absDx > absDy * 1.5 && hasMultiple) {
        if (dx > 0) handlePrev();
        else handleNext();
      }
    }
    swipeStartX.current = null;
    swipeStartY.current = null;
    isSwiping.current = false;
  }, [hasMultiple, handlePrev, handleNext]);

  if (!isOpen || !currentImage) return null;

  return (
    <div className="modal-backdrop modal-backdrop--dark" onClick={onClose}>
      <div className="modal-image-viewer" onClick={(e) => e.stopPropagation()}>
        <button className="modal-image-viewer__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {hasMultiple && (
          <button className="modal-image-viewer__nav modal-image-viewer__nav--prev" onClick={handlePrev}>
            ‹
          </button>
        )}

        <div
          className="modal-image-viewer__content"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <ZoomableImage
            key={currentIndex}
            src={currentImage.src}
            alt={currentImage.alt || `Image ${currentIndex + 1}`}
            onZoomChange={setCurrentZoom}
            className="modal-image-viewer__zoomable"
          />
        </div>

        {hasMultiple && (
          <button className="modal-image-viewer__nav modal-image-viewer__nav--next" onClick={handleNext}>
            ›
          </button>
        )}

        <div className="modal-image-viewer__info">
          {renderInfo ? renderInfo(currentImage, currentIndex) : (
            <span>#{currentIndex + 1} of {images.length}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
