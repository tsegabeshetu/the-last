// AEC single-page router. Hash routes keep the static server requirement to zero.
import { mountAssistant } from './components/assistant.js';
import { renderFooter } from './components/footer.js';
import { renderHeader, setActiveRoute } from './components/header.js';
import { disposeMap } from './components/map.js';
import { escapeHtml } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { applyStoredLanguage, onLanguageChange, t } from './lib/i18n.js';
import { initOfflineMode, registerServiceWorker } from './lib/offline.js';
import { errorBlock } from './lib/ui.js';

import * as homePage from './pages/home.js';
import * as emergencyPage from './pages/emergency.js';
import * as mapPage from './pages/map-page.js';
import * as reportPage from './pages/report.js';
import * as missingPage from './pages/missing.js';
import * as newsPage from './pages/news.js';
import * as helpPage from './pages/help.js';
import * as adminPage from './pages/admin.js';

const ROUTES = {
  home: { page: homePage, title: 'nav.home' },
  emergency: { page: emergencyPage, title: 'nav.emergency' },
  map: { page: mapPage, title: 'nav.map' },
  report: { page: reportPage, title: 'nav.report' },
  'missing-persons': { page: missingPage, title: 'nav.missing' },
  news: { page: newsPage, title: 'nav.news' },
  help: { page: helpPage, title: 'nav.help' },
  admin: { page: adminPage, title: 'nav.admin' },
};

let activeRender = 0;

function parseRoute() {
  const hash = location.hash || '#/home';
  const body = hash.replace(/^#\/?/, '');
  const [path, query = ''] = body.split('?');
  const name = path.replace(/\/+$/, '') || 'home';
  return { name, params: Object.fromEntries(new URLSearchParams(query)) };
}

function focusMain(main) {
  try {
    main.focus({ preventScroll: true });
  } catch {
    main.focus();
  }
}

function notFound() {
  return `
    <section class="section">
      <div class="shell stack center" style="place-items:center;text-align:center;gap:1rem">
        <p class="eyebrow">404</p>
        <h1>${escapeHtml(t('error.notFoundTitle'))}</h1>
        <p class="muted" style="max-width:46ch">${escapeHtml(t('error.notFoundText'))}</p>
        <div class="btn-row" style="justify-content:center">
          <a class="btn" href="#/home">${icon('home')}${escapeHtml(t('action.backHome'))}</a>
          <a class="btn btn--ghost" href="#/help">${icon('info')}${escapeHtml(t('nav.help'))}</a>
        </div>
      </div>
    </section>
  `;
}

async function renderRoute() {
  const main = document.getElementById('main');
  if (!main) return;

  const { name, params } = parseRoute();
  const route = ROUTES[name];
  const ticket = ++activeRender;

  disposeMap();
  main.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (!route) {
    setActiveRoute('');
    document.title = `${t('error.notFoundTitle')} · ${t('brand.short')}`;
    main.innerHTML = notFound();
    focusMain(main);
    return;
  }

  setActiveRoute(name);
  document.title = `${t(route.title)} · ${t('brand.short')}`;

  try {
    await route.page.render(main, params);
  } catch (error) {
    if (ticket !== activeRender) return;
    console.error('AEC page failed to render', error);
    main.innerHTML = `<section class="section"><div class="shell">${errorBlock(t('error.pageFailed'))}</div></section>`;
    main.querySelector('[data-retry]')?.addEventListener('click', () => {
      void renderRoute();
    });
    focusMain(main);
    return;
  }

  if (ticket !== activeRender) return;
  main.classList.remove('page-enter');
  void main.offsetWidth;
  main.classList.add('page-enter');
  focusMain(main);
}

function boot() {
  applyStoredLanguage();
  initOfflineMode();
  registerServiceWorker();
  renderHeader();
  renderFooter();
  mountAssistant();

  if (!location.hash) history.replaceState(null, '', '#/home');

  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    const main = document.getElementById('main');
    if (!main) return;
    main.scrollIntoView();
    focusMain(main);
  });

  window.addEventListener('hashchange', () => {
    void renderRoute();
  });

  onLanguageChange(() => {
    renderFooter();
    void renderRoute();
  });

  void renderRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
