let daOrigin = '*';
let org, repo, branch;
let basePath = '/fragments';
let currentPath = '';
let selectedItem = null;
let pathStack = [];

const listEl = document.getElementById('list');
const breadcrumbEl = document.getElementById('breadcrumb');
const backBtn = document.getElementById('btn-back');
const referenceBtn = document.getElementById('btn-reference');
const copyBtn = document.getElementById('btn-copy');

// --- DA context handshake ---
window.addEventListener('message', (e) => {
  let data;
  try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }

  if (data.action === 'da:context') {
    ({ org, repo, branch } = data);
    daOrigin = e.origin || '*';
    init();
  }
});

parent.postMessage(JSON.stringify({ action: 'da:requestContext' }), '*');

// Fallback for direct/test loading via query params
setTimeout(() => {
  if (!org) {
    const params = new URLSearchParams(window.location.search);
    org = params.get('org');
    repo = params.get('repo');
    branch = params.get('branch') || 'main';
    if (org && repo) init();
    else showStatus('Waiting for DA context…');
  }
}, 300);

async function init() {
  await loadConfig();
  currentPath = basePath;
  breadcrumbEl.textContent = basePath;
  loadList(currentPath);
}

async function loadConfig() {
  try {
    const url = `https://admin.da.live/source/${org}/${repo}/.da/insert-fragment.json`;
    const resp = await fetch(url, { credentials: 'include' });
    if (resp.ok) {
      const json = await resp.json();
      if (json.basePath) basePath = json.basePath;
    }
  } catch { /* use default /fragments */ }
}

async function loadList(path) {
  showStatus('Loading…');
  try {
    const url = `https://admin.da.live/list/${org}/${repo}${path}`;
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const { data } = await resp.json();
    renderList(data || []);
  } catch (err) {
    showStatus(`Error loading ${path}: ${err.message}`, true);
  }
}

function renderList(items) {
  listEl.innerHTML = '';
  if (!items.length) { showStatus('No items found.'); return; }

  const sorted = [...items].sort((a, b) => {
    if (!a.ext && b.ext) return -1;
    if (a.ext && !b.ext) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const item of sorted) {
    const isFolder = !item.ext;
    const el = document.createElement('div');
    el.className = `list-item ${isFolder ? 'folder' : 'page'}`;
    el.innerHTML = `
      <span class="icon">${isFolder ? '📁' : '📄'}</span>
      <span class="name">${item.name}</span>
      ${isFolder ? '<span>›</span>' : ''}
    `;

    if (isFolder) {
      el.addEventListener('click', () => navigateTo(item.path || `${currentPath}/${item.name}`));
    } else {
      el.addEventListener('click', () => selectPage(item, el));
    }

    listEl.append(el);
  }
}

function navigateTo(path) {
  pathStack.push(currentPath);
  currentPath = path;
  breadcrumbEl.textContent = path;
  backBtn.disabled = false;
  clearSelection();
  loadList(path);
}

backBtn.addEventListener('click', () => {
  if (!pathStack.length) return;
  currentPath = pathStack.pop();
  breadcrumbEl.textContent = currentPath;
  backBtn.disabled = pathStack.length === 0;
  clearSelection();
  loadList(currentPath);
});

function selectPage(item, el) {
  listEl.querySelectorAll('.list-item').forEach((i) => i.classList.remove('is-selected'));
  el.classList.add('is-selected');
  selectedItem = { ...item, path: item.path || `${currentPath}/${item.name}` };
  referenceBtn.disabled = false;
  copyBtn.disabled = false;
}

function clearSelection() {
  selectedItem = null;
  referenceBtn.disabled = true;
  copyBtn.disabled = true;
}

referenceBtn.addEventListener('click', () => {
  if (!selectedItem) return;
  const { path } = selectedItem;
  const html = `<table><tbody><tr><td>fragment</td></tr><tr><td><a href="${path}">${path}</a></td></tr></tbody></table>`;
  sendInsert(html);
});

copyBtn.addEventListener('click', async () => {
  if (!selectedItem) return;
  copyBtn.disabled = true;
  copyBtn.textContent = 'Fetching…';
  try {
    const html = await fetchFragmentContent(selectedItem.path);
    sendInsert(html);
    copyBtn.textContent = 'Inserted!';
    setTimeout(() => {
      copyBtn.disabled = false;
      copyBtn.textContent = 'Copy contents';
    }, 1500);
  } catch (err) {
    showStatus(`Failed: ${err.message}`, true);
    copyBtn.disabled = false;
    copyBtn.textContent = 'Copy contents';
  }
});

function sendInsert(html) {
  parent.postMessage(JSON.stringify({ action: 'da:insert', html }), daOrigin);
}

async function fetchFragmentContent(path) {
  const previewOrigin = `https://${branch || 'main'}--${repo}--${org}.aem.page`;
  const resp = await fetch(`${previewOrigin}${path}.plain.html`);
  if (!resp.ok) throw new Error(`${resp.status} fetching preview`);
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.innerHTML;
}

function showStatus(msg, isError = false) {
  listEl.innerHTML = `<p class="status ${isError ? 'error' : ''}">${msg}</p>`;
}
