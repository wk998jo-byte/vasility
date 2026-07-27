import { ROOM_DATA } from '../web/src/data/roomsData.js';
import { DHAHRAN_OFFICE_ROOMS } from '../web/src/data/dhahranOfficeRooms.js';
import { campLabelToSite, buildStaticQrToken } from './seed.js';
import { withTransaction } from './db.js';

const INVENTORY = { ...ROOM_DATA, ...DHAHRAN_OFFICE_ROOMS };

function parseLocationKey(key) {
  const raw = String(key || '').trim();
  const splitAt = raw.indexOf(' - ');
  if (splitAt === -1) return { camp: 'Other', roomName: raw };
  return {
    camp: raw.slice(0, splitAt).trim(),
    roomName: raw.slice(splitAt + 3).trim(),
  };
}

/** Camp label (ROOM_DATA key prefix) → DB rooms.site value. */
export { campLabelToSite };

async function ensureFacDepartment(client) {
  const { rows } = await client.query(
    `SELECT id FROM departments WHERE code = 'FAC' LIMIT 1`,
  );
  if (rows.length) return rows[0].id;
  const inserted = await client.query(
    `INSERT INTO departments (code, name_en, name_ar, is_active)
     VALUES ('FAC', 'Facilities', 'المرافق', true)
     RETURNING id`,
  );
  return inserted.rows[0].id;
}

async function ensureMissingTokens(pool) {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.site
     FROM rooms r
     WHERE r.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM room_qr_tokens t
         WHERE t.room_id = r.id AND t.is_active = true
       )`,
  );
  let tokensAdded = 0;
  for (const room of rows) {
    const token = buildStaticQrToken(room.site, room.name);
    await pool.query(
      `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)`,
      [room.id, token],
    );
    tokensAdded += 1;
  }
  return tokensAdded;
}

/**
 * Seed ROOM_DATA + Dhahran office into PostgreSQL.
 * - Full pass when DB is empty / FORCE_SEED_INVENTORY=true
 * - Otherwise only backfill sites that are missing or under-seeded (avoids Replit OOM)
 * - Always ensure rooms without QR tokens get one
 */
export async function seedInventoryRooms(pool) {
  const entries = Object.entries(INVENTORY);
  if (!entries.length) return { created: 0, assets: 0 };

  const force = String(process.env.FORCE_SEED_INVENTORY || '').toLowerCase() === 'true';

  const bySite = new Map();
  for (const [key, assets] of entries) {
    const { camp, roomName } = parseLocationKey(key);
    if (!roomName) continue;
    const site = campLabelToSite(camp) || '';
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site).push([key, assets, roomName]);
  }

  let countBySite = new Map();
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(site, '') AS site, COUNT(*)::int AS count
       FROM rooms WHERE is_active = true
       GROUP BY 1`,
    );
    countBySite = new Map(rows.map((r) => [r.site, r.count]));
  } catch (err) {
    console.warn('[seed-inventory] site count failed, full seed:', err.message);
  }

  const sitesToSeed = [];
  for (const [site, items] of bySite) {
    const have = countBySite.get(site) || 0;
    const need = Math.max(3, Math.floor(items.length * 0.5));
    if (force || have < need) sitesToSeed.push(site);
  }

  if (!sitesToSeed.length && !force) {
    const tokensAdded = await ensureMissingTokens(pool);
    if (tokensAdded) {
      console.log(`[seed-inventory] Ensured ${tokensAdded} missing QR token(s)`);
    } else {
      console.log('[seed-inventory] Sites already seeded — skip full rescan');
    }
    return { created: 0, assetsAdded: 0, tokensAdded, skipped: true };
  }

  console.log(`[seed-inventory] Backfilling sites: ${sitesToSeed.join(', ') || '(all)'}`);
  const siteFilter = new Set(sitesToSeed);

  const result = await withTransaction(pool, async (client) => {
    const deptId = await ensureFacDepartment(client);
    let created = 0;
    let assetsAdded = 0;
    let tokensAdded = 0;

    for (const [key, assets] of entries) {
      const { camp, roomName } = parseLocationKey(key);
      if (!roomName) continue;
      const site = campLabelToSite(camp) || '';
      if (siteFilter.size && !siteFilter.has(site)) continue;

      const existing = await client.query(
        `SELECT id FROM rooms
         WHERE department_id = $1 AND COALESCE(site, '') = $2 AND name = $3`,
        [deptId, site || '', roomName],
      );

      let roomId;
      if (existing.rows.length) {
        roomId = existing.rows[0].id;
        await client.query(
          `UPDATE rooms SET site = $1, is_active = true WHERE id = $2`,
          [site, roomId],
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO rooms (department_id, name, site, is_active)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [deptId, roomName, site],
        );
        roomId = inserted.rows[0].id;
        created += 1;
      }

      const staticToken = key;
      const { rows: tokenRows } = await client.query(
        `SELECT id, token FROM room_qr_tokens WHERE room_id = $1 AND is_active = true LIMIT 1`,
        [roomId],
      );
      // Never overwrite existing tokens — printed stickers must keep working.
      if (!tokenRows.length) {
        await client.query(
          `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)`,
          [roomId, staticToken],
        );
        tokensAdded += 1;
      }

      for (const asset of assets || []) {
        const name = String(asset || '').trim();
        if (!name) continue;
        const { rowCount } = await client.query(
          `INSERT INTO room_assets (room_id, name)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM room_assets ra WHERE ra.room_id = $1 AND ra.name = $2
           )`,
          [roomId, name],
        );
        assetsAdded += rowCount;
      }
    }

    return { created, assetsAdded, tokensAdded };
  });

  const extraTokens = await ensureMissingTokens(pool);
  result.tokensAdded += extraTokens;

  if (result.created > 0 || result.assetsAdded > 0 || result.tokensAdded > 0) {
    console.log(
      `[seed-inventory] ${result.created} rooms created, ${result.tokensAdded} tokens, ${result.assetsAdded} assets`,
    );
  }
  return result;
}
