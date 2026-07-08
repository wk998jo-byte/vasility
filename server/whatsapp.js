/**
 * WhatsApp notification for ticket status updates.
 *
 * Provider-agnostic: posts a generic JSON payload to WHATSAPP_API_URL
 * (Twilio, UltraMsg, Meta Graph API gateway, etc.). Optional
 * WHATSAPP_API_TOKEN is sent as a Bearer token. When WHATSAPP_API_URL is
 * unset the function degrades to a console stub so the app keeps working
 * without the integration.
 */
export async function sendWhatsAppNotification(phone, ticketNumber, status) {
  const to = typeof phone === 'string' ? phone.trim() : '';
  if (!to) {
    return { sent: false, skipped: true };
  }

  const message = [
    `Hello! Your maintenance request (Ticket: ${ticketNumber}) has been marked as ${status}. Thank you for using SSC OS.`,
    `مرحباً! تم تحديث حالة طلب الصيانة الخاص بك (تذكرة: ${ticketNumber}) إلى "${status}". شكراً لاستخدامك SSC OS.`,
  ].join('\n');

  const apiUrl = process.env.WHATSAPP_API_URL;
  if (!apiUrl) {
    console.log('WhatsApp Stub: Message sent to', to);
    console.log(`[whatsapp] Stub message for ${ticketNumber}: ${message.replace(/\n/g, ' | ')}`);
    return { sent: false, stub: true };
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.WHATSAPP_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.WHATSAPP_API_TOKEN}`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, message, ticketNumber, status }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API responded with HTTP ${response.status}`);
    }

    console.log(`[whatsapp] Notification sent to ${to} for ${ticketNumber} (${status})`);
    return { sent: true };
  } catch (err) {
    console.error('[whatsapp] Notification failed:', err?.message || err);
    return { sent: false, error: err?.message || String(err) };
  }
}
