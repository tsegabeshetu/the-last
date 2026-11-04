import { api } from '../lib/api.js';
import { escapeHtml, formatDate, relativeTime } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { loadingBlock } from '../lib/ui.js';
import { renderIncidentMap } from '../components/map.js';
import { paymentBadgesMarkup } from '../components/payment.js';

const SERVICES = [
  { route: '#/report?category=critical', icon: 'flame', title: 'service.critical.title', desc: 'service.critical.desc', tone: 'alert' },
  { route: '#/report?category=infrastructure', icon: 'zap', title: 'service.infrastructure.title', desc: 'service.infrastructure.desc', tone: '' },
  { route: '#/report?category=community', icon: 'users', title: 'service.community.title', desc: 'service.community.desc', tone: '' },
  { route: '#/emergency?service=rental', icon: 'car', title: 'service.rental.title', desc: 'service.rental.desc', tone: 'amber', cta: 'service.rental.cta' },
  { route: '#/emergency?service=medications', icon: 'pill', title: 'service.medication.title', desc: 'service.medication.desc', tone: 'amber', cta: 'service.medication.cta' },
];

export async function render(root) {
  root.innerHTML = `
    <section class="hero">
      <img class="hero__photo" src="assets/img/aurastay-response.jpg" alt="" width="1920" height="1024" />
      <div class="shell hero__inner">
        <p class="eyebrow eyebrow--light"><span class="live-dot"></span>${t('home.eyebrow')}</p>
        <h1>${t('brand.full')}</h1>
        <p class="hero__lede">${t('home.lede')}</p>
        <div class="hero__actions">
          <a class="btn btn--alert" href="#/report">${t('action.report')}</a>
          <a class="btn btn--light" href="tel:611">${t('action.call611')}</a>
          <button class="btn btn--ghost" type="button" data-open-assistant>${t('action.askAsayech')}</button>
        </div>
        <div class="hero__chips">
          <span>${t('home.chip1')}</span>
          <span>${t('home.chip2')}</span>
          <span>${t('home.chip3')}</span>
        </div>
      </div>
      <div class="hero__strip">
        <div class="shell">
          <div class="metrics" id="home-stats" aria-busy="true">
            ${Array.from({ length: 3 })
              .map(
                () => `<div class="metric"><strong>—</strong><span>${t('common.loading')}</span></div>`,
              )
              .join('')}
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('home.servicesEyebrow')}</p>
            <h2>${t('home.servicesTitle')}</h2>
          </div>
          <p>${t('home.servicesLede')}</p>
        </div>
        <div class="grid grid--auto">
          ${SERVICES.map(
            (service) => `
            <a class="service-card${service.tone ? ` service-card--${service.tone}` : ''}" href="${service.route}">
              <h3>${t(service.title)}</h3>
              <p>${t(service.desc)}</p>
              <span class="service-card__link">${service.cta ? t(service.cta) : t('action.open')}</span>
            </a>`,
          ).join('')}
        </div>
      </div>
    </section>

    <section class="section section--surface">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('home.howEyebrow')}</p>
            <h2>${t('home.howTitle')}</h2>
          </div>
          <p>${t('home.howLede')}</p>
        </div>
        <div class="step-grid">
          ${[
            ['1', 'home.step1Title', 'home.step1Text'],
            ['2', 'home.step2Title', 'home.step2Text'],
            ['3', 'home.step3Title', 'home.step3Text'],
            ['4', 'home.step4Title', 'home.step4Text'],
          ]
            .map(
              ([number, title, text]) => `
            <article class="step-card">
              <span class="step-card__number">${number}</span>
              <h3>${t(title)}</h3>
              <p>${t(text)}</p>
            </article>`,
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('home.liveEyebrow')}</p>
            <h2>${t('home.liveTitle')}</h2>
          </div>
          <p>${t('home.liveLede')}</p>
        </div>
        <div class="live-grid">
          <div class="map-frame">
            <div class="map-canvas" id="home-map"></div>
            <div class="map-frame__label"><span class="live-dot live-dot--alert"></span>ETHIOPIA <span>9.1450° N · 40.4897° E</span></div>
          </div>
          <div class="feed">
            <div class="feed__head">
              <h3>${t('home.feedTitle')}</h3>
              <span class="badge badge--outline">${t('common.demoData')}</span>
            </div>
            <div class="feed__list" id="home-feed">${loadingBlock(3)}</div>
            <div class="feed__foot">
              <a class="btn btn--quiet btn--sm" href="#/map">${t('map.openList')}</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--surface">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('home.paymentsEyebrow')}</p>
            <h2>${t('home.paymentsTitle')}</h2>
          </div>
          <p>${t('home.paymentsLede')}</p>
        </div>
        <div class="payment-band">
          <div class="payment-band__badges">${paymentBadgesMarkup()}</div>
          <div class="payment-band__note">
            <strong>${t('home.paymentsNoteTitle')}</strong>
            <p>${t('home.paymentsNote')}</p>
          </div>
          <div class="btn-row">
            <a class="btn btn--sm" href="#/emergency?service=rental">${t('service.rental.cta')}</a>
            <a class="btn btn--ghost btn--sm" href="#/emergency?service=medications">${t('service.medication.cta')}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('home.newsEyebrow')}</p>
            <h2>${t('home.newsTitle')}</h2>
          </div>
          <a class="btn btn--quiet btn--sm" href="#/news">${t('action.viewAll')}</a>
        </div>
        <div class="grid grid--3" id="home-news">${loadingBlock(3)}</div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="assistant-band">
          <div>
            <p class="eyebrow eyebrow--light">${t('assistant.name')} · AI</p>
            <h2>${t('home.assistantTitle')}</h2>
            <p>${t('home.assistantLede')}</p>
          </div>
          <div class="btn-row">
            <button class="btn btn--amber" type="button" data-open-assistant>${t('action.askAsayech')}</button>
            <a class="btn btn--light" href="tel:611">${t('action.call611')}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="shell">
        <p class="eyebrow">${t('home.agencyTitle')}</p>
        <div class="agency-strip">
          <span>Fire & Rescue</span>
          <span>Police & Safety</span>
          <span>EEPCO Power</span>
          <span>Emergency Medical Service</span>
          <span>Water & Sewerage</span>
          <span>Mobility Partners</span>
          <span>Pharmacy Partners</span>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll('[data-open-assistant]').forEach((button) =>
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('aec:open-assistant'))),
  );

  loadStats(root);
  loadLive(root);
  loadNews(root);
}

// The home strip shows headline figures, not category counts. Live counters from
// the API are used when they beat the published baseline; otherwise the baseline
// is shown so the public page never looks empty.
const HEADLINE_STATS = [
  { key: 'sos_activations', floor: 400, label: 'home.stat1' },
  { key: 'pharmacies', floor: 23000, label: 'home.stat6' },
  { key: 'vehicles_available', floor: 1200, label: 'home.stat5' },
];

function formatHeadline(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 1000) {
    const compact = number >= 10000 ? Math.round(number / 1000) : Math.round(number / 100) / 10;
    return `${compact}k+`;
  }
  return `${number}+`;
}

function renderHeadlineStats(target, stats = {}) {
  target.innerHTML = HEADLINE_STATS.map(({ key, floor, label }) => {
    const value = Math.max(Number(stats[key]) || 0, floor);
    return `<div class="metric"><strong>${formatHeadline(value)}</strong><span>${t(label)}</span></div>`;
  }).join('');
  target.removeAttribute('aria-busy');
}

async function loadStats(root) {
  const target = root.querySelector('#home-stats');
  try {
    const stats = await api.stats();
    renderHeadlineStats(target, stats);
  } catch {
    renderHeadlineStats(target);
  }
}

async function loadNews(root) {
  const target = root.querySelector('#home-news');
  if (!target) return;
  try {
    const articles = await api.news();
    if (!articles.length) {
      target.innerHTML = `<div class="empty-state">${icon('info')}<p>${t('home.newsEmpty')}</p></div>`;
      return;
    }
    target.innerHTML = articles
      .slice(0, 3)
      .map(
        (article) => `
        <a class="article-card" href="#/news">
          <span class="badge badge--outline">${escapeHtml(article.category)}</span>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.summary)}</p>
          <div class="article-card__meta">
            <span>${escapeHtml(formatDate(article.created_at, getLanguage()))}</span>
            <span>${t('news.read')}${icon('arrow-right')}</span>
          </div>
        </a>`,
      )
      .join('');
  } catch {
    target.innerHTML = `<div class="empty-state">${icon('info')}<p>${t('home.newsEmpty')}</p></div>`;
  }
}

async function loadLive(root) {
  const feed = root.querySelector('#home-feed');
  try {
    const incidents = await api.incidents();
    const active = incidents.filter((incident) => incident.status !== 'Resolved');

    if (!active.length) {
      feed.innerHTML = `<div class="empty-state">${icon('shield')}<p>${t('home.feedEmpty')}</p></div>`;
    } else {
      feed.innerHTML = active
        .slice(0, 5)
        .map(
          (incident) => `
          <a class="feed-item" href="#/map">
            <span class="feed-item__dot feed-item__dot--${escapeHtml(incident.category)}"></span>
            <div>
              <h4>${escapeHtml(incident.title)}</h4>
              <p>${escapeHtml(incident.location_name)} · ${escapeHtml(t(`status.${incident.status}`))} · ${escapeHtml(relativeTime(incident.created_at))}</p>
            </div>          </a>`,
        )
        .join('');
    }

    const mapTarget = root.querySelector('#home-map');
    if (mapTarget) {
      await renderIncidentMap(mapTarget, active, { height: 400 });
    }
  } catch (error) {
    feed.innerHTML = `<div class="empty-state">${icon('alert-triangle')}<p>${escapeHtml(error.message)}</p><a class="btn btn--ghost btn--sm" href="#/help">${t('nav.help')}</a></div>`;
    const mapTarget = root.querySelector('#home-map');
    if (mapTarget) mapTarget.innerHTML = `<div class="map-fallback">${escapeHtml(t('map.failed'))}</div>`;
  }
}
