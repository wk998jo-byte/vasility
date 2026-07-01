const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const inv = JSON.parse(fs.readFileSync(path.join(BASE, 'inventory.json'), 'utf8')).inventory;
const rooms = [
  '4S R&D ROOM', '4S SUPPORT#1', '4S SUPPORT#2', 'GENTS TOILET ROOM',
  'LADIES TOILET ROOM', 'MANAGERS ROOM', 'PANTRY/KITCHEN', 'PCC ROOM', 'SAFETY OFFICE ROOM',
];
const out = {};
rooms.forEach(r => { if (inv[r]) out[r] = inv[r]; });

const block = `/** Room → asset lists (from SSC building inventory). */
export const ROOM_ASSETS = ${JSON.stringify(out, null, 2)};

export function getAssetsForRoom(roomName) {
  return ROOM_ASSETS[roomName] || ['General', 'Other'];
}
`;

fs.writeFileSync(path.join(BASE, 'room-assets.js'), block, 'utf8');
console.log('Wrote room-assets.js with', Object.keys(out).length, 'rooms');
