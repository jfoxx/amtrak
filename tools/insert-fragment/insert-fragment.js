// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

let daContext;
let daToken;
let daActions;
let basePath = '/fragments';
let currentPath = '';
let selectedItem = null;
const pathStack = [];

const listEl = document.getElementById('list');
const breadcrumbEl = document.getElementById('breadcrumb');
const backBtn = document.getElementById('btn-back');
const referenceBtn = document.getElementById('btn-reference');
const insertBtn = document.getElementById('btn-copy');

function showStatus(msg, isError = false) {
  listEl.innerHTML = `<p class="status ${isError ? 'error' : ''}">${msg}</p>`;
}

function clearSelection() {
  selectedItem = null;
  referenceBtn.toggleAttribute('disabled', true);
  insertBtn.toggleAttribute('disabled', true);
}

function selectPage(item, el) {
  listEl.querySelectorAll('.list-item').forEach((i) => i.classList.remove('is-selected'));
  el.classList.add('is-selected');
  selectedItem = { ...item, path: item.path || `${currentPath}/${item.name}` };
  referenceBtn.toggleAttribute('disabled', false);
  insertBtn.toggleAttribute('disabled', false);
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
    const icon = isFolder ? 'icons/Smock_Folder_18_N.svg' : 'icons/Smock_FileHTML_18_N.svg';
    el.innerHTML = `
      <img class="icon" src="${icon}" alt="">
      <span class="name">${item.name}</span>
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
    const json = await resp.json();
    const raw = Array.isArray(json) ? json : (json.data ?? json.items ?? []);
    const prefix = `/${org}/${repo}`;
    const items = raw.map((item) => ({
      ...item,
      path: item.path?.startsWith(prefix) ? item.path.slice(prefix.length) : item.path,
    }));
    renderList(items, navigate);
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
  const { org, repo } = daContext;
  const url = `https://admin.da.live/source/${org}/${repo}${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${daToken}` },
  });
  if (!resp.ok) throw new Error(`${resp.status} fetching source`);
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('main');
  if (!main) return doc.body.innerHTML;
  // Strip section <div> wrappers so block <table> elements are top-level
  // when ProseMirror parses dom.body, matching DA's block parseRules
  const sections = [...main.querySelectorAll(':scope > div')];
  return sections.flatMap((s) => [...s.children]).map((el) => el.outerHTML).join('\n');
}

// DA SDK is a Promise that resolves with context, token, and actions
DA_SDK.then(({ context, token, actions }) => {
  daContext = context;
  daToken = token;
  daActions = actions;
  document.body.classList.add('is-ready');
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
  daActions.sendHTML(html);
});

insertBtn.addEventListener('click', async () => {
  if (!selectedItem) return;
  insertBtn.toggleAttribute('disabled', true);
  insertBtn.textContent = 'Fetching…';
  try {
    const html = await fetchFragmentContent(selectedItem.path);
    daActions.sendHTML(html);
    insertBtn.textContent = 'Inserted!';
    setTimeout(() => {
      insertBtn.toggleAttribute('disabled', false);
      insertBtn.textContent = 'Insert';
    }, 1500);
  } catch (err) {
    showStatus(`Failed: ${err.message}`, true);
    insertBtn.toggleAttribute('disabled', false);
    insertBtn.textContent = 'Insert';
  }
});
