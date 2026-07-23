import bcrypt from 'bcrypt';
import { OFFICIAL_STAFF } from './staff-seed-data.js';
import { passwordForRole } from './passwords.js';

/**
 * Upsert official staff.
 * Password is set ONLY on create — never overwrite existing hashes on restart.
 */
export async function seedOfficialStaff(db) {
  if (!db || !OFFICIAL_STAFF.length) return { upserted: 0 };

  let upserted = 0;

  for (const staff of OFFICIAL_STAFF) {
    const username = staff.username.toLowerCase();
    const { rows } = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username],
    );

    const title = staff.title || '';

    if (rows.length) {
      await db.query(
        `UPDATE users
         SET role = $1,
             full_name = $2,
             phone = CASE WHEN $3 <> '' THEN $3 ELSE phone END,
             email = $4,
             site = $5,
             title = $6,
             is_active = true
         WHERE id = $7`,
        [staff.role, staff.fullName, staff.phone || '', staff.email, staff.site, title, rows[0].id],
      );
    } else {
      const passwordHash = await bcrypt.hash(passwordForRole(staff.role), 12);
      await db.query(
        `INSERT INTO users (username, password_hash, role, is_active, full_name, phone, email, site, title)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)`,
        [username, passwordHash, staff.role, staff.fullName, staff.phone, staff.email, staff.site, title],
      );
      console.log(`[seed-staff] Created "${username}" (${staff.role})`);
    }
    upserted += 1;
  }

  return { upserted };
}
