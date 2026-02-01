import { useEffect } from 'react';
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

// Image viewer with navigation
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

  const handlePrev = () => {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    onNavigate(prevIndex);
  };

  const handleNext = () => {
    const nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    onNavigate(nextIndex);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images.length]);

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

        <div className="modal-image-viewer__content">
          <img
            src={currentImage.src}
            alt={currentImage.alt || `Image ${currentIndex + 1}`}
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
