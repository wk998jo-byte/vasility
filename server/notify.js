import nodemailer from 'nodemailer';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlEmail(issue) {
  const ticket = escapeHtml(issue.id || issue.ticketNumber);
  const room = escapeHtml(issue.room);
  const asset = escapeHtml(issue.asset);
  const issueType = escapeHtml(issue.issue);
  const priority = escapeHtml(issue.priority);
  const reporter = escapeHtml(issue.requesterName || issue.name);
  const employeeId = escapeHtml(issue.employeeId);
  const notes = escapeHtml(issue.notes || issue.description || '—');
  const department = escapeHtml(issue.departmentName || '—');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.5;color:#111;background:#f9fafb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
    <h1 style="margin:0 0 8px;font-size:20px;">New Facility Issue</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A new maintenance request was submitted via QR.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Ticket</td><td style="padding:8px 0;font-weight:bold;font-family:monospace;">${ticket}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Department</td><td style="padding:8px 0;">${department}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Room</td><td style="padding:8px 0;">${room}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Asset</td><td style="padding:8px 0;">${asset}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Issue</td><td style="padding:8px 0;">${issueType}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Priority</td><td style="padding:8px 0;"><strong>${priority}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Reporter</td><td style="padding:8px 0;">${reporter} (${employeeId})</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Notes</td><td style="padding:8px 0;">${notes}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">SSC Building Portal — automated notification</p>
  </div>
</body>
</html>`;
}

function buildTextEmail(issue) {
  return [
    'New facility issue reported.',
    `Ticket: ${issue.id || issue.ticketNumber}`,
    `Department: ${issue.departmentName || '—'}`,
    `Room: ${issue.room}`,
    `Asset: ${issue.asset}`,
    `Issue: ${issue.issue}`,
    `Priority: ${issue.priority}`,
    `Reporter: ${issue.requesterName || issue.name} (${issue.employeeId})`,
    `Notes: ${issue.notes || issue.description || '—'}`,
  ].join('\n');
}

/**
 * Send HTML email on new ticket. Falls back to console.log if SMTP is missing or fails.
 */
export async function sendNewIssueNotification(issue) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const notifyTo = process.env.NOTIFY_EMAIL;

  const subject = `[SSC Portal] New issue ${issue.id || issue.ticketNumber}`;
  const text = buildTextEmail(issue);
  const html = buildHtmlEmail(issue);

  if (!smtpHost || !smtpUser || !smtpPass || !notifyTo) {
    console.log(`[notify] SMTP not configured — stub notification to ${notifyTo || 'admin'}`);
    console.log(`[notify] Subject: ${subject}`);
    console.log(`[notify] ${text.replace(/\n/g, ' | ')}`);
    return { sent: false, stub: true };
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || smtpUser,
      to: notifyTo,
      subject,
      text,
      html,
    });

    console.log(`[notify] Email sent to ${notifyTo} for ${issue.id || issue.ticketNumber}`);
    return { sent: true };
  } catch (err) {
    console.error('[notify] Email failed:', err.message);
    console.log(`[notify] Fallback stub — Subject: ${subject}`);
    console.log(`[notify] ${text.replace(/\n/g, ' | ')}`);
    return { sent: false, error: err.message };
  }
}
