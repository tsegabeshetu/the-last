// Interactive maps on the portal: incident records are pinned from their
// coordinates, and every form that submits a place lets the citizen drop a pin
// by tapping the map (or by using their GPS position).
//
// Leaflet is served from the project's own vendor folder, so there is no API
// key, no account and no third-party script. Tiles come from OpenStreetMap; if
// they cannot be fetched (offline) the pins and the rest of the page still work.
import { currentLocation, escapeHtml, relativeTime } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLanguage, t } from '../lib/i18n.js';

const LEAFLET_DIR = new URL('../../vendor/leaflet/', import.meta.url);

// Basemaps. Both are keyless: satellite imagery plus place labels reads like a
// Google satellite map, while the street layer is the familiar road view.
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_LABELS_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const STREET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const STREET_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const SATELLITE_ATTRIBUTION = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';

const LAYER_STORAGE_KEY = 'aec.mapLayer';
let preferredLayer = readPreferredLayer();

function readPreferredLayer() {
  try {
    return localStorage.getItem(LAYER_STORAGE_KEY) === 'street' ? 'street' : 'satellite';
  } catch {
    return 'satellite';
  }
}

const ETHIOPIA = { lat: 9.145, lng: 40.4897, zoom: 6 };
const ADDIS = { lat: 9.0301, lng: 38.74, zoom: 12 };

const CATEGORY_COLOR = {
  critical: '#cf3f2f',
  infrastructure: '#c8871a',
  community: '#1f7a63',
};
const DEFAULT_MARKER_COLOR = '#0b6b57';
const PIN_COLOR = '#cf3f2f';

/** Every map currently on the page, so a route change can tear them down. */
const liveMaps = new Set();

/** The map that currently owns a given container (re-renders must replace it). */
const containerMaps = new WeakMap();

let leafletPromise = null;

/** Load Leaflet's CSS and script once, from the local vendor folder. */
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('leaflet.css', LEAFLET_DIR).href;
      link.dataset.leafletCss = 'true';
      document.head.append(link);
    }

    const script = document.createElement('script');
    script.src = new URL('leaflet.js', LEAFLET_DIR).href;
    script.async = true;
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet unavailable')));
    script.onerror = () => reject(new Error('Leaflet unavailable'));
    document.head.append(script);
  }).catch((error) => {
    leafletPromise = null;
    throw error;
  });

  return leafletPromise;
}

function registerMap(container, map) {
  liveMaps.add(map);
  containerMaps.set(container, map);
  return map;
}

/** Drop the map that a container held before it is filled again. */
function releaseContainer(container) {
  const previous = containerMaps.get(container);
  if (!previous) return;
  liveMaps.delete(previous);
  containerMaps.delete(container);
  try {
    previous.remove();
  } catch {
    /* already gone */
  }
}

function createBaseMap(L, host, { center, zoom, scrollWheelZoom = false } = {}) {
  const map = L.map(host, {
    center: [center.lat, center.lng],
    zoom,
    zoomControl: true,
    scrollWheelZoom,
    dragging: true,
    attributionControl: true,
  });

  const markOffline = () => host.classList.add('map-host--tiles-offline');

  const street = L.tileLayer(STREET_URL, {
    maxZoom: 19,
    attribution: STREET_ATTRIBUTION,
  });
  street.on('tileerror', markOffline);

  const satellite = L.layerGroup([
    L.tileLayer(SATELLITE_URL, { maxZoom: 18, attribution: SATELLITE_ATTRIBUTION }),
    L.tileLayer(SATELLITE_LABELS_URL, { maxZoom: 18, opacity: 0.9 }),
  ]);
  satellite.eachLayer((layer) => layer.on('tileerror', markOffline));

  const layers = { street, satellite };
  layers[preferredLayer].addTo(map);

  const control = L.control.layers(
    { [t('map.layerStreet')]: street, [t('map.layerSatellite')]: satellite },
    null,
    { position: 'topright', collapsed: true },
  );
  control.addTo(map);

  map.on('baselayerchange', (event) => {
    const chosen = Object.keys(layers).find((key) => layers[key] === event.layer);
    if (!chosen || chosen === preferredLayer) return;
    preferredLayer = chosen;
    try {
      localStorage.setItem(LAYER_STORAGE_KEY, chosen);
    } catch {
      /* private mode: keep the choice for this page only */
    }
  });

  return map;
}

function popupMarkup(incident) {
  const severity = incident.severity ? t(`severity.${incident.severity}`) : '';
  const when = incident.created_at ? relativeTime(incident.created_at, getLanguage()) : '';
  const category = incident.category ? t(`category.${incident.category}`) : '';
  const meta = [incident.status, when].filter(Boolean).map(escapeHtml).join(' · ');

  return `
    <div class="map-popup__body">
      ${category ? `<span class="map-popup__tag map-popup__tag--${escapeHtml(incident.category)}">${escapeHtml(category)}</span>` : ''}
      <strong>${escapeHtml(incident.title || '')}</strong>
      <p>${escapeHtml(incident.location_name || '')}${severity ? ` · ${escapeHtml(severity)}` : ''}</p>
      ${meta ? `<p class="map-popup__meta">${meta}</p>` : ''}
    </div>`;
}

