import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import './PictureStatus.css';

const PictureStatus = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pictureSet, setPictureSet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPictureSet();
  }, [id]);

  const loadPictureSet = async () => {
    try {
      setLoading(true);
      const data = await pictureService.getById(id);
      setPictureSet(data);
    } catch (err) {
      console.error('Failed to load picture set:', err);
      setError('Failed to load picture set');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      PENDING: {
        icon: '⏳',
        label: 'Pending Classification',
        color: '#ff9800',
        description: 'Picture set has been uploaded and is waiting for classification.',
        nextStep: 'Add categories and metadata to classify the pictures.',
      },
      CLASSIFIED: {
        icon: '📝',
        label: 'Classified - Awaiting Review',
        color: '#2196F3',
        description: 'Picture set has been classified with categories and metadata.',
        nextStep: 'Waiting for Branche Éclaireurs to review and approve.',
      },
      APPROVED: {
        icon: '✅',
        label: 'Approved - Public',
        color: '#4CAF50',
        description: 'Picture set has been approved and is now publicly visible.',
        nextStep: 'No further action needed. Pictures are live on the platform.',
      },
      REJECTED: {
        icon: '❌',
        label: 'Rejected',
        color: '#f44336',
        description: 'Picture set was rejected during review.',
        nextStep: 'Review the rejection reason and make necessary changes.',
      },
    };
    return statusMap[status] || statusMap.PENDING;
  };

  const getWorkflowSteps = (currentStatus) => {
    const steps = [
      { status: 'PENDING', label: 'Uploaded', icon: '📤' },
      { status: 'CLASSIFIED', label: 'Classified', icon: '📝' },
      { status: 'APPROVED', label: 'Approved', icon: '✅' },
    ];

    const statusOrder = ['PENDING', 'CLASSIFIED', 'APPROVED', 'REJECTED'];
    const currentIndex = statusOrder.indexOf(currentStatus);

    return steps.map((step, index) => {
      const stepIndex = statusOrder.indexOf(step.status);
      let state = 'incomplete';

      if (currentStatus === 'REJECTED') {
        state = index === 0 ? 'complete' : 'rejected';
      } else if (stepIndex <= currentIndex) {
        state = 'complete';
      } else if (stepIndex === currentIndex + 1) {
        state = 'current';
      }

      return { ...step, state };
    });
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error || !pictureSet) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Picture Set Not Found</h2>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(pictureSet.status);
  const workflowSteps = getWorkflowSteps(pictureSet.status);

  return (
    <div className="picture-status-page">
      <div className="container">
        {/* Header */}
        <div className="status-header">
          <button onClick={() => navigate('/dashboard')} className="btn-back">
            ← Back to Dashboard
          </button>
          <h1>{pictureSet.title}</h1>
          {pictureSet.description && <p className="description">{pictureSet.description}</p>}
        </div>

        {/* Current Status Card */}
        <div className="current-status-card" style={{ borderColor: statusInfo.color }}>
          <div className="status-icon" style={{ color: statusInfo.color }}>
            {statusInfo.icon}
          </div>
          <div className="status-content">
            <h2 style={{ color: statusInfo.color }}>{statusInfo.label}</h2>
            <p className="status-description">{statusInfo.description}</p>
            <p className="status-next-step">
              <strong>Next Step:</strong> {statusInfo.nextStep}
            </p>
          </div>
        </div>

        {/* Workflow Progress */}
        <div className="workflow-section">
          <h2>Workflow Progress</h2>
          <div className="workflow-steps">
            {workflowSteps.map((step, index) => (
              <div key={step.status} className={`workflow-step ${step.state}`}>
                <div className="step-icon">{step.icon}</div>
                <div className="step-label">{step.label}</div>
                {index < workflowSteps.length - 1 && (
                  <div className={`step-connector ${step.state === 'complete' ? 'complete' : ''}`}></div>
                )}
              </div>
            ))}
          </div>

          {pictureSet.status === 'REJECTED' && (
            <div className="rejection-info">
              <h3>❌ Rejection Details</h3>
              <p><strong>Reason:</strong> {pictureSet.rejectionReason || 'No reason provided'}</p>
              {pictureSet.reviewedBy && (
                <p><strong>Reviewed by:</strong> {pictureSet.reviewedBy.name}</p>
              )}
              {pictureSet.reviewedAt && (
                <p><strong>Reviewed on:</strong> {new Date(pictureSet.reviewedAt).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="metadata-section">
          <h2>Picture Set Details</h2>
          <div className="metadata-grid">
            <div className="metadata-item">
              <strong>Type:</strong>
              <span>{pictureSet.type === 'INSTALLATION_PHOTO' ? '📸 Installation Photo' : '📐 Schematic'}</span>
            </div>
            <div className="metadata-item">
              <strong>Category:</strong>
              <span>{pictureSet.category?.name || 'Not assigned'}</span>
            </div>
            <div className="metadata-item">
              <strong>Troupe:</strong>
              <span>{pictureSet.troupe?.name || 'Not assigned'}</span>
            </div>
            {pictureSet.patrouille && (
              <div className="metadata-item">
                <strong>Patrouille:</strong>
                <span>⚜️ {pictureSet.patrouille.name}</span>
              </div>
            )}
            {pictureSet.location && (
              <div className="metadata-item">
                <strong>Location:</strong>
                <span>📍 {pictureSet.location}</span>
              </div>
            )}
            <div className="metadata-item">
              <strong>Uploaded By:</strong>
              <span>👤 {pictureSet.uploadedBy?.name || 'Unknown'}</span>
            </div>
            <div className="metadata-item">
              <strong>Uploaded On:</strong>
              <span>📅 {new Date(pictureSet.uploadedAt).toLocaleString()}</span>
            </div>
            {pictureSet.classifiedBy && (
              <div className="metadata-item">
                <strong>Classified By:</strong>
                <span>👤 {pictureSet.classifiedBy.name}</span>
              </div>
            )}
            {pictureSet.classifiedAt && (
              <div className="metadata-item">
                <strong>Classified On:</strong>
                <span>📅 {new Date(pictureSet.classifiedAt).toLocaleString()}</span>
              </div>
            )}
            {pictureSet.reviewedBy && (
              <div className="metadata-item">
                <strong>Reviewed By:</strong>
                <span>👤 {pictureSet.reviewedBy.name}</span>
              </div>
            )}
            {pictureSet.reviewedAt && (
              <div className="metadata-item">
                <strong>Reviewed On:</strong>
                <span>📅 {new Date(pictureSet.reviewedAt).toLocaleString()}</span>
              </div>
            )}
            {pictureSet.isHighlight && (
              <div className="metadata-item">
                <strong>Highlight:</strong>
                <span>⭐ Featured Picture</span>
              </div>
            )}
          </div>
        </div>

        {/* Pictures Grid */}
        <div className="pictures-section">
          <h2>Pictures ({pictureSet.pictures?.length || 0})</h2>
          <div className="pictures-preview-grid">
            {pictureSet.pictures?.map((picture) => (
              <div key={picture.id} className="picture-preview-card">
                <img
                  src={`http://localhost:3001/${picture.filePath}`}
                  alt={`Picture ${picture.displayOrder}`}
                />
                <div className="picture-info">
                  <span className="picture-number">#{picture.displayOrder}</span>
                  {picture.categoryId && (
                    <span className="picture-classified">✓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          {pictureSet.status === 'PENDING' && (
            user?.role === 'CHEF_TROUPE' || user?.role === 'BRANCHE_ECLAIREURS'
          ) && (
            <button
              onClick={() => navigate(`/classify/${pictureSet.id}`)}
              className="btn-action primary"
            >
              📝 Classify Pictures
            </button>
          )}

          {pictureSet.status === 'CLASSIFIED' && (
            user?.role === 'CHEF_TROUPE' || user?.role === 'BRANCHE_ECLAIREURS'
          ) && (
            <button
              onClick={() => navigate(`/classify/${pictureSet.id}`)}
              className="btn-action secondary"
            >
              ✏️ Edit Classification
            </button>
          )}

          {pictureSet.status === 'CLASSIFIED' && (
            user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN'
          ) && (
            <button
              onClick={() => navigate('/review')}
              className="btn-action primary"
            >
              🔍 Go to Review Queue
            </button>
          )}

          {pictureSet.status === 'APPROVED' && (
            <button
              onClick={() => navigate('/browse')}
              className="btn-action secondary"
            >
              🌐 View in Browse
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PictureStatus;
