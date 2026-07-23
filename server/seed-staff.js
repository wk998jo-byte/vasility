import bcrypt from 'bcrypt';
import { OFFICIAL_STAFF } from './staff-seed-data.js';
import { passwordForRole } from './passwords.js';

/** Upsert official staff; admin password vs staff password by role. */
export async function seedOfficialStaff(db) {
  if (!db || !OFFICIAL_STAFF.length) return { upserted: 0 };

  let upserted = 0;

  for (const staff of OFFICIAL_STAFF) {
    const username = staff.username.toLowerCase();
    const passwordHash = await bcrypt.hash(passwordForRole(staff.role), 12);
    const { rows } = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username],
    );

    const title = staff.title || '';

    if (rows.length) {
      await db.query(
        `UPDATE users
         SET role = $1, full_name = $2, phone = $3, email = $4, site = $5,
             title = $6, password_hash = $7, is_active = true
         WHERE id = $8`,
        [staff.role, staff.fullName, staff.phone, staff.email, staff.site, title, passwordHash, rows[0].id],
      );
      console.log(`[seed-staff] Updated "${username}" (${staff.role})`);
    } else {
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
