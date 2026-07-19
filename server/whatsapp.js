/**
 * WhatsApp notification for ticket status updates.
 *
 * Supports three providers, checked in this order:
 *
 * 1. Twilio — enabled when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and a
 *    sender number are all set. The sender is read from TWILIO_WHATSAPP_FROM
 *    (env var, preferred) falling back to TWILIO_WHATSAPP_NUMBER (secret),
 *    e.g. "whatsapp:+15553707968". Official (non-sandbox) senders can only
 *    reach users outside a 24-hour session via approved WhatsApp templates:
 *    set TWILIO_TEMPLATE_WELCOME / TWILIO_TEMPLATE_DONE to approved Content
 *    SIDs (HX...) and the welcome/status messages are sent as templates;
 *    unset, they fall back to freeform text (session-only).
 *    Uses the twilio SDK (lazy-imported so a bad config can't crash the
 *    server at startup).
 *
 * 2. CallMeBot (free, per-recipient registration) — enabled when
 *    CALLMEBOT_KEYS is set. Each recipient registers once with CallMeBot
 *    and gets a personal apikey. CALLMEBOT_KEYS maps phone numbers to
 *    their apikeys, e.g. "+966501234567:123456,+966559876543:654321".
 *    Phones without a key are skipped (logged, no failure).
 *
 * 3. REST gateway (UltraMsg / Green API style) — enabled when
 *    WHATSAPP_API_URL is set (e.g. https://api.ultramsg.com/instanceXXX/messages/chat).
 *    Sends POST JSON { token, to, body } where token comes from
 *    WHATSAPP_TOKEN (or legacy WHATSAPP_API_TOKEN) and the phone is
 *    normalized to international digits (no leading '+' or '00').
 *
 * When none is configured the function degrades to a console stub so
 * the app keeps working without the integration.
 */

let twilioClient = null;

async function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const { default: twilio } = await import('twilio');
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID.trim(),
    process.env.TWILIO_AUTH_TOKEN.trim(),
  );
  return twilioClient;
}

/** Keep digits only so "+966 50 123 4567" and "0096650..." style variants match. */
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
}

/** Digits only, without a leading "00" — UltraMsg/Green API expect "9665..." format. */
function normalizePhoneForSend(phone) {
  return normalizePhone(phone).replace(/^00/, '');
}

function twilioFromNumber() {
  return (process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER || '').trim();
}

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID
    && process.env.TWILIO_AUTH_TOKEN
    && twilioFromNumber(),
  );
}

async function sendViaTwilio(phone, message, template) {
  const client = await getTwilioClient();
  const to = `whatsapp:+${normalizePhoneForSend(phone)}`;

  const payload = { from: twilioFromNumber(), to };
  if (template?.contentSid) {
    // Approved WhatsApp template — required to reach users outside the
    // 24-hour session window (Twilio error 63016 otherwise).
    payload.contentSid = template.contentSid;
    if (template.variables) {
      payload.contentVariables = JSON.stringify(template.variables);
    }
  } else {
    payload.body = message;
  }

  const result = await client.messages.create(payload);

  console.log(`[whatsapp] Twilio notification sent to ${to} (sid: ${result.sid})`);
  return { sent: true, provider: 'twilio' };
}

/** Parse CALLMEBOT_KEYS ("phone:apikey,phone:apikey") into a lookup map. */
function parseCallMeBotKeys(raw) {
  const map = new Map();
  for (const pair of String(raw).split(',')) {
    const idx = pair.lastIndexOf(':');
    if (idx === -1) continue;
    const phone = normalizePhone(pair.slice(0, idx));
    const apikey = pair.slice(idx + 1).trim();
    if (phone && apikey) map.set(phone, apikey);
  }
  return map;
}

