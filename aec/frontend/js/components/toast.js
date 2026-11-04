import { icon } from '../lib/icons.js';

export function toast(message, { type = 'info', timeout = 4500 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  node.innerHTML = `${icon(type === 'error' ? 'alert-triangle' : 'check')}<div>${message}</div>`;
  root.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s ease, transform .2s ease';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 220);
  }, timeout);
}
