import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStaticQrToken } from './seed.js';
import { withTransaction } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Idempotently seed the Bin Quraya camp locations (A/B/C blocks, mess hall,
 * gym halls, laundries) with their per-room asset lists from
 * camp-rooms-data.json. Safe to run on every server start — including in
 * production, where it populates the database on first publish.
 *
 * Uses a handful of bulk statements (set-based inserts with ON CONFLICT /
 * anti-joins) inside one transaction so startup stays fast even against a
 * remote production database. Self-healing: missing tokens or assets for
 * previously-created rooms are filled in on the next start.
 */
export async function seedCampRooms(pool) {
  const dataPath = path.join(__dirname, 'camp-rooms-data.json');
  if (!fs.existsSync(dataPath)) return { created: 0 };
  const rooms = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!rooms.length) return { created: 0 };

  const { rows: deptRows } = await pool.query(
    `SELECT id FROM departments WHERE code = 'FAC' LIMIT 1`,
  );
  let deptId;
  if (!deptRows.length) {
    const inserted = await pool.query(
      `INSERT INTO departments (code, name_en, name_ar, is_active)
       VALUES ('FAC', 'Facilities', 'المرافق', true)
       ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en
       RETURNING id`,
    );
    deptId = inserted.rows[0].id;
    console.log('[seed-camp] Created FAC department');
  } else {
    deptId = deptRows[0].id;
  }

  const names = rooms.map((r) => r.name);
  const floors = rooms.map((r) => r.floor || null);

  // Flatten (roomName, assetName) pairs for the bulk asset insert.
  const assetRoomNames = [];
  const assetNames = [];
  for (const room of rooms) {
    for (const asset of room.assets || []) {
      assetRoomNames.push(room.name);
      assetNames.push(asset);
    }
  }

  const result = await withTransaction(pool, async (client) => {
    // 1. Ensure all rooms exist (skip ones already present).
    const { rowCount: created } = await client.query(
      `INSERT INTO rooms (department_id, name, floor, site, is_active)
       SELECT $1, t.name, t.floor, 'MGS', true
       FROM unnest($2::text[], $3::text[]) AS t(name, floor)
       WHERE NOT EXISTS (
         SELECT 1 FROM rooms r
         WHERE r.department_id = $1
           AND COALESCE(r.site, '') = 'MGS'
           AND r.name = t.name
       )`,
      [deptId, names, floors],
    );

    // Ensure site stays MGS for camp rooms (covers older rows seeded without site).
    await client.query(
      `UPDATE rooms SET site = 'MGS'
       WHERE department_id = $1 AND name = ANY($2::text[])
         AND (site IS NULL OR site = '' OR site = 'Dhahran')`,
      [deptId, names],
    );

    // 2. Find seeded rooms that lack an active QR token.
    const { rows: tokenless } = await client.query(
      `SELECT r.id, r.name, r.site
       FROM rooms r
       WHERE r.department_id = $1
         AND r.name = ANY($2::text[])
         AND NOT EXISTS (
           SELECT 1 FROM room_qr_tokens t WHERE t.room_id = r.id AND t.is_active = true
         )`,
      [deptId, names],
    );
    if (tokenless.length) {
      const ids = tokenless.map((r) => r.id);
      const tokens = tokenless.map((r) => buildStaticQrToken(r.site, r.name));
      await client.query(
        `INSERT INTO room_qr_tokens (room_id, token, is_active)
         SELECT t.room_id::uuid, t.token, true
         FROM unnest($1::uuid[], $2::text[]) AS t(room_id, token)`,
        [ids, tokens],
      );
    }

    // 3. Insert any missing assets for the seeded rooms.
    let assetsAdded = 0;
    if (assetNames.length) {
      const { rowCount } = await client.query(
        `INSERT INTO room_assets (room_id, name)
         SELECT r.id, t.asset
         FROM unnest($2::text[], $3::text[]) AS t(room_name, asset)
         JOIN rooms r ON r.department_id = $1 AND r.name = t.room_name
         WHERE NOT EXISTS (
           SELECT 1 FROM room_assets ra WHERE ra.room_id = r.id AND ra.name = t.asset
         )`,
        [deptId, assetRoomNames, assetNames],
      );
      assetsAdded = rowCount;
    }

    return { created, tokensAdded: tokenless.length, assetsAdded };
  });

  if (result.created > 0 || result.tokensAdded > 0 || result.assetsAdded > 0) {
    console.log(
      `[seed-camp] Camp rooms: ${result.created} created, ${result.tokensAdded} tokens added, ${result.assetsAdded} assets added`,
    );
  }
  return result;
}
