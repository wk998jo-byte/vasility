import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateQrToken } from './seed.js';
import { withTransaction } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Idempotently seed the Bin Quraya camp locations (A/B/C blocks, mess hall,
 * gym halls, laundries) with their per-room asset lists from
 * camp-rooms-data.json. Safe to run on every server start — including in
 * production, where it populates the database on first publish.
 *
 * Self-healing: each room is created/completed inside its own transaction —
 * if a previous start crashed mid-room, the next start ensures the room has
 * an active QR token and all of its assets.
 */
export async function seedCampRooms(pool) {
  const dataPath = path.join(__dirname, 'camp-rooms-data.json');
  if (!fs.existsSync(dataPath)) return { created: 0, completed: 0, skipped: 0 };
  const rooms = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const { rows: deptRows } = await pool.query(
    `SELECT id FROM departments WHERE code = 'FAC' LIMIT 1`,
  );
  if (!deptRows.length) {
    console.warn('[seed-camp] FAC department not found — skipping camp rooms seed');
    return { created: 0, completed: 0, skipped: 0 };
  }
  const deptId = deptRows[0].id;

  let created = 0;
  let completed = 0;
  let skipped = 0;

  for (const room of rooms) {
    await withTransaction(pool, async (client) => {
      // Ensure the room row exists (unique on department_id + name).
      const { rows: [inserted] } = await client.query(
        `INSERT INTO rooms (department_id, name, floor, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (department_id, name) DO NOTHING
         RETURNING id`,
        [deptId, room.name, room.floor || null],
      );
      let roomId = inserted?.id;
      const isNew = Boolean(roomId);
      if (!roomId) {
        const { rows } = await client.query(
          'SELECT id FROM rooms WHERE department_id = $1 AND name = $2',
          [deptId, room.name],
        );
        roomId = rows[0].id;
      }

      let touched = false;

      // Ensure an active QR token exists.
      const { rows: tokenRows } = await client.query(
        'SELECT 1 FROM room_qr_tokens WHERE room_id = $1 AND is_active = true LIMIT 1',
        [roomId],
      );
      if (!tokenRows.length) {
        await client.query(
          `INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)`,
          [roomId, generateQrToken()],
        );
        touched = true;
      }

      // Ensure all listed assets exist (insert only the missing ones).
      const assets = room.assets || [];
      if (assets.length) {
        const { rows: existingAssets } = await client.query(
          'SELECT name FROM room_assets WHERE room_id = $1',
          [roomId],
        );
        const have = new Set(existingAssets.map((r) => r.name));
        for (const asset of assets) {
          if (have.has(asset)) continue;
          await client.query(
            'INSERT INTO room_assets (room_id, name) VALUES ($1, $2)',
            [roomId, asset],
          );
          touched = true;
        }
      }

      if (isNew) created += 1;
      else if (touched) completed += 1;
      else skipped += 1;
    });
  }

  if (created > 0 || completed > 0) {
    console.log(
      `[seed-camp] Camp rooms: ${created} created, ${completed} repaired, ${skipped} already complete`,
    );
  }

  // Integrity check: surface any seeded room left without an active token.
  const { rows: [{ missing }] } = await pool.query(
    `SELECT COUNT(*)::int AS missing
     FROM rooms r
     WHERE r.department_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM room_qr_tokens t WHERE t.room_id = r.id AND t.is_active = true
       )`,
    [deptId],
  );
  if (missing > 0) {
    console.warn(`[seed-camp] WARNING: ${missing} room(s) have no active QR token`);
  }

  return { created, completed, skipped };
}
