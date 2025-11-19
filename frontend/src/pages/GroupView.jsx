import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ImagePreviewer from '../components/ImagePreviewer';
import './CategoryView.css'; // Reuse the same styles

const GroupView = () => {
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPictureIndex, setSelectedPictureIndex] = useState(null);

  useEffect(() => {
    loadGroupPictures();
  }, [groupId]);

  const loadGroupPictures = async () => {
    try {
      setLoading(true);

      // Fetch group info
      const groupResponse = await fetch(`http://localhost:3001/api/groups`);
      if (!groupResponse.ok) throw new Error('Failed to load group');

      const groups = await groupResponse.json();
      const currentGroup = groups.find(g => g.id === parseInt(groupId));

      if (!currentGroup) {
        throw new Error('Group not found');
      }

      setGroup(currentGroup);

      // Fetch pictures for this group
      const picturesResponse = await fetch(
        `http://localhost:3001/api/pictures?status=APPROVED&groupId=${groupId}`
      );

      if (!picturesResponse.ok) throw new Error('Failed to load pictures');

      const data = await picturesResponse.json();

      // Extract individual pictures from picture sets
      const allPictures = (data.pictures || []).flatMap(set =>
        (set.pictures || []).map(pic => ({
          ...pic,
          pictureSet: {
            id: set.id,
            title: set.title,
            description: set.description,
            location: set.location,
            uploadedAt: set.uploadedAt,
          },
          troupe: set.troupe,
          patrouille: set.patrouille,
          category: set.category,
          subCategory: set.subCategory,
        }))
      );

      setPictures(allPictures);
    } catch (err) {
      console.error('Error loading group pictures:', err);
      setError(err.message);
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

  if (loading) {
    return (
      <div className="category-view">
        <div className="container loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="category-view">
        <div className="container">
          <div className="error-message">{error}</div>
          <Link to="/browse" className="btn-back">
            ← Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="category-view">
      <div className="container">
        {/* Header */}
        <div className="category-header">
          <Link to="/browse" className="btn-back">
            ← Back to Browse
          </Link>
          <h1>{group?.name}</h1>
          {group?.district && (
            <p className="category-description">District: {group.district.name}</p>
          )}
          <p className="pictures-count">
            {pictures.length} {pictures.length === 1 ? 'picture' : 'pictures'}
          </p>
        </div>

        {/* Pictures Grid */}
        {pictures.length === 0 ? (
          <div className="empty-state">
            <p>No pictures found for this group yet.</p>
            <Link to="/browse" className="btn-primary">
              Browse Other Groups
            </Link>
          </div>
        ) : (
          <div className="pictures-grid">
            {pictures.map((picture, index) => (
              <div
                key={picture.id}
                className="picture-thumbnail"
                onClick={() => handlePictureClick(index)}
              >
                <div className="thumbnail-image">
                  <img
                    src={`http://localhost:3001/${picture.filePath}`}
                    alt={picture.caption || `Picture ${index + 1}`}
                    loading="lazy"
                  />
                </div>
                <div className="thumbnail-overlay">
                  <div className="thumbnail-info">
                    {picture.troupe && (
                      <div className="thumbnail-troupe">
                        {picture.troupe.name}
                      </div>
                    )}
                    {picture.pictureSet?.location && (
                      <div className="thumbnail-location">
                        📍 {picture.pictureSet.location}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Previewer Modal */}
      {selectedPictureIndex !== null && (
        <ImagePreviewer
          pictures={pictures}
          initialIndex={selectedPictureIndex}
          onClose={handleClosePreviewer}
        />
      )}
    </div>
  );
};

export default GroupView;
