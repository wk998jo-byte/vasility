import { ROOM_DATA } from '../web/src/data/roomsData.js';
import { DHAHRAN_OFFICE_ROOMS } from '../web/src/data/dhahranOfficeRooms.js';
import { campLabelToSite } from './seed.js';
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

/**
 * Seed all ROOM_DATA + Dhahran office locations into PostgreSQL.
 * Uses (department_id, site, name) uniqueness so "A-01" can exist per camp.
 */
export async function seedInventoryRooms(pool) {
  const entries = Object.entries(INVENTORY);
  if (!entries.length) return { created: 0, assets: 0 };

  const result = await withTransaction(pool, async (client) => {
    const deptId = await ensureFacDepartment(client);
    let created = 0;
    let assetsAdded = 0;
    let tokensAdded = 0;

    for (const [key, assets] of entries) {
      const { camp, roomName } = parseLocationKey(key);
      if (!roomName) continue;
      const site = campLabelToSite(camp);

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
      if (!tokenRows.length) {
        await client.query(
          `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)`,
          [roomId, staticToken],
        );
        tokensAdded += 1;
      } else if (tokenRows[0].token !== staticToken) {
        await client.query(
          `UPDATE room_qr_tokens SET token = $2 WHERE id = $1`,
          [tokenRows[0].id, staticToken],
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

  if (result.created > 0 || result.assetsAdded > 0 || result.tokensAdded > 0) {
    console.log(
      `[seed-inventory] ${result.created} rooms created, ${result.tokensAdded} tokens, ${result.assetsAdded} assets`,
    );
  }
  return result;
}
