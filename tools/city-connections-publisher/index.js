// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { daFetch } from 'https://da.live/nx/utils/daFetch.js';

const ORG = 'jfoxx';
const REPO = 'amtrak';
const REF = 'main';

const CITIES_JSON = `https://${REF}--${REPO}--${ORG}.aem.page/city-connections/cities.json`;
const TEMPLATE_URL = `https://content.da.live/${ORG}/${REPO}/city-connections/city-connections`;
const DA_SOURCE = `https://admin.da.live/source/${ORG}/${REPO}`;
const AEM_PREVIEW = `https://admin.hlx.page/preview/${ORG}/${REPO}/${REF}`;
const AEM_LIVE = `https://admin.hlx.page/live/${ORG}/${REPO}/${REF}`;

let cityMap = {};
let routes = [];
let templateHtml = '';

// ---- DOM refs ----
const container = document.getElementById('container');
const checkAllBtn = document.getElementById('btn-check-all');
const createAllBtn = document.getElementById('btn-create-all');
const publishAllBtn = document.getElementById('btn-preview-publish-all');
const summaryEl = document.getElementById('summary');
const filterCheckbox = document.getElementById('filter-missing');

filterCheckbox.addEventListener('change', applyFilter);

// ---- Data helpers ----
async function fetchCities() {
  const resp = await fetch(CITIES_JSON);
  if (!resp.ok) throw new Error(`Failed to fetch cities (${resp.status})`);
  const json = await resp.json();
  return json.data;
}

