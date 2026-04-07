// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const CONFIG_PATH = '/.da/governance-config.json';

let daContext;
let daToken;

function getOrgAndSite() {
  return { org: daContext.org, site: daContext.site };
}

/**
 * Extract the page path from context pathname.
 */
function getPagePath(path) {
  return (path || '/').replace(/\.html$/, '');
}

const runBtn = document.getElementById('btn-run');
const resultsEl = document.getElementById('results');

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Test whether a glob-style pattern matches a page path.
 * Supports:
 *   /news/**  → any path starting with /news/
 *   /news/*   → one segment only (e.g. /news/article, not /news/a/b)
 *   /about    → exact match
 */
function matchesPath(pattern, pagePath) {
  const norm = (p) => p.replace(/\/$/, '') || '/';
  const p = norm(pattern);
  const path = norm(pagePath);

  if (!p.includes('*')) return p === path;

  const escaped = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000') // temp placeholder
    .replace(/\*/g, '[^/]+')
    .replace(/\u0000/g, '.*');

  return new RegExp(`^${escaped}$`).test(path);
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

async function loadConfig() {
  const { org, site } = getOrgAndSite();
  const url = `https://content.da.live/${org}/${site}${CONFIG_PATH}`;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${daToken}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return Array.isArray(json) ? json : (json.data ?? []);
  } catch {
    return null;
  }
}

// Return the most specific matching rule (longest pattern wins).
function findMatchingRule(rules, pagePath) {
  const matches = rules.filter((r) => r.path && matchesPath(r.path, pagePath));
  if (!matches.length) return null;
  return matches.sort((a, b) => b.path.length - a.path.length)[0];
}

// ---------------------------------------------------------------------------
// Page content fetching + parsing
// ---------------------------------------------------------------------------

async function fetchPageHTML() {
  const { org, site } = getOrgAndSite();
  const pagePath = getPagePath(daContext.path);
  const url = `https://content.da.live/${org}/${site}${pagePath}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${daToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to fetch page content (${resp.status})`);
  return resp.text();
}

/**
 * Extract all block names and metadata key→value pairs from the rendered page HTML.
 * Blocks are divs-with-classes that are direct children of section divs.
 */
function parsePageContent(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // AEM section structure: body > div (section) > div[class] (block)
  const blockDivs = doc.querySelectorAll('body > div > div[class], main > div > div[class]');

  const blockNames = [];
  const metadata = {};

  for (const div of blockDivs) {
    const name = div.classList[0]?.toLowerCase();
    if (!name) continue;

    if (name === 'metadata') {
      // Each row: first cell = key, second cell = value
      for (const row of div.querySelectorAll(':scope > div')) {
        const cells = row.querySelectorAll(':scope > div');
        if (cells.length >= 2) {
          const key = cells[0].textContent.trim().toLowerCase();
          const value = cells[1].textContent.trim();
          if (key) metadata[key] = value;
        }
      }
    }

    if (!blockNames.includes(name)) blockNames.push(name);
  }

  return { blockNames, metadata };
}

// ---------------------------------------------------------------------------
// Governance checks
// ---------------------------------------------------------------------------

