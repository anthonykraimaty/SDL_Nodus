import { useState, useEffect } from 'react';
import { getImageUrl } from '../config/api';
import { designGroupService } from '../services/api';
import Modal from './Modal';
import ImagePreviewer from './ImagePreviewer';
import './DesignGroupModal.css';

const DesignGroupModal = ({ isOpen, onClose, designGroupId, initialData = null }) => {
  const [designGroup, setDesignGroup] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [selectedPictureIndex, setSelectedPictureIndex] = useState(null);

  useEffect(() => {
    if (isOpen && designGroupId && !initialData) {
      loadDesignGroup();
    } else if (initialData) {
      setDesignGroup(initialData);
      setLoading(false);
    }
  }, [isOpen, designGroupId, initialData]);

  const loadDesignGroup = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await designGroupService.getById(designGroupId);
      setDesignGroup(data);
    } catch (err) {
      console.error('Failed to load design group:', err);
      setError('Failed to load design group');
    } finally {
      setLoading(false);
    }
  };

  const handlePictureClick = (index) => {
    setSelectedPictureIndex(index);
  };

  const handleClosePreviewer = () => {
    setSelectedPictureIndex(null);
  };

  if (!isOpen) return null;

  const pictures = designGroup?.pictures || [];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={designGroup?.name || 'Design Group'}
        size="large"
      >
        <Modal.Body>
          {loading ? (
            <div className="design-group-modal-loading">
              <div className="spinner"></div>
            </div>
          ) : error ? (
            <div className="design-group-modal-error">
              <p>{error}</p>
              <button onClick={loadDesignGroup} className="btn-retry">
                Retry
              </button>
            </div>
          ) : (
            <div className="design-group-modal-content">
              {/* Group info header */}
              <div className="design-group-modal-header">
                <div className="group-stats">
                  <span className="stat-item">
                    <strong>{pictures.length}</strong> {pictures.length === 1 ? 'photo' : 'photos'}
                  </span>
                  {designGroup?.category && (
                    <span className="stat-item category-badge">
                      {designGroup.category.name}
                    </span>
                  )}
                </div>
                {designGroup?.createdBy && (
                  <div className="group-meta">
                    <span className="created-by">
                      Created by {designGroup.createdBy.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Pictures grid */}
              <div className="design-group-pictures-grid">
                {pictures.map((picture, index) => (
                  <div
                    key={picture.id}
                    className={`design-group-picture ${picture.id === designGroup?.primaryPictureId ? 'is-primary' : ''}`}
                    onClick={() => handlePictureClick(index)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handlePictureClick(index)}
                  >
                    <img
                      src={getImageUrl(picture.filePath)}
                      alt={picture.caption || `Photo ${index + 1}`}
                      loading="lazy"
                    />
                    {picture.id === designGroup?.primaryPictureId && (
                      <div className="primary-badge" title="Primary picture">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                        </svg>
                      </div>
                    )}
                    <div className="picture-overlay">
                      {picture.pictureSet?.troupe && (
                        <span className="picture-troupe">
                          {picture.pictureSet.troupe.group?.name} - {picture.pictureSet.troupe.name}
                        </span>
                      )}
                      {picture.category && (
                        <span className="picture-category">{picture.category.name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Actions>
          <button onClick={onClose} className="secondary">
            Close
          </button>
        </Modal.Actions>
      </Modal>

      {/* Image Previewer for full-screen view */}
      {selectedPictureIndex !== null && (
        <ImagePreviewer
          pictures={pictures.map(pic => ({
            ...pic,
            troupe: pic.pictureSet?.troupe,
          }))}
          initialIndex={selectedPictureIndex}
          onClose={handleClosePreviewer}
        />
      )}
    </>
  );
};

export default DesignGroupModal;
