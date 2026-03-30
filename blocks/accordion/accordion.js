export default function init(el) {
  [...el.children].forEach((row) => {
    const label = row.children[0];
    const body = row.children[1];
    if (!label || !body) return;

    const summary = document.createElement('summary');
    summary.className = 'acc-label';
    summary.append(...label.childNodes);

    body.className = 'acc-body';

    const details = document.createElement('details');
    details.className = 'acc-item';
    details.append(summary, body);

    row.replaceWith(details);
  });
}
