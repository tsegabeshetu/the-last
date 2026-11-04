import { api } from '../lib/api.js';
import { CONFIG } from '../config.js';
import { escapeHtml } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { pageHead } from '../lib/ui.js';
import { buildIncidentSms, offerSmsFallback } from '../lib/offline.js';
import { renderLocationPicker } from '../components/map.js';
import { toast } from '../components/toast.js';

const CATEGORIES = [
  { value: 'critical', icon: 'flame', title: 'service.critical.title' },
  { value: 'infrastructure', icon: 'zap', title: 'service.infrastructure.title' },
  { value: 'community', icon: 'users', title: 'service.community.title' },
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export async function render(root, params = {}) {
  const initial = CATEGORIES.some((item) => item.value === params.category) ? params.category : '';

  root.innerHTML = `
    ${pageHead({
      eyebrow: t('report.eyebrow'),
      title: t('report.title'),
      lede: t('report.lede'),
      image: 'assets/img/bg-infrastructure.jpg',
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}

    <section class="section">
      <div class="shell grid grid--2" style="align-items:start;gap:1.5rem">
        <div class="card card--pad" id="report-card"></div>
        <aside class="stack" style="gap:1rem">
          <div class="card card--pad stack">
            <span class="badge badge--alert">${icon('alert-triangle')}${t('help.numberEmergency')}</span>
            <h2 style="font-size:1.2rem">${t('action.call611')}</h2>
            <p class="small muted">${t('report.lede')}</p>
            <a class="btn btn--alert btn--block" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}${CONFIG.emergencyNumber} · ${t('help.numberEmergency')}</a>
            <a class="btn btn--ghost btn--block" href="tel:${CONFIG.policeNumber}">${icon('shield')}${CONFIG.policeNumber} · ${t('help.numberPolice')}</a>
            <a class="btn btn--ghost btn--block" href="tel:${CONFIG.ambulanceNumber}">${icon('ambulance')}${CONFIG.ambulanceNumber} · ${t('help.numberAmbulance')}</a>
          </div>
          <div class="card card--pad stack">
            <h3 style="font-size:1rem">${t('common.demoData')}</h3>
            <p class="small muted">${t('report.demoNotice')}</p>
            <div class="notice notice--info">${icon('info')}<span>${t('report.successText')}</span></div>
          </div>
        </aside>
      </div>
    </section>
  `;

  renderForm(root, initial);
}

function renderForm(root, category) {
  const card = root.querySelector('#report-card');
  if (!card) return;

  card.innerHTML = `
    <form class="stack" data-report-form novalidate>
      <div class="field">
        <span class="field__label">${t('report.category')} <small>${t('common.required')}</small></span>
        <div class="chip-row" data-category-row role="group" aria-label="${t('report.category')}">
          ${CATEGORIES.map(
            (item) => `
            <button class="chip" type="button" data-category="${item.value}" aria-pressed="${item.value === category}">
              ${icon(item.icon)}${t(item.title)}
            </button>`,
          ).join('')}
        </div>
      </div>

      <div class="field">
        <label for="report-title">${t('report.titleLabel')} <small>${t('common.required')}</small></label>
        <input class="input" id="report-title" name="title" required minlength="4" maxlength="140" placeholder="Downed power line on Bole Road" />
      </div>

      <div class="field">
        <label for="report-description">${t('report.desc')} <small>${t('common.optional')}</small></label>
        <textarea class="textarea" id="report-description" name="description" rows="4" maxlength="2000"></textarea>
      </div>

      <div class="field">
        <label for="report-location">${t('report.location')} <small>${t('common.required')}</small></label>
        <input class="input" id="report-location" name="location_name" required minlength="2" maxlength="160" placeholder="Bole, Addis Ababa" />
        <p class="hint" data-location-status>${t('map.pickHint')}</p>
      </div>

      <div class="map-picker-panel" data-report-map></div>

      <div class="form-grid">
        <div class="field">
          <label for="report-severity">${t('report.severity')}</label>
          <select class="select" id="report-severity" name="severity">
            ${SEVERITIES.map(
              (level) =>
                `<option value="${level}"${level === 'medium' ? ' selected' : ''}>${t(`severity.${level}`)}</option>`,
            ).join('')}
          </select>
          <p class="hint">${t('report.severityHint')}</p>
        </div>
        <div class="field">
          <label for="report-name">${t('report.contactName')} <small>${t('common.optional')}</small></label>
          <input class="input" id="report-name" name="reporter_name" maxlength="120" autocomplete="name" />
        </div>
      </div>

      <div class="field">
        <label for="report-phone">${t('report.contactPhone')} <small>${t('common.optional')}</small></label>
        <input class="input" id="report-phone" name="reporter_phone" inputmode="tel" placeholder="+251 91 234 5678" autocomplete="tel" />
        <p class="hint">${t('report.contactHint')}</p>
      </div>

      <div class="notice notice--alert">${icon('alert-triangle')}<span>${t('help.disclaimer')}</span></div>

      <button class="btn btn--alert btn--block" type="submit">${icon('send')}${t('report.submit')}</button>
    </form>
  `;

  const form = card.querySelector('[data-report-form]');
  const categoryRow = form.querySelector('[data-category-row]');
  const locationStatus = form.querySelector('[data-location-status]');

  form.dataset.category = category;

  categoryRow.querySelectorAll('[data-category]').forEach((button) =>
    button.addEventListener('click', () => {
      form.dataset.category = button.dataset.category;
      categoryRow.querySelectorAll('[data-category]').forEach((item) =>
        item.setAttribute('aria-pressed', String(item.dataset.category === button.dataset.category)),
      );
    }),
  );

  const mapPanel = form.querySelector('[data-report-map]');
  void renderLocationPicker(mapPanel, {
    height: 230,
    onChange: ({ lat, lng }) => {
      form.dataset.lat = String(lat);
      form.dataset.lng = String(lng);
      locationStatus.textContent = `${t('map.locationSelected')} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    },
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.dataset.category) {
      toast(t('report.category'), { type: 'error' });
      categoryRow.querySelector('[data-category]')?.focus();
      return;
    }
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.innerHTML = `${t('report.sending')}`;

    const phone = form.reporter_phone.value.trim();
    const name = form.reporter_name.value.trim();
    const payload = {
      category: form.dataset.category,
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      location_name: form.elements.location_name.value.trim(),
      severity: form.elements.severity.value,
      lat: form.dataset.lat ? Number(form.dataset.lat) : null,
      lng: form.dataset.lng ? Number(form.dataset.lng) : null,
      reporter_name: name || null,
      reporter_phone: phone || null,
    };

    try {
      const result = await api.createIncident(payload);
      renderSuccess(card, result);
    } catch (error) {
      if (error.offline || error.network) {
        offerSmsFallback({
          title: 'Send this report by SMS',
          body: buildIncidentSms(payload),
          message: 'There is no connection to the AEC server. Your report details are ready to send as an SMS to 611.',
        });
      } else {
        toast(escapeHtml(error.message), { type: 'error', timeout: 8000 });
      }
      button.disabled = false;
      button.innerHTML = `${icon('send')}${t('report.submit')}`;
    }
  });
}

function renderSuccess(card, result) {
  card.innerHTML = `
    <div class="stack">
      <div class="confirm">
        <span class="small" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('report.successTitle')}</span>
        <span class="confirm__ref">${escapeHtml(result.reference)}</span>
        <p class="small">${t('report.successText')}</p>
      </div>
      <div class="summary-row"><span>${t('report.reference')}</span><span>${escapeHtml(result.reference)}</span></div>
      <div class="summary-row"><span>${t('common.category')}</span><span>${escapeHtml(t(`category.${result.category}`))}</span></div>
      <div class="summary-row"><span>${t('common.severity')}</span><span>${escapeHtml(t(`severity.${result.severity}`))}</span></div>
      <div class="summary-row"><span>${t('common.location')}</span><span>${escapeHtml(result.location_name)}</span></div>
      <div class="summary-row"><span>${t('common.date')}</span><span>${escapeHtml(new Date(result.created_at).toLocaleString(getLanguage() === 'am' ? 'am-ET' : 'en-GB'))}</span></div>
      <div class="notice notice--info">${icon('info')}<span>${escapeHtml(result.next_step || '')}</span></div>
      <div class="notice notice--alert">${icon('alert-triangle')}<span>${t('help.disclaimer')}</span></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--block" type="button" data-report-again>${icon('plus')}${t('report.another')}</button>
        <a class="btn btn--alert btn--block" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}${t('action.call611')}</a>
      </div>
    </div>
  `;

  card.querySelector('[data-report-again]')?.addEventListener('click', () => renderForm(card.closest('#main') || document, ''));
}
