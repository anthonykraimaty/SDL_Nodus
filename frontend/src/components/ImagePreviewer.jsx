import { useState, useEffect } from 'react';
import { getImageUrl } from '../config/api';
import { pictureService } from '../services/api';
import './ImagePreviewer.css';

const ImagePreviewer = ({
  pictures,
  initialIndex = 0,
  onClose,
  user = null,
  categories = [],
  onPictureUpdate = null
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [showDetails, setShowDetails] = useState(true);

  // Image orientation state
  const [isPortrait, setIsPortrait] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editType, setEditType] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const currentPicture = pictures[currentIndex];

  // Detect image orientation when it loads
  const handleImageLoad = (e) => {
    const img = e.target;
    setIsPortrait(img.naturalHeight > img.naturalWidth);
  };

  // Check if user can edit (admin or branche)
  const canEdit = user && (user.role === 'ADMIN' || user.role === 'BRANCHE_ECLAIREURS');

  // Reset edit state when picture changes
  useEffect(() => {
    setIsEditing(false);
    setEditError('');
  }, [currentIndex]);

  // Initialize edit values when entering edit mode
  useEffect(() => {
    if (isEditing && currentPicture) {
      setEditType(currentPicture.type || '');
      setEditCategoryId(currentPicture.category?.id?.toString() || currentPicture.categoryId?.toString() || '');
    }
  }, [isEditing, currentPicture]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditing) return; // Disable navigation while editing
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isEditing]);

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

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditError('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!currentPicture) return;

    setIsSaving(true);
    setEditError('');

    try {
      const updateData = {};

      if (editType !== (currentPicture.type || '')) {
        updateData.type = editType || null;
      }

      const currentCategoryId = currentPicture.category?.id?.toString() || currentPicture.categoryId?.toString() || '';
      if (editCategoryId !== currentCategoryId) {
        updateData.categoryId = editCategoryId ? parseInt(editCategoryId) : null;
      }

      // Only call API if there are changes
      if (Object.keys(updateData).length > 0) {
        await pictureService.updateIndividualPicture(currentPicture.id, updateData);

        // Notify parent to refresh data
        if (onPictureUpdate) {
          onPictureUpdate();
        }
      }

      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update picture:', err);
      setEditError(err.message || 'Failed to update picture');
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPicture) return null;

  // Determine layout class based on orientation (only on desktop)
  const layoutClass = isPortrait ? 'layout-portrait' : 'layout-landscape';

  return (
    <div className="image-previewer-overlay" onClick={onClose}>
      <div className={`image-previewer ${layoutClass}`} onClick={(e) => e.stopPropagation()}>
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
            disabled={pictures.length <= 1 || isEditing}
          >
            ‹
          </button>

          <button
            className="previewer-nav previewer-nav-right"
            onClick={handleNext}
            aria-label="Next"
            disabled={pictures.length <= 1 || isEditing}
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
            {showDetails ? 'Hide' : 'Details'}
          </button>
        </div>

        {/* Image Display */}
        <div className="previewer-image-container">
          <img
            src={getImageUrl(currentPicture.filePath)}
            alt={currentPicture.caption || `Picture ${currentIndex + 1}`}
            style={{ transform: `scale(${zoom})` }}
            className="previewer-image"
            onLoad={handleImageLoad}
          />
        </div>

        {/* Picture Counter */}
        <div className="previewer-counter">
          {currentIndex + 1} / {pictures.length}
        </div>

        {/* Picture Details */}
        {showDetails && (
          <div className="previewer-details">
            {/* Minimize button */}
            <button
              className="previewer-minimize-btn"
              onClick={() => setShowDetails(false)}
              title="Masquer les détails"
              aria-label="Minimize details"
            >
              −
            </button>

            {/* Edit button for authorized users */}
            {canEdit && !isEditing && (
              <button
                className="previewer-edit-btn"
                onClick={handleStartEdit}
                title="Modifier le type et la catégorie"
              >
                Modifier
              </button>
            )}

            {/* Edit Mode */}
            {isEditing ? (
              <div className="previewer-edit-form">
                <h4>Modifier l'image</h4>

                {editError && (
                  <div className="edit-error">{editError}</div>
                )}

                <div className="edit-field">
                  <label htmlFor="edit-type">Type:</label>
                  <select
                    id="edit-type"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">-- Non défini --</option>
                    <option value="INSTALLATION_PHOTO">Photo d'installation</option>
                    <option value="SCHEMATIC">Schéma</option>
                  </select>
                </div>

                <div className="edit-field">
                  <label htmlFor="edit-category">Catégorie:</label>
                  <select
                    id="edit-category"
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">-- Non définie --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="edit-actions">
                  <button
                    className="btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn-save"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>
              </div>
            ) : (
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

                {currentPicture.type && (
                  <div className="detail-item">
                    <strong>Type:</strong>
                    <span>{currentPicture.type === 'INSTALLATION_PHOTO' ? 'Photo' : 'Schéma'}</span>
                  </div>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePreviewer;
