import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './env.js';
import { seedDb } from './seed.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set — API will run without PostgreSQL.');
}

let pool = null;

export async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (pool) return pool;
  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function initDb() {
  const db = await getPool();
  if (!db) return false;
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  await seedDb(db);
  return true;
}

export async function checkDb() {
  const db = await getPool();
  if (!db) return false;
  await db.query('SELECT 1');
  return true;
}
