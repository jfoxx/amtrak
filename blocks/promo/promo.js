export default function init(el) {
  const cols = el.querySelectorAll(':scope > div > div');
  const picture = cols[0]?.querySelector('picture');
  const link = el.querySelector('a');
  const textEl = cols[1];

  el.textContent = '';

  const card = link
    ? Object.assign(document.createElement('a'), { href: link.href, className: 'promo-card' })
    : Object.assign(document.createElement('div'), { className: 'promo-card' });

  if (picture) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'promo-card-img';
    const img = picture.querySelector('img');
    if (img) {
      img.loading = 'lazy';
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
    imgWrap.append(picture);
    card.append(imgWrap);
  }

  const overlay = document.createElement('div');
  overlay.className = 'promo-card-overlay';

  if (textEl) {
    const p = document.createElement('p');
    p.className = 'promo-card-text';
    p.textContent = textEl.textContent.trim();
    overlay.append(p);
  }

  const arrow = document.createElement('span');
  arrow.className = 'promo-card-arrow';
  arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
  overlay.append(arrow);

  card.append(overlay);
  el.append(card);
}
