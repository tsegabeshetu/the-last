import { api } from '../lib/api.js';
import { CONFIG } from '../config.js';
import {
  currentLocation,
  debounce,
  escapeHtml,
  formatMoney,
  openDialog,
  readJSON,
  writeJSON,
} from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { errorBlock, loadingBlock, pageHead } from '../lib/ui.js';
import { offerSmsFallback } from '../lib/offline.js';
import { renderLocationPicker } from '../components/map.js';
import { paymentMethodsMarkup, paymentLabel, wirePaymentPicker } from '../components/payment.js';
import { toast } from '../components/toast.js';

const DRIVER_FEE = 1200;
const DELIVERY_FEE = 120;
const pickerMaps = new Set();

const state = {
  tab: 'rental',
  cities: [],
  vehicles: [],
  city: '',
  selectedVehicle: null,
  medications: [],
  pharmacies: [],
  query: '',
  category: '',
  basket: readJSON('aec.basket', []),
  priority: 'standard',
  rentalResult: null,
  deliveryResult: null,
};

let rootRef = null;
let activeBasketCity = '';

export async function render(root, params = {}) {
  rootRef = root;
  state.tab = params.service === 'medications' ? 'medications' : 'rental';
  state.selectedVehicle = null;
  state.rentalResult = null;
  state.deliveryResult = null;

  root.innerHTML = `
    ${pageHead({
      eyebrow: t('emergency.eyebrow'),
      title: t('emergency.title'),
      lede: t('emergency.lede'),
      image: 'assets/img/bg-emergency.jpg',
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}

    <section class="section section--tight">
      <div class="shell stack" style="gap:1.25rem">
        <div class="sos-card">
          <span class="sos-card__icon">${icon('alert-triangle')}</span>
          <div>
            <h2>${t('emergency.sosTitle')}</h2>
            <p>${t('emergency.sosText')} <span class="hint">${t('emergency.holdHint')}</span></p>
          </div>
          <div class="sos-card__actions">
            <button class="btn btn--alert sos-hold" type="button" data-sos-hold aria-describedby="sos-hint">
              <span class="sos-hold__fill"></span>${icon('navigation')}<span data-sos-label>${t('emergency.hold')}</span>
            </button>
            <a class="btn btn--ghost" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}${t('action.call611')}</a>
          </div>
          <p class="sr-only" id="sos-hint">${t('emergency.holdHint')}</p>
        </div>

        <div>
          <p class="eyebrow">${t('emergency.servicesEyebrow')}</p>
          <h2 style="margin-bottom:1rem">${t('emergency.servicesTitle')}</h2>
          <div class="service-switch" role="tablist" aria-label="${t('emergency.servicesEyebrow')}">
            <button class="service-tab" type="button" role="tab" id="tab-rental" aria-controls="panel-rental"
              aria-selected="${state.tab === 'rental'}" data-tab="rental">
              <span class="service-tab__icon">${icon('car')}</span>
              <span>
                <h3>${t('emergency.tabRental')}</h3>
                <p>${t('emergency.tabRentalSub')}</p>
              </span>
            </button>
            <button class="service-tab service-tab--med" type="button" role="tab" id="tab-medications" aria-controls="panel-medications"
              aria-selected="${state.tab === 'medications'}" data-tab="medications">
              <span class="service-tab__icon">${icon('pill')}</span>
              <span>
                <h3>${t('emergency.tabMeds')}</h3>
                <p>${t('emergency.tabMedsSub')}</p>
              </span>
            </button>
          </div>
        </div>

        <div id="panel-rental" role="tabpanel" aria-labelledby="tab-rental" ${state.tab === 'rental' ? '' : 'hidden'}>
          <div class="emergency-layout">
            <div class="stack" style="gap:1rem">
              <div class="card card--pad">
                <div class="section-head" style="margin-bottom:1rem">
                  <div>
                    <h2 style="font-size:1.35rem">${t('emergency.rentalTitle')}</h2>
                    <p style="margin-top:.4rem">${t('emergency.rentalLede')}</p>
                  </div>
                </div>
                <div class="chip-row" id="rental-cities" aria-label="${t('emergency.filterCity')}"></div>
              </div>
              <div id="vehicle-grid">${loadingBlock(2)}</div>
            </div>
            <aside class="sticky-panel" id="rental-panel">
              <div class="card card--pad stack">
                <h3 style="font-size:1.05rem">${t('emergency.chooseVehicle')}</h3>
                <p class="small muted">${t('emergency.quoteNote')}</p>
              </div>
            </aside>
          </div>
        </div>

        <div id="panel-medications" role="tabpanel" aria-labelledby="tab-medications" ${state.tab === 'medications' ? '' : 'hidden'}>
          <div class="emergency-layout">
            <div class="card card--pad stack">
              <div>
                <h2 style="font-size:1.35rem">${t('emergency.medTitle')}</h2>
                <p class="small muted" style="margin-top:.4rem">${t('emergency.medLede')}</p>
              </div>
              <div class="med-search">
                <label class="sr-only" for="med-search">${t('emergency.searchMeds')}</label>
                <input class="input" id="med-search" type="search" placeholder="${t('emergency.searchMeds')}" />
                <button class="btn btn--ghost btn--sm" type="button" data-clear-search>${t('action.clear')}</button>
              </div>
              <div class="chip-row" id="med-categories"></div>
              <div class="med-list" id="med-list">${loadingBlock(2)}</div>
            </div>
            <aside class="sticky-panel">
              <div class="card card--pad stack" id="basket-panel"></div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  `;

  wireTabs(root);
  wireSos(root);
  await Promise.all([loadRental(root), loadMedications(root)]);
  renderBasketPanel();
}

