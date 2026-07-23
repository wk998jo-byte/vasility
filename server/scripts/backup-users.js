/**
 * Backup only the users table to users-backup.sql
 * Usage: node server/scripts/backup-users.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadEnv } from '../env.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../../users-backup.sql');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
console.log(`users count: ${rows.length}`);

if (!rows.length) {
  console.error('No users found');
  await pool.end();
  process.exit(1);
}

const cols = Object.keys(rows[0]);
let sql = '';
sql += '-- FMC users table backup (passwords are bcrypt hashes)\n';
sql += `-- Generated: ${new Date().toISOString()}\n`;
sql += `-- Rows: ${rows.length}\n\n`;
sql += 'BEGIN;\n\n';

for (const r of rows) {
  const vals = cols.map((c) => esc(r[c]));
  sql += `INSERT INTO users (${cols.join(', ')}) VALUES (${vals.join(', ')})\n`;
  sql += 'ON CONFLICT (username) DO UPDATE SET\n';
  sql += '  password_hash = EXCLUDED.password_hash,\n';
  sql += '  role = EXCLUDED.role,\n';
  sql += '  is_active = EXCLUDED.is_active,\n';
  sql += '  full_name = EXCLUDED.full_name,\n';
  sql += '  phone = EXCLUDED.phone,\n';
  sql += '  email = EXCLUDED.email,\n';
  sql += '  site = EXCLUDED.site,\n';
  sql += '  title = EXCLUDED.title;\n\n';
}

sql += 'COMMIT;\n';
fs.writeFileSync(outPath, sql, 'utf8');
console.log(`Wrote ${outPath} (${Buffer.byteLength(sql)} bytes)`);
for (const r of rows) {
  console.log(`- ${r.username} | ${r.role} | ${r.full_name || ''}`);
}
await pool.end();