function runChecks(rule, blockNames, metadata) {
  const issues = [];
  const passes = [];

  // Allowed-blocks check
  if (rule['allowed-blocks']) {
    const allowed = rule['allowed-blocks']
      .split(',')
      .map((b) => b.trim().toLowerCase())
      .filter(Boolean);

    const disallowed = blockNames.filter((b) => !allowed.includes(b));
    const ok = blockNames.filter((b) => allowed.includes(b));

    if (disallowed.length) {
      issues.push({ category: 'Disallowed Blocks', items: disallowed });
    }
    if (ok.length) {
      passes.push({ category: 'Allowed Blocks', items: ok });
    }
  }

  // Required-metadata check
  if (rule['required-metadata']) {
    const required = rule['required-metadata']
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const missing = required.filter((k) => !metadata[k]);
    const present = required.filter((k) => metadata[k]);

    if (missing.length) {
      issues.push({ category: 'Missing Metadata', items: missing });
    }
    if (present.length) {
      passes.push({ category: 'Required Metadata', items: present });
    }
  }

  // Metadata value checks — any column starting with "metadata-"
  // Allowed values are comma-separated; use "(blank)" to permit an empty value.
  const metaValueIssues = [];
  const metaValuePasses = [];

  for (const [key, val] of Object.entries(rule)) {
    if (!key.startsWith('metadata-')) continue;
    const field = key.slice('metadata-'.length).toLowerCase();
    const allowedValues = val.split(',').map((v) => v.trim()).filter(Boolean);
    const allowBlank = allowedValues.includes('(blank)');
    const validValues = allowedValues.filter((v) => v !== '(blank)');
    const actual = (metadata[field] ?? '').trim();

    if (actual === '') {
      if (allowBlank) {
        metaValuePasses.push(`${field}: (blank)`);
      } else {
        metaValueIssues.push(`${field}: (blank) — allowed: ${validValues.join(', ')}`);
      }
    } else if (validValues.includes(actual)) {
      metaValuePasses.push(`${field}: ${actual}`);
    } else {
      metaValueIssues.push(`${field}: "${actual}" — allowed: ${validValues.join(', ')}`);
    }
  }

  if (metaValueIssues.length) {
    issues.push({ category: 'Metadata Values', items: metaValueIssues });
  }
  if (metaValuePasses.length) {
    passes.push({ category: 'Metadata Values', items: metaValuePasses });
  }

  return { issues, passes };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderCategory({ label, items, isPass }) {
  const icon = isPass ? 'icons/CheckmarkSize100.svg' : 'icons/CrossSize100.svg';
  const iconAlt = isPass ? 'Pass' : 'Fail';
  const rowClass = isPass ? 'cat-pass' : 'cat-fail';
  const rows = items.map((item) => `
    <div class="cat-item">
      <span class="cat-item-label">${item}</span>
    </div>`).join('');

  return `
    <details class="category ${rowClass}">
      <summary class="category-summary">
        <span class="cat-label">${label}</span>
        <span class="cat-right">
          <img class="cat-icon" src="${icon}" alt="${iconAlt}">
          <span class="cat-count">${items.length}</span>
        </span>
      </summary>
      <div class="cat-body">${rows}</div>
    </details>`;
}

function renderResults({ rule, pagePath, issues, passes }) {
  const allCategories = [
    ...issues.map(({ category, items }) => renderCategory({ label: category, items, isPass: false })),
    ...passes.map(({ category, items }) => renderCategory({ label: category, items, isPass: true })),
  ];

  resultsEl.innerHTML = `
    <div class="path-row">
      <span class="path-label">${pagePath}</span>
      <span class="path-rule"><code>${rule.path}</code></span>
    </div>
    <div class="category-list">
      ${allCategories.join('')}
    </div>
  `;

  // Auto-open failing categories
  resultsEl.querySelectorAll('.cat-fail').forEach((el) => el.setAttribute('open', ''));
}

function renderInfo(msg) {
  resultsEl.innerHTML = `<p class="info-message">${msg}</p>`;
}

function renderError(msg) {
  resultsEl.innerHTML = `<p class="error-message">${msg}</p>`;
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

async function runCheck() {
  runBtn.toggleAttribute('disabled', true);
  runBtn.textContent = 'Running…';
  resultsEl.innerHTML = '<p class="loading-message">Fetching page and config…</p>';

  try {
    const [rules, pageHTML] = await Promise.all([loadConfig(), fetchPageHTML()]);

    if (rules === null) {
      renderInfo(
        `No governance config found at <code>${CONFIG_PATH}</code>.<br>
         Create a sheet at that path with columns: <code>path</code>, <code>allowed-blocks</code>, <code>required-metadata</code>.`,
      );
      return;
    }

    const pagePath = getPagePath(daContext.path);
    const rule = findMatchingRule(rules, pagePath);

    if (!rule) {
      renderInfo(`No governance rule matches path <code>${pagePath}</code>.`);
      return;
    }

    const { blockNames, metadata } = parsePageContent(pageHTML);
    const { issues, passes } = runChecks(rule, blockNames, metadata);
    renderResults({ rule, pagePath, blockNames, metadata, issues, passes });
  } catch (err) {
    renderError(`Error: ${err.message}`);
  } finally {
    runBtn.toggleAttribute('disabled', false);
    runBtn.textContent = 'Run Check';
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

DA_SDK.then(({ context, token }) => {
  daContext = context;
  daToken = token;
  document.body.removeAttribute('style');
  runBtn.addEventListener('click', runCheck);
  runCheck();
});
