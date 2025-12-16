const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Get auth token from localStorage
const getAuthToken = () => localStorage.getItem('token');

// Helper to build headers
const getHeaders = (includeAuth = false, isFormData = false) => {
  const headers = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};

export const api = {
  async get(endpoint, requiresAuth = false) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: getHeaders(requiresAuth),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  },

  async post(endpoint, data, requiresAuth = false) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(requiresAuth),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  },

  async put(endpoint, data, requiresAuth = false) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(requiresAuth),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  },

  async delete(endpoint, requiresAuth = false) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(requiresAuth),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  },

  async upload(endpoint, formData) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(true, true), // Auth but no Content-Type
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  },

  /**
   * Upload with progress tracking using XMLHttpRequest
   * @param {string} endpoint - API endpoint
   * @param {FormData} formData - Form data to upload
   * @param {function} onProgress - Progress callback (receives { loaded, total, percent })
   * @param {AbortSignal} signal - Optional abort signal for cancellation
   * @returns {Promise} - Resolves with response JSON
   */
  uploadWithProgress(endpoint, formData, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Upload cancelled'));
        });
      }

      // Progress event
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percent: Math.round((event.loaded / event.total) * 100),
          });
        }
      });

      // Load complete
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            resolve({ success: true });
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      // Error event
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      // Abort event
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Open and send
      xhr.open('POST', `${API_URL}${endpoint}`);

      // Set auth header
      const token = getAuthToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  },
};

// Authentication
export const authService = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (data) => api.post('/api/auth/register', data),
  getMe: () => api.get('/api/auth/me', true),
  logout: () => api.post('/api/auth/logout', {}, true),
  updateProfile: (data) => api.put('/api/auth/profile', data, true),
  changePassword: (currentPassword, newPassword) =>
    api.post('/api/auth/change-password', { currentPassword, newPassword }, true),
};

// Pictures
export const pictureService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/pictures${query ? '?' + query : ''}`, true); // Send auth token
  },
  getById: (id) => api.get(`/api/pictures/${id}`, true), // Send auth token
  upload: (formData) => api.upload('/api/pictures', formData),
  uploadWithProgress: (formData, onProgress, signal) =>
    api.uploadWithProgress('/api/pictures', formData, onProgress, signal),
  classify: (id, data) => api.put(`/api/pictures/${id}/classify`, data, true),
  classifyBulk: (id, data) => api.put(`/api/pictures/${id}/classify-bulk`, data, true),
  approve: (id, isHighlight = false, excludedPictureIds = []) => api.post(`/api/pictures/${id}/approve`, { isHighlight, excludedPictureIds }, true),
  reject: (id, rejectionReason) => api.post(`/api/pictures/${id}/reject`, { rejectionReason }, true),
  delete: (id) => api.delete(`/api/pictures/${id}`, true),
  deletePicture: (setId, pictureId) => api.delete(`/api/pictures/${setId}/picture/${pictureId}`, true),
};

// Categories
export const categoryService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/categories${query ? '?' + query : ''}`);
  },
  getMonthly: (month, year) => api.get(`/api/categories/monthly/${month}/${year}`),
  create: (data) => api.post('/api/categories', data, true),
};

// Announcements
export const announcementService = {
  getAll: () => api.get('/api/announcements'),
  create: (data) => api.post('/api/announcements', data, true),
};

// Organizational
export const organizationService = {
  getDistricts: () => api.get('/api/districts'),
  getGroups: () => api.get('/api/groups'),
};

// Analytics
export const analyticsService = {
  getParticipation: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/analytics/participation${query ? '?' + query : ''}`, true);
  },
  getPictureStats: () => api.get('/api/analytics/pictures/stats', true),
};
