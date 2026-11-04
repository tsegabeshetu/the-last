// Offline / SMS fallback.
//
// When the browser has no connection (or the API cannot be reached) the portal
// keeps working as a read-only page and every request is redirected to the
// phone's SMS app addressed to the emergency line.
import { CONFIG } from '../config.js';

const BANNER_ID = 'aec-offline-banner';
const SMS_NUMBER = CONFIG.emergencyNumber;
let dialog = null;

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function smsHref(body = '') {
  const text = String(body || '').trim();
  return `sms:${SMS_NUMBER}${text ? `?body=${encodeURIComponent(text)}` : ''}`;
}

export function buildIncidentSms({ category, title, description, location_name, severity, lat, lng } = {}) {
  const lines = [
    'AEC EMERGENCY',
    category ? `Type: ${category}` : '',
    title ? `What: ${title}` : '',
    description ? `Details: ${description}` : '',
    location_name ? `Where: ${location_name}` : '',
    Number.isFinite(lat) && Number.isFinite(lng) ? `GPS: ${lat},${lng}` : '',
    severity ? `Urgency: ${severity}` : '',
  ];
  return lines.filter(Boolean).join('\n').slice(0, 900);
}

function bannerMarkup() {
  return `
    <div class="offline-banner" id="${BANNER_ID}" role="status" aria-live="polite">
      <span class="offline-banner__dot" aria-hidden="true"></span>
      <p><strong>Offline mode</strong> — no internet. Your request can be sent by SMS instead.</p>
      <a class="btn btn--alert btn--sm" href="${smsHref('AEC EMERGENCY - I need help.')}">Send SMS to ${SMS_NUMBER}</a>
      <button class="icon-btn" type="button" data-offline-dismiss aria-label="Dismiss offline notice">&times;</button>
    </div>
  `;
}

function showBanner() {
  if (!document.body || document.getElementById(BANNER_ID)) return;
  document.body.insertAdjacentHTML('beforeend', bannerMarkup());
  document.getElementById(BANNER_ID)?.querySelector('[data-offline-dismiss]')?.addEventListener('click', () => {
    document.getElementById(BANNER_ID)?.remove();
  });
  document.body.classList.add('is-offline');
}

function hideBanner() {
  document.getElementById(BANNER_ID)?.remove();
  document.body.classList.remove('is-offline');
}

export function syncOfflineBanner() {
  if (isOffline()) showBanner();
  else hideBanner();
}

/**
 * Show a small sheet offering the same request as an SMS message.
 * Returns the SMS href so callers can use it for tests or analytics.
 */
export function offerSmsFallback({ title = 'Send this request by SMS', body = '', message = '' } = {}) {
  const href = smsHref(body);

  if (dialog) dialog.remove();
  dialog = document.createElement('div');
  dialog.className = 'sms-fallback';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `
    <div class="sms-fallback__panel">
      <div class="sms-fallback__head">
        <div>
          <p class="eyebrow">Offline mode</p>
          <h2>${title}</h2>
        </div>
        <button class="icon-btn" type="button" data-sms-close aria-label="Close">&times;</button>
      </div>
      <p class="small muted">${message || `No internet connection. The details below will open in your SMS app, addressed to ${SMS_NUMBER}.`}</p>
      <pre class="sms-fallback__preview">${body || `AEC EMERGENCY - I need help.`}</pre>
      <div class="btn-row">
        <a class="btn btn--alert btn--block" href="${href}" data-sms-send>Open SMS app</a>
        <button class="btn btn--ghost btn--block" type="button" data-sms-close>Keep browsing</button>
      </div>
      <p class="hint">SMS delivery depends on your mobile network. For immediate danger, call ${SMS_NUMBER} if you can.</p>
    </div>
  `;
  document.body.appendChild(dialog);

  const close = () => {
    dialog?.remove();
    dialog = null;
  };
  dialog.querySelectorAll('[data-sms-close]').forEach((button) => button.addEventListener('click', close));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  return href;
}

export function initOfflineMode() {
  syncOfflineBanner();
  window.addEventListener('online', () => {
    hideBanner();
    window.dispatchEvent(new CustomEvent('aec:online'));
  });
  window.addEventListener('offline', () => {
    showBanner();
    window.dispatchEvent(new CustomEvent('aec:offline'));
  });
  window.addEventListener('aec:offline', showBanner);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!['http:', 'https:'].includes(location.protocol)) return;
  // sw.js sits at the frontend root (two levels above this file); the worker's
  // own directory becomes its scope, so it controls the whole site whether it
  // is served at / or under a sub-path.
  const worker = new URL('../../sw.js', import.meta.url);
  navigator.serviceWorker.register(worker).catch(() => {
    // Offline fallback still works without a service worker.
  });
}
