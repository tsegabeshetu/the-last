// Runtime configuration. When the app is served by the API (production) it
// uses same-origin requests; the local static dev server still points at 8000.
const storedBase = localStorage.getItem('aec.apiBase');
const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
const localDevApi = isLocalHost && location.port && location.port !== '8000' ? 'http://127.0.0.1:8000' : '';

export const CONFIG = {
  apiBase: (storedBase ?? localDevApi).replace(/\/$/, ''),
  emergencyNumber: '611',
  policeNumber: '991',
  ambulanceNumber: '907',
  adminTokenKey: 'aec.adminToken',
  languageKey: 'aec.language',
  sessionKey: 'aec.assistant.session',
};

export function setApiBase(base) {
  localStorage.setItem('aec.apiBase', base);
  CONFIG.apiBase = base.replace(/\/$/, '');
}
