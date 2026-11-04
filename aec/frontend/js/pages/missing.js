import { api } from '../lib/api.js';
import { escapeHtml, formatDate } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { emptyBlock, errorBlock, loadingBlock, pageHead, sampleBadge, statusBadge } from '../lib/ui.js';
import { renderLocationPicker } from '../components/map.js';
import { offerSmsFallback } from '../lib/offline.js';
import { toast } from '../components/toast.js';

const GENDERS = [
  { value: 'female', label: 'missing.genderFemale' },
  { value: 'male', label: 'missing.genderMale' },
  { value: 'unknown', label: 'missing.genderUnknown' },
];

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

// Initials shown in the card's photo tile until a real portrait is available.
function initialsOf(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

// A record can carry an uploaded image (API: photo_data) or a file path that
// ships with the site (bundled records: photo, e.g. assets/img/missing/AEC-MP-D01.jpg).
function photoSource(report) {
  if (typeof report.photo_data === 'string' && report.photo_data.startsWith('data:image/')) return report.photo_data;
  if (typeof report.photo === 'string' && report.photo.trim()) return report.photo.trim();
  return '';
}

function readPhotoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.onerror = () => reject(new Error('image-decode'));
      image.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('image-read'));
    reader.readAsDataURL(file);
  });
}

export async function render(root) {
  root.innerHTML = `
    ${pageHead({
      eyebrow: t('missing.eyebrow'),
      title: t('missing.title'),
      lede: t('missing.lede'),
      image: 'assets/img/bg-community.jpg',
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}

    <section class="section">
      <div class="shell grid grid--2" style="align-items:start;gap:1.5rem">
        <div class="stack" style="gap:1rem">
          <div class="section-head" style="margin-bottom:0">
            <div>
              <p class="eyebrow">${t('missing.listTitle')}</p>
              <h2>${t('missing.active')}</h2>
            </div>
            <span class="badge badge--outline">${icon('shield')}${t('missing.private')}</span>
          </div>
          <div class="list" id="missing-list">${loadingBlock(2)}</div>
        </div>

        <div class="card card--pad" id="missing-form-card"></div>
      </div>
    </section>
  `;

  renderForm(root);
  await loadList(root);
}

async function loadList(root) {
  const list = root.querySelector('#missing-list');
  if (!list) return;

  try {
    const reports = await api.missingPersons();
    if (!reports.length) {
      list.innerHTML = emptyBlock(t('missing.noReports'));
      return;
    }

    list.innerHTML = reports
      .map((report) => {
        const gender = GENDERS.find((item) => item.value === report.gender)?.label || 'missing.genderUnknown';
        const photo = photoSource(report);
        const media = `
          <div class="missing-media">
            <span class="missing-media__initials" aria-hidden="true">${escapeHtml(initialsOf(report.full_name))}</span>
            ${photo ? `<img class="missing-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(report.full_name)}" loading="lazy" />` : ''}
          </div>`;
        return `
        <article class="list-card list-card--person">
          ${media}
          <div class="list-card__body">
          <div class="list-card__head">
            <h3>${escapeHtml(report.full_name)}</h3>
            <div class="meta-row">
              ${statusBadge(report.status)}
              ${report.is_sample ? sampleBadge() : ''}
            </div>
          </div>
          <div class="meta-row">
            <span>${icon('users')}${t('missing.age')}: ${report.age ?? t('missing.ageUnknown')}</span>
            <span>${icon('info')}${t('missing.gender')}: ${t(gender)}</span>
            <span>${icon('map-pin')}${escapeHtml(report.last_seen_location)}</span>
            <span>${icon('clock')}${escapeHtml(formatDate(report.last_seen_at, getLanguage()))}</span>
          </div>
          <p>${escapeHtml(report.description)}</p>
          <div class="notice notice--info">${icon('shield')}<span>${t('missing.private')}</span></div>
          </div>
        </article>`;
      })
      .join('');

    // The initials stay visible until the portrait actually decodes; a missing
    // file simply leaves the initials in place instead of a broken image.
    list.querySelectorAll('img.missing-photo').forEach((img) => {
      const reveal = () => img.classList.add('is-loaded');
      if (img.complete && img.naturalWidth) reveal();
      else img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
    });
  } catch (error) {
    list.innerHTML = errorBlock(error.message);
    list.querySelector('[data-retry]')?.addEventListener('click', () => loadList(root));
  }
}