function wireTabs(root) {
  root.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((tab) => {
        const selected = tab.dataset.tab === state.tab;
        tab.setAttribute('aria-selected', String(selected));
        const panel = root.querySelector(`#panel-${tab.dataset.tab}`);
        if (panel) panel.hidden = !selected;
      });
      history.replaceState(null, '', `#/emergency?service=${state.tab}`);
      invalidatePickerMaps();
    });
  });
}

async function mountLocationPicker(container, options = {}) {
  if (!container) return null;
  const map = await renderLocationPicker(container, options);
  if (map) pickerMaps.add(map);
  return map;
}

function invalidatePickerMaps() {
  // Leaflet cannot measure a hidden panel, so it is refreshed after the tab is shown.
  setTimeout(() => {
    pickerMaps.forEach((map) => {
      try {
        map.invalidateSize();
      } catch {
        pickerMaps.delete(map);
      }
    });
  }, 140);
}

/* ------------------------------- SOS ------------------------------- */
function wireSos(root) {
  const button = root.querySelector('[data-sos-hold]');
  if (!button) return;
  const label = button.querySelector('[data-sos-label]');
  let timer = null;
  let holding = false;

  const start = (event) => {
    if (event.type === 'pointerdown') event.preventDefault();
    if (holding) return;
    holding = true;
    button.classList.add('is-holding');
    label.textContent = t('emergency.holding');
    timer = setTimeout(() => {
      holding = false;
      button.classList.remove('is-holding');
      label.textContent = t('emergency.hold');
      void sendSos();
    }, 3000);
  };

  const cancel = () => {
    if (!holding) return;
    holding = false;
    clearTimeout(timer);
    button.classList.remove('is-holding');
    label.textContent = t('emergency.hold');
  };

  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', cancel);
  button.addEventListener('pointerleave', cancel);
  button.addEventListener('pointercancel', cancel);
  button.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') start(event);
  });
  button.addEventListener('keyup', cancel);
}

async function sendSos() {
  let location = { lat: null, lng: null };
  try {
    location = await currentLocation();
  } catch {
    // Location is optional: the alert still records without coordinates.
  }

  try {
    const result = await api.sendSos({
      lat: location.lat,
      lng: location.lng,
      location_name: location.lat ? 'GPS location shared' : 'Location not shared',
      message: 'SOS triggered from the AEC emergency page (demo).',
    });

    openDialog(`
      <div class="sheet__head">
        <div>
          <h2>SOS recorded</h2>
          <p>${escapeHtml(result.status)}</p>
        </div>
        <button class="icon-btn" type="button" data-close aria-label="${t('action.close')}">${icon('close')}</button>
      </div>
      <div class="sheet__body stack">
        <div class="confirm">
          <span class="small" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('common.reference')}</span>
          <span class="confirm__ref">${escapeHtml(result.reference)}</span>
          <p class="small">${escapeHtml(result.message)}</p>
        </div>
        <div class="notice notice--alert">${icon('alert-triangle')}<span>${escapeHtml(t('help.disclaimer'))}</span></div>
      </div>
      <div class="sheet__foot">
        <a class="btn btn--alert" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}${t('action.call611')}</a>
        <button class="btn btn--ghost" type="button" data-close>${t('action.close')}</button>
      </div>
    `);
  } catch (error) {
    if (error.offline || error.network) {
      const gps = location.lat && location.lng ? ` GPS: ${location.lat},${location.lng}` : '';
      offerSmsFallback({
        title: 'Send SOS by SMS',
        body: `AEC SOS - I need emergency help.${gps}`,
        message: 'There is no connection to the AEC server. Press the button below to send this SOS as an SMS to 611.',
      });
    } else {
      toast(escapeHtml(error.message), { type: 'error' });
    }
  }
}

