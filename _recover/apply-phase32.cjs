const fs = require('fs');
const path = 'C:/Users/User1/.cursor/projects/c-Users-User1-Desktop-QR/agent-transcripts/58f5d011-01d2-429f-bffc-ad92ecbfa405/58f5d011-01d2-429f-bffc-ad92ecbfa405.jsonl';
const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);

let content = fs.readFileSync('C:/Users/User1/Desktop/QR/app.js', 'utf8');
const phase32 = [];

for (let i = 1013; i < 1032; i++) {
  const obj = JSON.parse(lines[i]);
  for (const m of obj.message?.content || []) {
    if (m.type === 'tool_use' && m.name === 'StrReplace' && m.input?.path?.includes('app.js')) {
      phase32.push({ line: i + 1, old: m.input.old_string, new: m.input.new_string });
    }
  }
}

console.log('Phase 3.2 operations:', phase32.length);
let applied = 0;
for (const sr of phase32) {
  if (!content.includes(sr.old)) {
    console.log('FAIL line', sr.line, 'old starts:', JSON.stringify(sr.old.slice(0, 80)));
    continue;
  }
  content = content.replace(sr.old, sr.new);
  applied++;
  console.log('OK line', sr.line);
}

fs.writeFileSync('C:/Users/User1/Desktop/QR/app.js', content, 'utf8');
console.log('Applied', applied, '/', phase32.length);
console.log('Final lines:', content.split('\n').length);
