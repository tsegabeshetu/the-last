import { CONFIG } from '../config.js';
import { answerFor } from '../lib/localAssistant.js';
import { escapeHtml } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, onLanguageChange, t } from '../lib/i18n.js';

const LOCAL_STARTERS = {
  en: [
    'I smell smoke in my building',
    'Someone is unconscious and bleeding',
    'A power line fell on my street',
    'I need a car to reach the hospital',
    'Can I get insulin delivered tonight?',
    'How do I report a missing person?',
  ],
  am: [
    'በህንጻው ውስጥ ጢስ አለ',
    'አንድ ሰው ንቃተ ህሊናውን አጥቷል፣ ደምም ይወጣል',
    'በመንገዳችን ላይ የመብራት መስመር ወድቋል',
    'ወደ ሆስፒታል ለመድረስ መኪና ያስፈልገኛል',
    'ዛሬ ማታ ኢንሱሊን ማድረስ ይቻላል?',
    'የጠፋ ሰው እንዴት ሪፖርት ማድረግ እችላለሁ?',
  ],
};

const state = {
  open: false,
  busy: false,
  messages: [],
};

let elements = null;

function renderRoot() {
  const root = document.getElementById('assistant-root');
  if (!root) return;

  root.innerHTML = `
    <button class="asayech-fab${state.open ? ' hidden' : ''}" type="button" data-assistant-open aria-haspopup="dialog">
      <span class="asayech-fab__avatar">${icon('sparkles')}</span>
      <span>${t('assistant.name')}</span>
    </button>

    <section class="asayech-panel${state.open ? '' : ' hidden'}" role="dialog" aria-modal="false" aria-label="${t('assistant.name')}">
      <header class="asayech-head">
        <span class="asayech-head__avatar">${icon('sparkles')}</span>
        <div>
          <h2>${t('assistant.name')}</h2>
          <p><span class="live-dot"></span>${t('assistant.online')}</p>
        </div>
        <button class="icon-btn" type="button" data-assistant-clear aria-label="${t('assistant.clear')}" title="${t('assistant.clear')}">
          ${icon('rotate-ccw')}
        </button>
        <button class="icon-btn" type="button" data-assistant-close aria-label="${t('action.close')}">
          ${icon('close')}
        </button>
      </header>

      <div class="asayech-log" data-assistant-log></div>

      <div class="asayech-starters" data-assistant-starters hidden></div>

      <form class="asayech-form" data-assistant-form>
        <label class="sr-only" for="asayech-input">${t('assistant.placeholder')}</label>
        <textarea id="asayech-input" rows="1" maxlength="1000" placeholder="${t('assistant.placeholder')}" data-assistant-input></textarea>
        <button class="asayech-send" type="submit" aria-label="${t('assistant.send')}">${icon('send')}</button>
      </form>

      <div class="asayech-foot">
        <span>${t('assistant.disclaimer')}</span>
        <a href="tel:${CONFIG.emergencyNumber}">${t('action.call611')}</a>
      </div>
    </section>
  `;

  elements = {
    fab: root.querySelector('[data-assistant-open]'),
    panel: root.querySelector('.asayech-panel'),
    log: root.querySelector('[data-assistant-log]'),
    starters: root.querySelector('[data-assistant-starters]'),
    form: root.querySelector('[data-assistant-form]'),
    input: root.querySelector('[data-assistant-input]'),
    clear: root.querySelector('[data-assistant-clear]'),
    close: root.querySelector('[data-assistant-close]'),
  };

  elements.fab.addEventListener('click', open);
  elements.close.addEventListener('click', close);
  elements.clear.addEventListener('click', resetConversation);
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(elements.input.value);
  });
  elements.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(elements.input.value);
    }
  });
  elements.input.addEventListener('input', () => {
    elements.input.style.height = 'auto';
    elements.input.style.height = `${Math.min(elements.input.scrollHeight, 110)}px`;
  });

  renderLog();
  renderStarters();
}

