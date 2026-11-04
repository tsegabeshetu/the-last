import { CONFIG } from '../config.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/i18n.js';
import { pageHead } from '../lib/ui.js';

const NUMBERS = [
  { number: CONFIG.emergencyNumber, label: 'help.numberEmergency', icon: 'alert-triangle', tone: 'btn--alert' },
  { number: CONFIG.policeNumber, label: 'help.numberPolice', icon: 'shield', tone: 'btn--ghost' },
  { number: CONFIG.ambulanceNumber, label: 'help.numberAmbulance', icon: 'ambulance', tone: 'btn--ghost' },
];

const GUIDANCE = [
  { icon: 'flame', title: 'help.fireTitle', text: 'help.fireText' },
  { icon: 'heart-pulse', title: 'help.medicalTitle', text: 'help.medicalText' },
  { icon: 'zap', title: 'help.powerTitle', text: 'help.powerText' },
  { icon: 'users', title: 'help.missingTitle', text: 'help.missingText' },
];

const FAQ = [
  ['help.faqQ1', 'help.faqA1'],
  ['help.faqQ2', 'help.faqA2'],
  ['help.faqQ3', 'help.faqA3'],
  ['help.faqQ4', 'help.faqA4'],
  ['help.faqQ5', 'help.faqA5'],
];

export async function render(root) {
  root.innerHTML = `
    ${pageHead({
      eyebrow: t('help.eyebrow'),
      title: t('help.title'),
      lede: t('help.lede'),
      image: 'assets/img/bg-help.jpg',
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}

    <section class="section section--tight">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('help.numbers')}</p>
            <h2>${t('help.numbers')}</h2>
          </div>
          <p>${t('help.callNote')}</p>
        </div>
        <div class="grid grid--3">
          ${NUMBERS.map(
            (item) => `
            <div class="card card--pad stack">
              <span class="badge badge--outline">${icon(item.icon)}${t(item.label)}</span>
              <p class="metric" style="border:0;padding:0;display:block">
                <strong style="font-size:2rem;line-height:1">${item.number}</strong>
              </p>
              <a class="btn ${item.tone} btn--block" href="tel:${item.number}">${icon('phone')}${t('action.callNow')}</a>
            </div>`,
          ).join('')}
        </div>
        <div class="notice notice--alert" style="margin-top:1.25rem">
          ${icon('alert-triangle')}<span>${t('help.disclaimer')}</span>
        </div>
      </div>
    </section>

    <section class="section section--surface">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t('help.guidance')}</p>
            <h2>${t('help.guidance')}</h2>
          </div>
        </div>
        <div class="grid grid--2">
          ${GUIDANCE.map(
            (item) => `
            <article class="card card--pad stack">
              <span class="service-card__icon">${icon(item.icon)}</span>
              <h3>${t(item.title)}</h3>
              <p class="small muted">${t(item.text)}</p>
            </article>`,
          ).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell grid grid--2" style="align-items:start;gap:1.5rem">
        <div class="stack" style="gap:1rem">
          <div class="section-head" style="margin-bottom:0">
            <div>
              <p class="eyebrow">${t('help.faq')}</p>
              <h2>${t('help.faq')}</h2>
            </div>
          </div>
          <div class="list">
            ${FAQ.map(
              ([question, answer]) => `
              <details class="list-card">
                <summary style="cursor:pointer;font-weight:650">${t(question)}</summary>
                <p style="margin-top:.6rem">${t(answer)}</p>
              </details>`,
            ).join('')}
          </div>
        </div>

        <div class="stack" style="gap:1rem">
          <div class="assistant-band">
            <div>
              <p class="eyebrow eyebrow--light">${t('assistant.name')} · AI</p>
              <h2>${t('help.asayechTitle')}</h2>
              <p>${t('help.asayechText')}</p>
            </div>
            <div class="btn-row">
              <button class="btn btn--amber" type="button" data-open-assistant>${icon('sparkles')}${t('action.askAsayech')}</button>
              <a class="btn btn--light" href="tel:${CONFIG.emergencyNumber}">${icon('phone')}${t('action.call611')}</a>
            </div>
          </div>

          <div class="card card--pad stack">
            <h3>${t('help.about')}</h3>
            <p class="small muted">${t('help.aboutText')}</p>
            <div class="divider"></div>
            <div class="meta-row">
              <span>${icon('globe')}JavaScript frontend</span>
              <span>${icon('shield')}Python API</span>
              <span>${icon('zap')}Java dispatch service</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll('[data-open-assistant]').forEach((button) =>
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('aec:open-assistant'))),
  );
}
