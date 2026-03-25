function replaceDotMedia(path, doc) {
  const resetAttributeBase = (tag, attr) => {
    doc.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((el) => {
      el[attr] = new URL(el.getAttribute(attr), new URL(path, window.location)).href;
    });
  };
  resetAttributeBase('img', 'src');
  resetAttributeBase('source', 'srcset');
}

async function fetchPromo(path) {
  const fetchPath = path.endsWith('.html') ? path : `${path}.plain.html`;
  const resp = await fetch(fetchPath);
  if (!resp.ok) return null;

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  replaceDotMedia(fetchPath, doc);

  const picture = doc.querySelector('picture');
  const walk = doc.querySelectorAll('div > div:last-child, p, strong, a, h1, h2, h3');
  let text = '';
  for (const el of walk) {
    const t = el.textContent.trim();
    if (t && !el.querySelector('img, picture')) { text = t; break; }
  }

  return { picture, text, path };
}

function buildCard(promo) {
  const card = document.createElement('a');
  card.className = 'pc-card';
  card.href = promo.path;

  if (promo.picture) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'pc-card-img';
    const pic = promo.picture.cloneNode(true);
    const img = pic.querySelector('img');
    if (img) {
      img.loading = 'lazy';
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
    imgWrap.append(pic);
    card.append(imgWrap);
  }

  const overlay = document.createElement('div');
  overlay.className = 'pc-card-overlay';

  if (promo.text) {
    const p = document.createElement('p');
    p.className = 'pc-card-text';
    p.textContent = promo.text;
    overlay.append(p);
  }

  const arrow = document.createElement('span');
  arrow.className = 'pc-card-arrow';
  arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
  overlay.append(arrow);

  card.append(overlay);
  return card;
}

function updateArrows(track, prevBtn, nextBtn) {
  const { scrollLeft, scrollWidth, clientWidth } = track;
  prevBtn.style.display = scrollLeft > 4 ? '' : 'none';
  nextBtn.style.display = scrollLeft + clientWidth < scrollWidth - 4 ? '' : 'none';
}

function toLocalPath(url) {
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.hostname === window.location.hostname) return u.pathname;
    const isAem = ['.da.', '.aem.', 'local'].some((h) => u.hostname.includes(h));
    if (isAem) {
      const [aemOrg, aemSite] = u.hostname.split('.')[0].split('--').reverse();
      const [winOrg, winSite] = window.location.hostname.split('.')[0].split('--').reverse();
      if (aemOrg === winOrg && aemSite === winSite) return u.pathname;
      return u.pathname;
    }
    return url;
  } catch { return url; }
}

function extractPaths(el) {
  const anchors = [...el.querySelectorAll('a')];
  if (anchors.length) {
    return anchors.map((a) => toLocalPath(a.getAttribute('href')));
  }
  const paragraphs = [...el.querySelectorAll('p')];
  return paragraphs
    .map((p) => p.textContent.trim())
    .filter((t) => t.startsWith('http') || t.startsWith('/'))
    .map(toLocalPath);
}

export default async function init(el) {
  const paths = extractPaths(el);
  if (!paths.length) return;

  el.textContent = '';

  const container = document.createElement('div');
  container.className = 'pc-container';

  const track = document.createElement('div');
  track.className = 'pc-track';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'pc-nav pc-prev';
  prevBtn.setAttribute('aria-label', 'Previous promos');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'pc-nav pc-next';
  nextBtn.setAttribute('aria-label', 'Next promos');
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';

  const promos = await Promise.all(paths.map(fetchPromo));
  promos.filter(Boolean).forEach((promo) => track.append(buildCard(promo)));

  container.append(track, prevBtn, nextBtn);
  el.append(container);

  const scrollByCards = () => {
    const card = track.querySelector('.pc-card');
    if (!card) return 0;
    const style = getComputedStyle(track);
    return card.offsetWidth + parseFloat(style.columnGap || style.gap || 0);
  };

  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -scrollByCards(), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: scrollByCards(), behavior: 'smooth' });
  });

  track.addEventListener('scroll', () => updateArrows(track, prevBtn, nextBtn));
  updateArrows(track, prevBtn, nextBtn);

  new ResizeObserver(() => updateArrows(track, prevBtn, nextBtn)).observe(track);
}
