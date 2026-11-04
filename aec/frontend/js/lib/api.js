// Thin fetch wrapper around the Python API. Every failure surfaces a readable message.
import { CONFIG } from '../config.js';
import { SAMPLE_MISSING_PERSONS } from '../data/missingPersons.js';

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function describeDetail(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : '';
        const message = item.msg || 'Invalid value';
        return field ? `${field}: ${message}` : message;
      })
      .join(' · ');
  }
  return String(detail);
}

async function request(path, { method = 'GET', body, admin = false, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (admin) {
    const token = localStorage.getItem(CONFIG.adminTokenKey);
    if (token) headers['X-AEC-Admin-Token'] = token;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    clearTimeout(timer);
    window.dispatchEvent(new CustomEvent('aec:offline'));
    const offline = new ApiError('You are offline. Send this request by SMS instead.', 0);
    offline.offline = true;
    offline.payload = body;
    throw offline;
  }

  let response;
  try {
    response = await fetch(`${CONFIG.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new ApiError('The AEC server took too long to answer. Check your connection and try again.', 0);
    }
    const failed = new ApiError(
      `Cannot reach the AEC API at ${CONFIG.apiBase || 'this server'}. Check your connection, then retry.`,
      0,
    );
    failed.network = true;
    failed.payload = body;
    throw failed;
  }
  clearTimeout(timer);

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail = payload && typeof payload === 'object' ? payload.detail : payload;
    throw new ApiError(describeDetail(detail) || `Request failed (${response.status})`, response.status, payload);
  }
  return payload;
}

export const api = {
  health: () => request('/api/health'),
  stats: () => request('/api/stats'),

  incidents: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
    return request(`/api/incidents?${query.toString()}`);
  },
  createIncident: (payload) => request('/api/incidents', { method: 'POST', body: payload }),
  updateIncidentStatus: (id, status) =>
    request(`/api/incidents/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH', admin: true }),

  sendSos: (payload) => request('/api/sos', { method: 'POST', body: payload }),

  vehicles: (city) => request(`/api/emergency/vehicles${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  vehicleCities: () => request('/api/emergency/vehicles/cities'),
  createRental: (payload) => request('/api/emergency/rentals', { method: 'POST', body: payload }),

  medications: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
    return request(`/api/emergency/medications?${query.toString()}`);
  },
  pharmacies: (city) =>
    request(`/api/emergency/pharmacies${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  createDelivery: (payload) => request('/api/emergency/deliveries', { method: 'POST', body: payload }),

  rentals: () => request('/api/emergency/rentals', { admin: true }),
  deliveries: () => request('/api/emergency/deliveries', { admin: true }),
  adminRequests: () => request('/api/admin/requests', { admin: true }),

  // The portal's missing-person records ship with the site, so the list is never
  // empty and works with no server running. Anything the API returns is added on
  // top of them.
  missingPersons: async () => {
    try {
      const remote = await request('/api/missing-persons');
      return [...SAMPLE_MISSING_PERSONS, ...(Array.isArray(remote) ? remote : [])];
    } catch {
      return [...SAMPLE_MISSING_PERSONS];
    }
  },
  createMissingPerson: (payload) => request('/api/missing-persons', { method: 'POST', body: payload }),

  news: (category) => request(`/api/news${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  createNews: (payload) => request('/api/news', { method: 'POST', body: payload, admin: true }),

  assistantStarters: (language) => request(`/api/assistant/starters?language=${language}`),
  assistantChat: (payload) => request('/api/assistant/chat', { method: 'POST', body: payload, timeout: 25000 }),
};
