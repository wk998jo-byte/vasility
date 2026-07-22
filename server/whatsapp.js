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

/**
 * Discover approved WhatsApp templates directly from the Twilio Content API,
 * so deleted/recreated templates never leave the app pointing at stale SIDs
 * (Twilio error 63112). Templates are matched by friendly_name prefix
 * ("ssc_ticket_welcome" / "ssc_ticket_done"), newest first, approved only.
 * Cached for 10 minutes; falls back to TWILIO_TEMPLATE_* env vars, then to
 * freeform text (delivered only inside a 24h session window).
 */
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000;
let templateCache = { at: 0, map: null };

async function twilioContentGet(path) {
  const auth = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID.trim()}:${process.env.TWILIO_AUTH_TOKEN.trim()}`,
  ).toString('base64');
  const res = await fetch(`https://content.twilio.com/v1${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Content API HTTP ${res.status}`);
  return res.json();
}

async function discoverTemplates() {
  const now = Date.now();
  if (templateCache.map && now - templateCache.at < TEMPLATE_CACHE_TTL_MS) {
    return templateCache.map;
  }

  const map = {};
  try {
    const list = await twilioContentGet('/Content?PageSize=100');
    // Newest first so a re-created template wins over an older one.
    const contents = (list.contents || []).sort(
      (a, b) => new Date(b.date_created) - new Date(a.date_created),
    );
    for (const c of contents) {
      const name = c.friendly_name || '';
      let key = null;
      if (name.startsWith('ssc_ticket_welcome')) key = 'welcome';
      else if (name.startsWith('ssc_ticket_done')) key = 'done';
      else if (name.startsWith('ssc_ticket_admin')) key = 'admin';
      if (!key || map[key]) continue;

      const approval = await twilioContentGet(`/Content/${c.sid}/ApprovalRequests`)
        .catch(() => null);
      if (approval?.whatsapp?.status === 'approved') map[key] = c.sid;
    }
    templateCache = { at: now, map };
  } catch (err) {
    console.error('[whatsapp] template discovery failed:', err?.message || err);
    // Cache failures briefly too, so an outage doesn't add latency to every send.
    templateCache = { at: now - TEMPLATE_CACHE_TTL_MS + 60_000, map };
  }
  return map;
}

async function resolveTemplate(kind, envKey, variables) {
  if (!twilioConfigured()) return undefined;
  const discovered = (await discoverTemplates())[kind];
  const contentSid = discovered || (process.env[envKey] || '').trim();
  return contentSid ? { contentSid, variables } : undefined;
}

/** Welcome message sent right after a new ticket is created. */
export async function sendWhatsAppWelcome(phone, ticketNumber) {
  const message =
    `مرحباً بك في مركز صيانة المرافق FMC 🏢. تم استلام طلب الصيانة الخاص بك بنجاح برقم: *${ticketNumber}*. `
    + 'فريقنا الفني يقوم بمراجعة الطلب الآن وسيتواصل معك قريباً. ✨';

  const template = await resolveTemplate('welcome', 'TWILIO_TEMPLATE_WELCOME', { 1: ticketNumber });
  return sendWhatsAppMessage(phone, message, template);
}

/** Builds the ticket-status message and sends it. Used by the issue routes. */
export async function sendWhatsAppNotification(phone, ticketNumber, status) {
  const message = [
    `مرحباً، تم الانتهاء من طلب الصيانة الخاص بك رقم ${ticketNumber}. شكراً لاستخدامك مركز صيانة المرافق FMC.`,
    `Hello! Your maintenance request (Ticket: ${ticketNumber}) has been marked as ${status}. Thank you for using FMC (Facility Maintenance Center).`,
  ].join('\n');

  const template = await resolveTemplate('done', 'TWILIO_TEMPLATE_DONE', { 1: ticketNumber });
  return sendWhatsAppMessage(phone, message, template);
}

/**
 * Alert sent to an admin's WhatsApp whenever a new ticket is created.
 * `phone` defaults to the ADMIN_WHATSAPP env var; silently skipped when unset.
 */
export async function sendWhatsAppAdminAlert(ticketNumber, details, phone) {
  const adminPhone = (phone || process.env.ADMIN_WHATSAPP || '').trim();
  if (!adminPhone) return { sent: false, skipped: true, reason: 'no-admin-phone' };

  const summary = String(details || '').slice(0, 200);
  const message =
    `🔔 تذكرة جديدة في مركز صيانة المرافق FMC\nرقم التذكرة: *${ticketNumber}*\n${summary}\n\n`
    + `New FMC ticket: ${ticketNumber} — ${summary}`;

  const template = await resolveTemplate('admin', 'TWILIO_TEMPLATE_ADMIN', { 1: ticketNumber, 2: summary });
  return sendWhatsAppMessage(adminPhone, message, template);
}

/**
 * Role-based new-ticket WhatsApp body (freeform). Prefer admin template when
 * approved Content SID is available (required outside the 24h session window).
 */
export async function sendWhatsAppNewTicketAlert(phone, ticket) {
  const to = (phone || '').trim();
  if (!to) return { sent: false, skipped: true, reason: 'no-phone' };

  const ticketId = ticket?.id || ticket?.ticketNumber || '';
  const location = ticket?.room || ticket?.roomName || ticket?.location || '';
  const issue = ticket?.issue || ticket?.issueType || '';
  const summary = [location, issue].filter(Boolean).join(' — ').slice(0, 200);

  const message =
    `🚨 *New Maintenance Request*\n\n`
    + `*Ticket ID:* ${ticketId}\n`
    + `*Location:* ${location}\n`
    + `*Issue:* ${issue}\n\n`
    + 'Please check the FMC Command Center.';

  const template = await resolveTemplate('admin', 'TWILIO_TEMPLATE_ADMIN', {
    1: String(ticketId),
    2: summary || String(ticketId),
  });
  return sendWhatsAppMessage(to, message, template);
}