function pinIcon(L) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span class="map-pin__dot" style="background:${PIN_COLOR}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function hasCoordinates(item) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * The display map on the home page and the live-map page: one pin per incident
 * that carries coordinates, each with a popup showing its details.
 */
export async function renderIncidentMap(container, incidents = [], { height = 420 } = {}) {
  if (!container) return null;

  const pinned = (incidents || []).filter(hasCoordinates);

  releaseContainer(container);
  container.style.height = `${height}px`;
  container.innerHTML = `<div class="map-host" data-map-host></div>`;
  const host = container.querySelector('[data-map-host]');

  let L;
  try {
    L = await loadLeaflet();
  } catch {
    container.innerHTML = `<div class="map-fallback">${escapeHtml(t('map.failed'))}</div>`;
    return null;
  }

  const map = registerMap(
    container,
    createBaseMap(L, host, {
      center: pinned.length ? { lat: Number(pinned[0].lat), lng: Number(pinned[0].lng) } : ETHIOPIA,
      zoom: pinned.length ? 10 : ETHIOPIA.zoom,
    }),
  );

  const markers = pinned.map((incident) => {
    const marker = L.circleMarker([Number(incident.lat), Number(incident.lng)], {
      radius: 9,
      color: '#ffffff',
      weight: 2.5,
      opacity: 1,
      fillColor: CATEGORY_COLOR[incident.category] || DEFAULT_MARKER_COLOR,
      fillOpacity: 0.95,
    });
    marker.bindPopup(popupMarkup(incident), { maxWidth: 280, minWidth: 180, className: 'map-popup' });
    marker.addTo(map);
    return marker;
  });

  if (markers.length) {
    const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
    map.fitBounds(bounds.pad(0.25), { maxZoom: 11 });
  }

  setTimeout(() => {
    try {
      map.invalidateSize();
    } catch {
      /* map already removed */
    }
  }, 120);

  return map;
}

/**
 * The map panel on every form that submits a place (incident report, missing
 * person, car rental, medicine order). Tapping the map drops a draggable pin,
 * which is what fills the coordinates that go with the submission.
 */
export async function renderLocationPicker(container, { height = 220, onChange = null } = {}) {
  if (!container) return null;

  releaseContainer(container);
  container.innerHTML = `
    <div class="map-picker">
      <div class="map-picker__canvas" data-picker-canvas></div>
      <div class="map-picker__bar">
        <button class="btn btn--ghost btn--sm" type="button" data-picker-gps>${icon('map-pin')}${t('map.useMyLocation')}</button>
        <span class="small muted" data-picker-status>${t('map.pickHint')}</span>
      </div>
    </div>
  `;

  const canvas = container.querySelector('[data-picker-canvas]');
  const status = container.querySelector('[data-picker-status]');
  const gpsButton = container.querySelector('[data-picker-gps]');

  canvas.style.height = `${height}px`;
  canvas.innerHTML = `<div class="map-host" data-map-host></div>`;
  const host = canvas.querySelector('[data-map-host]');

  let L;
  try {
    L = await loadLeaflet();
  } catch {
    canvas.innerHTML = `<div class="map-fallback">${escapeHtml(t('map.failed'))}</div>`;
    return null;
  }

  const map = registerMap(container, createBaseMap(L, host, { center: ADDIS, zoom: ADDIS.zoom }));
  canvas.classList.add('is-pickable');

  let pin = null;

  const place = ({ lat, lng }, { zoom = null } = {}) => {
    const point = [Number(lat), Number(lng)];

    if (!pin) {
      pin = L.marker(point, { draggable: true, icon: pinIcon(L), keyboard: true }).addTo(map);
      pin.on('dragend', () => {
        const moved = pin.getLatLng();
        status.textContent = `${t('map.locationSelected')} · ${moved.lat.toFixed(5)}, ${moved.lng.toFixed(5)}`;
        onChange?.({ lat: moved.lat, lng: moved.lng });
      });
    } else {
      pin.setLatLng(point);
    }

    if (zoom) map.setView(point, zoom);
    status.textContent = `${t('map.locationSelected')} · ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
    onChange?.({ lat: Number(lat), lng: Number(lng) });
  };

  map.on('click', (event) => place(event.latlng));

  gpsButton.addEventListener('click', async () => {
    gpsButton.disabled = true;
    try {
      const position = await currentLocation();
      place(position, { zoom: 15 });
    } catch {
      status.textContent = t('map.locationDenied');
    } finally {
      gpsButton.disabled = false;
    }
  });

  setTimeout(() => {
    try {
      map.invalidateSize();
    } catch {
      /* map already removed */
    }
  }, 120);

  return map;
}

/** Called by the router before each page render: tear every map down cleanly. */
export function disposeMap() {
  liveMaps.forEach((map) => {
    try {
      map.remove();
    } catch {
      /* already gone */
    }
  });
  liveMaps.clear();
}
