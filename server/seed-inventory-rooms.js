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
 * Ensure every ROOM_DATA / Dhahran office key exists as an active room + QR token.
 * Only inserts missing rooms (cheap) so we never skip Dhahran office rooms just
 * because other Dhahran rows already exist. Full asset refresh only for new rooms
 * unless FORCE_SEED_INVENTORY=true.
 */
export async function seedInventoryRooms(pool) {
  const entries = Object.entries(INVENTORY);
  if (!entries.length) return { created: 0, assets: 0 };

  const force = String(process.env.FORCE_SEED_INVENTORY || '').toLowerCase() === 'true';

  const result = await withTransaction(pool, async (client) => {
    const deptId = await ensureFacDepartment(client);

    const { rows: existingRows } = await client.query(
      `SELECT id, name, COALESCE(site, '') AS site
       FROM rooms
       WHERE department_id = $1 AND is_active = true`,
      [deptId],
    );
    const bySiteName = new Map();
    for (const row of existingRows) {
      bySiteName.set(`${row.site}::${row.name}`.toLowerCase(), row.id);
    }

    let created = 0;
    let assetsAdded = 0;
    let tokensAdded = 0;

    for (const [key, assets] of entries) {
      const { camp, roomName } = parseLocationKey(key);
      if (!roomName) continue;
      const site = campLabelToSite(camp) || '';
      const mapKey = `${site}::${roomName}`.toLowerCase();
      let roomId = bySiteName.get(mapKey);
      const isNew = !roomId;

      if (!roomId) {
        const inserted = await client.query(
          `INSERT INTO rooms (department_id, name, site, is_active)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [deptId, roomName, site],
        );
        roomId = inserted.rows[0].id;
        bySiteName.set(mapKey, roomId);
        created += 1;
      } else if (force) {
        await client.query(
          `UPDATE rooms SET site = $1, is_active = true WHERE id = $2`,
          [site, roomId],
        );
      }

      const { rows: tokenRows } = await client.query(
        `SELECT id FROM room_qr_tokens WHERE room_id = $1 AND is_active = true LIMIT 1`,
        [roomId],
      );
      if (!tokenRows.length) {
        await client.query(
          `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)`,
          [roomId, key],
        );
        tokensAdded += 1;
      }

      // Assets: always for new rooms; full refresh only when forced (OOM-safe default).
      if (isNew || force) {
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
    }

    return { created, assetsAdded, tokensAdded };
  });

  const extraTokens = await ensureMissingTokens(pool);
  result.tokensAdded += extraTokens;

  if (result.created > 0 || result.tokensAdded > 0 || result.assetsAdded > 0) {
    console.log(
      `[seed-inventory] ${result.created} rooms created, ${result.tokensAdded} tokens, ${result.assetsAdded} assets`,
    );
  } else {
    console.log('[seed-inventory] Inventory rooms already present');
  }
  return result;
}