async function sendViaCallMeBot(to, message) {
  const keys = parseCallMeBotKeys(process.env.CALLMEBOT_KEYS);
  const apikey = keys.get(normalizePhone(to));

  if (!apikey) {
    console.log(
      `[whatsapp] ${to} is not registered with CallMeBot (no apikey in CALLMEBOT_KEYS) — skipping notification`,
    );
    return { sent: false, skipped: true, reason: 'callmebot-unregistered' };
  }

  const url =
    'https://api.callmebot.com/whatsapp.php' +
    `?phone=${encodeURIComponent(to)}` +
    `&text=${encodeURIComponent(message)}` +
    `&apikey=${encodeURIComponent(apikey)}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.text().catch(() => '');

  // CallMeBot returns HTTP 200 even for some errors, with the error in the body.
  if (!response.ok || /error/i.test(body)) {
    // Redact the apikey in case the provider echoes request parameters back.
    const safeBody = body.split(apikey).join('[redacted]').slice(0, 200);
    throw new Error(`CallMeBot responded with HTTP ${response.status}: ${safeBody}`);
  }

  console.log(`[whatsapp] CallMeBot notification sent to ${to}`);
  return { sent: true, provider: 'callmebot' };
}

async function sendViaRestGateway(phone, message) {
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN || '';
  const to = normalizePhoneForSend(phone);

  const response = await fetch(process.env.WHATSAPP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, to, body: message }),
    signal: AbortSignal.timeout(10_000),
  });

  const responseText = await response.text().catch(() => '');
  // UltraMsg/Green API can return HTTP 200 with an error object in the body.
  if (!response.ok || /"error"|error:/i.test(responseText)) {
    const safeBody = (token ? responseText.split(token).join('[redacted]') : responseText).slice(0, 200);
    throw new Error(`WhatsApp API responded with HTTP ${response.status}: ${safeBody}`);
  }

  console.log(`[whatsapp] Notification sent to ${to}`);
  return { sent: true, provider: 'gateway' };
}

/** Provider-dispatching low-level sender. Never throws — callers fire-and-forget. */
export async function sendWhatsAppMessage(phone, message, template) {
  const to = typeof phone === 'string' ? phone.trim() : '';
  if (!to) {
    return { sent: false, skipped: true };
  }

  try {
    if (twilioConfigured()) {
      return await sendViaTwilio(to, message, template);
    }
    if (process.env.CALLMEBOT_KEYS) {
      return await sendViaCallMeBot(to, message);
    }
    if (process.env.WHATSAPP_API_URL) {
      return await sendViaRestGateway(to, message);
    }
  } catch (err) {
    console.error('[whatsapp] Notification failed:', err?.message || err);
    return { sent: false, error: err?.message || String(err) };
  }

  console.log('WhatsApp Stub: Message sent to', to);
  console.log(`[whatsapp] Stub message: ${message.replace(/\n/g, ' | ')}`);
  return { sent: false, stub: true };
}

/** Welcome message sent right after a new ticket is created. */
export async function sendWhatsAppWelcome(phone, ticketNumber) {
  const message =
    `مرحباً بك في نظام SSC OS 🏢. تم استلام طلب الصيانة الخاص بك بنجاح برقم: *${ticketNumber}*. `
    + 'فريقنا الفني يقوم بمراجعة الطلب الآن وسيتواصل معك قريباً. ✨';

  const contentSid = (process.env.TWILIO_TEMPLATE_WELCOME || '').trim();
  const template = contentSid ? { contentSid, variables: { 1: ticketNumber } } : undefined;
  return sendWhatsAppMessage(phone, message, template);
}

/** Builds the ticket-status message and sends it. Used by the issue routes. */
export async function sendWhatsAppNotification(phone, ticketNumber, status) {
  const message = [
    `مرحباً، تم الانتهاء من طلب الصيانة الخاص بك رقم ${ticketNumber}. شكراً لاستخدامك نظام SSC OS.`,
    `Hello! Your maintenance request (Ticket: ${ticketNumber}) has been marked as ${status}. Thank you for using SSC OS.`,
  ].join('\n');

  const contentSid = (process.env.TWILIO_TEMPLATE_DONE || '').trim();
  const template = contentSid ? { contentSid, variables: { 1: ticketNumber } } : undefined;
  return sendWhatsAppMessage(phone, message, template);
}
