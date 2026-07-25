import { OFFICIAL_USERNAMES } from './staff-seed-data.js';

/**
 * Excel camp logins are no longer seeded.
 * Only OFFICIAL_STAFF may be auto-created; leftover seed accounts stay inactive.
 * Manual Staff Manager users (source=manual) are never touched here.
 */
export async function seedCampUsers(db) {
  if (!db) return { created: 0, updated: 0, skipped: true };

  const allow = [...OFFICIAL_USERNAMES];
  if (allow.length) {
    const { rowCount } = await db.query(
      `UPDATE users
       SET is_active = false
       WHERE is_active = true
         AND LOWER(username) <> ALL($1::text[])
         AND COALESCE(source, 'manual') <> 'manual'`,
      [allow],
    );
    if (rowCount > 0) {
      console.log(`[seed-camp-users] Kept ${rowCount} non-official seed account(s) inactive`);
    }
  }

  console.log('[seed-camp-users] Skipped Excel login seeding — official allowlist only');
  return { created: 0, updated: 0, skipped: true };
}