function renderLog() {
  if (!elements) return;
  const log = elements.log;

  if (!state.messages.length) {
    log.innerHTML = `
      <div class="msg msg--bot">
        ${escapeHtml(
          getLanguage() === 'en'
            ? 'Hello, I am ASAYECH, the AEC emergency assistant. I can guide you through fire, medical, and personal-safety emergencies, power or water failures, missing-person reports, car rental, and medication delivery. What is happening right now?'
            : 'ሰላም፣ እኔ አሳየች የAEC የአደጋ ረዳት ነኝ። በእሳት፣ በሕክምናና በግል ደህንነት አደጋዎች፣ በመብራት ወይም በውሃ ብልሽት፣ በጠፉ ሰዎች ሪፖርት፣ በመኪና ኪራይ እና በመድኃኒት ማድረስ ልመራዎት እችላለሁ። አሁን ምን እየተፈጸመ ነው?',
        )}
      </div>
    `;
    return;
  }

  log.innerHTML = state.messages
    .map((message) => {
      if (message.role === 'user') {
        return `<div class="msg msg--user">${escapeHtml(message.content)}</div>`;
      }
      const actions = (message.actions || [])
        .map((action) => {
          if (action.phone) {
            return `<a class="btn btn--alert" href="tel:${escapeHtml(action.phone)}">${icon('phone')}${escapeHtml(action.label)}</a>`;
          }
          if (action.href) {
            return `<a class="btn" href="${escapeHtml(action.href)}" data-assistant-nav>${escapeHtml(action.label)}${icon('arrow-right')}</a>`;
          }
          return '';
        })
        .join('');
      return `
        <div class="msg msg--bot">
          ${escapeHtml(message.content)}
          ${actions ? `<div class="msg-actions">${actions}</div>` : ''}
        </div>
      `;
    })
    .join('');

  if (state.busy) {
    log.insertAdjacentHTML(
      'beforeend',
      `<div class="msg msg--bot msg--typing" aria-label="${t('assistant.thinking')}"><span></span><span></span><span></span></div>`,
    );
  }

  log.querySelectorAll('[data-assistant-nav]').forEach((link) =>
    link.addEventListener('click', () => {
      if (window.innerWidth < 560) close();
    }),
  );

  log.scrollTop = log.scrollHeight;
}

function renderStarters() {
  if (!elements) return;
  const starters = LOCAL_STARTERS[getLanguage()];
  if (state.messages.length) {
    elements.starters.hidden = true;
    return;
  }
  elements.starters.hidden = false;
  elements.starters.innerHTML = starters
    .map((prompt) => `<button type="button" data-starter="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`)
    .join('');
  elements.starters.querySelectorAll('[data-starter]').forEach((button) =>
    button.addEventListener('click', () => submit(button.dataset.starter)),
  );
}

async function submit(rawMessage) {
  const message = String(rawMessage || '').trim();
  if (!message || state.busy) return;

  state.messages.push({ role: 'user', content: message });
  elements.input.value = '';
  elements.input.style.height = 'auto';
  renderLog();
  renderStarters();

  // ASAYECH answers from the built-in question set — no API call, so it
  // replies instantly and keeps working with no internet.
  const answer = answerFor(message, getLanguage());
  state.messages.push({
    role: 'assistant',
    content: answer.reply,
    actions: answer.suggestions,
  });
  renderLog();
  elements.input.focus();
}

function resetConversation() {
  state.messages = [];
  state.busy = false;
  renderLog();
  renderStarters();
  elements.input.value = '';
  elements.input.focus();
}

export function open() {
  state.open = true;
  if (!elements) renderRoot();
  elements.panel.classList.remove('hidden');
  elements.fab.classList.add('hidden');
  elements.input.focus();
  document.body.dataset.assistantOpen = 'true';
}

export function close() {
  state.open = false;
  if (!elements) return;
  elements.panel.classList.add('hidden');
  elements.fab.classList.remove('hidden');
  document.body.dataset.assistantOpen = 'false';
  elements.fab.focus();
}

export function mountAssistant() {
  renderRoot();
  onLanguageChange(() => {
    const wasOpen = state.open;
    const messages = state.messages;
    renderRoot();
    state.messages = messages;
    state.open = wasOpen;
    if (wasOpen) {
      elements.panel.classList.remove('hidden');
      elements.fab.classList.add('hidden');
    }
    renderLog();
    renderStarters();
  });

  window.addEventListener('aec:open-assistant', open);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open) close();
  });
}
