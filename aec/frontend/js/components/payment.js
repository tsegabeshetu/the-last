// Demo payment-method picker. No money moves: the selected method and a masked
// reference are stored with the request so a partner can confirm payment.
import { icon } from '../lib/icons.js';
import { t } from '../lib/i18n.js';

export const PAYMENT_METHODS = [
  {
    id: 'telebirr',
    mark: 'telebirr',
    title: 'payment.telebirr',
    desc: 'payment.telebirrDesc',
    tone: 'telebirr',
  },
  {
    id: 'cbe',
    mark: 'CBE',
    title: 'payment.cbe',
    desc: 'payment.cbeDesc',
    tone: 'cbe',
  },
  {
    id: 'paypal',
    mark: 'PayPal',
    title: 'payment.paypal',
    desc: 'payment.paypalDesc',
    tone: 'paypal',
  },
  {
    id: 'mastercard',
    mark: 'MC',
    title: 'payment.mastercard',
    desc: 'payment.mastercardDesc',
    tone: 'mastercard',
  },
];

export function paymentMethodsMarkup({ selected = 'telebirr' } = {}) {
  return `
    <div class="payment-picker" data-payment-picker>
      <span class="field__label">${t('payment.title')}</span>
      <div class="payment-grid" role="radiogroup" aria-label="${t('payment.title')}">
        ${PAYMENT_METHODS.map(
          (method) => `
          <label class="payment-option payment-option--${method.tone}">
            <input type="radio" name="payment_method" value="${method.id}" ${method.id === selected ? 'checked' : ''} />
            <span class="payment-option__mark">${method.mark}</span>
            <span class="payment-option__text">
              <strong>${t(method.title)}</strong>
              <small>${t(method.desc)}</small>
            </span>
            <span class="payment-option__check">${icon('check')}</span>
          </label>`,
        ).join('')}
      </div>
      <div class="payment-detail" data-payment-detail></div>
      <p class="hint">${t('payment.demoNote')}</p>
    </div>
  `;
}

function detailMarkup(method, uid) {
  if (method === 'telebirr') {
    return `
      <div class="field">
        <label for="${uid}-phone">${t('payment.accountPhone')} <small>${t('common.required')}</small></label>
        <input class="input" id="${uid}-phone" name="payment_account" required inputmode="tel" placeholder="+251 91 234 5678" autocomplete="tel" />
      </div>`;
  }
  if (method === 'cbe') {
    return `
      <div class="field">
        <label for="${uid}-cbe">${t('payment.cbeAccount')} <small>${t('common.required')}</small></label>
        <input class="input" id="${uid}-cbe" name="payment_account" required inputmode="numeric" minlength="8" maxlength="20" placeholder="1000 1234 5678" />
      </div>`;
  }
  if (method === 'paypal') {
    return `
      <div class="field">
        <label for="${uid}-paypal">${t('payment.paypalEmail')} <small>${t('common.required')}</small></label>
        <input class="input" id="${uid}-paypal" name="payment_account" type="email" required placeholder="name@example.com" autocomplete="email" />
      </div>`;
  }
  return `
    <div class="field">
      <label for="${uid}-card">${t('payment.cardNumber')} <small>${t('common.required')}</small></label>
      <input class="input" id="${uid}-card" name="payment_card" required inputmode="numeric" pattern="[0-9 ]{12,19}" maxlength="19" placeholder="5555 5555 5555 4444" autocomplete="cc-number" />
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="${uid}-expiry">${t('payment.expiry')} <small>${t('common.required')}</small></label>
        <input class="input" id="${uid}-expiry" name="payment_expiry" required pattern="(0[1-9]|1[0-2])/[0-9]{2}" maxlength="5" placeholder="MM/YY" autocomplete="cc-exp" />
      </div>
      <div class="field">
        <label for="${uid}-cvv">${t('payment.cvv')} <small>${t('common.required')}</small></label>
        <input class="input" id="${uid}-cvv" name="payment_cvv" required inputmode="numeric" pattern="[0-9]{3,4}" maxlength="4" placeholder="123" autocomplete="cc-csc" />
      </div>
    </div>
    <div class="field">
      <label for="${uid}-holder">${t('payment.cardHolder')} <small>${t('common.required')}</small></label>
      <input class="input" id="${uid}-holder" name="payment_holder" required minlength="2" maxlength="80" autocomplete="cc-name" />
    </div>`;
}

function selectedMethod(container) {
  return container.querySelector('[data-payment-picker] input[name="payment_method"]:checked')?.value || 'telebirr';
}

function maskTail(value, label) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const digits = clean.replace(/\D/g, '');
  const tail = digits.length >= 4 ? digits.slice(-4) : clean.slice(-4);
  return tail ? `${label} ···· ${tail}` : label;
}

/** Wire the picker inside a form. Call once after the form markup is inserted. */
export function wirePaymentPicker(container, { uid = 'pay' } = {}) {
  const picker = container.querySelector('[data-payment-picker]');
  if (!picker) return null;

  const detail = picker.querySelector('[data-payment-detail]');
  let method = selectedMethod(picker);

  const renderDetail = () => {
    detail.innerHTML = detailMarkup(method, uid);
  };

  picker.querySelectorAll('input[name="payment_method"]').forEach((input) =>
    input.addEventListener('change', () => {
      method = selectedMethod(picker);
      renderDetail();
    }),
  );

  renderDetail();

  return {
    get method() {
      return method;
    },
    getSelection() {
      const accountField = detail.querySelector('input[name="payment_account"]');
      const cardField = detail.querySelector('input[name="payment_card"]');
      let reference = '';
      if (method === 'mastercard') {
        reference = maskTail(cardField?.value, 'Mastercard');
      } else if (method === 'paypal') {
        reference = String(accountField?.value || '').trim();
      } else if (method === 'cbe') {
        reference = maskTail(accountField?.value, 'CBE');
      } else {
        reference = maskTail(accountField?.value, 'telebirr');
      }
      return { payment_method: method, payment_reference: reference.slice(0, 80) };
    },
    clearSensitiveFields() {
      detail.querySelectorAll('input').forEach((input) => {
        if (input.name !== 'payment_method') input.value = '';
      });
    },
  };
}

export function paymentBadgesMarkup() {
  return PAYMENT_METHODS.map(
    (method) =>
      `<span class="payment-badge payment-badge--${method.tone}"><span>${method.mark}</span>${t(method.title)}</span>`,
  ).join('');
}

export function paymentLabel(method) {
  return t(`payment.${method}`) === `payment.${method}` ? method : t(`payment.${method}`);
}
