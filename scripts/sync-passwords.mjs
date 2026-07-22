/** Sync passwords from .env on restart. Run: node scripts/sync-passwords.mjs */
import { loadEnv } from '../server/env.js';
import { getPool } from '../server/db.js';
import { seedUsers } from '../server/seed.js';
import { seedOfficialStaff } from '../server/seed-staff.js';
import { seedCampUsers } from '../server/seed-camp-users.js';
import { ADMIN_DEFAULT_PASSWORD, STAFF_DEFAULT_PASSWORD } from '../server/passwords.js';

loadEnv();

const pool = await getPool();
if (!pool) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

await seedUsers(pool);
await seedOfficialStaff(pool);
await seedCampUsers(pool);
await pool.end();

console.log('Passwords synced.');
console.log(`  Admins: ${ADMIN_DEFAULT_PASSWORD}`);
console.log(`  Staff:  ${STAFF_DEFAULT_PASSWORD}`);
