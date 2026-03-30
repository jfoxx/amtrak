import { loadArea, setConfig, getMetadata } from './ak.js';

const hostnames = ['authorkit.dev'];

const locales = {
  '': { lang: 'en' },
  '/de': { lang: 'de' },
  '/es': { lang: 'es' },
  '/fr': { lang: 'fr' },
  '/hi': { lang: 'hi' },
  '/ja': { lang: 'ja' },
  '/zh': { lang: 'zh' },
};

const linkBlocks = [
  { fragment: '/fragments/' },
  { schedule: '/schedules/' },
  { youtube: 'https://www.youtube' },
];

// Blocks with self-managed styles
const components = ['fragment', 'schedule'];

// How to decorate an area before loading it
const decorateArea = ({ area = document }) => {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    if (!img) return;
    img.removeAttribute('loading');
    img.fetchPriority = 'high';
  };

  eagerLoad(area, 'img');
};

if (getMetadata('navbooking')) document.body.classList.add('navbooking');

async function loadTarget() {
  // Check for target metadata flag
  const targetMeta = getMetadata('target');
  if (targetMeta) {
    // Overwrite target domains to be same origin
    window.targetGlobalSettings = {
   //   serverDomain: hostnames[0],
      secureOnly: true,
      overrideMboxEdgeServer: false,
    };

    // Import the local copy of at.js
    await import('../deps/at/at.js');

    // Request all the relevant offers for the page
    const offers = await window.adobe.target.getOffers({
      request: { execute: { pageLoad: {} } },
    });

    // Loop through them and inject if they exist
    offers?.execute?.pageLoad?.options?.forEach((opt) => {
      const { cssSelector, content } = opt.content[0];
      const el = document.querySelector(cssSelector);
      if (el) el.outerHTML = content;
    });
  }
}

export async function loadPage() {
  setConfig({ hostnames, locales, linkBlocks, components, decorateArea });
  await loadTarget();
  await loadArea();
}
await loadPage();

(function da() {
  const { searchParams } = new URL(window.location.href);
  const hasPreview = searchParams.has('dapreview');
  if (hasPreview) import('../tools/da/da.js').then((mod) => mod.default(loadPage));
  const hasQE = searchParams.has('quick-edit');
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
}());
