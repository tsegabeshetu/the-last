import { api } from '../lib/api.js';
import { escapeHtml, formatDate, relativeTime } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { emptyBlock, errorBlock, loadingBlock, pageHead, sampleBadge, statusBadge } from '../lib/ui.js';
import { renderIncidentMap } from '../components/map.js';

const CATEGORIES = ['critical', 'infrastructure', 'community'];

const state = {
  incidents: [],
  filter: '',
};

export async function render(root) {
  state.incidents = [];
  state.filter = '';

  root.innerHTML = `
    ${pageHead({
      eyebrow: t('map.eyebrow'),
      title: t('map.title'),
      lede: t('map.lede'),
      image: 'assets/img/bg-community.jpg',
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}

    <section class="section">
      <div class="shell stack" style="gap:1.25rem">
        <div class="section-head" style="margin-bottom:0">
          <div>
            <p class="eyebrow">${t('map.filterLabel')}</p>
            <div class="chip-row" id="map-filters" role="group" aria-label="${t('map.filterLabel')}"></div>
          </div>
          <span class="badge badge--outline">${icon('info')}${t('map.sampleNote')}</span>
        </div>

        <div class="live-grid">
          <div class="map-frame">
            <div class="map-canvas" id="map-canvas">${loadingBlock(1)}</div>
            <div class="map-frame__label">
              <span class="live-dot live-dot--alert"></span>ETHIOPIA
              <span>9.1450° N · 40.4897° E</span>
            </div>
          </div>

          <div class="feed">
            <div class="feed__head">
              <h3>${t('map.listTitle')}</h3>
              <span class="badge badge--outline" id="map-count">—</span>
            </div>
            <div class="feed__list" id="map-list">${loadingBlock(3)}</div>
          </div>
        </div>
      </div>
    </section>
  `;

  await load(root);
}

async function load(root) {
  const list = root.querySelector('#map-list');
  try {
    state.incidents = await api.incidents({ limit: 200 });
    renderFilters(root);
    renderList(root);
    await renderMap(root);
  } catch (error) {
    if (list) {
      list.innerHTML = errorBlock(error.message);
      list.querySelector('[data-retry]')?.addEventListener('click', () => load(root));
    }
    const canvas = root.querySelector('#map-canvas');
    if (canvas) canvas.innerHTML = `<div class="map-fallback">${escapeHtml(t('map.failed'))}</div>`;
  }
}

function renderFilters(root) {
  const row = root.querySelector('#map-filters');
  if (!row) return;

  row.innerHTML = [
    `<button class="chip" type="button" data-filter="" aria-pressed="${state.filter === ''}">${t('map.filterAll')}</button>`,
    ...CATEGORIES.map(
      (category) =>
        `<button class="chip" type="button" data-filter="${category}" aria-pressed="${state.filter === category}">${icon(
          category === 'critical' ? 'flame' : category === 'infrastructure' ? 'zap' : 'users',
        )}${t(`category.${category}`)}</button>`,
    ),
  ].join('');

  row.querySelectorAll('[data-filter]').forEach((button) =>
    button.addEventListener('click', async () => {
      state.filter = button.dataset.filter;
      row.querySelectorAll('[data-filter]').forEach((item) =>
        item.setAttribute('aria-pressed', String(item.dataset.filter === state.filter)),
      );
      renderList(root);
      await renderMap(root);
    }),
  );
}

function visibleIncidents() {
  return state.filter
    ? state.incidents.filter((incident) => incident.category === state.filter)
    : state.incidents;
}

function renderList(root) {
  const list = root.querySelector('#map-list');
  const count = root.querySelector('#map-count');
  if (!list) return;

  const incidents = visibleIncidents();
  if (count) count.textContent = t('map.count', { count: incidents.length });

  if (!incidents.length) {
    list.innerHTML = emptyBlock(t('common.noResults'));
    return;
  }

  list.innerHTML = incidents
    .map(
      (incident) => `
      <article class="feed-item" style="cursor:default">
        <span class="feed-item__dot feed-item__dot--${escapeHtml(incident.category)}"></span>
        <div>
          <h4>${escapeHtml(incident.title)}</h4>
          <p>
            ${escapeHtml(incident.location_name)} · ${escapeHtml(t(`severity.${incident.severity}`))} ·
            ${escapeHtml(relativeTime(incident.created_at, getLanguage()))}
          </p>
          <div class="meta-row" style="margin-top:.35rem">
            ${statusBadge(incident.status)}
            ${incident.is_sample ? sampleBadge() : ''}
            <span>${icon('clock')}${escapeHtml(formatDate(incident.created_at, getLanguage()))}</span>
          </div>
        </div>
      </article>`,
    )
    .join('');
}

async function renderMap(root) {
  const canvas = root.querySelector('#map-canvas');
  if (!canvas) return;
  await renderIncidentMap(canvas, visibleIncidents(), { language: getLanguage(), height: 460 });
}
