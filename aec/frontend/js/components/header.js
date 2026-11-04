import { CONFIG } from '../config.js';
import { icon } from '../lib/icons.js';
import { getLanguage, onLanguageChange, setLanguage, t } from '../lib/i18n.js';

const NAV = [
  ['home', '#/home', 'nav.home'],
  ['emergency', '#/emergency', 'nav.emergency'],
  ['map', '#/map', 'nav.map'],
  ['report', '#/report', 'nav.report'],
  ['missing-persons', '#/missing-persons', 'nav.missing'],
  ['news', '#/news', 'nav.news'],
  ['help', '#/help', 'nav.help'],
];

let currentRoute = 'home';
let isOpen = false;

export function renderHeader() {
  const root = document.getElementById('site-header');
  if (!root) return;
  const language = getLanguage();

  root.innerHTML = `
    <header class="site-header">
      <div class="shell site-header__inner">
    <a class="brand" href="#/home" aria-label="${t('brand.full')}">
      <span class="brand__mark">${icon('shield')}</span>
      <span class="brand__text">
        <span class="brand__name">${t('brand.short')}</span>
        <span class="brand__tag">${t('brand.full')}</span>
      </span>
    </a>

        <nav class="site-nav${isOpen ? ' is-open' : ''}" id="site-nav" aria-label="Main navigation">
          ${NAV.map(
            ([route, href, label]) =>
              `<a href="${href}" data-route="${route}"${route === currentRoute ? ' aria-current="page"' : ''}>${t(label)}</a>`,
          ).join('')}
        </nav>

        <div class="header-actions">
          <div class="lang-toggle" role="group" aria-label="Language">
            <button type="button" data-lang="en" aria-pressed="${language === 'en'}">EN</button>
            <button type="button" data-lang="am" aria-pressed="${language === 'am'}">አማ</button>
          </div>
          <a class="btn btn--call btn--sm" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}<span>${CONFIG.emergencyNumber}</span></a>
          <button class="btn btn--assistant btn--sm" type="button" data-open-assistant>
            ${icon('sparkles')}<span>${t('assistant.name')}</span>
          </button>
          <button class="nav-toggle" type="button" aria-expanded="${isOpen}" aria-controls="site-nav" aria-label="Menu">
            ${icon(isOpen ? 'close' : 'menu')}
          </button>
        </div>
      </div>
    </header>
  `;

  root.querySelector('.nav-toggle')?.addEventListener('click', () => {
    isOpen = !isOpen;
    const nav = root.querySelector('#site-nav');
    nav.classList.toggle('is-open', isOpen);
    root.querySelector('.nav-toggle').setAttribute('aria-expanded', String(isOpen));
    root.querySelector('.nav-toggle').innerHTML = icon(isOpen ? 'close' : 'menu');
  });

  root.querySelectorAll('.site-nav a').forEach((link) =>
    link.addEventListener('click', () => {
      isOpen = false;
      root.querySelector('#site-nav').classList.remove('is-open');
      root.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
    }),
  );

  root.querySelectorAll('[data-lang]').forEach((button) =>
    button.addEventListener('click', () => {
      setLanguage(button.dataset.lang);
      renderHeader();
    }),
  );

  root.querySelector('[data-open-assistant]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('aec:open-assistant'));
  });
}

export function setActiveRoute(route) {
  currentRoute = route;
  document.querySelectorAll('.site-nav a').forEach((link) => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

onLanguageChange(() => renderHeader());
