/**
 * Create FMC WhatsApp templates via Twilio Content API and submit for Meta approval.
 *
 * Usage (from project root):
 *   node server/scripts/create_twilio_whatsapp_templates.js
 *
 * Requires TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (or API key/secret) in .env
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

const ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const API_KEY = (process.env.TWILIO_API_KEY || '').trim();
const API_SECRET = (process.env.TWILIO_API_SECRET || '').trim();

const authUser = API_KEY || ACCOUNT_SID;
const authPass = API_SECRET || AUTH_TOKEN;

if (!authUser || !authPass) {
  console.error('[templates] Missing Twilio credentials in .env');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${authUser}:${authPass}`).toString('base64')}`;

const TEMPLATES = [
  {
    envKey: 'TWILIO_TEMPLATE_WELCOME',
    friendly_name: 'fmc_ticket_welcome_ar',
    approval_name: 'fmc_ticket_welcome_ar',
    language: 'ar',
    variables: { 1: 'FMC-2026-0045' },
    body:
      'مرحباً بك في مركز صيانة المرافق FMC.\n'
      + 'تم استلام طلب الصيانة الخاص بك بنجاح برقم: {{1}}.\n'
      + 'فريقنا الفني يقوم بمراجعة الطلب وسيتواصل معك قريباً.',
  },
  {
    envKey: null,
    friendly_name: 'fmc_ticket_welcome_en',
    approval_name: 'fmc_ticket_welcome_en',
    language: 'en',
    variables: { 1: 'FMC-2026-0045' },
    body:
      'Welcome to Facility Maintenance Center (FMC).\n'
      + 'Your maintenance request has been received successfully. Ticket number: {{1}}.\n'
      + 'Our team is reviewing your request and will contact you shortly.',
  },
  {
    envKey: 'TWILIO_TEMPLATE_ADMIN',
    friendly_name: 'fmc_ticket_admin_alert_ar',
    approval_name: 'fmc_ticket_admin_alert_ar',
    language: 'ar',
    variables: { 1: 'FMC-2026-0045', 2: 'Camp A — AC not cooling' },
    body:
      'تنبيه: تذكرة صيانة جديدة في مركز صيانة المرافق FMC.\n'
      + 'رقم التذكرة: {{1}}\n'
      + 'التفاصيل: {{2}}\n'
      + 'يرجى المراجعة والمتابعة.',
  },
  {
    envKey: null,
    friendly_name: 'fmc_ticket_admin_alert_en',
    approval_name: 'fmc_ticket_admin_alert_en',
    language: 'en',
    variables: { 1: 'FMC-2026-0045', 2: 'Camp A — AC not cooling' },
    body:
      'Alert: A new maintenance ticket was created in Facility Maintenance Center (FMC).\n'
      + 'Ticket number: {{1}}\n'
      + 'Details: {{2}}\n'
      + 'Please review and follow up.',
  },
  {
    envKey: 'TWILIO_TEMPLATE_DONE',
    friendly_name: 'fmc_ticket_done_ar',
    approval_name: 'fmc_ticket_done_ar',
    language: 'ar',
    variables: { 1: 'FMC-2026-0045' },
    body:
      'مرحباً، تم الانتهاء من طلب الصيانة الخاص بك رقم {{1}}.\n'
      + 'شكراً لاستخدامك مركز صيانة المرافق FMC.',
  },
  {
    envKey: null,
    friendly_name: 'fmc_ticket_done_en',
    approval_name: 'fmc_ticket_done_en',
    language: 'en',
    variables: { 1: 'FMC-2026-0045' },
    body:
      'Hello, your maintenance request {{1}} has been completed.\n'
      + 'Thank you for using Facility Maintenance Center (FMC).',
  },
];

async function twilioJson(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function createContent(tpl) {
  return twilioJson('https://content.twilio.com/v1/Content', {
    method: 'POST',
    body: {
      friendly_name: tpl.friendly_name,
      language: tpl.language,
      variables: tpl.variables,
      types: {
        'twilio/text': { body: tpl.body },
      },
    },
  });
}

async function submitWhatsAppApproval(sid, name) {
  return twilioJson(
    `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`,
    {
      method: 'POST',
      body: {
        name,
        category: 'UTILITY',
      },
    },
  );
}

async function main() {
  console.log('[templates] Creating 6 WhatsApp templates (AR + EN) via Twilio…\n');
  const results = [];

  for (const tpl of TEMPLATES) {
    console.log(`→ Creating ${tpl.friendly_name} (${tpl.language})…`);
    const created = await createContent(tpl);
    if (!created.ok) {
      console.error('  FAIL create:', JSON.stringify(created.data, null, 2));
      results.push({ ...tpl, error: created.data });
      continue;
    }

    const sid = created.data.sid;
    console.log(`  Created SID: ${sid}`);

    console.log(`  Submitting for WhatsApp approval as "${tpl.approval_name}"…`);
    const approval = await submitWhatsAppApproval(sid, tpl.approval_name);
    if (!approval.ok) {
      console.error('  FAIL approval:', JSON.stringify(approval.data, null, 2));
      results.push({ ...tpl, sid, approvalError: approval.data });
      continue;
    }

    console.log(`  Approval status: ${approval.data.status || 'submitted'}`);
    results.push({
      friendly_name: tpl.friendly_name,
      language: tpl.language,
      envKey: tpl.envKey,
      sid,
      approval: approval.data,
    });
    console.log('');
  }

  console.log('\n========== SUMMARY ==========');
  for (const r of results) {
    if (r.sid) {
      const tag = r.envKey ? `  → set ${r.envKey}=${r.sid}` : '';
      console.log(`${r.friendly_name}: ${r.sid}${tag}`);
    } else {
      console.log(`${r.friendly_name}: FAILED`);
    }
  }

  const envUpdates = results.filter((r) => r.envKey && r.sid);
  if (envUpdates.length) {
    console.log('\nArabic SIDs for .env:');
    for (const r of envUpdates) {
      console.log(`${r.envKey}=${r.sid}`);
    }
  }

  console.log(
    '\nCheck status in Twilio Console → Messaging → Content Template Builder.\n'
    + 'Meta usually approves UTILITY templates within minutes to 1 business day.',
  );
}

main().catch((err) => {
  console.error('[templates] FATAL:', err.message);
  process.exit(1);
});
