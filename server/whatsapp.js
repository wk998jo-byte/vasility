/**
 * WhatsApp + SMS notifications via Twilio.
 *
 * WhatsApp (Content templates):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID
 *   TWILIO_TEMPLATE_WELCOME / ADMIN / DONE
 *
 * SMS (plain body):
 *   TWILIO_PHONE_NUMBER_SID (PN…) and/or TWILIO_SMS_NUMBER (+E.164)
 */

import { createRequire } from 'module';
import { loadEnv } from './env.js';

loadEnv();

// Bypass local Windows SSL/Proxy inspection for Twilio requests
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
const twilio = require('twilio');

if (!(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim()) {
  console.warn('[WARNING] TWILIO_MESSAGING_SERVICE_SID is missing from the environment variables.');
}

let twilioClient = null;
let cachedSmsFrom = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const apiKey = (process.env.TWILIO_API_KEY || '').trim();
  const apiSecret = (process.env.TWILIO_API_SECRET || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();

  if (apiKey && apiSecret && accountSid) {
    twilioClient = twilio(apiKey, apiSecret, { accountSid });
  } else {
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/** Keep digits only so "+966 50 123 4567" and "0096650..." style variants match. */
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
}

/**
 * Strict WhatsApp E.164 formatting for Saudi / international numbers.
 */
export function formatWhatsAppPhone(phone) {
  let raw = String(phone || '').trim();
  if (!raw) return '';

  raw = raw.replace(/whatsapp:/gi, '').trim();

  const plusParts = raw.replace(/[^\d+]/g, '').split('+').filter(Boolean);
  if (plusParts.length > 1) {
    raw = plusParts[plusParts.length - 1];
  }

  if (/^\+966[\d\s-]+$/.test(raw)) {
    return `+${normalizePhone(raw)}`;
  }

  const digits = normalizePhone(raw);

  if (digits.startsWith('05')) {
    return `+966${digits.slice(1)}`;
  }
  if (digits.startsWith('966')) {
    return `+${digits}`;
  }
  if (digits.startsWith('00')) {
    return `+${digits.slice(2)}`;
  }
  if (digits.startsWith('5') && digits.length === 9) {
    return `+966${digits}`;
  }
  if (!digits) return '';
  return `+${digits}`;
}

function messagingServiceSid() {
  return (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim().replace(/^whatsapp:/i, '');
}

/**
 * Working Meta-approved Content SIDs for WhatsApp sender +15739201367.
 * Replit Secrets often keep stale HX… values that fail with 63027 — these defaults win
 * when env is empty or points at a known-broken template.
 */
const DEFAULT_CONTENT_SIDS = {
  welcome: 'HX6e9593b826b3e3a2ab3d3b2e64589c18',
  admin: 'HX5ac827c6ea10ff3114d5602d575f7d67',
  done: 'HXbd1985f4517e39cd2993d3f250fea082',
};

const BROKEN_CONTENT_SIDS = new Set([
  'HX8aaa173e0ba33a1e1c70a86d30145760',
  'HX25116fe96cb6108b3d0cf15ae0976c61',
  'HX9987669bbd573aef9e2b262e0885ee65',
  'HXedd8ac15e8550aa79632a21952975979',
  'HXd949820e6285392ff22e530e4916576d',
  'HXde6c9601982c421afb35e4eddc1ddbbc',
  'HXf825e099272ac519a3ba5e3fa4874f1a',
  'HX2b69ca2ce94e62a45418349217067770',
  'HXf4924771f61551f63c36abcc4cdb3eef',
  'HX10af1e421f41ffe5b686d51cddf58c03',
  'HX73f31b62d0b77fab0bd8e29798fc4399',
  'HX7c245fc8b58f513dd9f00ae8e66bdb4b',
]);

function resolveContentSid(role) {
  const envKey = role === 'admin'
    ? 'TWILIO_TEMPLATE_ADMIN'
    : role === 'done'
      ? 'TWILIO_TEMPLATE_DONE'
      : 'TWILIO_TEMPLATE_WELCOME';
  const fallbackKey = role === 'done' ? 'TWILIO_TEMPLATE_SID' : '';
  const fromEnv = (process.env[envKey] || (fallbackKey ? process.env[fallbackKey] : '') || '').trim();
  const defaults = DEFAULT_CONTENT_SIDS[role === 'admin' ? 'admin' : role === 'done' ? 'done' : 'welcome'];

  if (!fromEnv) return defaults;
  if (BROKEN_CONTENT_SIDS.has(fromEnv) || fromEnv === defaults) {
    if (BROKEN_CONTENT_SIDS.has(fromEnv)) {
      console.warn(`[whatsapp] Ignoring broken ${envKey}=${fromEnv} → using ${defaults}`);
    }
    return defaults;
  }
  return fromEnv;
}

function toStrictE164(phone) {
  const e164 = formatWhatsAppPhone(phone);
  const digits = String(e164 || phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

async function resolveSmsFromNumber() {
  // Preferred for KSA: Alphanumeric Sender ID (e.g. FMC / BinQuraya) — pre-register in Twilio Trust Hub
  const alpha = (process.env.TWILIO_SMS_ALPHA_SENDER || process.env.TWILIO_ALPHANUMERIC_SENDER || '').trim();
  if (alpha) {
    cachedSmsFrom = alpha.replace(/^whatsapp:/i, '').slice(0, 11);
    return cachedSmsFrom;
  }

  const explicit = (process.env.TWILIO_SMS_NUMBER || '').trim().replace(/^whatsapp:/i, '');
  if (explicit) {
    // If it's letters (alpha sender stored in SMS_NUMBER), keep as-is; else force E.164
    if (/[A-Za-z]/.test(explicit)) {
      cachedSmsFrom = explicit.slice(0, 11);
      return cachedSmsFrom;
    }
    cachedSmsFrom = toStrictE164(explicit);
    return cachedSmsFrom;
  }
  if (cachedSmsFrom) return cachedSmsFrom;

  const pnSid = (process.env.TWILIO_PHONE_NUMBER_SID || '').trim();
  if (!pnSid) return '';

  try {
    const client = getTwilioClient();
    const num = await client.incomingPhoneNumbers(pnSid).fetch();
    cachedSmsFrom = toStrictE164(num.phoneNumber || '');
    if (cachedSmsFrom) {
      process.env.TWILIO_SMS_NUMBER = cachedSmsFrom;
      console.log(`[sms] Resolved TWILIO_PHONE_NUMBER_SID → ${cachedSmsFrom}`);
    }
    return cachedSmsFrom;
  } catch (err) {
    console.error('[sms] Failed to resolve phone number SID:', err.message);
    return '';
  }
}

/** Call after loadEnv() on server boot. */
export function checkTwilioConfig() {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const apiKey = (process.env.TWILIO_API_KEY || '').trim();
  const fromWa = (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '').trim();
  if (!sid || (!token && !apiKey)) {
    console.warn('[WARNING] Twilio credentials missing. Alerts are disabled.');
    return false;
  }
  if (!fromWa && !messagingServiceSid()) {
    console.warn('[WARNING] Set TWILIO_WHATSAPP_NUMBER or TWILIO_MESSAGING_SERVICE_SID — WhatsApp alerts disabled.');
    return false;
  }
  console.log('[whatsapp] Twilio Content API templates configured — WhatsApp alerts enabled.');
  if (fromWa) console.log(`[whatsapp] From sender: ${fromWa}`);
  console.log(`[whatsapp] templates welcome=${resolveContentSid('welcome')} admin=${resolveContentSid('admin')} done=${resolveContentSid('done')}`);
  if (messagingServiceSid()) {
    console.log(`[sms] MessagingServiceSid=${messagingServiceSid()}`);
  }

  resolveSmsFromNumber()
    .then((from) => {
      if (from) console.log(`[sms] Fallback SMS From available: ${from}`);
    })
    .catch(() => {});

  return true;
}

/**
 * Plain SMS via Twilio — same pattern as Twilio Console test:
 *   MessagingServiceSid + To (E.164) + Body  (no whatsapp: prefix)
 *
 * Ensure Phone Number PN… / +1573… is in the Messaging Service Sender Pool.
 *
 * @param {string} phone
 * @param {string} ticketId
 * @param {'user'|'welcome'|'admin'|'done'} role
 * @param {string} extraDetails
 */
export async function sendSMSNotification(phone, ticketId, role = 'user', extraDetails = '') {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID) {
      console.warn('[sms] Twilio credentials missing');
      return { sent: false, skipped: true, reason: 'twilio-not-configured' };
    }

    const raw = String(phone || '').trim();
    const id = String(ticketId || '').trim();
    if (!raw || !id) {
      return { sent: false, skipped: true, reason: !raw ? 'no-phone' : 'no-ticket-id' };
    }

    // To must be E.164 only — e.g. +966580814770 or Twilio Virtual Phone +18777804236
    const to = toStrictE164(raw);
    if (!to || !/^\+[1-9]\d{7,14}$/.test(to)) {
      console.error('[sms] invalid To after sanitize (need E.164):', phone, '→', to);
      return { sent: false, skipped: true, reason: 'invalid-phone' };
    }

    // Skip SMS to Saudi Arabia unless alphanumeric sender is configured (avoids 21612).
    if (to.startsWith('+966') && !(process.env.TWILIO_SMS_ALPHA_SENDER || '').trim()) {
      console.warn(`[sms] skipped +966 ${to} — set TWILIO_SMS_ALPHA_SENDER (e.g. FMC) after Meta/Twilio pre-registration`);
      return { sent: false, skipped: true, reason: 'saudi-needs-alpha-sender' };
    }

    let body = '';
    if (role === 'admin') {
      body = `SSC OS Alert: New Ticket [${id}]. Details: ${extraDetails || 'No details'}`;
    } else if (role === 'done') {
      body = `SSC OS: Your ticket [${id}] has been completed. Thank you for using FMC.`;
    } else {
      body = `SSC OS: Your maintenance request [${id}] has been received successfully.`;
    }

    const client = getTwilioClient();
    const mgSid = messagingServiceSid();
    const alpha = (process.env.TWILIO_SMS_ALPHA_SENDER || '').trim();
    const payload = { body, to };

    if (alpha && to.startsWith('+966')) {
      payload.from = alpha.replace(/[^A-Za-z0-9]/g, '').slice(0, 11);
      console.log(`[sms] Sending From=${payload.from} (alpha) To=${to}`);
    } else if (mgSid) {
      payload.messagingServiceSid = mgSid;
      console.log(`[sms] Sending MessagingServiceSid=${mgSid} To=${to}`);
    } else {
      const fromRaw = await resolveSmsFromNumber();
      if (!fromRaw) {
        console.warn('[sms] skipped — need TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_NUMBER');
        return { sent: false, skipped: true, reason: 'sms-from-missing' };
      }
      const fromIsAlpha = /[A-Za-z]/.test(fromRaw);
      payload.from = fromIsAlpha
        ? String(fromRaw).replace(/[^A-Za-z0-9]/g, '').slice(0, 11)
        : toStrictE164(fromRaw);
      console.log(`[sms] Sending From=${payload.from} To=${to}`);
    }

    const response = await client.messages.create(payload);

    console.log(`[sms] Successfully sent to ${to} | SID: ${response.sid}`);
    return { sent: true, provider: 'twilio-sms', sid: response.sid };
  } catch (error) {
    console.error(`[sms] FATAL ERROR sending to ${phone}:`, error.message);
    console.error('Error Code:', error.code);
    console.error('More Info URL:', error.moreInfo);
    return { sent: false, error: error?.message || String(error), code: error?.code };
  }
}

/**
 * Send WhatsApp via Twilio Content templates (no freeform body).
 * Also fires SMS in parallel when SMS From is configured.
 *
 * @param {string} phone
 * @param {string} ticketId
 * @param {'user'|'welcome'|'admin'|'done'} role
 * @param {string} extraDetails
 */
export async function sendWhatsAppNotification(phone, ticketId, role = 'user', extraDetails = '') {
  const smsPromise = sendSMSNotification(phone, ticketId, role, extraDetails)
    .catch((err) => {
      console.error('[sms] parallel send failed:', err?.message || err);
      return { sent: false, error: err?.message || String(err) };
    });

  let waResult;
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || (!process.env.TWILIO_AUTH_TOKEN && !process.env.TWILIO_API_KEY)) {
      console.warn('[whatsapp] Twilio credentials missing');
      waResult = { sent: false, skipped: true, reason: 'twilio-not-configured' };
    } else if (!(process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || messagingServiceSid())) {
      console.warn('[whatsapp] TWILIO_WHATSAPP_NUMBER / Messaging Service missing');
      waResult = { sent: false, skipped: true, reason: 'twilio-not-configured' };
    } else {
      const raw = String(phone || '').trim();
      const id = String(ticketId || '').trim();
      if (!raw || !id) {
        waResult = { sent: false, skipped: true, reason: !raw ? 'no-phone' : 'no-ticket-id' };
      } else {
        const e164 = formatWhatsAppPhone(raw);
        const cleanPhone = String(e164 || raw).replace(/[^\d+]/g, '');
        const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
        if (!formattedPhone || formattedPhone === '+') {
          console.error('[whatsapp] invalid phone after sanitize:', phone);
          waResult = { sent: false, skipped: true, reason: 'invalid-phone' };
        } else {
          const targetWhatsapp = `whatsapp:${formattedPhone}`;

          let contentSid = '';
          let contentVariables = '';

          if (role === 'admin') {
            contentSid = resolveContentSid('admin');
            contentVariables = JSON.stringify({
              1: String(ticketId),
              2: String(extraDetails || 'No details'),
            });
          } else if (role === 'done') {
            contentSid = resolveContentSid('done');
            contentVariables = JSON.stringify({
              1: String(ticketId),
            });
          } else {
            contentSid = resolveContentSid('welcome');
            contentVariables = JSON.stringify({
              1: String(ticketId),
            });
          }

          console.log(`[whatsapp] role=${role} contentSid=${contentSid}`);

          if (!contentSid) {
            console.error(`[whatsapp] missing contentSid for role=${role}`);
            waResult = { sent: false, error: 'missing-content-sid' };
          } else {
            const client = getTwilioClient();
            const fromWa = (process.env.TWILIO_WHATSAPP_NUMBER || '').trim();
            // Prefer explicit WhatsApp From. Do not mix MG + From for WA — MG pool is SMS-only
            // for +1573 and can cause template sends to degrade to freeform (63016).
            const waPayload = {
              to: targetWhatsapp,
              contentSid,
              contentVariables,
            };
            if (fromWa) {
              waPayload.from = fromWa;
            } else if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
              waPayload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
            } else {
              console.error('[whatsapp] missing TWILIO_WHATSAPP_NUMBER and Messaging Service');
              waResult = { sent: false, error: 'whatsapp-from-missing' };
              // fall through — smsPromise still awaited below
            }

            if (!waResult) {
            const response = await client.messages.create(waPayload);

            // API accept ≠ delivery. Poll for terminal status (undelivered can arrive after "sent").
            let delivery = response.status;
            let errorCode = response.errorCode || null;
            let errorMessage = response.errorMessage || null;
            for (const waitMs of [3000, 5000]) {
              try {
                await new Promise((r) => setTimeout(r, waitMs));
                const check = await client.messages(response.sid).fetch();
                delivery = check.status;
                errorCode = check.errorCode || null;
                errorMessage = check.errorMessage || null;
                if (['delivered', 'read', 'failed', 'undelivered', 'canceled'].includes(delivery)) break;
              } catch (_) { /* ignore poll errors */ }
            }

            const deliveredOk = ['delivered', 'read'].includes(delivery)
              || (['queued', 'sending', 'sent'].includes(delivery) && !errorCode);
            if (deliveredOk) {
              console.log(`[whatsapp] OK from ${fromWa || 'MG-pool'} to ${targetWhatsapp} | SID: ${response.sid} | status: ${delivery}`);
              waResult = { sent: true, provider: 'twilio', sid: response.sid, status: delivery };
            } else {
              console.error(`[whatsapp] DELIVERY FAILED to ${targetWhatsapp} | SID: ${response.sid} | status: ${delivery} | error: ${errorCode} ${errorMessage || ''}`);
              waResult = {
                sent: false,
                provider: 'twilio',
                sid: response.sid,
                status: delivery,
                error: errorMessage || `twilio-${errorCode || delivery}`,
                code: errorCode,
              };
            }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`[whatsapp] FATAL ERROR sending to ${phone}:`, error.message);
    console.error('Error Code:', error.code);
    console.error('More Info URL:', error.moreInfo);
    waResult = { sent: false, error: error?.message || String(error), code: error?.code };
  }

  const smsResult = await smsPromise;
  return { ...waResult, sms: smsResult };
}

/** Welcome template to the ticket reporter (+ SMS). */
export async function sendWhatsAppWelcome(phone, ticketNumber) {
  console.log('\n--- TWILIO DEBUG: WELCOME (reporter) ---');
  return sendWhatsAppNotification(phone, ticketNumber, 'welcome');
}

/** Admin alert when a new ticket is created (+ SMS). */
export async function sendWhatsAppAdminAlert(ticketNumber, details, phone) {
  const adminPhone = (phone || process.env.ADMIN_WHATSAPP || '').trim();
  if (!adminPhone) return { sent: false, skipped: true, reason: 'no-admin-phone' };
  return sendWhatsAppNotification(adminPhone, ticketNumber, 'admin', String(details || '').slice(0, 200));
}

/** New-ticket alert for admins/sub-admins (RBAC fan-out) (+ SMS). */
export async function sendWhatsAppNewTicketAlert(phone, ticket) {
  const to = (phone || '').trim();
  const ticketId = ticket?.id || ticket?.ticketNumber || '';
  console.log('\n--- TWILIO DEBUG: ADMIN ALERT ---');
  console.log('Target Phone:', to);
  console.log('Ticket ID:', ticketId);

  if (!to) return { sent: false, skipped: true, reason: 'no-phone' };

  const location = ticket?.room || ticket?.roomName || ticket?.location || '';
  const issue = ticket?.issue || ticket?.issueType || '';
  const summary = [location, issue].filter(Boolean).join(' — ').slice(0, 200);

  return sendWhatsAppNotification(to, ticketId, 'admin', summary || 'No details');
}
