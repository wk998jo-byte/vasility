import { loadEnv } from './env.js';
import { initDb, checkDb, getPool } from './db.js';

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

try {
  await initDb();
  await checkDb();
  const pool = await getPool();
  await pool.end();
  console.log('Database schema ready.');
  process.exit(0);
} catch (err) {
  console.error('Database init failed:', err.message);
  process.exit(1);
}
