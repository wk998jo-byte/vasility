/**
 * Create the SSC admin WhatsApp message template via Meta Graph API
 * (bypasses Meta Business Manager UI bugs).
 *
 * Before running, set these in the project root `.env`:
 *   META_WABA_ID=your_whatsapp_business_account_id
 *   META_ACCESS_TOKEN=your_permanent_or_system_user_token
 *
 * Then run from the project root:
 *   node server/scripts/create_template.js
 *
 * WABA ID is found in Meta Business Suite → WhatsApp Accounts,
 * or Developer Console → WhatsApp → API Setup → WhatsApp Business Account ID.
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../env.js';

// ESM-safe require so dotenv works with "type": "module"
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root, then bypass corporate SSL inspection
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Fallback loader (fills any blanks dotenv did not set)
loadEnv();

async function createAdminAlertTemplate() {
  const accessToken = (process.env.META_ACCESS_TOKEN || '').trim();
  const wabaId = (process.env.META_WABA_ID || '').trim();

  if (!accessToken || !wabaId) {
    console.error(
      '[create_template] Missing META_ACCESS_TOKEN or META_WABA_ID in .env.\n'
      + 'Add both, save the file, then re-run: node server/scripts/create_template.js',
    );
    process.exitCode = 1;
    return;
  }

  // Exact payload for the Arabic admin alert template (with samples for review)
  const payload = {
    name: 'ssc_ticket_admin_alert',
    category: 'UTILITY',
    language: 'ar',
    components: [
      {
        type: 'BODY',
        text: 'تنبيه للإدارة \nيوجد طلب صيانة جديد برقم: {{1}}\nالتفاصيل: {{2}}\nيرجى مراجعة لوحة تحكم FMC.',
        example: {
          body_text: [
            ['FMC-2026-0001', 'MANAGERS ROOM - PC - Leaking'],
          ],
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/v17.0/${wabaId}/message_templates`;

  console.log('[create_template] Creating template ssc_ticket_admin_alert (ar / UTILITY)…');
  console.log('[create_template] POST', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[create_template] Meta API rejected the template:');
      console.error(JSON.stringify(data, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log('[create_template] Success — template submitted to Meta:');
    console.log(JSON.stringify(data, null, 2));
    console.log(
      '[create_template] Check status in Meta Business Manager → WhatsApp → Message templates.\n'
      + 'Once status is APPROVED, admin alerts in FMC will use ssc_ticket_admin_alert.',
    );
  } catch (error) {
    console.error('[create_template] FATAL:', error.message, error.cause);
    process.exitCode = 1;
  }
}

createAdminAlertTemplate();
