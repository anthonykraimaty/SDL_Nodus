import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import { getImageUrl } from '../config/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import './Archive.css';

const Archive = () => {
  const { user } = useAuth();
  const canManage = user && (user.role === 'ADMIN' || user.role === 'BRANCHE_ECLAIREURS');

  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPictures, setSelectedPictures] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    loadArchive();
  }, [page]);

  const loadArchive = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await pictureService.getArchivedPictures({ page, limit: 50 });
      setPictures(data.pictures || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Failed to load archive:', err);
      setError('Failed to load archived pictures');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (pictureId) => {
    setSelectedPictures(prev => {
      const next = new Set(prev);
      if (next.has(pictureId)) {
        next.delete(pictureId);
      } else {
        next.add(pictureId);
      }
      return next;
    });
  };

  const handleRestore = async (picture) => {
    try {
      await pictureService.restorePicture(picture.pictureSetId, picture.id);
      await loadArchive();
    } catch (err) {
      console.error('Restore error:', err);
      setError(err.message || 'Failed to restore picture');
    }
  };

  const handlePermanentDelete = (picture) => {
    setConfirmAction({
      title: 'Delete permanently?',
      message: 'Permanently delete this picture? This cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await pictureService.permanentlyDeleteArchived(picture.id);
          setSelectedPictures(prev => {
            const next = new Set(prev);
            next.delete(picture.id);
            return next;
          });
          await loadArchive();
        } catch (err) {
          console.error('Delete error:', err);
          setError(err.message || 'Failed to delete picture');
        }
      },
    });
  };

  const handleBulkRestore = async () => {
    try {
      setError('');
      const selected = pictures.filter(p => selectedPictures.has(p.id));
      for (const picture of selected) {
        await pictureService.restorePicture(picture.pictureSetId, picture.id);
      }
      setSelectedPictures(new Set());
      await loadArchive();
    } catch (err) {
      console.error('Bulk restore error:', err);
      setError(err.message || 'Failed to restore pictures');
    }
  };

  const handleBulkDelete = () => {
    setConfirmAction({
      title: 'Delete permanently?',
      message: `Permanently delete ${selectedPictures.size} picture(s)? This cannot be undone.`,
      confirmText: 'Delete All',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setError('');
          await pictureService.bulkDeleteArchived(Array.from(selectedPictures));
          setSelectedPictures(new Set());
          await loadArchive();
        } catch (err) {
          console.error('Bulk delete error:', err);
          setError(err.message || 'Failed to delete pictures');
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="archive-page">
        <div className="container">
          <div className="archive-header">
            <h1>Archive</h1>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="archive-page">
      <div className="container">
        <div className="archive-header">
          <h1>Archive</h1>
          <p>{canManage ? 'Restore or permanently delete archived pictures.' : 'Your archived pictures.'}</p>
          <Link to="/classify" className="archive-back-link">Back to Classify</Link>
        </div>

        {error && <div className="error-message">{error}</div>}

        {canManage && selectedPictures.size > 0 && (
          <div className="archive-bulk-actions">
            <span>{selectedPictures.size} selected</span>
            <button onClick={handleBulkRestore} className="btn-restore">
              Restore Selected
            </button>
            <button onClick={handleBulkDelete} className="btn-permanent-delete">
              Delete Permanently
            </button>
          </div>
        )}

        {pictures.length === 0 ? (
          <div className="archive-empty">
            <p>No archived pictures.</p>
            <Link to="/classify" className="btn-restore" style={{ display: 'inline-block', padding: '8px 24px', textDecoration: 'none' }}>
              Back to Classify
            </Link>
          </div>
        ) : (
          <>
            <div className="archive-grid">
              {pictures.map(picture => (
                <div
                  key={picture.id}
                  className={`archive-card ${selectedPictures.has(picture.id) ? 'selected' : ''}`}
                >
                  <div className="archive-card-preview" onClick={() => setSelectedImage(picture)}>
                    <img
                      src={getImageUrl(picture.filePath)}
                      alt={`Archived picture ${picture.id}`}
                    />
                    {canManage && (
                      <div
                        className={`archive-card-checkbox ${selectedPictures.has(picture.id) ? 'checked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelection(picture.id);
                        }}
                      >
                        {selectedPictures.has(picture.id) ? '✓' : ''}
                      </div>
                    )}
                  </div>
                  <div className="archive-card-info">
                    <span className="archive-set-name">
                      {picture.pictureSet?.uploadedBy?.name || 'Unknown'}
                      {picture.pictureSet?.troupe ? ` - ${picture.pictureSet.troupe.name}` : ''}
                    </span>
                    <span>
                      Archived {picture.archivedAt ? new Date(picture.archivedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  {canManage && (
                    <div className="archive-card-actions">
                      <button onClick={() => handleRestore(picture)} className="btn-restore">
                        Restore
                      </button>
                      <button onClick={() => handlePermanentDelete(picture)} className="btn-permanent-delete">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="archive-pagination">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        <ConfirmModal
          isOpen={!!confirmAction}
          onCancel={() => setConfirmAction(null)}
          {...confirmAction}
        />

        {/* Image Preview Modal */}
        <Modal
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
        >
          {selectedImage && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={getImageUrl(selectedImage.filePath)}
                alt="Archived picture preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' }}
              />
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default Archive;
