const ORG = 'jfoxx';
const REPO = 'amtrak';
const REF = 'main';

const CITIES_JSON = `https://${REF}--${REPO}--${ORG}.aem.page/city-connections/cities.json`;
const TEMPLATE_URL = `https://content.da.live/${ORG}/${REPO}/city-connections/city-connections`;
const DA_SOURCE = `https://admin.da.live/source/${ORG}/${REPO}`;
const AEM_PREVIEW = `https://admin.hlx.page/preview/${ORG}/${REPO}/${REF}`;
const AEM_LIVE = `https://admin.hlx.page/live/${ORG}/${REPO}/${REF}`;

let token = localStorage.getItem('cc-da-token') || '';
let cityMap = {};
let routes = [];
let templateHtml = '';

// ---- DOM refs ----
const container = document.getElementById('container');
const tokenInput = document.getElementById('token-input');
const saveTokenBtn = document.getElementById('btn-save-token');
const checkAllBtn = document.getElementById('btn-check-all');
const createAllBtn = document.getElementById('btn-create-all');
const publishAllBtn = document.getElementById('btn-preview-publish-all');
const summaryEl = document.getElementById('summary');
const filterCheckbox = document.getElementById('filter-missing');

// Show body once components load
document.body.classList.add('is-ready');

// Pre-fill token
if (token) tokenInput.value = token;

saveTokenBtn.addEventListener('click', () => {
  token = tokenInput.value.trim();
  localStorage.setItem('cc-da-token', token);
  saveTokenBtn.textContent = 'Saved!';
  setTimeout(() => { saveTokenBtn.textContent = 'Save Token'; }, 1500);
});

filterCheckbox.addEventListener('change', applyFilter);

// ---- Data helpers ----
async function fetchCities() {
  const resp = await fetch(CITIES_JSON);
  if (!resp.ok) throw new Error(`Failed to fetch cities (${resp.status})`);
  const json = await resp.json();
  return json.data;
}

async function fetchTemplate() {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(TEMPLATE_URL, { headers });
  if (!resp.ok) throw new Error(`Failed to fetch template (${resp.status})`);
  return resp.text();
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
      if (!toCity) continue; // skip cities not in the dataset

      list.push({
        fromCode,
        toCode,
        fromCity: city['City'],
        toCity: toCity['City'],
        path: `/city-connections/${fromCode.toLowerCase()}-${toCode.toLowerCase()}`,
        status: 'unknown',
        statusText: 'Unknown',
      });
    }
  }
  return list;
}

function fillTemplate(from, to) {
  return templateHtml
    .replaceAll('{{city1}}', from['City'])
    .replaceAll('{{city2}}', to['City'])
    .replaceAll('{{city-code-one}}', from['Station Code'])
    .replaceAll('{{city-code-two}}', to['Station Code'])
    .replaceAll('{{description}}', to['Description']);
}

// ---- DA / AEM API ----
async function checkPageExists(path) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${DA_SOURCE}${path}.html`, { method: 'HEAD', headers });
  return resp.ok;
}

async function savePage(path, html) {
  const blob = new Blob([html], { type: 'text/html' });
  const form = new FormData();
  form.append('data', blob, 'index.html');
  const resp = await fetch(`${DA_SOURCE}${path}.html`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return resp.ok;
}

async function previewPage(path) {
  const resp = await fetch(`${AEM_PREVIEW}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.ok;
}

async function publishPage(path) {
  const resp = await fetch(`${AEM_LIVE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
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

function requireToken() {
  if (!token) {
    alert('Please enter and save your DA auth token first.');
    return false;
  }
  return true;
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

function buildRow(index) {
  const { fromCity, fromCode, toCity, toCode, path, status, statusText } = routes[index];
  const viewHref = `https://${REF}--${REPO}--${ORG}.aem.page${path}`;

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
      <a class="view-link" href="${viewHref}" target="_blank" ${status !== 'published' ? 'hidden' : ''}>View ↗</a>
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
  const badge = tr.querySelector('.status-badge');
  badge.className = `status-badge badge-${status}`;
  badge.textContent = statusText;

  const viewLink = tr.querySelector('.view-link');
  viewLink.hidden = status !== 'published';
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
  const parts = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');
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
  if (!requireToken()) return;
  if (!templateHtml) {
    setStatus(index, 'creating', 'Loading template…');
    try { templateHtml = await fetchTemplate(); } catch (e) {
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
  if (!requireToken()) return;
  setStatus(index, 'previewing', 'Previewing…');
  try {
    const ok = await previewPage(routes[index].path);
    setStatus(index, ok ? 'previewed' : 'error', ok ? 'Previewed' : 'Error');
  } catch {
    setStatus(index, 'error', 'Error');
  }
}

async function handlePublish(index) {
  if (!requireToken()) return;
  setStatus(index, 'publishing', 'Publishing…');
  try {
    const ok = await publishPage(routes[index].path);
    setStatus(index, ok ? 'published' : 'error', ok ? 'Published' : 'Error');
  } catch {
    setStatus(index, 'error', 'Error');
  }
}

// ---- Bulk actions ----
checkAllBtn.addEventListener('click', async () => {
  for (let i = 0; i < routes.length; i++) await handleCheck(i);
});

createAllBtn.addEventListener('click', async () => {
  if (!requireToken()) return;
  // Load template once before the loop
  if (!templateHtml) {
    try { templateHtml = await fetchTemplate(); } catch (e) {
      alert(`Failed to load template: ${e.message}`);
      return;
    }
  }
  for (let i = 0; i < routes.length; i++) await handleCreate(i);
});

publishAllBtn.addEventListener('click', async () => {
  if (!requireToken()) return;
  if (!templateHtml) {
    try { templateHtml = await fetchTemplate(); } catch (e) {
      alert(`Failed to load template: ${e.message}`);
      return;
    }
  }
  for (let i = 0; i < routes.length; i++) {
    await handleCreate(i);
    if (routes[i].status === 'created') {
      await handlePreview(i);
      if (routes[i].status === 'previewed') await handlePublish(i);
    }
  }
});

// ---- Init ----
async function init() {
  try {
    const cities = await fetchCities();
    routes = buildRoutes(cities);
    renderTable();
  } catch (err) {
    container.innerHTML = `<p class="error-msg">Failed to load: ${err.message}</p>`;
  }
}

init();
