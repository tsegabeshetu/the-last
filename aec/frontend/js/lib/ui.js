import { escapeHtml, statusTone } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

export function loadingBlock(rows = 3) {
  return `
    <div class="grid" style="gap:.75rem" aria-busy="true" aria-label="${t('common.loading')}">
      ${Array.from({ length: rows })
        .map(() => '<div class="skeleton skeleton-card"></div>')
        .join('')}
    </div>
  `;
}

export function errorBlock(message, { retryLabel = t('action.retry'), retryAttribute = 'data-retry' } = {}) {
  return `
    <div class="card card--pad center stack" style="place-items:center">
      <span style="color:var(--alert);display:inline-flex">${icon('alert-triangle')}</span>
      <p style="color:var(--muted);max-width:44ch">${escapeHtml(message)}</p>
      <button class="btn btn--ghost btn--sm" type="button" ${retryAttribute}>${icon('refresh')}${escapeHtml(retryLabel)}</button>
    </div>
  `;
}

export function statusBadge(status) {
  const tone = statusTone(status);
  const key = `status.${status}`;
  const translated = t(key);
  const label = translated === key ? status : translated;
  return `<span class="badge badge--${tone}">${escapeHtml(label)}</span>`;
}

export function sampleBadge() {
  return `<span class="badge badge--outline badge--sm">${icon('info')}${t('common.sample')}</span>`;
}

export function pageHead({ eyebrow, title, lede, image, crumbs = [] }) {
  const crumbMarkup = crumbs.length
    ? `<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs
        .map((crumb) => `<a href="${crumb.href}">${escapeHtml(crumb.label)}</a><span>/</span>`)
        .join('')}<span>${escapeHtml(title)}</span></nav>`
    : '';

  return `
    <section class="page-head">
      ${image ? `<img class="page-head__photo" src="${image}" alt="" />` : ''}
      <div class="shell">
        ${crumbMarkup}
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(lede)}</p>
      </div>
    </section>
  `;
}

export function emptyBlock(message) {
  return `<div class="empty-state">${icon('info')}<p>${escapeHtml(message)}</p></div>`;
}
