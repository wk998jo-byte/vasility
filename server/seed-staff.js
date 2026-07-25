import bcrypt from 'bcrypt';
import { OFFICIAL_STAFF } from './staff-seed-data.js';
import { passwordForRole } from './passwords.js';

/**
 * Upsert official staff.
 * Password is set ONLY on create — never overwrite existing hashes on restart.
 * Missing STAFF_DEFAULT_PASSWORD skips NEW creates but still updates existing rows.
 */
export async function seedOfficialStaff(db) {
  if (!db || !OFFICIAL_STAFF.length) return { upserted: 0, skippedCreate: 0 };

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
             is_active = true
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
      `INSERT INTO users (username, password_hash, role, is_active, full_name, phone, email, site, sites, title)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9)`,
      [username, passwordHash, staff.role, staff.fullName, staff.phone, staff.email, site, sites, title],
    );
    console.log(`[seed-staff] Created "${username}" (${staff.role} / ${site || 'All'})`);
    upserted += 1;
  }

  return { upserted, skippedCreate };
}