/* ----------------------------- car rental ----------------------------- */
async function loadRental(root) {
  const grid = root.querySelector('#vehicle-grid');
  const cityRow = root.querySelector('#rental-cities');

  try {
    const [vehicles, cities] = await Promise.all([api.vehicles(state.city || undefined), api.vehicleCities()]);
    state.vehicles = vehicles;
    state.cities = cities;

    cityRow.innerHTML = [
      `<button class="chip" type="button" data-city="" aria-pressed="${state.city === ''}">${t('emergency.allCities')}</button>`,
      ...cities.map(
        (city) => `<button class="chip" type="button" data-city="${escapeHtml(city)}" aria-pressed="${state.city === city}">${escapeHtml(city)}</button>`,
      ),
    ].join('');

    cityRow.querySelectorAll('[data-city]').forEach((chip) =>
      chip.addEventListener('click', async () => {
        state.city = chip.dataset.city;
        state.selectedVehicle = null;
        renderRentalPanel(root);
        cityRow.querySelectorAll('[data-city]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item.dataset.city === state.city)),
        );
        grid.innerHTML = loadingBlock(2);
        try {
          state.vehicles = await api.vehicles(state.city || undefined);
          renderVehicleGrid(root);
        } catch (error) {
          grid.innerHTML = errorBlock(error.message);
          grid.querySelector('[data-retry]')?.addEventListener('click', () => loadRental(root));
        }
      }),
    );

    renderVehicleGrid(root);
  } catch (error) {
    grid.innerHTML = errorBlock(error.message);
    grid.querySelector('[data-retry]')?.addEventListener('click', () => loadRental(root));
  }
}

