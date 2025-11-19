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
};

// Authentication
export const authService = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (data) => api.post('/api/auth/register', data),
  getMe: () => api.get('/api/auth/me', true),
  logout: () => api.post('/api/auth/logout', {}, true),
};

// Pictures
export const pictureService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/pictures${query ? '?' + query : ''}`, true); // Send auth token
  },
  getById: (id) => api.get(`/api/pictures/${id}`, true), // Send auth token
  upload: (formData) => api.upload('/api/pictures', formData),
  classify: (id, data) => api.put(`/api/pictures/${id}/classify`, data, true),
  classifyBulk: (id, data) => api.put(`/api/pictures/${id}/classify-bulk`, data, true),
  approve: (id, isHighlight = false) => api.post(`/api/pictures/${id}/approve`, { isHighlight }, true),
  reject: (id, rejectionReason) => api.post(`/api/pictures/${id}/reject`, { rejectionReason }, true),
  delete: (id) => api.delete(`/api/pictures/${id}`, true),
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
