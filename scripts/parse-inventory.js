/**
 * Parse SSC_BUILDING_DETAILS xlsx (via extracted XML) → inventory.json
 * Run: node scripts/parse-inventory.js
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const stringsXml = fs.readFileSync(path.join(BASE, '_xlsx_extract/strings.xml'), 'utf8');
const sheetXml = fs.readFileSync(path.join(BASE, '_xlsx_extract/sheet1.xml'), 'utf8');

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si>(?:<t[^>]*>([^<]*)<\/t>|<r><t[^>]*>([^<]*)<\/t><\/r>)+|<si><t[^>]*>([^<]*)<\/t>/g;
  // Simpler: split by <si> blocks
  const blocks = xml.split(/<si>/).slice(1);
  for (const block of blocks) {
    const m = block.match(/<t(?: xml:space="preserve")?>([\s\S]*?)<\/t>/);
    if (m) {
      strings.push(m[1].replace(/&amp;/g, '&').trim());
    } else {
      strings.push('');
    }
  }
  return strings;
}

function colLetter(cellRef) {
  return cellRef.replace(/[0-9]/g, '');
}

function parseSheet(xml, strings) {
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let m;
  while ((m = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(m[1], 10);
    const rowContent = m[2];
    const cells = {};
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRe.exec(rowContent)) !== null) {
      const col = cm[1];
      const attrs = cm[3];
      const inner = cm[4];
      const vm = inner.match(/<v>([^<]*)<\/v>/);
      if (!vm) continue;
      const raw = vm[1];
      cells[col] = attrs.includes('t="s"') ? strings[parseInt(raw, 10)] : raw;
    }
    rows.push({ rowNum, cells });
  }
  return rows;
}

function normalizeRoom(name) {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '')
    .replace(/\(.*?\)/g, '')
    .trim();
}

function roomKey(name) {
  // Canonical keys for app / QR
  const n = name.toUpperCase().replace(/\s+/g, ' ').trim();
  const map = {
    '4S SUPPORT#1': '4S SUPPORT#1',
    '4S SUPPORT# 1': '4S SUPPORT#1',
    '4S SUPPORT# 2 ROOM': '4S SUPPORT#2',
    '4S SUPPORT#2': '4S SUPPORT#2',
    '4S R&D ROOM': '4S R&D ROOM',
    '4S R&D ROOM ONE PERSON (INSIDE)': '4S R&D ROOM ONE PERSON',
    '4S R&D ROOM ONE PERSON': '4S R&D ROOM ONE PERSON',
    'PCC ROOM': 'PCC ROOM',
    'PANTRY ROOM': 'PANTRY/KITCHEN',
    'MANAGERS ROOM': 'MANAGERS ROOM',
    'GENETS TOILET ROOM': 'GENTS TOILET ROOM',
    'LADIES TOILET ROOM': 'LADIES TOILET ROOM',
    'SAFETY OFFICE ROOM': 'SAFETY OFFICE ROOM',
  };
  for (const [k, v] of Object.entries(map)) {
    if (n.includes(k) || n === k) return v;
  }
  return normalizeRoom(name);
}

const strings = parseSharedStrings(stringsXml);
const rows = parseSheet(sheetXml, strings);

const inventory = {};
const products = [];
let currentRoom = null;
let currentRoomRaw = null;

const headerMarkers = new Set(['S.NO', 'DESCRIPTION OF ITEMS', 'SSC BUILDING DETAILS']);

for (const { rowNum, cells } of rows) {
  const a = cells.A;
  const b = cells.B;

  // Room header: merged row — room name in column A only
  if (a && (b === undefined || b === '') && !headerMarkers.has(a) && a !== 'S.NO' && !/^\d+$/.test(String(a))) {
    const looksLikeRoom =
      a.includes('ROOM') ||
      a.includes('SUPPORT') ||
      a.includes('PANTRY') ||
      a.includes('PCC') ||
      a.includes('TOILET') ||
      a.includes('R&D') ||
      a.includes('MANAGER');
    if (looksLikeRoom) {
      currentRoomRaw = a;
      currentRoom = roomKey(a);
      if (!inventory[currentRoom]) inventory[currentRoom] = [];
      continue;
    }
  }

  // Item row: A = serial number, B = description
  if (currentRoom && a && b && /^\d+$/.test(String(a)) && !headerMarkers.has(b)) {
    const asset = b.trim();
    if (!inventory[currentRoom].includes(asset)) {
      inventory[currentRoom].push(asset);
    }
    products.push({
      id: `SSC-${String(products.length + 1).padStart(4, '0')}`,
      room: currentRoom,
      roomRaw: currentRoomRaw,
      asset,
      unit: cells.C || '',
      qty: cells.D || '',
      remarks: cells.E || '',
    });
  }
}

const out = { inventory, products, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(BASE, 'inventory.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('Rooms:', Object.keys(inventory).length);
console.log('Products:', products.length);
Object.entries(inventory).forEach(([r, items]) => console.log(`  ${r}: ${items.length} items`));
