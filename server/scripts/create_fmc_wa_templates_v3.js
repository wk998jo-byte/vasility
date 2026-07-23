/**
 * Create Meta-compliant FMC WhatsApp templates (variables never at start/end).
 * Usage: node server/scripts/create_fmc_wa_templates_v3.js
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
const tok = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const auth = `Basic ${Buffer.from(`${sid}:${tok}`).toString('base64')}`;

const TEMPLATES = [
  {
    envKey: 'TWILIO_TEMPLATE_WELCOME',
    friendly_name: 'fmc_welcome_v3',
    approval_name: 'fmc_welcome_v3',
    language: 'en',
    variables: { 1: 'FMC-2026-0040' },
    body:
      'Welcome to Facility Maintenance Center (FMC).\n'
      + 'Your maintenance request number is {{1}}.\n'
      + 'Our team is reviewing your request and will contact you shortly.',
  },
  {
    envKey: 'TWILIO_TEMPLATE_ADMIN',
    friendly_name: 'fmc_admin_alert_v3',
    approval_name: 'fmc_admin_alert_v3',
    language: 'en',
    variables: { 1: 'FMC-2026-0040', 2: 'B-04-A — Fire extinguisher — Other' },
    body:
      'Alert: A new maintenance ticket was created in Facility Maintenance Center (FMC).\n'
      + 'Ticket number: {{1}}\n'
      + 'Details: {{2}}\n'
      + 'Please review and follow up in the FMC dashboard.',
  },
  {
    envKey: 'TWILIO_TEMPLATE_DONE',
    friendly_name: 'fmc_done_v3',
    approval_name: 'fmc_done_v3',
    language: 'en',
    variables: { 1: 'FMC-2026-0040' },
    body:
      'Hello, your FMC maintenance request {{1}} has been completed.\n'
      + 'Thank you for using Facility Maintenance Center.',
  },
  {
    envKey: null,
    friendly_name: 'fmc_welcome_v3_ar',
    approval_name: 'fmc_welcome_v3_ar',
    language: 'ar',
    variables: { 1: 'FMC-2026-0040' },
    body:
      'مرحباً بك في مركز صيانة المرافق FMC.\n'
      + 'رقم طلب الصيانة الخاص بك هو {{1}}.\n'
      + 'فريقنا الفني يقوم بمراجعة الطلب وسيتواصل معك قريباً.',
  },
  {
    envKey: null,
    friendly_name: 'fmc_admin_alert_v3_ar',
    approval_name: 'fmc_admin_alert_v3_ar',
    language: 'ar',
    variables: { 1: 'FMC-2026-0040', 2: 'B-04-A — طفاية حريق — أخرى' },
    body:
      'تنبيه: تذكرة صيانة جديدة في مركز صيانة المرافق FMC.\n'
      + 'رقم التذكرة: {{1}}\n'
      + 'التفاصيل: {{2}}\n'
      + 'يرجى المراجعة والمتابعة في لوحة تحكم FMC.',
  },
  {
    envKey: null,
    friendly_name: 'fmc_done_v3_ar',
    approval_name: 'fmc_done_v3_ar',
    language: 'ar',
    variables: { 1: 'FMC-2026-0040' },
    body:
      'مرحباً، تم الانتهاء من طلب الصيانة رقم {{1}}.\n'
      + 'شكراً لاستخدامك مركز صيانة المرافق FMC.',
  },
];

async function twilioJson(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const results = [];
  for (const tpl of TEMPLATES) {
    console.log(`→ ${tpl.friendly_name} (${tpl.language})`);
    const created = await twilioJson('https://content.twilio.com/v1/Content', {
      method: 'POST',
      body: {
        friendly_name: tpl.friendly_name,
        language: tpl.language,
        variables: tpl.variables,
        types: { 'twilio/text': { body: tpl.body } },
      },
    });
    if (!created.ok || !created.data.sid) {
      console.error('  create FAIL', JSON.stringify(created.data));
      results.push({ ...tpl, error: created.data });
      continue;
    }
    const contentSid = created.data.sid;
    console.log(`  SID ${contentSid}`);
    const approval = await twilioJson(
      `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
      { method: 'POST', body: { name: tpl.approval_name, category: 'UTILITY' } },
    );
    console.log(`  approval: ${approval.data.status || JSON.stringify(approval.data)}`);
    results.push({
      envKey: tpl.envKey,
      friendly_name: tpl.friendly_name,
      language: tpl.language,
      sid: contentSid,
      approval: approval.data.status || approval.data,
    });
  }

  console.log('\n========== .env (English primary) ==========');
  for (const r of results.filter((x) => x.envKey && x.sid)) {
    console.log(`${r.envKey}=${r.sid}`);
  }
  console.log('\nArabic optional:');
  for (const r of results.filter((x) => !x.envKey && x.sid)) {
    console.log(`${r.friendly_name}=${r.sid}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
