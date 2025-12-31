import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import AdminLayout from './components/layout/AdminLayout';
import Landing from './pages/Landing';
import Browse from './pages/Browse';
import CategoryView from './pages/CategoryView';
import Login from './pages/Login';
import Upload from './pages/Upload';
import Classify from './pages/Classify';
import ImageClassifier from './pages/ImageClassifier';
import ReviewQueue from './pages/ReviewQueue';
import PictureStatus from './pages/PictureStatus';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminCategories from './pages/AdminCategories';
import AdminRoles from './pages/AdminRoles';
import AdminOrganizations from './pages/AdminOrganizations';
import AdminDistricts from './pages/AdminDistricts';
import AdminGroups from './pages/AdminGroups';
import AdminTroupes from './pages/AdminTroupes';
import AdminPatrouilles from './pages/AdminPatrouilles';
import AdminPictures from './pages/AdminPictures';
import ProfileSettings from './pages/ProfileSettings';
import SchematicUpload from './pages/SchematicUpload';
import SchematicReview from './pages/SchematicReview';
import SchematicProgress from './pages/SchematicProgress';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="container">
        <div className="error-page">
          <h2>Access Denied</h2>
          <p>You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PWAInstallPrompt />
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Public Routes */}
            <Route index element={<Landing />} />
            <Route path="browse" element={<Browse />} />
            <Route path="category/:categoryId" element={<CategoryView />} />
            <Route path="schematics" element={<SchematicProgress />} />
            <Route path="login" element={<Login />} />

            {/* Protected Routes */}
            <Route
              path="dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="upload"
              element={
                <ProtectedRoute allowedRoles={['CHEF_TROUPE']}>
                  <Upload />
                </ProtectedRoute>
              }
            />

            <Route
              path="classify"
              element={
                <ProtectedRoute allowedRoles={['CHEF_TROUPE', 'BRANCHE_ECLAIREURS']}>
                  <Classify />
                </ProtectedRoute>
              }
            />

            <Route
              path="classify/:id"
              element={
                <ProtectedRoute allowedRoles={['CHEF_TROUPE', 'BRANCHE_ECLAIREURS']}>
                  <ImageClassifier />
                </ProtectedRoute>
              }
            />

            <Route
              path="review"
              element={
                <ProtectedRoute allowedRoles={['BRANCHE_ECLAIREURS', 'ADMIN']}>
                  <ReviewQueue />
                </ProtectedRoute>
              }
            />

            <Route
              path="picture/:id"
              element={
                <ProtectedRoute>
                  <PictureStatus />
                </ProtectedRoute>
              }
            />

            <Route
              path="profile"
              element={
                <ProtectedRoute>
                  <ProfileSettings />
                </ProtectedRoute>
              }
            />

            {/* Schematic Routes */}
            <Route
              path="schematics/upload"
              element={
                <ProtectedRoute allowedRoles={['CHEF_TROUPE']}>
                  <SchematicUpload />
                </ProtectedRoute>
              }
            />

            <Route
              path="schematics/review"
              element={
                <ProtectedRoute allowedRoles={['BRANCHE_ECLAIREURS', 'ADMIN']}>
                  <SchematicReview />
                </ProtectedRoute>
              }
            />

            <Route
              path="schematics/progress"
              element={
                <ProtectedRoute>
                  <SchematicProgress />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>

          {/* Admin Routes - Separate Layout */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="roles" element={<AdminRoles />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="organizations" element={<AdminOrganizations />} />
            <Route path="districts" element={<AdminDistricts />} />
            <Route path="groups" element={<AdminGroups />} />
            <Route path="troupes" element={<AdminTroupes />} />
            <Route path="patrouilles" element={<AdminPatrouilles />} />
            <Route path="pictures" element={<AdminPictures />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
