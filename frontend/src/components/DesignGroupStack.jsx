import { getImageUrl } from '../config/api';
import './DesignGroupStack.css';

const DesignGroupStack = ({ designGroup, onClick, thumbnailSize = 50 }) => {
  // Get the primary picture or fallback to first picture
  const primaryPicture = designGroup.primaryPicture || designGroup.pictures?.[0];
  const pictureCount = designGroup.pictureCount || designGroup.pictures?.length || 0;

  // Get up to 3 preview pictures for the stack effect
  const previewPictures = designGroup.pictures?.slice(0, 3) || [];

  if (!primaryPicture) {
    return null;
  }

  return (
    <article
      className="design-group-stack"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Voir groupe de ${pictureCount} photos${designGroup.name ? `: ${designGroup.name}` : ''}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      style={{ '--stack-size': `${200 + thumbnailSize * 3}px` }}
    >
      <div className="stack-container">
        {/* Background cards for stack effect */}
        {previewPictures.length >= 3 && (
          <div className="stack-card stack-card-3">
            <img
              src={getImageUrl(previewPictures[2]?.filePath || primaryPicture.filePath)}
              alt=""
              loading="lazy"
            />
          </div>
        )}
        {previewPictures.length >= 2 && (
          <div className="stack-card stack-card-2">
            <img
              src={getImageUrl(previewPictures[1]?.filePath || primaryPicture.filePath)}
              alt=""
              loading="lazy"
            />
          </div>
        )}

        {/* Primary picture (front card) */}
        <div className="stack-card stack-card-1">
          <img
            src={getImageUrl(primaryPicture.filePath)}
            alt={designGroup.name || 'Design group'}
            loading="lazy"
          />

          {/* Count badge */}
          <div className="stack-count-badge">
            <span className="stack-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <rect x="7" y="7" width="10" height="10" rx="1" />
              </svg>
            </span>
            <span className="stack-count">{pictureCount}</span>
          </div>
        </div>
      </div>

      {/* Group info */}
      <div className="stack-info">
        {designGroup.name && (
          <span className="stack-name">{designGroup.name}</span>
        )}
        <span className="stack-photos-label">
          {pictureCount} {pictureCount === 1 ? 'photo' : 'photos'}
        </span>
      </div>
    </article>
  );
};

export default DesignGroupStack;
