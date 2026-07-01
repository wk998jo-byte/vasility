const fs = require('fs');
const path = 'C:/Users/User1/.cursor/projects/c-Users-User1-Desktop-QR/agent-transcripts/58f5d011-01d2-429f-bffc-ad92ecbfa405/58f5d011-01d2-429f-bffc-ad92ecbfa405.jsonl';
const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);

function isIndex(p) {
  return (p || '').replace(/\\/g, '/').toLowerCase().endsWith('/index.html');
}

const ops = [];
for (let i = 0; i < lines.length; i++) {
  const obj = JSON.parse(lines[i]);
  for (const m of obj.message?.content || []) {
    if (m.type !== 'tool_use') continue;
    if (!isIndex(m.input?.path)) continue;
    if (m.name === 'Write' || m.name === 'StrReplace') {
      ops.push({ line: i + 1, name: m.name, ...m.input });
    }
  }
}

let html = null;
let applied = 0;
let failed = 0;
for (const op of ops) {
  if (op.name === 'Write') {
    if (!html || (op.contents?.length || 0) > 5000) html = op.contents;
    continue;
  }
  if (!html || !op.old_string) continue;
  if (html.includes(op.old_string)) {
    html = html.replace(op.old_string, op.new_string);
    applied++;
  } else {
    failed++;
  }
}

if (!html) {
  console.error('Failed to reconstruct index.html');
  process.exit(1);
}

const out = 'C:/Users/User1/Desktop/QR/_recover/reconstructed-index.html';
fs.writeFileSync(out, html, 'utf8');
console.log('Lines:', html.split('\n').length);
console.log('Applied:', applied, 'Failed:', failed);
for (const k of ['view-report', 'modals.js', 'auth.js', 'nav.js', 'admin-toolbar.js', 'app.js']) {
  console.log(k + ':', html.includes(k) ? 'OK' : 'MISSING');
}
