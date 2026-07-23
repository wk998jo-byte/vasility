/**
 * Fetch Twilio message delivery status for recent SIDs.
 * Usage: node server/scripts/check_twilio_message_status.js MM... SM...
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../env.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
loadEnv();

const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const key = (process.env.TWILIO_API_KEY || '').trim();
const secret = (process.env.TWILIO_API_SECRET || '').trim();
const user = key || sid;
const pass = secret || token;
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const sids = process.argv.slice(2);
if (!sids.length) {
  console.error('Pass message SIDs: node check_twilio_message_status.js MM... SM...');
  process.exit(1);
}

for (const messageSid of sids) {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`,
    { headers: { Authorization: auth }, signal: AbortSignal.timeout(30_000) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`\n${messageSid}: HTTP ${res.status}`, JSON.stringify(data));
    continue;
  }
  console.log(`\n${messageSid}`);
  console.log(`  status: ${data.status}`);
  console.log(`  from:   ${data.from}`);
  console.log(`  to:     ${data.to}`);
  console.log(`  error:  ${data.error_code || 0} ${data.error_message || ''}`);
  console.log(`  date:   ${data.date_updated || data.date_sent}`);
}
