/**
 * Audit every ROOM_DATA / Dhahran office QR key against /api/rooms/resolve.
 * Usage (from repo root, with DATABASE_URL set):
 *   node server/scripts/audit-qr-tokens.js
 *   node server/scripts/audit-qr-tokens.js --base https://your-app.replit.dev
 */
import { ROOM_DATA } from '../../web/src/data/roomsData.js';
import { DHAHRAN_OFFICE_ROOMS } from '../../web/src/data/dhahranOfficeRooms.js';
import { loadEnv } from '../env.js';
import { getPool, initDb } from '../db.js';
import { resolveRoomByToken, campLabelToSite } from '../seed.js';

loadEnv();

const INVENTORY = { ...ROOM_DATA, ...DHAHRAN_OFFICE_ROOMS };

function parseKey(key) {
  const raw = String(key || '').trim();
  const splitAt = raw.indexOf(' - ');
  if (splitAt === -1) return { camp: 'Other', room: raw };
  return { camp: raw.slice(0, splitAt).trim(), room: raw.slice(splitAt + 3).trim() };
}

async function main() {
  const baseArg = process.argv.find((a) => a.startsWith('--base='));
  const baseUrl = baseArg ? baseArg.slice('--base='.length) : null;

  await initDb();
  const db = await getPool();
  if (!db) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const bySite = new Map();
  let ok = 0;
  let fail = 0;
  const failures = [];

  for (const key of Object.keys(INVENTORY)) {
    const { camp } = parseKey(key);
    const site = campLabelToSite(camp) || camp;
    if (!bySite.has(site)) bySite.set(site, { ok: 0, fail: 0, samples: [] });
    const bucket = bySite.get(site);

    const resolved = await resolveRoomByToken(db, key);
    if (resolved?.room?.id) {
      ok += 1;
      bucket.ok += 1;
    } else {
      fail += 1;
      bucket.fail += 1;
      if (bucket.samples.length < 5) bucket.samples.push(key);
      failures.push(key);
    }
  }

  console.log('\n=== QR resolve audit ===');
  console.log(`Total keys: ${ok + fail} | OK: ${ok} | FAIL: ${fail}\n`);
  for (const [site, stats] of [...bySite.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const mark = stats.fail ? 'FAIL' : 'OK  ';
    console.log(`${mark}  ${site.padEnd(22)} ok=${stats.ok} fail=${stats.fail}`);
    if (stats.samples.length) {
      console.log(`       samples: ${stats.samples.join(' | ')}`);
    }
  }

  if (baseUrl) {
    console.log(`\nSample URL: ${baseUrl.replace(/\/$/, '')}/?token=${encodeURIComponent(Object.keys(INVENTORY)[0] || '')}`);
  }

  if (fail) {
    console.log(`\n${fail} QR key(s) do not resolve. Restart with FORCE_SEED_INVENTORY=true or fix site mapping.`);
    process.exit(2);
  }
  console.log('\nAll inventory QR keys resolve to a room.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
