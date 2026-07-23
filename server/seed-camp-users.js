import bcrypt from 'bcrypt';
import { USERS } from '../web/src/campUsersData.js';
import { campLabelToSite } from './seed.js';
import { passwordForRole } from './passwords.js';

function mapDbRole(user) {
  if (user.role === 'admin') return 'admin';
  return 'sub_admin';
}

function mapSite(user) {
  if (user.role === 'admin' || user.camp === 'All') return null;
  return campLabelToSite(user.camp);
}

function placeholderEmail(username) {
  return `${String(username || 'user').replace(/\./g, '_')}@binquraya.local`;
}

/**
 * Upsert camp directory users.
 * Password is set ONLY on create — never overwrite existing hashes on restart.
 */
export async function seedCampUsers(db) {
  if (!db) return { created: 0, updated: 0 };

  let created = 0;
  let updated = 0;

  for (const user of Object.values(USERS)) {
    const username = String(user.username || '').trim().toLowerCase();
    if (!username) continue;

    const role = mapDbRole(user);
    const site = mapSite(user);
    const fullName = user.name || username;
    const phone = user.phone || '';
    const email = placeholderEmail(username);
    const title = user.title || '';

    const { rows } = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username],
    );

    if (rows.length) {
      // Profile only — keep password_hash and prefer existing phone if seed phone empty.
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
        [role, fullName, phone, email, site, title, rows[0].id],
      );
      updated += 1;
    } else {
      const passwordHash = await bcrypt.hash(passwordForRole(role), 12);
      await db.query(
        `INSERT INTO users (username, password_hash, role, is_active, full_name, phone, email, site, title)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)`,
        [username, passwordHash, role, fullName, phone, email, site, title],
      );
      console.log(`[seed-camp-users] Created "${username}" (${role})`);
      created += 1;
    }
  }

  if (created || updated) {
    console.log(`[seed-camp-users] ${created} created, ${updated} profile-updated (passwords preserved)`);
  }

  return { created, updated };
}
