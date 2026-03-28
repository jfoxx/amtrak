let daContext;
let daToken;
let basePath = '/fragments';
let currentPath = '';
let selectedItem = null;
const pathStack = [];

const listEl = document.getElementById('list');
const breadcrumbEl = document.getElementById('breadcrumb');
const backBtn = document.getElementById('btn-back');
const referenceBtn = document.getElementById('btn-reference');
const copyBtn = document.getElementById('btn-copy');

function showStatus(msg, isError = false) {
  listEl.innerHTML = `<p class="status ${isError ? 'error' : ''}">${msg}</p>`;
}

function clearSelection() {
  selectedItem = null;
  referenceBtn.toggleAttribute('disabled', true);
  copyBtn.toggleAttribute('disabled', true);
}

function selectPage(item, el) {
  listEl.querySelectorAll('.list-item').forEach((i) => i.classList.remove('is-selected'));
  el.classList.add('is-selected');
  selectedItem = { ...item, path: item.path || `${currentPath}/${item.name}` };
  referenceBtn.toggleAttribute('disabled', false);
  copyBtn.toggleAttribute('disabled', false);
}

// onNavigate passed as arg to avoid circular reference with navigate()
function renderList(items, onNavigate) {
  listEl.innerHTML = '';
  if (!items.length) {
    showStatus('No items found.');
    return;
  }

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

    const itemPath = item.path || `${currentPath}/${item.name}`;
    if (isFolder) {
      el.addEventListener('click', () => onNavigate(itemPath));
    } else {
      el.addEventListener('click', () => selectPage(item, el));
    }

    listEl.append(el);
  }
}

async function navigate(path, push = true) {
  if (push) pathStack.push(currentPath);
  currentPath = path;
  breadcrumbEl.textContent = path;
  backBtn.toggleAttribute('disabled', pathStack.length === 0);
  clearSelection();
  showStatus('Loading…');
  try {
    const { org, repo } = daContext;
    const url = `https://admin.da.live/list/${org}/${repo}${path}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${daToken}` },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const { data } = await resp.json();
    renderList(data || [], navigate);
  } catch (err) {
    showStatus(`Error loading ${path}: ${err.message}`, true);
  }
}

async function loadConfig() {
  try {
    const { org, repo } = daContext;
    const url = `https://admin.da.live/source/${org}/${repo}/.da/insert-fragment.json`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${daToken}` },
    });
    if (resp.ok) {
      const json = await resp.json();
      if (json.basePath) basePath = json.basePath;
    }
  } catch { /* use default /fragments */ }
}

async function init() {
  await loadConfig();
  navigate(basePath, false);
}

async function fetchFragmentContent(path) {
  const { org, repo, ref } = daContext;
  const previewOrigin = `https://${ref || 'main'}--${repo}--${org}.aem.page`;
  const resp = await fetch(`${previewOrigin}${path}.plain.html`);
  if (!resp.ok) throw new Error(`${resp.status} fetching preview`);
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.innerHTML;
}

// DA sends { token, context } via postMessage
window.addEventListener('message', (e) => {
  if (!e.data?.token || !e.data?.context) return;
  daToken = e.data.token;
  daContext = e.data.context;
  init();
});

backBtn.addEventListener('click', () => {
  if (!pathStack.length) return;
  const path = pathStack.pop();
  navigate(path, false);
});

referenceBtn.addEventListener('click', () => {
  if (!selectedItem) return;
  const { path } = selectedItem;
  const html = `<table><tbody><tr><td>fragment</td></tr><tr><td><a href="${path}">${path}</a></td></tr></tbody></table>`;
  window.parent.postMessage(html);
});

copyBtn.addEventListener('click', async () => {
  if (!selectedItem) return;
  copyBtn.toggleAttribute('disabled', true);
  copyBtn.textContent = 'Fetching…';
  try {
    const html = await fetchFragmentContent(selectedItem.path);
    window.parent.postMessage(html);
    copyBtn.textContent = 'Inserted!';
    setTimeout(() => {
      copyBtn.toggleAttribute('disabled', false);
      copyBtn.textContent = 'Copy contents';
    }, 1500);
  } catch (err) {
    showStatus(`Failed: ${err.message}`, true);
    copyBtn.toggleAttribute('disabled', false);
    copyBtn.textContent = 'Copy contents';
  }
});
