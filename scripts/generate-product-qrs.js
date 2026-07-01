/**
 * Generate inventory-data.js, static QR assets, and printable HTML from inventory.json
 * Run: node scripts/generate-product-qrs.js
 */
const fs = require('fs');
const path = require('path');
const qrcode = require('./vendor/qrcode-generator.js');

const BASE = path.join(__dirname, '..');
const QR_DIR = path.join(BASE, 'assets', 'qrs');
const data = JSON.parse(fs.readFileSync(path.join(BASE, 'inventory.json'), 'utf8'));

function qrPayload(p) {
  return `SSC|${p.room}|${p.asset}|${p.id}`;
}

function makeQrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag(4, 1);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Static QR files (permanent, never regenerated in browser) ──
fs.mkdirSync(QR_DIR, { recursive: true });
const existingQr = new Set(fs.readdirSync(QR_DIR).filter(f => f.endsWith('.svg')));
const neededQr = new Set(data.products.map(p => `${p.id}.svg`));
for (const file of existingQr) {
  if (!neededQr.has(file)) fs.unlinkSync(path.join(QR_DIR, file));
}
for (const p of data.products) {
  const payload = qrPayload(p);
  const file = path.join(QR_DIR, `${p.id}.svg`);
  fs.writeFileSync(file, makeQrSvg(payload), 'utf8');
}

// ── Static room QR files (room name as scan payload) ──
const ROOM_QR_DIR = path.join(QR_DIR, 'rooms');
fs.mkdirSync(ROOM_QR_DIR, { recursive: true });

function roomSlug(name) {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const roomNames = Object.keys(data.inventory).sort();
const roomQrMapLines = roomNames.map(room => {
  const slug = roomSlug(room);
  const relPath = `assets/qrs/rooms/${slug}.svg`;
  fs.writeFileSync(path.join(ROOM_QR_DIR, `${slug}.svg`), makeQrSvg(room), 'utf8');
  return `  ${JSON.stringify(room)}: ${JSON.stringify(relPath)}`;
});

// ── inventory-data.js ──
const invLines = Object.entries(data.inventory)
  .map(([room, assets]) => {
    const items = assets.map(a => JSON.stringify(a)).join(', ');
    return `  ${JSON.stringify(room)}: [${items}]`;
  })
  .join(',\n');

const dataJs = `// Auto-generated from SSC_BUILDING_DETAILS (1).xlsx — do not edit manually
export const INVENTORY = {
${invLines}
};

export const PRODUCTS = ${JSON.stringify(data.products, null, 2)};

export const QR_STATIC_BASE = 'assets/qrs';

export const ROOM_QRS = {
${roomQrMapLines.join(',\n')}
};

export function encodeProductQR(product) {
  return \`SSC|\${product.room}|\${product.asset}|\${product.id}\`;
}

export function qrImagePath(productOrId) {
  const id = typeof productOrId === 'string' ? productOrId : productOrId.id;
  return \`\${QR_STATIC_BASE}/\${id}.svg\`;
}

export function roomQrImagePath(room) {
  return ROOM_QRS[room] ?? null;
}

export function parseProductQR(raw) {
  const t = raw.trim();
  if (t.startsWith('SSC|')) {
    const parts = t.split('|');
    if (parts.length >= 4) return { room: parts[1], asset: parts[2], id: parts[3] };
  }
  const room = Object.keys(INVENTORY).find(r =>
    r.toUpperCase() === t.toUpperCase() || t.toUpperCase().includes(r.toUpperCase())
  );
  return room ? { room, asset: null, id: null } : null;
}
`;

fs.writeFileSync(path.join(BASE, 'inventory-data.js'), dataJs, 'utf8');

// ── product-qrs.html (print grid, static images only) ──
const byRoom = {};
for (const p of data.products) {
  if (!byRoom[p.room]) byRoom[p.room] = [];
  byRoom[p.room].push(p);
}

const roomSections = Object.keys(byRoom).sort().map(room => {
  const cards = byRoom[room].map(p => `
    <div class="qr-card">
      <img class="qr-img" src="assets/qrs/${p.id}.svg" alt="${escapeHtml(p.id)}" width="140" height="140">
      <p class="qr-id">${escapeHtml(p.id)}</p>
      <p class="qr-asset">${escapeHtml(p.asset)}</p>
      <p class="qr-room">${escapeHtml(room)}</p>
    </div>`).join('');
  return `<section class="room-section"><h2>${escapeHtml(room)}</h2><div class="qr-grid">${cards}</div></section>`;
}).join('');

const qrHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SSC Product QR Codes — ${data.products.length} Items</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, sans-serif; background: #f5f5f5; color: #000; padding: 2rem; }
    .page-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .back-link {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.625rem 1rem; border-radius: 10px; border: 1px solid rgba(0,0,0,.15);
      background: #fff; color: #000; font-weight: 600; font-size: 0.875rem;
      text-decoration: none; transition: background 0.2s;
    }
    .back-link:hover { background: #f0f0f0; }
    .back-link svg { width: 1.125rem; height: 1.125rem; }
    header { text-align: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 2px solid #000; }
    header .brand-logo { margin-bottom: 1.25rem; }
    header h1 { font-size: 1.75rem; font-weight: 700; }
    header p { color: #666; margin-top: 0.5rem; }
    .toolbar { display: flex; justify-content: center; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .toolbar button { padding: 0.75rem 1.5rem; border: none; border-radius: 12px; background: #000; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
    .room-section { margin-bottom: 2.5rem; break-inside: avoid; }
    .room-section h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; padding: 0.5rem 1rem; background: #000; color: #fff; border-radius: 8px; display: inline-block; }
    .qr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    .qr-card { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 1rem; text-align: center; break-inside: avoid; page-break-inside: avoid; }
    .qr-img { display: block; margin: 0 auto 0.75rem; }
    .qr-id { font-size: 0.7rem; font-weight: 700; color: #666; letter-spacing: 0.05em; }
    .qr-asset { font-size: 0.75rem; font-weight: 600; margin-top: 0.25rem; line-height: 1.3; }
    .qr-room { font-size: 0.65rem; color: #888; margin-top: 0.25rem; }
    @media print {
      body { background: #fff; padding: 0.5rem; }
      .page-top, .toolbar { display: none; }
      .qr-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
      .qr-card { border: 1px solid #ccc; padding: 0.5rem; }
    }
  </style>
</head>
<body>
  <div class="page-top">
    <a href="index.html" class="back-link" aria-label="Back to portal">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Back to Portal
    </a>
  </div>
  <header>
    <img src="assets/bin-quraya-logo.png" alt="Bin Quraya" class="brand-logo brand-logo--standalone">
    <h1>SSC Building Portal — Product QR Codes</h1>
    <p>${data.products.length} assets across ${Object.keys(byRoom).length} rooms · Static QR files · Generated ${new Date().toLocaleDateString()}</p>
  </header>
  <div class="toolbar">
    <button onclick="window.print()">Print All QR Codes</button>
  </div>
  ${roomSections}
</body>
</html>`;

fs.writeFileSync(path.join(BASE, 'product-qrs.html'), qrHtml, 'utf8');

console.log('Wrote inventory-data.js');
console.log('Wrote', data.products.length, 'static QR files to assets/qrs/');
console.log('Wrote', roomNames.length, 'room QR files to assets/qrs/rooms/');
console.log('Wrote product-qrs.html');
