// Small DOM and formatting helpers shared by every page.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Sets innerHTML and returns the first element child. */
export function mount(root, markup) {
  root.innerHTML = markup;
  return root.firstElementChild;
}

export function on(target, eventName, selector, handler) {
  target.addEventListener(eventName, (event) => {
    const match = event.target.closest(selector);
    if (match && target.contains(match)) handler(event, match);
  });
}

export function formatDate(value, language = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateShort(value, language = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatMoney(amount, language = 'en') {
  const value = Number(amount || 0);
  const formatted = new Intl.NumberFormat(language === 'am' ? 'am-ET' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
  return language === 'am' ? `${formatted} ብር` : `ETB ${formatted}`;
}

export function relativeTime(value, language = 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat(language === 'am' ? 'am' : 'en', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const hours = Math.round(diffMinutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private mode */
  }
}

export function statusTone(status = '') {
  const value = status.toLowerCase();
  if (value.includes('resolved') || value.includes('delivered') || value.includes('confirmed')) return 'safe';
  if (value.includes('critical') || value.includes('cancel') || value.includes('reject')) return 'alert';
  if (value.includes('progress') || value.includes('dispatch') || value.includes('review') || value.includes('queued')) return 'amber';
  return 'outline';
}

export function severityLabel(severity, t) {
  return t(`severity.${severity}`) || severity;
}

export function categoryLabel(category, t) {
  return t(`category.${category}`) || category;
}

/** Opens a <dialog> built from markup and wires close behaviour. */
export function openDialog(markup, { onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.innerHTML = markup;
  document.body.append(dialog);

  const close = () => dialog.close();
  dialog.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  dialog.showModal();
  return { dialog, close };
}

export function scrollToId(id) {
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function currentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(new Error(error.message || 'Location permission was denied.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