function renderForm(root) {
  const card = root.querySelector('#missing-form-card');
  if (!card) return;

  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  card.innerHTML = `
    <div class="stack">
      <div>
        <h2 style="font-size:1.25rem">${t('missing.reportTitle')}</h2>
        <p class="small muted" style="margin-top:.4rem">${t('missing.reportLede')}</p>
      </div>

      <div class="notice notice--alert">${icon('alert-triangle')}<span>${t('missing.privacyNote')}</span></div>
      <div class="notice notice--info">${icon('shield')}<span>${t('missing.noSignIn')}</span></div>

      <form class="stack" data-missing-form novalidate>
        <div class="field">
          <label for="mp-name">${t('missing.formName')} <small>${t('common.required')}</small></label>
          <input class="input" id="mp-name" name="full_name" required minlength="2" maxlength="120" autocomplete="off" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="mp-age">${t('missing.age')} <small>${t('common.optional')}</small></label>
            <input class="input" id="mp-age" name="age" type="number" min="0" max="120" inputmode="numeric" />
          </div>
          <div class="field">
            <label for="mp-gender">${t('missing.gender')}</label>
            <select class="select" id="mp-gender" name="gender">
              ${GENDERS.map(
                (gender) =>
                  `<option value="${gender.value}"${gender.value === 'unknown' ? ' selected' : ''}>${t(gender.label)}</option>`,
              ).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label for="mp-location">${t('missing.formLastSeenLocation')} <small>${t('common.required')}</small></label>
          <input class="input" id="mp-location" name="last_seen_location" required minlength="2" maxlength="200" placeholder="Merkato, Addis Ababa" />
          <p class="hint" data-mp-map-status>${t('map.pickHint')}</p>
        </div>

        <div class="field">
          <span class="field__label">${t('map.pickTitle')} <small>${t('common.optional')}</small></span>
          <div class="map-picker-panel" data-mp-map></div>
        </div>

        <div class="field">
          <label for="mp-seen-at">${t('missing.formLastSeenAt')} <small>${t('common.required')}</small></label>
          <input class="input" id="mp-seen-at" name="last_seen_at" type="datetime-local" required value="${local}" />
        </div>

        <div class="field">
          <label for="mp-description">${t('missing.formDesc')} <small>${t('common.required')}</small></label>
          <textarea class="textarea" id="mp-description" name="description" required minlength="20" maxlength="1200" rows="4"></textarea>
        </div>

        <div class="field">
          <span class="field__label">${t('missing.photoLabel')} <small>${t('common.optional')}</small></span>
          <div class="photo-upload" data-photo-upload>
            <input class="sr-only" id="mp-photo" type="file" accept="image/jpeg,image/png,image/webp" data-photo-input />
            <label class="photo-upload__drop" for="mp-photo">
              <span class="photo-upload__icon">${icon('image')}</span>
              <span>
                <strong>${t('missing.photoChoose')}</strong>
                <small>${t('missing.photoHint')}</small>
              </span>
            </label>
            <div class="photo-upload__preview" data-photo-preview hidden>
              <img alt="${t('missing.photoPreviewAlt')}" />
              <button class="btn btn--ghost btn--sm" type="button" data-photo-remove>${icon('close')}${t('missing.photoRemove')}</button>
            </div>
            <p class="hint" data-photo-status></p>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="mp-contact-name">${t('missing.formContactName')} <small>${t('common.required')}</small></label>
            <input class="input" id="mp-contact-name" name="contact_name" required minlength="2" maxlength="120" autocomplete="name" />
          </div>
          <div class="field">
            <label for="mp-contact-phone">${t('missing.formContactPhone')} <small>${t('common.required')}</small></label>
            <input class="input" id="mp-contact-phone" name="contact_phone" required inputmode="tel" placeholder="+251 91 234 5678" autocomplete="tel" />
          </div>
        </div>

        <label class="check">
          <input type="checkbox" name="consent" required />
          <span>${t('missing.consentText')}</span>
        </label>

        <div class="notice notice--info">${icon('info')}<span>${t('missing.private')}</span></div>

        <button class="btn btn--alert btn--block" type="submit">${icon('shield')}${t('missing.submit')}</button>
      </form>
    </div>
  `;

  const form = card.querySelector('[data-missing-form]');
  const photoInput = form.querySelector('[data-photo-input]');
  const photoPreview = form.querySelector('[data-photo-preview]');
  const photoStatus = form.querySelector('[data-photo-status]');
  let photoData = '';

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      photoStatus.textContent = t('missing.photoWrongType');
      photoInput.value = '';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      photoStatus.textContent = t('missing.photoTooLarge');
      photoInput.value = '';
      return;
    }
    photoStatus.textContent = t('missing.photoPreparing');
    try {
      photoData = await readPhotoAsDataUrl(file);
      photoPreview.querySelector('img').src = photoData;
      photoPreview.hidden = false;
      photoStatus.textContent = t('missing.photoReady');
    } catch {
      photoData = '';
      photoPreview.hidden = true;
      photoStatus.textContent = t('missing.photoError');
    }
  });

  form.querySelector('[data-photo-remove]').addEventListener('click', () => {
    photoData = '';
    photoInput.value = '';
    photoPreview.hidden = true;
    photoPreview.querySelector('img').removeAttribute('src');
    photoStatus.textContent = '';
  });

  const mapStatus = form.querySelector('[data-mp-map-status]');
  void renderLocationPicker(form.querySelector('[data-mp-map]'), {
    height: 210,
    onChange: ({ lat, lng }) => {
      form.dataset.lat = String(lat);
      form.dataset.lng = String(lng);
      mapStatus.textContent = `${t('map.locationSelected')} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    },
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.elements.consent.checked) {
      toast(t('missing.consentRequired'), { type: 'error' });
      form.elements.consent.focus();
      return;
    }
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = t('action.sending');

    const age = form.elements.age.value.trim();

    try {
      const result = await api.createMissingPerson({
        full_name: form.elements.full_name.value.trim(),
        age: age === '' ? null : Number(age),
        gender: form.elements.gender.value,
        last_seen_location: form.elements.last_seen_location.value.trim(),
        last_seen_lat: form.dataset.lat ? Number(form.dataset.lat) : null,
        last_seen_lng: form.dataset.lng ? Number(form.dataset.lng) : null,
        last_seen_at: new Date(form.elements.last_seen_at.value).toISOString(),
        photo_data: photoData,
        description: form.elements.description.value.trim(),
        contact_name: form.elements.contact_name.value.trim(),
        contact_phone: form.elements.contact_phone.value.trim(),
        consent: form.elements.consent.checked,
      });
      renderSuccess(card, result, root);
    } catch (error) {
      if (error.offline || error.network) {
        offerSmsFallback({
          title: 'Send this missing-person report by SMS',
          body: [
            'AEC MISSING PERSON',
            `Name: ${form.elements.full_name.value.trim()}`,
            `Age: ${form.elements.age.value.trim() || 'unknown'}`,
            `Last seen: ${form.elements.last_seen_location.value.trim()} at ${form.elements.last_seen_at.value}`,
            form.elements.description.value.trim() ? `Details: ${form.elements.description.value.trim()}` : '',
            `Contact: ${form.elements.contact_name.value.trim()} · ${form.elements.contact_phone.value.trim()}`,
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 900),
          message: 'There is no connection to the AEC server. Your report details are ready to send as an SMS to 611.',
        });
      } else {
        toast(escapeHtml(error.message), { type: 'error', timeout: 8000 });
      }
      button.disabled = false;
      button.innerHTML = `${icon('shield')}${t('missing.submit')}`;
    }
  });
}

function renderSuccess(card, result, root) {
  card.innerHTML = `
    <div class="stack">
      <div class="confirm">
        <span class="small" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('report.successTitle')}</span>
        <span class="confirm__ref">${escapeHtml(result.reference)}</span>
        <p class="small">${escapeHtml(result.message)}</p>
      </div>
      <div class="summary-row"><span>${t('missing.reference')}</span><span>${escapeHtml(result.reference)}</span></div>
      <div class="notice notice--info">${icon('shield')}<span>${t('missing.private')}</span></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--block" type="button" data-missing-again>${t('action.newRequest')}</button>
        <a class="btn btn--alert btn--block" href="tel:611">${icon('phone')}${t('action.call611')}</a>
      </div>
    </div>
  `;

  card.querySelector('[data-missing-again]')?.addEventListener('click', () => {
    renderForm(root);
  });

  loadList(root);
}
