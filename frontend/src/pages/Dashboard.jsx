import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pictureService } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const [pictures, setPictures] = useState([]);
  const [allPictures, setAllPictures] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    classified: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const params = {};

      // For Chef Troupe, show their own pictures
      if (user?.role === 'CHEF_TROUPE') {
        // This would need backend support to filter by user
        const data = await pictureService.getAll({ limit: 50 });
        const userPictures = data.pictures.filter(p => p.uploadedBy?.id === user.id);
        setAllPictures(userPictures);
        setPictures(userPictures);

        // Calculate stats
        setStats({
          pending: userPictures.filter(p => p.status === 'PENDING').length,
          classified: userPictures.filter(p => p.status === 'CLASSIFIED').length,
          approved: userPictures.filter(p => p.status === 'APPROVED').length,
          rejected: userPictures.filter(p => p.status === 'REJECTED').length,
        });
      }

      // For Branche, show pictures needing review
      if (user?.role === 'BRANCHE_ECLAIREURS' || user?.role === 'ADMIN') {
        const data = await pictureService.getAll({ limit: 50 });
        setAllPictures(data.pictures);
        setPictures(data.pictures);

        setStats({
          pending: data.pictures.filter(p => p.status === 'PENDING').length,
          classified: data.pictures.filter(p => p.status === 'CLASSIFIED').length,
          approved: data.pictures.filter(p => p.status === 'APPROVED').length,
          rejected: data.pictures.filter(p => p.status === 'REJECTED').length,
        });
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterByStatus = (status) => {
    setActiveFilter(status);
    if (status === 'all') {
      setPictures(allPictures);
    } else {
      setPictures(allPictures.filter(p => p.status === status.toUpperCase()));
    }
  };

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="container">
        <div className="dashboard-header">
          <div>
            <h2>Dashboard</h2>
            <p className="text-muted">
              Welcome back, {user?.name}
            </p>
          </div>
          {user?.role === 'CHEF_TROUPE' && (
            <Link to="/upload" className="btn-upload primary">
              Upload Picture
            </Link>
          )}
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div
            className={`stat-card ${activeFilter === 'pending' ? 'active' : ''}`}
            onClick={() => filterByStatus('pending')}
          >
            <div className="stat-icon pending">⏳</div>
            <div className="stat-info">
              <h3>{stats.pending}</h3>
              <p>Pending</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'classified' ? 'active' : ''}`}
            onClick={() => filterByStatus('classified')}
          >
            <div className="stat-icon classified">📝</div>
            <div className="stat-info">
              <h3>{stats.classified}</h3>
              <p>Classified</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'approved' ? 'active' : ''}`}
            onClick={() => filterByStatus('approved')}
          >
            <div className="stat-icon approved">✅</div>
            <div className="stat-info">
              <h3>{stats.approved}</h3>
              <p>Approved</p>
            </div>
          </div>

          <div
            className={`stat-card ${activeFilter === 'rejected' ? 'active' : ''}`}
            onClick={() => filterByStatus('rejected')}
          >
            <div className="stat-icon rejected">❌</div>
            <div className="stat-info">
              <h3>{stats.rejected}</h3>
              <p>Rejected</p>
            </div>
          </div>
        </div>

        {/* Recent Pictures */}
        <div className="recent-pictures">
          <div className="pictures-header">
            <h3>
              {user?.role === 'CHEF_TROUPE' ? 'Your Pictures' : 'Recent Submissions'}
              {activeFilter !== 'all' && ` - ${activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}`}
            </h3>
            {activeFilter !== 'all' && (
              <button onClick={() => filterByStatus('all')} className="btn-clear-filter">
                Show All
              </button>
            )}
          </div>

          {pictures.length === 0 ? (
            <div className="empty-state">
              <p>No pictures yet</p>
              {user?.role === 'CHEF_TROUPE' && (
                <Link to="/upload" className="primary">
                  Upload Your First Picture
                </Link>
              )}
            </div>
          ) : (
            <div className="pictures-grid-container">
              {pictures.slice(0, 10).map((picture) => (
                <div key={picture.id} className="picture-card">
                  <div className="picture-card-image">
                    <img
                      src={`http://localhost:3001/${picture.pictures?.[0]?.filePath || 'placeholder.jpg'}`}
                      alt={picture.title}
                    />
                    <div className="picture-card-type">
                      {picture.type === 'INSTALLATION_PHOTO' ? '📸' : '📐'}
                    </div>
                  </div>
                  <div className="picture-card-content">
                    <h4 className="picture-card-title">{picture.title}</h4>
                    <div className="picture-card-meta">
                      <span className={`status-badge ${picture.status.toLowerCase()}`}>
                        {picture.status}
                      </span>
                      <span className="picture-card-date">
                        {new Date(picture.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Link to={`/picture/${picture.id}`} className="btn-view-card">
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