function renderVehicleGrid(root) {
  const grid = root.querySelector('#vehicle-grid');
  if (!state.vehicles.length) {
    grid.innerHTML = `<div class="empty-state">${icon('car')}<p>${t('common.noResults')}</p></div>`;
    return;
  }

  grid.innerHTML = `
    <div class="vehicle-grid">
      ${state.vehicles
        .map((vehicle) => {
          const selected = state.selectedVehicle?.id === vehicle.id;
          return `
          <article class="vehicle-card${vehicle.available ? '' : ' is-unavailable'}" data-vehicle="${vehicle.id}" data-selected="${selected}">
            <div class="vehicle-card__top">
              <div>
                <h3>${escapeHtml(vehicle.name)}</h3>
                <p class="small muted">${escapeHtml(vehicle.class)} · ${escapeHtml(vehicle.city)}</p>
              </div>
              <div class="vehicle-card__price">
                <strong>${formatMoney(vehicle.price_per_day_etb, getLanguage())}</strong>
                <span>${t('common.perDay')}</span>
              </div>
            </div>
            <div class="vehicle-meta">
              <span>${icon('users')}${vehicle.seats} ${t('common.seats')}</span>
              <span>${icon('car')}${escapeHtml(vehicle.transmission)}</span>
              <span>${icon('zap')}${escapeHtml(vehicle.fuel)}</span>
              <span>${icon('shield')}${vehicle.driver_included ? t('common.driver') : t('common.selfDrive')}</span>
            </div>
            <div class="vehicle-card__foot">
              <span class="badge badge--${vehicle.available ? 'safe' : 'outline'}">${vehicle.available ? t('common.available') : t('common.unavailable')}</span>
              <button class="btn btn--sm${selected ? '' : ' btn--ghost'}" type="button" data-select="${vehicle.id}" ${vehicle.available ? '' : 'disabled'}>
                ${selected ? icon('check') : ''}${selected ? t('action.details') : t('emergency.chooseVehicle')}
              </button>
            </div>
          </article>`;
        })
        .join('')}
    </div>
  `;

  grid.querySelectorAll('[data-select]').forEach((button) =>
    button.addEventListener('click', () => {
      state.selectedVehicle = state.vehicles.find((vehicle) => vehicle.id === Number(button.dataset.select)) || null;
      state.rentalResult = null;
      renderVehicleGrid(root);
      renderRentalPanel(root);
      root.querySelector('#rental-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }),
  );
}

function renderRentalPanel(root) {
  const panel = root.querySelector('#rental-panel');
  const vehicle = state.selectedVehicle;

  if (state.rentalResult) {
    panel.innerHTML = rentalConfirmation(state.rentalResult);
    panel.querySelector('[data-new-rental]')?.addEventListener('click', () => {
      state.rentalResult = null;
      state.selectedVehicle = null;
      renderVehicleGrid(root);
      renderRentalPanel(root);
    });
    return;
  }

  if (!vehicle) {
    panel.innerHTML = `
      <div class="card card--pad stack">
        <h3 style="font-size:1.05rem">${t('emergency.chooseVehicle')}</h3>
        <p class="small muted">${t('emergency.quoteNote')}</p>
        <div class="notice notice--info">${icon('info')}<span>${t('help.faqA2')}</span></div>
      </div>`;
    return;
  }

  const today = new Date();
  const defaultDate = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  panel.innerHTML = `
    <div class="card card--pad stack">
      <div>
        <span class="badge badge--amber">${icon('car')}${escapeHtml(vehicle.class)}</span>
        <h3 style="margin-top:.5rem">${escapeHtml(vehicle.name)}</h3>
        <p class="small muted">${escapeHtml(vehicle.city)} · ${escapeHtml(vehicle.partner)}</p>
      </div>

      <form class="stack" data-rental-form novalidate>
        <div class="field">
          <label for="rental-name">${t('common.fullName')} <small>${t('common.required')}</small></label>
          <input class="input" id="rental-name" name="full_name" required minlength="2" autocomplete="name" />
        </div>
        <div class="field">
          <label for="rental-phone">${t('common.phone')} <small>${t('common.required')}</small></label>
          <input class="input" id="rental-phone" name="phone" required inputmode="tel" placeholder="+251 91 234 5678" autocomplete="tel" />
        </div>
        <div class="field">
          <label for="rental-pickup">${t('emergency.pickupLocation')} <small>${t('common.required')}</small></label>
          <input class="input" id="rental-pickup" name="pickup_location" required minlength="2" placeholder="${escapeHtml(vehicle.city)}" />
          <p class="hint" data-rental-map-status>${t('map.pickHint')}</p>
        </div>
        <div class="field">
          <span class="field__label">${t('map.pickTitle')} <small>${t('common.optional')}</small></span>
          <div class="map-picker-panel" data-rental-map></div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="rental-date">${t('emergency.pickupDate')} <small>${t('common.required')}</small></label>
            <input class="input" id="rental-date" name="pickup_date" type="date" required value="${defaultDate}" min="${today.toISOString().slice(0, 10)}" />
          </div>
          <div class="field">
            <label for="rental-days">${t('emergency.days')} <small>${t('common.required')}</small></label>
            <input class="input" id="rental-days" name="days" type="number" min="1" max="30" value="1" required />
          </div>
        </div>
        <label class="check">
          <input type="checkbox" name="needs_driver" ${vehicle.driver_included ? 'checked disabled' : ''} />
          <span>${t('emergency.needDriver')}${vehicle.driver_included ? ' · included' : ` · +${formatMoney(DRIVER_FEE, getLanguage())}${t('common.perDay')}`}</span>
        </label>
        <div class="field">
          <label for="rental-notes">${t('emergency.notes')} <small>${t('common.optional')}</small></label>
          <textarea class="textarea" id="rental-notes" name="notes" maxlength="600"></textarea>
        </div>

        ${paymentMethodsMarkup()}

        <div class="quote-box" data-rental-quote></div>
        <p class="hint">${t('emergency.quoteNote')}</p>
        <button class="btn btn--alert btn--block" type="submit">${icon('check')}${t('emergency.confirmBooking')}</button>
      </form>
    </div>
  `;

  const form = panel.querySelector('[data-rental-form]');
  const paymentPicker = wirePaymentPicker(form, { uid: 'rental-pay' });
  const mapStatus = form.querySelector('[data-rental-map-status]');
  void mountLocationPicker(form.querySelector('[data-rental-map]'), {
    height: 200,
    onChange: ({ lat, lng }) => {
      form.dataset.lat = String(lat);
      form.dataset.lng = String(lng);
      mapStatus.textContent = `${t('map.locationSelected')} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    },
  });

  const updateQuote = () => {
    const days = Math.max(1, Number(form.days.value || 1));
    const needsDriver = form.needs_driver.checked;
    const driverFee = vehicle.driver_included ? 0 : needsDriver ? DRIVER_FEE : 0;
    const total = (vehicle.price_per_day_etb + driverFee) * days;
    form.querySelector('[data-rental-quote]').innerHTML = `
      <div class="summary-row"><span>${escapeHtml(vehicle.name)} × ${days} ${days === 1 ? t('common.day') : t('common.days')}</span><span>${formatMoney(vehicle.price_per_day_etb * days, getLanguage())}</span></div>
      ${driverFee ? `<div class="summary-row"><span>${t('common.driver')}</span><span>${formatMoney(driverFee * days, getLanguage())}</span></div>` : ''}
      <div class="summary-row summary-row--total"><span>${t('emergency.quote')}</span><span>${formatMoney(total, getLanguage())}</span></div>
    `;
  };

  form.addEventListener('input', updateQuote);
  updateQuote();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.innerHTML = `${t('action.sending')}`;

    try {
      const payment = paymentPicker?.getSelection() || {};
      const result = await api.createRental({
        vehicle_id: vehicle.id,
        full_name: form.full_name.value.trim(),
        phone: form.phone.value.trim(),
        pickup_location: form.pickup_location.value.trim(),
        pickup_lat: form.dataset.lat ? Number(form.dataset.lat) : null,
        pickup_lng: form.dataset.lng ? Number(form.dataset.lng) : null,
        pickup_date: form.pickup_date.value,
        days: Number(form.days.value),
        needs_driver: form.needs_driver.checked,
        notes: form.notes.value.trim(),
        payment_method: payment.payment_method || 'telebirr',
        payment_reference: payment.payment_reference || '',
      });
      paymentPicker?.clearSensitiveFields();
      state.rentalResult = result;
      renderRentalPanel(root);
      toast(`${t('emergency.bookingSuccess')} · ${result.reference}`);
    } catch (error) {
      if (error.offline || error.network) {
        offerSmsFallback({
          title: 'Send this rental request by SMS',
          body: [
            'AEC CAR RENTAL',
            `Name: ${form.full_name.value.trim()}`,
            `Phone: ${form.phone.value.trim()}`,
            `Vehicle: ${vehicle.name}`,
            `Pickup: ${form.pickup_location.value.trim()} · ${form.pickup_date.value} · ${form.days.value} day(s)`,
            `Driver: ${form.needs_driver.checked ? 'yes' : 'no'}`,
            form.notes.value.trim() ? `Notes: ${form.notes.value.trim()}` : '',
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 900),
          message: 'There is no connection to the AEC server. Your rental details are ready to send as an SMS to 611.',
        });
      } else {
        toast(escapeHtml(error.message), { type: 'error' });
      }
      button.disabled = false;
      button.innerHTML = `${icon('check')}${t('emergency.confirmBooking')}`;
    }
  });
}

function rentalConfirmation(result) {
  const dispatch = result.dispatch || {};
  const eta = dispatch.eta_minutes;
  return `
    <div class="card card--pad stack">
      <div class="confirm">
        <span class="small" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('emergency.bookingSuccess')}</span>
        <span class="confirm__ref">${escapeHtml(result.reference)}</span>
        <p class="small">${escapeHtml(result.message)}</p>
      </div>
      <div class="summary-row"><span>${escapeHtml(result.vehicle_name)}</span><span>${escapeHtml(result.pickup_date)}</span></div>
      <div class="summary-row"><span>${result.days} ${result.days === 1 ? t('common.day') : t('common.days')}</span><span>${formatMoney(result.total_etb, getLanguage())}</span></div>
      <div class="summary-row"><span>${t('payment.title')}</span><span>${escapeHtml(paymentLabel(result.payment_method))}${result.payment_reference ? ` · ${escapeHtml(result.payment_reference)}` : ''}</span></div>
      <div class="summary-row summary-row--total"><span>${t('common.total')}</span><span>${formatMoney(result.total_etb, getLanguage())}</span></div>
      <div class="notice notice--info">
        ${icon('clock')}
        <span>
          <strong>${t('emergency.estimate')}:</strong>
          ${eta ? `${eta.min}–${eta.max} ${t('common.minutes')} · ${escapeHtml(dispatch.unit || '')}` : escapeHtml(dispatch.note || t('common.estimateOnly'))}
          <br /><span class="small">${escapeHtml(dispatch.note || '')}</span>
        </span>
      </div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--block" type="button" data-new-rental>${t('action.newRequest')}</button>
        <a class="btn btn--block" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}${t('action.call611')}</a>
      </div>
    </div>
  `;
}

/* -------------------------- medication delivery -------------------------- */
async function loadMedications(root) {
  const list = root.querySelector('#med-list');
  try {
    const [medications, pharmacies] = await Promise.all([api.medications(), api.pharmacies()]);
    state.medications = medications;
    state.pharmacies = pharmacies;

    const categories = [...new Set(medications.map((item) => item.category))];
    root.querySelector('#med-categories').innerHTML = [
      `<button class="chip" type="button" data-category="" aria-pressed="true">${t('news.all')}</button>`,
      ...categories.map(
        (category) =>
          `<button class="chip" type="button" data-category="${escapeHtml(category)}" aria-pressed="false">${escapeHtml(category)}</button>`,
      ),
    ].join('');

    root.querySelectorAll('[data-category]').forEach((chip) =>
      chip.addEventListener('click', () => {
        state.category = chip.dataset.category;
        root.querySelectorAll('[data-category]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item.dataset.category === state.category)),
        );
        renderMedicationList(root);
      }),
    );

    const search = root.querySelector('#med-search');
    search.addEventListener(
      'input',
      debounce(() => {
        state.query = search.value.trim().toLowerCase();
        renderMedicationList(root);
      }, 180),
    );
    root.querySelector('[data-clear-search]').addEventListener('click', () => {
      search.value = '';
      state.query = '';
      renderMedicationList(root);
      search.focus();
    });

    renderMedicationList(root);
  } catch (error) {
    list.innerHTML = errorBlock(error.message);
    list.querySelector('[data-retry]')?.addEventListener('click', () => loadMedications(root));
  }
}

function filteredMedications() {
  return state.medications.filter((item) => {
    const matchesQuery = !state.query || `${item.name} ${item.strength} ${item.category}`.toLowerCase().includes(state.query);
    const matchesCategory = !state.category || item.category === state.category;
    return matchesQuery && matchesCategory;
  });
}

function renderMedicationList(root) {
  const list = root.querySelector('#med-list');
  const items = filteredMedications();
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">${icon('pill')}<p>${t('common.noResults')}</p></div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (medication) => `
      <div class="med-row">
        <div>
          <h4>${escapeHtml(medication.name)} ${escapeHtml(medication.strength)}</h4>
          <p>
            ${escapeHtml(medication.form)} · ${escapeHtml(medication.category)}
            ${medication.prescription_required ? ` · <span class="badge badge--amber badge--sm">${t('emergency.rx')}</span>` : ` · <span class="badge badge--outline badge--sm">${t('emergency.otc')}</span>`}
            ${medication.in_stock ? '' : ` · <span class="badge badge--alert badge--sm">${t('emergency.outOfStock')}</span>`}
          </p>
        </div>
        <div class="med-row__price">
          ${formatMoney(medication.price_etb, getLanguage())}
          <span>${medication.prescription_required ? t('emergency.rx') : t('emergency.otc')}</span>
          <button class="btn btn--ghost btn--sm" type="button" data-add-med="${medication.id}" ${medication.in_stock ? '' : 'disabled'} style="margin-top:.35rem">
            ${icon('plus')}${t('emergency.addToBasket')}
          </button>
        </div>
      </div>`,
    )
    .join('');

  list.querySelectorAll('[data-add-med]').forEach((button) =>
    button.addEventListener('click', () => {
      addToBasket(Number(button.dataset.addMed));
      toast(`${t('emergency.basket')} · +1`);
    }),
  );
}

function addToBasket(medicationId) {
  const medication = state.medications.find((item) => item.id === medicationId);
  if (!medication) return;
  const existing = state.basket.find((item) => item.id === medicationId);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + 1);
  } else {
    state.basket.push({
      id: medication.id,
      name: medication.name,
      strength: medication.strength,
      price: medication.price_etb,
      rx: medication.prescription_required,
      quantity: 1,
    });
  }
  persistBasket();
  renderBasketPanel();
}

function changeQuantity(medicationId, delta) {
  const item = state.basket.find((entry) => entry.id === medicationId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) state.basket = state.basket.filter((entry) => entry.id !== medicationId);
  persistBasket();
  renderBasketPanel();
}

function persistBasket() {
  writeJSON('aec.basket', state.basket);
}

function basketTotals() {
  const subtotal = state.basket.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fee = state.priority === 'urgent' ? 0 : DELIVERY_FEE;
  return { subtotal, fee, total: subtotal + fee };
}

function basketItemsMarkup() {
  if (!state.basket.length) {
    return `<p class="small muted">${t('emergency.basketEmpty')}</p>`;
  }
  return `<div class="basket__items">
    ${state.basket
      .map(
        (item) => `
        <div class="basket-item">
          <div>
            <strong style="font-size:.86rem">${escapeHtml(item.name)}</strong>
            <div class="small muted">${escapeHtml(item.strength)} · ${formatMoney(item.price, getLanguage())}</div>
            ${item.rx ? `<span class="badge badge--amber badge--sm">${t('emergency.rx')}</span>` : ''}
          </div>
          <div class="qty" role="group" aria-label="${escapeHtml(item.name)}">
            <button type="button" data-qty="-1" data-id="${item.id}" aria-label="−">${icon('minus')}</button>
            <span>${item.quantity}</span>
            <button type="button" data-qty="1" data-id="${item.id}" aria-label="+">${icon('plus')}</button>
          </div>
        </div>`,
      )
      .join('')}
  </div>`;
}

function totalsMarkup() {
  const { subtotal, fee, total } = basketTotals();
  return `
    <div class="summary-row"><span>${t('emergency.basket')}</span><span>${formatMoney(subtotal, getLanguage())}</span></div>
    <div class="summary-row"><span>${t('emergency.deliveryFee')}</span><span>${formatMoney(fee, getLanguage())}</span></div>
    <div class="summary-row summary-row--total"><span>${t('common.total')}</span><span>${formatMoney(total, getLanguage())}</span></div>
  `;
}

function wireBasketQuantity(panel) {
  panel.querySelectorAll('[data-qty]').forEach((button) =>
    button.addEventListener('click', () => changeQuantity(Number(button.dataset.id), Number(button.dataset.qty))),
  );
}

function refreshBasketUi() {
  const panel = rootRef?.querySelector('#basket-panel');
  if (!panel) return;
  const items = panel.querySelector('[data-basket-items]');
  const totals = panel.querySelector('[data-basket-totals]');
  const submit = panel.querySelector('button[type="submit"]');
  if (items) items.innerHTML = basketItemsMarkup();
  if (totals) totals.innerHTML = totalsMarkup();
  if (submit) submit.disabled = state.basket.length === 0;
  wireBasketQuantity(panel);
}

function renderBasketPanel() {
  const panel = rootRef?.querySelector('#basket-panel');
  if (!panel) return;

  if (state.deliveryResult) {
    panel.innerHTML = deliveryConfirmation(state.deliveryResult);
    panel.querySelector('[data-new-delivery]')?.addEventListener('click', () => {
      state.deliveryResult = null;
      renderBasketPanel();
    });
    return;
  }

  const hasRx = state.basket.some((item) => item.rx);
  const cities = [...new Set(state.pharmacies.map((pharmacy) => pharmacy.city))];

  panel.innerHTML = `
    <h3 style="font-size:1.05rem">${t('emergency.basket')}</h3>
    <div data-basket-items>${basketItemsMarkup()}</div>

    <form class="stack" data-delivery-form novalidate>
      <div class="field">
        <label for="delivery-city">${t('common.city')} <small>${t('common.required')}</small></label>
        <select class="select" id="delivery-city" name="city" required>
          <option value="">${t('emergency.choosePharmacy')}</option>
          ${cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="delivery-pharmacy">${t('emergency.pharmacy')} <small>${t('common.required')}</small></label>
        <select class="select" id="delivery-pharmacy" name="pharmacy_id" required>
          <option value="">${t('emergency.choosePharmacy')}</option>
          ${state.pharmacies
            .map(
              (pharmacy) =>
                `<option value="${pharmacy.id}" data-city="${escapeHtml(pharmacy.city)}">${escapeHtml(pharmacy.name)}${pharmacy.open_24h ? ' · 24/7' : ''}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="delivery-name">${t('common.fullName')} <small>${t('common.required')}</small></label>
          <input class="input" id="delivery-name" name="full_name" required minlength="2" autocomplete="name" />
        </div>
        <div class="field">
          <label for="delivery-phone">${t('common.phone')} <small>${t('common.required')}</small></label>
          <input class="input" id="delivery-phone" name="phone" required inputmode="tel" placeholder="+251 91 234 5678" autocomplete="tel" />
        </div>
      </div>
      <div class="field">
        <label for="delivery-address">${t('common.address')} <small>${t('common.required')}</small></label>
        <input class="input" id="delivery-address" name="address" required minlength="5" placeholder="Sub-city, woreda, house number" autocomplete="street-address" />
        <p class="hint" data-delivery-map-status>${t('map.pickHint')}</p>
      </div>
      <div class="field">
        <span class="field__label">${t('map.pickTitle')} <small>${t('common.optional')}</small></span>
        <div class="map-picker-panel" data-delivery-map></div>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="delivery-priority">${t('emergency.priority')}</label>
          <select class="select" id="delivery-priority" name="priority">
            <option value="standard" ${state.priority === 'standard' ? 'selected' : ''}>${t('emergency.standard')} · ${formatMoney(DELIVERY_FEE, getLanguage())}</option>
            <option value="urgent" ${state.priority === 'urgent' ? 'selected' : ''}>${t('emergency.urgent')} · ${formatMoney(0, getLanguage())}</option>
          </select>
        </div>
        <div class="field">
          <label for="delivery-rx">${t('emergency.rxRef')} <small>${hasRx ? t('common.required') : t('common.optional')}</small></label>
          <input class="input" id="delivery-rx" name="prescription_ref" ${hasRx ? 'required' : ''} placeholder="RX-2026-0000" />
        </div>
      </div>
      <p class="hint">${t('emergency.rxRefHint')}</p>
      <div class="field">
        <label for="delivery-notes">${t('common.notes')} <small>${t('common.optional')}</small></label>
        <textarea class="textarea" id="delivery-notes" name="notes" maxlength="600"></textarea>
      </div>

      ${paymentMethodsMarkup()}

      <div class="stack" style="gap:.35rem" data-basket-totals>${totalsMarkup()}</div>
      <p class="hint">${t('emergency.pharmacistReview')}</p>
      <button class="btn btn--alert btn--block" type="submit" ${state.basket.length ? '' : 'disabled'}>
        ${icon('package')}${t('emergency.placeOrder')}
      </button>
    </form>
  `;

  const form = panel.querySelector('[data-delivery-form]');
  const citySelect = form.querySelector('#delivery-city');
  const pharmacySelect = form.querySelector('#delivery-pharmacy');
  const paymentPicker = wirePaymentPicker(form, { uid: 'delivery-pay' });
  const mapStatus = form.querySelector('[data-delivery-map-status]');
  void mountLocationPicker(form.querySelector('[data-delivery-map]'), {
    height: 200,
    onChange: ({ lat, lng }) => {
      form.dataset.lat = String(lat);
      form.dataset.lng = String(lng);
      mapStatus.textContent = `${t('map.locationSelected')} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    },
  });

  citySelect.addEventListener('change', () => {
    activeBasketCity = citySelect.value;
    const options = Array.from(pharmacySelect.options);
    options.forEach((option) => {
      if (!option.value) return;
      const matches = !activeBasketCity || option.dataset.city === activeBasketCity;
      option.hidden = !matches;
      option.disabled = !matches;
    });
    if (pharmacySelect.selectedOptions[0]?.disabled) pharmacySelect.value = '';
  });

  form.querySelector('#delivery-priority').addEventListener('change', (event) => {
    state.priority = event.target.value;
    const totals = panel.querySelector('[data-basket-totals]');
    if (totals) totals.innerHTML = totalsMarkup();
  });

  wireBasketQuantity(panel);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.basket.length) {
      toast(t('emergency.basketEmpty'), { type: 'error' });
      return;
    }
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = t('action.sending');

    try {
      const payment = paymentPicker?.getSelection() || {};
      const result = await api.createDelivery({
        pharmacy_id: Number(form.pharmacy_id.value),
        full_name: form.full_name.value.trim(),
        phone: form.phone.value.trim(),
        city: form.city.value,
        address: form.address.value.trim(),
        lat: form.dataset.lat ? Number(form.dataset.lat) : null,
        lng: form.dataset.lng ? Number(form.dataset.lng) : null,
        items: state.basket.map((item) => ({ medication_id: item.id, quantity: item.quantity })),
        prescription_ref: form.prescription_ref.value.trim(),
        priority: form.priority.value,
        notes: form.notes.value.trim(),
        payment_method: payment.payment_method || 'telebirr',
        payment_reference: payment.payment_reference || '',
      });
      paymentPicker?.clearSensitiveFields();
      state.deliveryResult = result;
      state.basket = [];
      persistBasket();
      renderBasketPanel();
      toast(`${t('emergency.deliverySuccess')} · ${result.reference}`);
    } catch (error) {
      if (error.offline || error.network) {
        offerSmsFallback({
          title: 'Send this medicine order by SMS',
          body: [
            'AEC MEDICINE DELIVERY',
            `Name: ${form.full_name.value.trim()}`,
            `Phone: ${form.phone.value.trim()}`,
            `City: ${form.city.value}`,
            `Address: ${form.address.value.trim()}`,
            `Items: ${state.basket.map((item) => `${item.name} x${item.quantity}`).join(', ')}`,
            `Priority: ${form.priority.value}`,
            form.prescription_ref.value.trim() ? `RX: ${form.prescription_ref.value.trim()}` : '',
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 900),
          message: 'There is no connection to the AEC server. Your order details are ready to send as an SMS to 611.',
        });
      } else {
        toast(escapeHtml(error.message), { type: 'error', timeout: 7000 });
      }
      button.disabled = false;
      button.innerHTML = `${icon('package')}${t('emergency.placeOrder')}`;
    }
  });
}

function deliveryConfirmation(result) {
  const dispatch = result.dispatch || {};
  return `
    <div class="stack">
      <div class="confirm">
        <span class="small" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('emergency.deliverySuccess')}</span>
        <span class="confirm__ref">${escapeHtml(result.reference)}</span>
        <p class="small">${escapeHtml(result.message)}</p>
      </div>
      <div class="summary-row"><span>${escapeHtml(result.pharmacy_name)}</span><span>${escapeHtml(result.city)}</span></div>
      ${result.items
        .map(
          (item) =>
            `<div class="summary-row"><span>${escapeHtml(item.name)} × ${item.quantity}</span><span>${formatMoney(item.line_total_etb, getLanguage())}</span></div>`,
        )
        .join('')}
      <div class="summary-row"><span>${t('payment.title')}</span><span>${escapeHtml(paymentLabel(result.payment_method))}${result.payment_reference ? ` · ${escapeHtml(result.payment_reference)}` : ''}</span></div>
      <div class="summary-row summary-row--total"><span>${t('common.total')}</span><span>${formatMoney(result.total_etb, getLanguage())}</span></div>
      <div class="notice notice--info">${icon('clock')}<span>${escapeHtml(dispatch.note || t('emergency.pharmacistReview'))}</span></div>
      <div class="notice notice--alert">${icon('alert-triangle')}<span>${t('emergency.pharmacistReview')} ${t('help.disclaimer')}</span></div>
      <button class="btn btn--ghost btn--block" type="button" data-new-delivery>${t('action.newRequest')}</button>
    </div>
  `;
}