async function fetchTemplate() {
  const resp = await daFetch(TEMPLATE_URL);
  if (!resp.ok) throw new Error(`Failed to fetch template (${resp.status})`);
  return resp.text();
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildRoutes(cities) {
  cityMap = Object.fromEntries(cities.map((c) => [c['Station Code'], c]));

  const list = [];
  for (const city of cities) {
    const fromCode = city['Station Code'];
    const connected = (city['Connected Cities (Codes)'] || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    for (const toCode of connected) {
      const toCity = cityMap[toCode];
      if (!toCity) continue;

      const slug = `${slugify(city['City'])}-to-${slugify(toCity['City'])}-by-train`;
      list.push({
        fromCode,
        toCode,
        fromCity: city['City'],
        toCity: toCity['City'],
        path: `/city-connections/${slug}`,
        status: 'unknown',
        statusText: 'Unknown',
      });
    }
  }
  return list;
}

function fillTemplate(from, to) {
  const html = templateHtml
    .replaceAll('{{city1}}', from['City'])
    .replaceAll('{{city2}}', to['City'])
    .replaceAll('{{city-code-one}}', from['Station Code'])
    .replaceAll('{{city-code-two}}', to['Station Code'])
    .replaceAll('{{description}}', to['Description']);

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pictures = [...doc.querySelectorAll('.cc-hero picture')];

  [[pictures[0], from.image], [pictures[1], to.image]].forEach(([pic, src]) => {
    if (!pic || !src) return;
    pic.querySelectorAll('source').forEach((s) => s.setAttribute('srcset', src));
    const img = pic.querySelector('img');
    if (img) img.setAttribute('src', src);
  });

  return doc.body.outerHTML;
}

// ---- DA / AEM API ----
async function checkPageExists(path) {
  const resp = await daFetch(`${DA_SOURCE}${path}.html`, { method: 'HEAD' });
  return resp.ok;
}

async function savePage(path, html) {
  const blob = new Blob([html], { type: 'text/html' });
  const form = new FormData();
  form.append('data', blob, 'index.html');
  const resp = await daFetch(`${DA_SOURCE}${path}.html`, { method: 'PUT', body: form });
  return resp.ok;
}

async function previewPage(path) {
  const resp = await daFetch(`${AEM_PREVIEW}${path}`, { method: 'POST' });
  return resp.ok;
}

async function publishPage(path) {
  const resp = await daFetch(`${AEM_LIVE}${path}`, { method: 'POST' });
  return resp.ok;
}

// ---- State helpers ----
function setStatus(index, status, text) {
  routes[index].status = status;
  routes[index].statusText = text;
  refreshRow(index);
  updateSummary();
  applyFilter();
}

// ---- Render ----
function renderTable() {
  if (!routes.length) {
    container.innerHTML = '<p class="error-msg">No routes found.</p>';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>From</th>
        <th></th>
        <th>To</th>
        <th>Page Path</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  `;

  const tbody = table.querySelector('tbody');
  routes.forEach((_, i) => tbody.append(buildRow(i)));

  container.innerHTML = '';
  container.append(table);
  updateSummary();
}

const STATUSES_WITH_EDIT     = new Set(['exists', 'created', 'previewed', 'published']);
const STATUSES_WITH_PREVIEW  = new Set(['previewed', 'published']);
const STATUSES_WITH_LIVE     = new Set(['published']);

function buildRow(index) {
  const { fromCity, fromCode, toCity, toCode, path, status, statusText } = routes[index];
  const editHref    = `https://da.live/edit#/${ORG}/${REPO}${path}`;
  const previewHref = `https://${REF}--${REPO}--${ORG}.aem.page${path}`;
  const liveHref    = `https://${REF}--${REPO}--${ORG}.aem.live${path}`;

  const tr = document.createElement('tr');
  tr.id = `route-${index}`;
  tr.innerHTML = `
    <td>
      <div class="city-name">${fromCity}</div>
      <div class="city-code">${fromCode}</div>
    </td>
    <td class="td-arrow">→</td>
    <td>
      <div class="city-name">${toCity}</div>
      <div class="city-code">${toCode}</div>
    </td>
    <td class="td-path">${path}</td>
    <td class="td-status">
      <span class="status-badge badge-${status}">${statusText}</span>
    </td>
    <td class="actions">
      <sl-button class="btn-check" data-index="${index}">Check</sl-button>
      <sl-button class="btn-create" data-index="${index}">Create</sl-button>
      <sl-button class="btn-preview" data-index="${index}">Preview</sl-button>
      <sl-button class="btn-publish" data-index="${index}">Publish</sl-button>
      <a class="row-link link-edit" href="${editHref}" target="_blank" ${STATUSES_WITH_EDIT.has(status) ? '' : 'hidden'}>Edit ↗</a>
      <a class="row-link link-preview" href="${previewHref}" target="_blank" ${STATUSES_WITH_PREVIEW.has(status) ? '' : 'hidden'}>aem.page ↗</a>
      <a class="row-link link-live" href="${liveHref}" target="_blank" ${STATUSES_WITH_LIVE.has(status) ? '' : 'hidden'}>aem.live ↗</a>
    </td>
  `;

  tr.querySelector('.btn-check').addEventListener('click', () => handleCheck(index));
  tr.querySelector('.btn-create').addEventListener('click', () => handleCreate(index));
  tr.querySelector('.btn-preview').addEventListener('click', () => handlePreview(index));
  tr.querySelector('.btn-publish').addEventListener('click', () => handlePublish(index));

  return tr;
}

function refreshRow(index) {
  const tr = document.getElementById(`route-${index}`);
  if (!tr) return;

  const { status, statusText } = routes[index];
  tr.querySelector('.status-badge').className = `status-badge badge-${status}`;
  tr.querySelector('.status-badge').textContent = statusText;

  tr.querySelector('.link-edit').hidden    = !STATUSES_WITH_EDIT.has(status);
  tr.querySelector('.link-preview').hidden = !STATUSES_WITH_PREVIEW.has(status);
  tr.querySelector('.link-live').hidden    = !STATUSES_WITH_LIVE.has(status);
}

function applyFilter() {
  const onlyMissing = filterCheckbox.checked;
  routes.forEach((route, i) => {
    const tr = document.getElementById(`route-${i}`);
    if (!tr) return;
    const hide = onlyMissing && route.status !== 'new' && route.status !== 'unknown';
    tr.dataset.hidden = hide ? 'true' : 'false';
  });
}

function updateSummary() {
  const counts = routes.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ');
  summaryEl.textContent = `${routes.length} routes — ${parts}`;
}

// ---- Individual action handlers ----
async function handleCheck(index) {
  setStatus(index, 'checking', 'Checking…');
  try {
    const exists = await checkPageExists(routes[index].path);
    setStatus(index, exists ? 'exists' : 'new', exists ? 'Exists' : 'Not created');
  } catch {
    setStatus(index, 'error', 'Error');
  }
}

async function handleCreate(index) {
  if (!templateHtml) {
    setStatus(index, 'creating', 'Loading template…');
    try { templateHtml = await fetchTemplate(); } catch {
      setStatus(index, 'error', 'Template error');
      return;
    }
  }
  setStatus(index, 'creating', 'Creating…');
  try {
    const { fromCode, toCode } = routes[index];
    const html = fillTemplate(cityMap[fromCode], cityMap[toCode]);
    const ok = await savePage(routes[index].path, html);
    setStatus(index, ok ? 'created' : 'error', ok ? 'Created' : 'Error');
  } catch {
    setStatus(index, 'error', 'Error');
  }
}

async function handlePreview(index) {
  setStatus(index, 'previewing', 'Previewing…');
  try {
    const ok = await previewPage(routes[index].path);
    setStatus(index, ok ? 'previewed' : 'error', ok ? 'Previewed' : 'Error');
  } catch {
    setStatus(index, 'error', 'Error');
  }
}

async function handlePublish(index) {
  setStatus(index, 'publishing', 'Publishing…');
  try {
    const ok = await publishPage(routes[index].path);
    setStatus(index, ok ? 'published' : 'error', ok ? 'Published' : 'Error');
  } catch {
    setStatus(index, 'error', 'Error');
  }
}

// ---- Bulk actions ----
async function ensureTemplate() {
  if (templateHtml) return true;
  try {
    templateHtml = await fetchTemplate();
    return true;
  } catch (e) {
    container.innerHTML = `<p class="error-msg">Failed to load template: ${e.message}</p>`;
    return false;
  }
}

checkAllBtn.addEventListener('click', async () => {
  for (let i = 0; i < routes.length; i++) await handleCheck(i);
});

createAllBtn.addEventListener('click', async () => {
  if (!await ensureTemplate()) return;
  for (let i = 0; i < routes.length; i++) await handleCreate(i);
});

publishAllBtn.addEventListener('click', async () => {
  if (!await ensureTemplate()) return;
  for (let i = 0; i < routes.length; i++) {
    await handleCreate(i);
    if (routes[i].status === 'created') {
      await handlePreview(i);
      if (routes[i].status === 'previewed') await handlePublish(i);
    }
  }
});

// ---- Init (gated on DA_SDK) ----
async function init() {
  await DA_SDK;
  try {
    const cities = await fetchCities();
    routes = buildRoutes(cities);
    renderTable();
  } catch (err) {
    container.innerHTML = `<p class="error-msg">Failed to load: ${err.message}</p>`;
  }
  document.body.style.display = '';
}

init();
