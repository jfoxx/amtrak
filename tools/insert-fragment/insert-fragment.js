// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

let daContext;
let daToken;
let daActions;
let basePath = '/fragments';
let excludedPaths = [];
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

function isExcluded(itemPath) {
  const cleanPath = itemPath.replace(/\.html$/, '');
  return excludedPaths.some((pattern) => cleanPath === pattern || cleanPath.startsWith(`${pattern}/`));
}

// onNavigate passed as arg to avoid circular reference with navigate()
function renderList(items, onNavigate) {
  listEl.innerHTML = '';
  const visible = items.filter((item) => {
    const itemPath = item.path || `${currentPath}/${item.name}`;
    return !isExcluded(itemPath);
  });
  if (!visible.length) {
    showStatus('No items found.');
    return;
  }

  const sorted = [...visible].sort((a, b) => {
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
      const rows = Array.isArray(json) ? json : (json.data ?? []);
      const config = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
      if (config.basePath) basePath = config.basePath;
      if (config.excludedPaths) {
        excludedPaths = config.excludedPaths.split(',').map((p) => p.trim()).filter(Boolean);
      }
    }
  } catch { /* use default /fragments */ }
}

async function init() {
  await loadConfig();
  navigate(basePath, false);
}

// Inverse of prose2aem convertBlocks: div-based block → <table border="1">
function getBlockTableHtml(block) {
  const classes = block.className.split(' ');
  const name = classes.shift();
  const label = classes.length ? `${name} (${classes.join(', ')})` : name;
  const rows = [...block.children];
  const maxCols = rows.reduce((cols, row) => Math.max(cols, row.children.length), 0) || 1;
  const table = document.createElement('table');
  table.setAttribute('border', '1');
  const headerRow = document.createElement('tr');
  const th = document.createElement('td');
  th.setAttribute('colspan', String(maxCols));
  th.textContent = label;
  headerRow.append(th);
  table.append(headerRow);
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [...row.children].forEach((col) => {
      const td = document.createElement('td');
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

async function fetchFragmentContent(path) {
  const { org, repo } = daContext;
  const cleanPath = path.replace(/\.html$/, '');
  const url = `https://content.da.live/${org}/${repo}${cleanPath}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${daToken}` },
  });
  if (!resp.ok) throw new Error(`${resp.status} fetching content`);
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sections = [...doc.querySelectorAll('body > div, main > div')];
  const parts = sections.flatMap((section) => [...section.children]
    .filter((child) => !(child.nodeName === 'DIV' && child.classList[0] === 'metadata'))
    .map((child) => {
      if (child.nodeName === 'DIV') return getBlockTableHtml(child).outerHTML;
      return child.outerHTML;
    }));
  return parts.join('\n');
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
  const { org, repo, ref = 'main' } = daContext;
  const cleanPath = selectedItem.path.replace(/\.html$/, '');
  const href = `https://${ref}--${repo}--${org}.aem.page${cleanPath}`;
  const html = `<table><tbody><tr><td>fragment</td></tr><tr><td><a href="${href}">${href}</a></td></tr></tbody></table>`;
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
