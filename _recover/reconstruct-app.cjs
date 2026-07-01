const fs = require('fs');
const path = 'C:/Users/User1/.cursor/projects/c-Users-User1-Desktop-QR/agent-transcripts/58f5d011-01d2-429f-bffc-ad92ecbfa405/58f5d011-01d2-429f-bffc-ad92ecbfa405.jsonl';
const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);

function norm(p) {
  return (p || '').replace(/\\/g, '/').toLowerCase();
}
function isAppJs(p) {
  return norm(p).endsWith('/app.js');
}
function isIndex(p) {
  return norm(p).endsWith('/index.html');
}

const appSRByTurn = new Map();
const indexOps = [];

for (let i = 0; i < lines.length; i++) {
  const obj = JSON.parse(lines[i]);
  for (const m of obj.message?.content || []) {
    if (m.type !== 'tool_use') continue;
    const input = m.input || {};
    if (isAppJs(input.path) && m.name === 'StrReplace') {
      if (!appSRByTurn.has(i)) appSRByTurn.set(i, []);
      appSRByTurn.get(i).push({ line: i + 1, old: input.old_string, new: input.new_string });
    }
    if (isIndex(input.path) && (m.name === 'StrReplace' || m.name === 'Write')) {
      indexOps.push({ line: i + 1, name: m.name, ...input });
    }
  }
}

// Build index.html; capture inline script right before external app.js link
let html = null;
let initial = null;
const marker = '<script type="module">';

for (const op of indexOps) {
  if (op.name === 'Write') {
    if (!html || (op.contents?.length || 0) > 5000) html = op.contents;
    continue;
  }
  if (!html) continue;

  const before = html;
  if (!html.includes(op.old_string)) continue;
  html = html.replace(op.old_string, op.new_string);

  const hadInline = before.includes(marker) && !before.includes('src="app.js"');
  const nowExternal = html.includes('src="app.js"');
  if (hadInline && nowExternal) {
    const start = before.indexOf(marker);
    const end = before.lastIndexOf('</script>');
    if (start >= 0 && end > start) {
      initial = before.slice(start + marker.length + 1, end);
    }
  }
}

if (!initial && html?.includes(marker) && !html.includes('src="app.js"')) {
  const start = html.indexOf(marker);
  const end = html.lastIndexOf('</script>');
  if (start >= 0 && end > start) {
    initial = html.slice(start + marker.length + 1, end);
  }
}

if (!initial) {
  console.error('Could not extract inline module script from reconstructed index.html');
  process.exit(1);
}

console.log('Reconstructed index.html inline JS lines:', initial.split('\n').length);

let content = initial;
let applied = 0;
let failed = 0;
const failSamples = [];

const turns = [...appSRByTurn.keys()].sort((a, b) => a - b);
for (const turn of turns) {
  const group = appSRByTurn.get(turn);
  for (const sr of group) {
    if (!content.includes(sr.old)) {
      failed++;
      if (failSamples.length < 15) {
        failSamples.push({ line: sr.line, oldStart: sr.old.slice(0, 120) });
      }
      continue;
    }
    content = content.replace(sr.old, sr.new);
    applied++;
  }
}

console.log('Applied:', applied, 'Failed:', failed, 'Turns:', turns.length);
console.log('Final lines:', content.split('\n').length);

const outPath = 'C:/Users/User1/Desktop/QR/app.js';
fs.writeFileSync(outPath, content, 'utf8');

const imports = [
  './rooms-data.js',
  './room-assets.js',
  './locations-store.js',
  './i18n-service.js',
  './ui-utils.js',
  './tickets-manager.js',
];
for (const imp of imports) {
  console.log(imp, content.includes(imp) ? 'OK' : 'MISSING');
}

const markers = [
  'setTicketHooks',
  'setI18nAfterApply',
  'getTickets()',
  'function initApp',
];
for (const mk of markers) {
  console.log(mk, content.includes(mk) ? 'OK' : 'MISSING');
}

if (failSamples.length) {
  fs.writeFileSync('C:/Users/User1/Desktop/QR/_recover/failed-sr.json', JSON.stringify(failSamples, null, 2));
}
