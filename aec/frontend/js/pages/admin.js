import { CONFIG } from '../config.js';
import { api } from '../lib/api.js';
import { escapeHtml, formatDate, formatMoney } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { emptyBlock, errorBlock, loadingBlock, pageHead, statusBadge } from '../lib/ui.js';
import { toast } from '../components/toast.js';

const TABS = [
  ['rentals', 'admin.tabRentals'],
  ['deliveries', 'admin.tabDeliveries'],
  ['sos', 'admin.tabSos'],
  ['incidents', 'admin.tabIncidents'],
  ['news', 'admin.tabNews'],
];

const INCIDENT_STATUSES = ['Reported', 'Dispatched', 'In progress', 'Resolved'];
const NEWS_CATEGORIES = ['Preparedness', 'Safety', 'Health', 'Missing persons', 'Traffic', 'Utilities'];

const state = {
  token: localStorage.getItem(CONFIG.adminTokenKey) || '',
  tab: 'rentals',
  requests: null,
  incidents: [],
  news: [],
};

export async function render(root) {
  root.innerHTML = `
    ${pageHead({
      eyebrow: t('admin.eyebrow'),
      title: t('admin.title'),
      lede: t('admin.lede'),
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}
    <section class="section">
      <div class="shell" id="admin-body"></div>
    </section>
  `;

  if (state.token) await loadAll(root);
  else renderGate(root);
}

/* ------------------------------- token gate ------------------------------- */
function renderGate(root, message = '') {
  const body = root.querySelector('#admin-body');
  if (!body) return;

  body.innerHTML = `
    <div class="admin-gate card card--pad stack">
      <span class="badge badge--outline">${icon('shield')}${t('admin.eyebrow')}</span>
      <h2 style="font-size:1.3rem">${t('admin.unlock')}</h2>
      <p class="small muted">${t('admin.noToken')}</p>
      ${message ? `<div class="notice notice--alert">${icon('alert-triangle')}<span>${escapeHtml(message)}</span></div>` : ''}
      <form class="stack" data-admin-form novalidate>
        <div class="field">
          <label for="admin-token">${t('admin.token')} <small>${t('common.required')}</small></label>
          <input class="input" id="admin-token" name="token" type="password" required autocomplete="current-password" />
          <p class="hint">${t('admin.demoHint')}</p>
        </div>
        <button class="btn btn--block" type="submit">${icon('shield')}${t('admin.unlock')}</button>
      </form>
    </div>
  `;

  const form = body.querySelector('[data-admin-form]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = form.elements.token.value.trim();
    if (!token) {
      toast(t('admin.noToken'), { type: 'error' });
      return;
    }
    state.token = token;
    localStorage.setItem(CONFIG.adminTokenKey, token);
    await loadAll(root);
  });
}

async function loadAll(root) {
  const body = root.querySelector('#admin-body');
  if (!body) return;
  body.innerHTML = loadingBlock(3);

  try {
    const [requests, incidents, news] = await Promise.all([
      api.adminRequests(),
      api.incidents({ limit: 200 }),
      api.news(),
    ]);
    state.requests = requests;
    state.incidents = incidents;
    state.news = news;
    renderDesk(root);
  } catch (error) {
    if (error.status === 401) {
      state.token = '';
      localStorage.removeItem(CONFIG.adminTokenKey);
      renderGate(root, t('admin.unauthorized'));
      return;
    }
    body.innerHTML = errorBlock(error.message);
    body.querySelector('[data-retry]')?.addEventListener('click', () => loadAll(root));
  }
}

/* --------------------------------- desk ---------------------------------- */
function renderDesk(root) {
  const body = root.querySelector('#admin-body');
  if (!body) return;

  body.innerHTML = `
    <div class="stack" style="gap:1rem">
      <div class="list-card__head">
        <div class="notice notice--info" style="margin:0">${icon('shield')}<span>${t('admin.signedIn')}</span></div>
        <button class="btn btn--ghost btn--sm" type="button" data-admin-lock>${icon('log-out')}${t('admin.lock')}</button>
      </div>

      <div class="tabs" role="tablist" aria-label="${t('admin.title')}">
        ${TABS.map(
          ([key, label]) =>
            `<button type="button" role="tab" data-admin-tab="${key}" aria-selected="${state.tab === key}">${t(label)}</button>`,
        ).join('')}
      </div>

      <div id="admin-panel"></div>
    </div>
  `;

  body.querySelectorAll('[data-admin-tab]').forEach((button) =>
    button.addEventListener('click', () => {
      state.tab = button.dataset.adminTab;
      body.querySelectorAll('[data-admin-tab]').forEach((item) =>
        item.setAttribute('aria-selected', String(item.dataset.adminTab === state.tab)),
      );
      renderPanel(root);
    }),
  );

  body.querySelector('[data-admin-lock]').addEventListener('click', () => {
    state.token = '';
    state.requests = null;
    state.incidents = [];
    state.news = [];
    localStorage.removeItem(CONFIG.adminTokenKey);
    renderGate(root);
    toast(t('admin.signedOut'));
  });

  renderPanel(root);
}

