function createIcon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const icons = {
    swap: '<path d="M7 16l-4-4 4-4"/><path d="M3 12h18"/><path d="M17 8l4 4-4 4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  };

  svg.innerHTML = icons[name] || '';
  return svg;
}

function buildTripTypeTabs() {
  const tabs = document.createElement('div');
  tabs.className = 'bw-trip-tabs';

  const types = [
    { label: 'One-Way', value: 'one-way', hasDropdown: true },
    { label: 'Rail Passes', value: 'rail-passes' },
    { label: 'Auto Train', value: 'auto-train' },
  ];

  types.forEach((type, idx) => {
    const btn = document.createElement('button');
    btn.className = 'bw-trip-tab';
    btn.dataset.value = type.value;
    btn.textContent = type.label;
    if (idx === 0) btn.classList.add('is-active');

    if (type.hasDropdown) {
      btn.append(createIcon('chevron', 14));
      btn.classList.add('has-dropdown');

      const menu = document.createElement('div');
      menu.className = 'bw-trip-menu';
      ['One-Way', 'Round Trip'].forEach((opt) => {
        const option = document.createElement('button');
        option.className = 'bw-trip-option';
        option.textContent = opt;
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.childNodes[0].textContent = opt;
          menu.classList.remove('is-open');
        });
        menu.append(option);
      });
      btn.append(menu);

      btn.addEventListener('click', (e) => {
        if (e.target === btn || e.target.closest('svg')) {
          e.stopPropagation();
          menu.classList.toggle('is-open');
        }
      });
    }

    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.bw-trip-tab').forEach((t) => t.classList.remove('is-active'));
      btn.classList.add('is-active');
    });

    tabs.append(btn);
  });

  return tabs;
}

function buildUsePointsToggle() {
  const wrapper = document.createElement('div');
  wrapper.className = 'bw-points-toggle';

  const label = document.createElement('span');
  label.textContent = 'Use Points';

  const toggle = document.createElement('button');
  toggle.className = 'bw-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', 'false');

  const knob = document.createElement('span');
  knob.className = 'bw-toggle-knob';
  toggle.append(knob);

  toggle.addEventListener('click', () => {
    const checked = toggle.getAttribute('aria-checked') === 'true';
    toggle.setAttribute('aria-checked', String(!checked));
    toggle.classList.toggle('is-on');
  });

  wrapper.append(label, toggle);
  return wrapper;
}

function buildStationInputs() {
  const wrapper = document.createElement('div');
  wrapper.className = 'bw-stations';

  const fromInput = document.createElement('input');
  fromInput.type = 'text';
  fromInput.placeholder = 'From';
  fromInput.className = 'bw-station-input';
  fromInput.setAttribute('aria-label', 'From station');

  const swapBtn = document.createElement('button');
  swapBtn.className = 'bw-swap-btn';
  swapBtn.setAttribute('aria-label', 'Switch departure and arrival stations');
  swapBtn.append(createIcon('swap', 20));
  swapBtn.addEventListener('click', () => {
    const temp = fromInput.value;
    fromInput.value = toInput.value;
    toInput.value = temp;
  });

  const toInput = document.createElement('input');
  toInput.type = 'text';
  toInput.placeholder = 'To';
  toInput.className = 'bw-station-input';
  toInput.setAttribute('aria-label', 'To station');

  wrapper.append(fromInput, swapBtn, toInput);
  return wrapper;
}

function buildDateInputs() {
  const wrapper = document.createElement('div');
  wrapper.className = 'bw-dates';

  const depart = document.createElement('input');
  depart.type = 'text';
  depart.placeholder = 'Depart Date';
  depart.className = 'bw-date-input';
  depart.setAttribute('aria-label', 'Departure date');
  depart.onfocus = (e) => { e.target.type = 'date'; };
  depart.onblur = (e) => { if (!e.target.value) e.target.type = 'text'; };

  const ret = document.createElement('input');
  ret.type = 'text';
  ret.placeholder = 'Return Date';
  ret.className = 'bw-date-input';
  ret.setAttribute('aria-label', 'Return date');
  ret.onfocus = (e) => { e.target.type = 'date'; };
  ret.onblur = (e) => { if (!e.target.value) e.target.type = 'text'; };

  wrapper.append(depart, ret);
  return wrapper;
}

function buildFindButton() {
  const btn = document.createElement('button');
  btn.className = 'bw-find-btn';
  btn.textContent = 'FIND TRAINS';
  return btn;
}

function buildSecondaryRow() {
  const row = document.createElement('div');
  row.className = 'bw-secondary';

  // Traveler selector
  const traveler = document.createElement('button');
  traveler.className = 'bw-traveler-btn';
  const travelerIcon = createIcon('user', 18);
  const travelerText = document.createElement('span');
  travelerText.textContent = '1 Traveler';
  const travelerChevron = createIcon('chevron', 12);
  traveler.append(travelerIcon, travelerText, travelerChevron);

  // Disability checkbox
  const a11yLabel = document.createElement('label');
  a11yLabel.className = 'bw-a11y-label';
  const a11yCheck = document.createElement('input');
  a11yCheck.type = 'checkbox';
  a11yCheck.className = 'bw-a11y-check';
  const a11yText = document.createElement('span');
  a11yText.textContent = 'Passenger with Disability or Assistance Needed?';
  a11yLabel.append(a11yCheck, a11yText);

  // Info button
  const infoBtn = document.createElement('button');
  infoBtn.className = 'bw-info-btn';
  infoBtn.setAttribute('aria-label', 'More information');
  infoBtn.append(createIcon('info', 18));

  // Add Coupon
  const couponBtn = document.createElement('button');
  couponBtn.className = 'bw-action-btn';
  couponBtn.innerHTML = 'Add Coupon';
  couponBtn.append(createIcon('chevron', 12));

  // Add Trip
  const tripBtn = document.createElement('button');
  tripBtn.className = 'bw-action-btn';
  const tripIcon = createIcon('plus', 14);
  const tripText = document.createElement('span');
  tripText.textContent = 'Add Trip';
  tripBtn.append(tripIcon, tripText);

  // Advanced Search
  const advBtn = document.createElement('button');
  advBtn.className = 'bw-action-btn bw-advanced';
  advBtn.innerHTML = '<strong>Advanced Search</strong>';
  advBtn.append(createIcon('chevron', 12));

  row.append(traveler, a11yLabel, infoBtn, couponBtn, tripBtn, advBtn);
  return row;
}

export default function init(el) {
  el.textContent = '';

  const container = document.createElement('div');
  container.className = 'bw-container';

  // Dark blue tier: trip type tabs only
  const topBar = document.createElement('div');
  topBar.className = 'bw-top-bar';
  const topBarInner = document.createElement('div');
  topBarInner.className = 'bw-top-bar-inner';
  topBarInner.append(buildTripTypeTabs());
  topBar.append(topBarInner);

  // Light gray tier: use points toggle + form inputs + secondary row
  const formArea = document.createElement('div');
  formArea.className = 'bw-form-area';
  const formAreaInner = document.createElement('div');
  formAreaInner.className = 'bw-form-area-inner';

  const pointsRow = document.createElement('div');
  pointsRow.className = 'bw-points-row';
  pointsRow.append(buildUsePointsToggle());

  const formRow = document.createElement('div');
  formRow.className = 'bw-form-row';
  formRow.append(buildStationInputs(), buildDateInputs(), buildFindButton());

  formAreaInner.append(pointsRow, formRow, buildSecondaryRow());
  formArea.append(formAreaInner);

  container.append(topBar, formArea);
  el.append(container);
}
