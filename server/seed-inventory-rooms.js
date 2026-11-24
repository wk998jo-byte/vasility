import { ROOM_DATA } from '../web/src/data/roomsData.js';
import { DHAHRAN_OFFICE_ROOMS } from '../web/src/data/dhahranOfficeRooms.js';
import {
  campLabelToSite,
  buildStaticQrToken,
  siteFilterAliases,
  normalizeRoomName,
  roomNameVariants,
  LEGACY_STICKER_TOKENS,
  parseQrLocationKey,
} from './seed.js';
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
    try {
      await pool.query(
        `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)
         ON CONFLICT (token) DO NOTHING`,
        [room.id, token],
      );
      tokensAdded += 1;
    } catch {
      /* ignore */
    }
  }
  return tokensAdded;
}

/**
 * Ensure every inventory key resolves:
 * - Find existing room by site aliases + name (never create duplicates for MGS vs MGS BQ)
 * - Keep ALL existing tokens (printed stickers stay valid)
 * - Add inventory key as an extra active token alias when missing
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

    /** Map normalized "alias::name" → roomId (covers legacy site labels). */
    const byAliasName = new Map();
    for (const row of existingRows) {
      const nName = normalizeRoomName(row.name);
      byAliasName.set(`${String(row.site).toLowerCase()}::${nName}`, row.id);
      for (const alias of siteFilterAliases(row.site)) {
        byAliasName.set(`${String(alias).toLowerCase()}::${nName}`, row.id);
      }
    }

    let created = 0;
    let assetsAdded = 0;
    let tokensAdded = 0;
    let aliasesLinked = 0;

    for (const [key, assets] of entries) {
      const { camp, roomName } = parseLocationKey(key);
      if (!roomName) continue;
      const site = campLabelToSite(camp) || '';
      const nName = normalizeRoomName(roomName);

      let roomId = null;
      for (const alias of siteFilterAliases(camp)) {
        roomId = byAliasName.get(`${String(alias).toLowerCase()}::${nName}`);
        if (roomId) break;
      }
      if (!roomId) {
        roomId = byAliasName.get(`${String(site).toLowerCase()}::${nName}`);
      }

      const isNew = !roomId;
      if (!roomId) {
        const inserted = await client.query(
          `INSERT INTO rooms (department_id, name, site, is_active)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [deptId, roomName, site],
        );
        roomId = inserted.rows[0].id;
        created += 1;
        byAliasName.set(`${String(site).toLowerCase()}::${nName}`, roomId);
        for (const alias of siteFilterAliases(site)) {
          byAliasName.set(`${String(alias).toLowerCase()}::${nName}`, roomId);
        }
      }

      // Never overwrite/deactivate existing tokens — only ADD missing aliases.
      const { rows: tokenHit } = await client.query(
        `SELECT id, room_id, is_active FROM room_qr_tokens
         WHERE LOWER(TRIM(token)) = LOWER(TRIM($1))
         LIMIT 1`,
        [key],
      );
      if (!tokenHit.length) {
        try {
          await client.query(
            `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)`,
            [roomId, key],
          );
          tokensAdded += 1;
          aliasesLinked += 1;
        } catch {
          /* unique race — ignore */
        }
      } else if (tokenHit[0].room_id === roomId && !tokenHit[0].is_active) {
        // Same room, token was deactivated — reactivate so printed sticker works again.
        await client.query(
          `UPDATE room_qr_tokens SET is_active = true WHERE id = $1`,
          [tokenHit[0].id],
        );
        aliasesLinked += 1;
      }
      // If token belongs to a different room, leave it untouched (UNIQUE constraint).

      // Also ensure at least one active token exists for the room.
      const { rows: anyActive } = await client.query(
        `SELECT id FROM room_qr_tokens WHERE room_id = $1 AND is_active = true LIMIT 1`,
        [roomId],
      );
      if (!anyActive.length) {
        try {
          await client.query(
            `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)
             ON CONFLICT (token) DO NOTHING`,
            [roomId, key],
          );
          tokensAdded += 1;
        } catch { /* ignore */ }
      }

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

    return { created, assetsAdded, tokensAdded, aliasesLinked };
  });

  const extraTokens = await ensureMissingTokens(pool);
  result.tokensAdded += extraTokens;

  const legacyLinked = await seedLegacyStickerTokens(pool);
  result.tokensAdded += legacyLinked;

  if (result.created > 0 || result.tokensAdded > 0 || result.assetsAdded > 0) {
    console.log(
      `[seed-inventory] ${result.created} rooms created, ${result.tokensAdded} tokens/aliases, ${result.assetsAdded} assets`,
    );
  } else {
    console.log('[seed-inventory] Inventory rooms already present (tokens preserved)');
  }
  return result;
}

/** Link opaque printed sticker tokens to rooms without changing the sticker payload. */
async function seedLegacyStickerTokens(pool) {
  const entries = Object.entries(LEGACY_STICKER_TOKENS || {});
  if (!entries.length) return 0;
  let linked = 0;
  for (const [token, locationKey] of entries) {
    const parsed = parseQrLocationKey(locationKey);
    if (!parsed?.roomName) continue;
    const aliases = siteFilterAliases(parsed.camp).map((a) => a.toLowerCase());
    const aliasList = aliases.length
      ? aliases
      : [String(campLabelToSite(parsed.camp) || '').toLowerCase()];
    const want = new Set(roomNameVariants(parsed.roomName));
    const { rows } = await pool.query(
      `SELECT id, name FROM rooms
       WHERE is_active = true
         AND LOWER(TRIM(COALESCE(site, ''))) = ANY($1::text[])`,
      [aliasList],
    );
    const room = rows.find((r) => roomNameVariants(r.name).some((v) => want.has(v)));
    if (!room) continue;
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)
         ON CONFLICT (token) DO UPDATE
           SET room_id = EXCLUDED.room_id, is_active = true
         WHERE room_qr_tokens.is_active IS DISTINCT FROM true
            OR room_qr_tokens.room_id IS DISTINCT FROM EXCLUDED.room_id`,
        [room.id, token],
      );
      linked += rowCount;
    } catch {
      /* ignore */
    }
  }
  if (linked > 0) {
    console.log(`[seed-inventory] Linked ${linked} legacy printed sticker token(s)`);
  }
  return linked;
}