function renderPanel(root) {
  const panel = root.querySelector('#admin-panel');
  if (!panel) return;

  switch (state.tab) {
    case 'deliveries':
      renderDeliveries(panel);
      break;
    case 'sos':
      renderSos(panel);
      break;
    case 'incidents':
      renderIncidents(panel, root);
      break;
    case 'news':
      renderNews(panel, root);
      break;
    default:
      renderRentals(panel);
  }
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function dateCell(value) {
  return `<span class="small muted">${escapeHtml(formatDate(value, getLanguage()))}</span>`;
}

function renderRentals(panel) {
  const rentals = state.requests?.rentals || [];
  if (!rentals.length) {
    panel.innerHTML = emptyBlock(t('admin.empty'));
    return;
  }

  panel.innerHTML = table(
    [t('admin.ref'), t('admin.customer'), t('admin.vehicle'), t('admin.pickup'), t('admin.days'), t('admin.total'), t('common.status'), t('admin.created')],
    rentals.map((rental) => [
      `<code>${escapeHtml(rental.reference)}</code>`,
      `<strong>${escapeHtml(rental.full_name)}</strong><br /><span class="small muted">${escapeHtml(rental.phone)}</span>`,
      escapeHtml(rental.vehicle_name),
      `${escapeHtml(rental.pickup_location)}<br /><span class="small muted">${escapeHtml(rental.pickup_date)}</span>`,
      String(rental.days),
      formatMoney(rental.total_etb, getLanguage()),
      statusBadge(rental.status),
      dateCell(rental.created_at),
    ]),
  );
}

function renderDeliveries(panel) {
  const deliveries = state.requests?.deliveries || [];
  if (!deliveries.length) {
    panel.innerHTML = emptyBlock(t('admin.empty'));
    return;
  }

  panel.innerHTML = table(
    [t('admin.ref'), t('admin.customer'), t('emergency.pharmacy'), t('admin.items'), t('admin.total'), t('admin.priority'), t('common.status'), t('admin.created')],
    deliveries.map((delivery) => [
      `<code>${escapeHtml(delivery.reference)}</code>`,
      `<strong>${escapeHtml(delivery.full_name)}</strong><br /><span class="small muted">${escapeHtml(delivery.phone)}</span><br /><span class="small muted">${escapeHtml(delivery.address)}</span>`,
      `${escapeHtml(delivery.pharmacy_name)}<br /><span class="small muted">${escapeHtml(delivery.city)}</span>`,
      (delivery.items || [])
        .map((item) => `${escapeHtml(item.name)} × ${item.quantity}`)
        .join('<br />'),
      formatMoney(delivery.total_etb, getLanguage()),
      escapeHtml(t(`emergency.${delivery.priority === 'urgent' ? 'urgent' : 'standard'}`)),
      statusBadge(delivery.status),
      dateCell(delivery.created_at),
    ]),
  );
}

function renderSos(panel) {
  const alerts = state.requests?.sos || [];
  if (!alerts.length) {
    panel.innerHTML = emptyBlock(t('admin.empty'));
    return;
  }

  panel.innerHTML = table(
    [t('admin.ref'), t('admin.location'), t('common.status'), t('admin.time')],
    alerts.map((alert) => [
      `<code>${escapeHtml(alert.reference)}</code>`,
      `${escapeHtml(alert.location_name)}${
        typeof alert.lat === 'number' && typeof alert.lng === 'number'
          ? `<br /><span class="small muted">${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}</span>`
          : ''
      }`,
      statusBadge(alert.status),
      dateCell(alert.created_at),
    ]),
  );
}

function renderIncidents(panel, root) {
  if (!state.incidents.length) {
    panel.innerHTML = emptyBlock(t('admin.empty'));
    return;
  }

  panel.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th scope="col">${t('admin.ref')}</th>
            <th scope="col">${t('admin.incident')}</th>
            <th scope="col">${t('common.category')}</th>
            <th scope="col">${t('common.location')}</th>
            <th scope="col">${t('common.severity')}</th>
            <th scope="col">${t('admin.agency')}</th>
            <th scope="col">${t('common.status')}</th>
            <th scope="col">${t('admin.created')}</th>
          </tr>
        </thead>
        <tbody>
          ${state.incidents
            .map(
              (incident) => `
              <tr>
                <td><code>${escapeHtml(incident.reference)}</code></td>
                <td><strong>${escapeHtml(incident.title)}</strong><br /><span class="small muted">${escapeHtml(incident.description || '')}</span></td>
                <td>${escapeHtml(t(`category.${incident.category}`))}</td>
                <td>${escapeHtml(incident.location_name)}</td>
                <td>${escapeHtml(t(`severity.${incident.severity}`))}</td>
                <td>${escapeHtml(incident.agency)}</td>
                <td>
                  <select class="select" data-incident-status="${incident.id}" aria-label="${t('admin.newStatus')}">
                    ${INCIDENT_STATUSES.map(
                      (status) =>
                        `<option value="${status}"${status === incident.status ? ' selected' : ''}>${escapeHtml(t(`status.${status}`))}</option>`,
                    ).join('')}
                  </select>
                  <button class="btn btn--ghost btn--sm" type="button" data-update-incident="${incident.id}" style="margin-top:.35rem">
                    ${icon('check')}${t('admin.updateStatus')}
                  </button>
                </td>
                <td>${dateCell(incident.created_at)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  panel.querySelectorAll('[data-update-incident]').forEach((button) =>
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const select = row?.querySelector('[data-incident-status]');
      if (!select) return;

      button.disabled = true;
      try {
        const updated = await api.updateIncidentStatus(Number(button.dataset.updateIncident), select.value);
        state.incidents = state.incidents.map((incident) =>
          incident.id === updated.id ? updated : incident,
        );
        toast(t('admin.updated'));
        renderPanel(root);
      } catch (error) {
        toast(escapeHtml(error.message), { type: 'error' });
        button.disabled = false;
      }
    }),
  );
}

function renderNews(panel, root) {
  panel.innerHTML = `
    <div class="stack" style="gap:1.25rem">
      <div class="card card--pad stack">
        <h2 style="font-size:1.2rem">${t('admin.publish')}</h2>
        <p class="small muted">${t('admin.publishNote')}</p>

        <form class="stack" data-news-form novalidate>
          <div class="field">
            <label for="admin-news-title">${t('admin.titleLabel')} <small>${t('common.required')}</small></label>
            <input class="input" id="admin-news-title" name="title" required minlength="6" maxlength="160" />
          </div>
          <div class="field">
            <label for="admin-news-summary">${t('admin.summary')} <small>${t('common.required')}</small></label>
            <input class="input" id="admin-news-summary" name="summary" required minlength="10" maxlength="280" />
          </div>
          <div class="field">
            <label for="admin-news-body">${t('admin.body')} <small>${t('common.required')}</small></label>
            <textarea class="textarea" id="admin-news-body" name="body" required minlength="40" maxlength="6000" rows="6"></textarea>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="admin-news-category">${t('admin.category')}</label>
              <select class="select" id="admin-news-category" name="category">
                ${NEWS_CATEGORIES.map((category) => `<option value="${category}">${escapeHtml(category)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="admin-news-author">${t('admin.author')} <small>${t('common.required')}</small></label>
              <input class="input" id="admin-news-author" name="author" required minlength="2" maxlength="120" />
              <p class="hint">${t('admin.authorHint')}</p>
            </div>
          </div>
          <button class="btn btn--block" type="submit">${icon('send')}${t('admin.publish')}</button>
        </form>
      </div>

      <div class="stack" style="gap:.75rem">
        <h3>${t('admin.newsTitle')}</h3>
        ${state.news.length ? '' : emptyBlock(t('admin.empty'))}
        <div class="list">
          ${state.news
            .map(
              (article) => `
              <article class="list-card">
                <div class="list-card__head">
                  <h3>${escapeHtml(article.title)}</h3>
                  <div class="meta-row">
                    <span class="badge badge--outline badge--sm">${escapeHtml(article.category)}</span>
                    ${article.is_sample ? `<span class="badge badge--outline badge--sm">${t('common.sample')}</span>` : ''}
                  </div>
                </div>
                <p>${escapeHtml(article.summary)}</p>
                <div class="meta-row">
                  <span>${icon('users')}${escapeHtml(article.author)}</span>
                  <span>${icon('clock')}${escapeHtml(formatDate(article.created_at, getLanguage()))}</span>
                </div>
              </article>`,
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  const form = panel.querySelector('[data-news-form]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = t('action.sending');

    try {
      await api.createNews({
        title: form.elements.title.value.trim(),
        summary: form.elements.summary.value.trim(),
        body: form.elements.body.value.trim(),
        category: form.elements.category.value,
        author: form.elements.author.value.trim(),
      });
      state.news = await api.news();
      toast(t('admin.published'));
      renderPanel(root);
    } catch (error) {
      toast(escapeHtml(error.message), { type: 'error', timeout: 8000 });
      button.disabled = false;
      button.innerHTML = `${icon('send')}${t('admin.publish')}`;
    }
  });
}
