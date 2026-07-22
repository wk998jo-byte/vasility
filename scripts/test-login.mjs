/** Quick login diagnostic — run: node scripts/test-login.mjs */
import { loadEnv } from '../server/env.js';
import { getPool } from '../server/db.js';
import bcrypt from 'bcrypt';
import { ADMIN_DEFAULT_PASSWORD, STAFF_DEFAULT_PASSWORD } from '../server/passwords.js';

loadEnv();

const BASE = `http://localhost:${process.env.PORT || 8081}`;
const API = `${BASE}/api`;

async function main() {
  console.log('API base:', API);

  try {
    const health = await fetch(`${API}/health`).then((r) => r.json());
    console.log('Health:', health);
  } catch (e) {
    console.error('Health FAILED — is the server running? npm start');
    console.error(e.message);
    process.exit(1);
  }

  const pool = await getPool();
  if (!pool) {
    console.error('No DATABASE_URL / PostgreSQL');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT username, role, is_active, (password_hash IS NOT NULL AND password_hash <> '') AS has_password
     FROM users WHERE role = 'admin' ORDER BY username LIMIT 10`,
  );
  console.log('Admin accounts in DB:', rows.length);
  for (const u of rows) {
    console.log(`  - ${u.username} (active=${u.is_active}, has_password=${u.has_password})`);
  }

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || ADMIN_DEFAULT_PASSWORD;

  for (const [label, user, pass] of [
    ['env admin', adminUser, adminPass],
    ['official admin', 'm.irfan', adminPass],
    ['official staff', 'ansar.basha', STAFF_DEFAULT_PASSWORD],
  ]) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`Login [${label}] ${user}: HTTP ${res.status}`, body.token ? 'OK' : body.error || body);

    if (!body.token && pool) {
      const { rows: urows } = await pool.query(
        'SELECT password_hash FROM users WHERE LOWER(username) = LOWER($1)',
        [user],
      );
      if (urows[0]?.password_hash) {
        const match = await bcrypt.compare(pass, urows[0].password_hash);
        console.log(`  bcrypt direct check: ${match ? 'password matches' : 'password DOES NOT match DB hash'}`);
      } else {
        console.log('  user not found in DB');
      }
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
