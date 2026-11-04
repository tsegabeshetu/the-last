import { CONFIG } from '../config.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/i18n.js';

export function renderFooter() {
  const root = document.getElementById('site-footer');
  if (!root) return;
  const year = new Date().getFullYear();

  root.innerHTML = `
    <footer class="site-footer">
      <div class="shell">
        <div class="footer-grid">
          <div>
            <a class="brand" href="#/home">
              <span class="brand__mark">${icon('shield')}</span>
              <span class="brand__text">
                <span class="brand__name">${t('brand.short')}</span>
                <span class="brand__tag">${t('brand.full')}</span>
              </span>
            </a>
            <p style="margin-top:1rem">${t('home.lede')}</p>
            <p style="margin-top:1rem;color:rgba(255,255,255,.5);font-size:.78rem">${t('help.disclaimer')}</p>
          </div>
          <div>
            <h3>${t('nav.home')}</h3>
            <div class="footer-links">
              <a href="#/emergency">${t('nav.emergency')}</a>
              <a href="#/map">${t('nav.map')}</a>
              <a href="#/report">${t('nav.report')}</a>
              <a href="#/missing-persons">${t('nav.missing')}</a>
            </div>
          </div>
          <div>
            <h3>${t('emergency.servicesEyebrow')}</h3>
            <div class="footer-links">
              <a href="#/emergency?service=rental">${t('service.rental.title')}</a>
              <a href="#/emergency?service=medications">${t('service.medication.title')}</a>
              <a href="#/help">${t('nav.help')}</a>
              <a href="#/admin">${t('nav.admin')}</a>
            </div>
          </div>
          <div>
            <h3>${t('help.numbers')}</h3>
            <div class="footer-links">
              <a href="tel:${CONFIG.emergencyNumber}"><span class="footer-emergency">${icon('phone')} ${CONFIG.emergencyNumber} · ${t('nav.emergency')}</span></a>
              <a href="tel:${CONFIG.policeNumber}">${CONFIG.policeNumber} · Police</a>
              <a href="tel:${CONFIG.ambulanceNumber}">${CONFIG.ambulanceNumber} · Ambulance</a>
              <a href="mailto:desk@aec.demo">desk@aec.demo</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${year} AEC · ${t('brand.full')}</span>
          <span>${t('common.demoData')} · JavaScript frontend · Python API · Java dispatch</span>
        </div>
      </div>
    </footer>
  `;
}
