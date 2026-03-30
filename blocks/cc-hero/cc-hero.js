export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const bgRow = rows[0];
  const fgRow = rows[1];

  const [leftBgCol, rightBgCol] = [...bgRow.querySelectorAll(':scope > div')];

  // Background: two images that blend at center
  const bg = document.createElement('div');
  bg.className = 'cc-hero-bg';

  const leftImg = document.createElement('div');
  leftImg.className = 'cc-hero-img cc-hero-img-left';
  const leftPic = leftBgCol?.querySelector('picture');
  if (leftPic) leftImg.append(leftPic);

  const rightImg = document.createElement('div');
  rightImg.className = 'cc-hero-img cc-hero-img-right';
  const rightPic = rightBgCol?.querySelector('picture');
  if (rightPic) rightImg.append(rightPic);

  bg.append(leftImg, rightImg);

  // Foreground: single headline centered over the images
  fgRow.className = 'cc-hero-fg';

  el.innerHTML = '';
  el.append(bg, fgRow);
}
