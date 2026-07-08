/**
 * WhatsApp notification for ticket status updates.
 *
 * Supports two providers, checked in this order:
 *
 * 1. CallMeBot (free, per-recipient registration) — enabled when
 *    CALLMEBOT_KEYS is set. Each recipient registers once with CallMeBot
 *    and gets a personal apikey. CALLMEBOT_KEYS maps phone numbers to
 *    their apikeys, e.g. "+966501234567:123456,+966559876543:654321".
 *    Phones without a key are skipped (logged, no failure).
 *
 * 2. Generic gateway — posts a JSON payload to WHATSAPP_API_URL
 *    (Twilio, UltraMsg, Meta Graph API gateway, etc.). Optional
 *    WHATSAPP_API_TOKEN is sent as a Bearer token.
 *
 * When neither is configured the function degrades to a console stub so
 * the app keeps working without the integration.
 */

/** Keep digits only so "+966 50 123 4567" and "0966501234567" style variants match. */
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
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

async function sendViaCallMeBot(to, message, ticketNumber, status) {
  const keys = parseCallMeBotKeys(process.env.CALLMEBOT_KEYS);
  const apikey = keys.get(normalizePhone(to));

  if (!apikey) {
    console.log(
      `[whatsapp] ${to} is not registered with CallMeBot (no apikey in CALLMEBOT_KEYS) — skipping notification for ${ticketNumber}`,
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

  console.log(`[whatsapp] CallMeBot notification sent to ${to} for ${ticketNumber} (${status})`);
  return { sent: true, provider: 'callmebot' };
}

async function sendViaGenericGateway(to, message, ticketNumber, status) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.WHATSAPP_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.WHATSAPP_API_TOKEN}`;
  }

  const response = await fetch(process.env.WHATSAPP_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to, message, ticketNumber, status }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API responded with HTTP ${response.status}`);
  }

  console.log(`[whatsapp] Notification sent to ${to} for ${ticketNumber} (${status})`);
  return { sent: true, provider: 'gateway' };
}

export async function sendWhatsAppNotification(phone, ticketNumber, status) {
  const to = typeof phone === 'string' ? phone.trim() : '';
  if (!to) {
    return { sent: false, skipped: true };
  }

  const message = [
    `Hello! Your maintenance request (Ticket: ${ticketNumber}) has been marked as ${status}. Thank you for using SSC OS.`,
    `مرحباً! تم تحديث حالة طلب الصيانة الخاص بك (تذكرة: ${ticketNumber}) إلى "${status}". شكراً لاستخدامك SSC OS.`,
  ].join('\n');

  try {
    if (process.env.CALLMEBOT_KEYS) {
      return await sendViaCallMeBot(to, message, ticketNumber, status);
    }
    if (process.env.WHATSAPP_API_URL) {
      return await sendViaGenericGateway(to, message, ticketNumber, status);
    }
  } catch (err) {
    console.error('[whatsapp] Notification failed:', err?.message || err);
    return { sent: false, error: err?.message || String(err) };
  }

  console.log('WhatsApp Stub: Message sent to', to);
  console.log(`[whatsapp] Stub message for ${ticketNumber}: ${message.replace(/\n/g, ' | ')}`);
  return { sent: false, stub: true };
}
