import bcrypt from 'bcrypt';
import { OFFICIAL_STAFF, OFFICIAL_USERNAMES } from './staff-seed-data.js';
import { passwordForRole } from './passwords.js';

export function officialStaffUsernames() {
  return new Set(OFFICIAL_USERNAMES);
}

/**
 * Upsert official staff, mark them source=official, deactivate leftover seed accounts.
 * Manually created users (source=manual) are never auto-deactivated.
 * Password is set ONLY on create — never overwrite existing hashes on restart.
 */
export async function seedOfficialStaff(db) {
  if (!db || !OFFICIAL_STAFF.length) return { upserted: 0, skippedCreate: 0, deactivated: 0 };

  let upserted = 0;
  let skippedCreate = 0;

  for (const staff of OFFICIAL_STAFF) {
    const username = staff.username.toLowerCase();
    const { rows } = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username],
    );

    const title = staff.title || '';
    const site = staff.site || null;
    const sites = site ? [site] : null;

    if (rows.length) {
      await db.query(
        `UPDATE users
         SET role = $1,
             full_name = $2,
             phone = CASE WHEN $3 <> '' THEN $3 ELSE phone END,
             email = $4,
             site = $5,
             sites = $6,
             title = $7,
             is_active = true,
             source = 'official'
         WHERE id = $8`,
        [staff.role, staff.fullName, staff.phone || '', staff.email, site, sites, title, rows[0].id],
      );
      upserted += 1;
      continue;
    }

    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(passwordForRole(staff.role), 12);
    } catch (err) {
      skippedCreate += 1;
      console.warn(`[seed-staff] Skip create "${username}": ${err.message}`);
      continue;
    }

    await db.query(
      `INSERT INTO users (username, password_hash, role, is_active, full_name, phone, email, site, sites, title, source)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, 'official')`,
      [username, passwordHash, staff.role, staff.fullName, staff.phone, staff.email, site, sites, title],
    );
    console.log(`[seed-staff] Created "${username}" (${staff.role} / ${site || 'All'})`);
    upserted += 1;
  }

  const allow = [...officialStaffUsernames()];

  // Enforce allowlist: only official main/sub admins stay active.
  // Reclassify everyone else as seed leftovers (Excel / env defaults), then deactivate.
  // Future Staff Manager creates use source='manual' and are not purged on restart.
  const { rowCount: deactivated } = await db.query(
    `UPDATE users
     SET is_active = false,
         source = CASE
           WHEN COALESCE(source, '') = 'manual'
                AND phone IS NOT NULL AND TRIM(phone) <> ''
                AND email IS NOT NULL AND email NOT ILIKE '%@binquraya.local'
             THEN 'manual'
           ELSE 'seed'
         END
     WHERE is_active = true
       AND LOWER(username) <> ALL($1::text[])
       AND NOT (
         COALESCE(source, '') = 'manual'
         AND phone IS NOT NULL AND TRIM(phone) <> ''
         AND email IS NOT NULL AND email NOT ILIKE '%@binquraya.local'
       )`,
    [allow],
  );

  // Hard purge classic leftovers even if they somehow look "manual".
  const { rowCount: hardDeactivated } = await db.query(
    `UPDATE users
     SET is_active = false, source = 'seed'
     WHERE is_active = true
       AND LOWER(username) <> ALL($1::text[])
       AND (
         email ILIKE '%@binquraya.local'
         OR TRIM(COALESCE(phone, '')) = ''
         OR LOWER(username) IN ('admin', 'facility_user', 'facility', 'viewer')
       )`,
    [allow],
  );

  const totalDeactivated = (deactivated || 0) + (hardDeactivated || 0);
  if (totalDeactivated > 0) {
    console.log(`[seed-staff] Deactivated ${totalDeactivated} non-allowlisted user(s)`);
  }

  return { upserted, skippedCreate, deactivated: totalDeactivated };
}
