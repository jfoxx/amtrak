// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const CONFIG_PATH = '/.da/governance-config.json';

let daContext;
let daToken;

/**
 * Extract org and site from the AEM preview hostname.
 * e.g. main--amtrak--jfoxx.aem.live → { org: 'jfoxx', site: 'amtrak' }
 */
function getOrgAndSite() {
  const parts = window.location.hostname.split('--');
  if (parts.length >= 3) {
    return { org: parts[2].split('.')[0], site: parts[1] };
  }
  return { org: undefined, site: undefined };
}

/**
 * Extract the page path from context pathname.
 * Handles full DA URLs: https://da.live/edit#/jfoxx/amtrak/promotions/easter-weekend
 *   → /promotions/easter-weekend
 */
function getPagePath(pathname) {
  const raw = (pathname || '/').replace(/\.html$/, '');
  if (raw.includes('edit#')) {
    const parts = raw.split('edit#')[1].split('/').filter(Boolean);
    return `/${parts.slice(2).join('/')}`; // drop org + site segments
  }
  return raw;
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
  const pagePath = getPagePath(daContext.pathname);
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
      issues.push({
        category: 'Disallowed Blocks',
        detail: `${disallowed.length} block(s) not permitted on this path`,
        items: disallowed,
      });
    }
    if (ok.length) {
      passes.push({ category: 'Allowed Blocks', detail: ok.join(', ') });
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
      issues.push({
        category: 'Missing Metadata',
        detail: `${missing.length} required field(s) missing or empty`,
        items: missing,
      });
    }
    if (present.length) {
      passes.push({ category: 'Required Metadata', detail: present.join(', ') });
    }
  }

  return { issues, passes };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderIssueItem(issue) {
  const listItems = issue.items
    ? `<ul class="item-list">${issue.items.map((i) => `<li><code>${i}</code></li>`).join('')}</ul>`
    : '';
  return `
    <div class="check-row check-fail">
      <span class="check-icon" aria-hidden="true">✗</span>
      <div class="check-content">
        <strong>${issue.category}</strong>
        <span class="check-detail">${issue.detail}</span>
        ${listItems}
      </div>
    </div>`;
}

function renderPassItem(pass) {
  return `
    <div class="check-row check-pass">
      <span class="check-icon" aria-hidden="true">✓</span>
      <div class="check-content">
        <strong>${pass.category}</strong>
        <span class="check-detail">${pass.detail}</span>
      </div>
    </div>`;
}

function renderResults({ rule, pagePath, blockNames, metadata, issues, passes }) {
  const failed = issues.length > 0;
  const statusLabel = failed ? 'Fail' : 'Pass';
  const statusClass = failed ? 'badge-fail' : 'badge-pass';

  resultsEl.innerHTML = `
    <div class="result-summary">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="summary-meta">
        <span class="summary-path">${pagePath}</span>
        <span class="summary-rule">Rule: <code>${rule.path}</code></span>
      </div>
    </div>

    <div class="found-info">
      <div class="found-row">
        <span class="found-label">Blocks found</span>
        <span class="found-value">${blockNames.length ? blockNames.join(', ') : '<em>none</em>'}</span>
      </div>
      <div class="found-row">
        <span class="found-label">Metadata keys</span>
        <span class="found-value">${Object.keys(metadata).length ? Object.keys(metadata).join(', ') : '<em>none</em>'}</span>
      </div>
    </div>

    <div class="check-list">
      ${issues.map(renderIssueItem).join('')}
      ${passes.map(renderPassItem).join('')}
    </div>
  `;
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

    const pagePath = getPagePath(daContext.pathname);
    // eslint-disable-next-line no-console
    console.log('[governance] context.pathname:', daContext.pathname);
    // eslint-disable-next-line no-console
    console.log('[governance] resolved pagePath:', pagePath);
    // eslint-disable-next-line no-console
    console.log('[governance] rules:', JSON.stringify(rules));
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
