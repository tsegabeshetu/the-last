import { api } from '../lib/api.js';
import { escapeHtml, formatDate, openDialog } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';
import { emptyBlock, errorBlock, loadingBlock, pageHead, sampleBadge } from '../lib/ui.js';

const state = {
  articles: [],
  category: '',
};

export async function render(root) {
  state.articles = [];
  state.category = '';

  root.innerHTML = `
    ${pageHead({
      eyebrow: t('news.eyebrow'),
      title: t('news.title'),
      lede: t('news.lede'),
      image: 'assets/img/hero-team.jpg',
      crumbs: [{ label: t('nav.home'), href: '#/home' }],
    })}

    <section class="section">
      <div class="shell stack" style="gap:1.25rem">
        <div class="section-head" style="margin-bottom:0">
          <div>
            <p class="eyebrow">${t('news.categoryAll')}</p>
            <div class="chip-row" id="news-filters" role="group" aria-label="${t('news.categoryAll')}"></div>
          </div>
          <span class="badge badge--outline">${icon('info')}${t('common.demoData')}</span>
        </div>

        <div class="grid grid--3" id="news-grid">${loadingBlock(3)}</div>
      </div>
    </section>
  `;

  await load(root);
}

async function load(root) {
  const grid = root.querySelector('#news-grid');
  if (!grid) return;

  try {
    state.articles = await api.news();
    renderFilters(root);
    renderGrid(root);
  } catch (error) {
    grid.innerHTML = errorBlock(error.message);
    grid.querySelector('[data-retry]')?.addEventListener('click', () => load(root));
  }
}

function renderFilters(root) {
  const row = root.querySelector('#news-filters');
  if (!row) return;

  const categories = [...new Set(state.articles.map((article) => article.category))];
  row.innerHTML = [
    `<button class="chip" type="button" data-news-filter="" aria-pressed="${state.category === ''}">${t('news.all')}</button>`,
    ...categories.map(
      (category) =>
        `<button class="chip" type="button" data-news-filter="${escapeHtml(category)}" aria-pressed="${state.category === category}">${escapeHtml(category)}</button>`,
    ),
  ].join('');

  row.querySelectorAll('[data-news-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      state.category = button.dataset.newsFilter;
      row.querySelectorAll('[data-news-filter]').forEach((item) =>
        item.setAttribute('aria-pressed', String(item.dataset.newsFilter === state.category)),
      );
      renderGrid(root);
    }),
  );
}

function renderGrid(root) {
  const grid = root.querySelector('#news-grid');
  if (!grid) return;

  const articles = state.category
    ? state.articles.filter((article) => article.category === state.category)
    : state.articles;

  if (!articles.length) {
    grid.innerHTML = emptyBlock(t('news.empty'));
    return;
  }

  grid.innerHTML = articles
    .map(
      (article) => `
      <button class="article-card" type="button" data-news="${article.id}">
        <div class="list-card__head">
          <span class="badge badge--outline badge--sm">${escapeHtml(article.category)}</span>
          ${article.is_sample ? sampleBadge() : ''}
        </div>
        <h3>${escapeHtml(article.title)}</h3>
        <p>${escapeHtml(article.summary)}</p>
        <div class="article-card__meta">
          <span>${escapeHtml(article.author)}</span>
          <span>${escapeHtml(formatDate(article.created_at, getLanguage()))}</span>
        </div>
        <span class="service-card__link">${t('news.read')}${icon('arrow-right')}</span>
      </button>`,
    )
    .join('');

  grid.querySelectorAll('[data-news]').forEach((button) =>
    button.addEventListener('click', () => {
      const article = state.articles.find((item) => item.id === Number(button.dataset.news));
      if (article) openArticle(article);
    }),
  );
}

function openArticle(article) {
  const paragraphs = String(article.body || '')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br />')}</p>`)
    .join('');

  openDialog(`
    <div class="sheet__head">
      <div>
        <p class="eyebrow">${escapeHtml(article.category)}</p>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(t('news.by', { author: article.author }))} · ${escapeHtml(formatDate(article.created_at, getLanguage()))}</p>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="${t('action.close')}">${icon('close')}</button>
    </div>
    <div class="sheet__body stack">
      ${article.is_sample ? `<div class="notice notice--info">${icon('info')}<span>${t('news.sampleNote')}</span></div>` : ''}
      ${paragraphs}
      <div class="notice notice--alert">${icon('alert-triangle')}<span>${t('help.disclaimer')}</span></div>
    </div>
    <div class="sheet__foot">
      <button class="btn btn--ghost" type="button" data-close>${t('news.close')}</button>
      <a class="btn btn--alert" href="tel:611">${icon('phone')}${t('action.call611')}</a>
    </div>
  `);
}
