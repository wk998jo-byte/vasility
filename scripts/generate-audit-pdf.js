import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'Facilities-QR-Audit-Report.pdf');

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  info: {
    Title: 'Facilities QR Room Reporting — Technical Audit',
    Author: 'SSC Building Portal',
    Subject: 'Full-stack technical audit report',
  },
});

doc.pipe(fs.createWriteStream(outPath));

const colors = {
  primary: '#111111',
  muted: '#555555',
  accent: '#0d6efd',
  line: '#dddddd',
  pass: '#198754',
  warn: '#b45309',
};

function h1(text) {
  doc.moveDown(0.5);
  doc.fontSize(20).fillColor(colors.primary).font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
  doc.strokeColor(colors.line).lineWidth(1)
    .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
}

function h2(text) {
  doc.moveDown(0.4);
  doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold').text(text);
  doc.moveDown(0.25);
}

function h3(text) {
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text(text);
  doc.moveDown(0.15);
}

function p(text, opts = {}) {
  doc.fontSize(10).fillColor(opts.color || colors.muted).font('Helvetica')
    .text(text, { align: opts.align || 'left', lineGap: 3 });
  doc.moveDown(0.15);
}

function bullet(text) {
  doc.fontSize(10).fillColor(colors.muted).font('Helvetica')
    .text(`•  ${text}`, { indent: 10, lineGap: 2 });
}

function tableRow(cols, bold = false) {
  const startY = doc.y;
  const colWidths = [140, 340];
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  cols.forEach((col, i) => {
    doc.fillColor(colors.primary).text(col, 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), startY, {
      width: colWidths[i],
      lineGap: 2,
    });
  });
  doc.moveDown(0.5);
}

function verdictBox(label, value, ok) {
  const y = doc.y;
  doc.rect(50, y, 495, 28).fillAndStroke(ok ? '#ecfdf5' : '#fff7ed', colors.line);
  doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10)
    .text(label, 60, y + 9, { continued: true });
  doc.fillColor(ok ? colors.pass : colors.warn).text(`  ${value}`);
  doc.moveDown(1.2);
}

// ─── Cover ───────────────────────────────────────────────────────────────────
doc.fontSize(26).fillColor(colors.primary).font('Helvetica-Bold')
  .text('Facilities QR Room\nReporting System', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(14).fillColor(colors.muted).font('Helvetica')
  .text('Technical Audit Report', { align: 'center' });
doc.moveDown(0.3);
doc.fontSize(10).text('SSC Building Portal · Full-Stack Review', { align: 'center' });
doc.moveDown(0.3);
doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
doc.moveDown(2);

verdictBox('READY FOR REPLIT', 'YES', true);
verdictBox('READY FOR REAL USE', 'CONDITIONAL YES (pilot-ready)', false);
verdictBox('STACK TYPE', 'FULL STACK (React + Express + PostgreSQL)', true);

doc.addPage();

// ─── A) Executive Summary ───────────────────────────────────────────────────
h1('A) Executive Summary');
p('This is a full-stack Facilities QR issue reporting application. Each department has rooms with unique QR codes. Scanning a QR opens a room-locked issue form. Facility staff manage tickets via a Command Center dashboard.');
p('Core flow is implemented end-to-end: QR token → locked form → PostgreSQL persistence → dashboard with filters, status workflow, audit trail, staff management, and optional Cloudinary images.');
p('Recent security hardening: QR token required for image uploads; tracking requires ticket + employee ID; facility users receive limited user-list fields; tighter CORS; cross-platform start scripts.');
p('Static checks: lint PASS · build PASS · 3 tests PASS', { color: colors.pass });

// ─── B) Architecture ──────────────────────────────────────────────────────────
h1('B) Current Architecture');
p('Browser (React SPA — web/src/App.jsx) → Express API (server/index.js) → PostgreSQL (DATABASE_URL)');
p('Optional: SMTP notifications (notify.js), Cloudinary image uploads (upload.js)');
h3('Active source');
bullet('Frontend: App.jsx, main.jsx, sla.js, Vitest tests');
bullet('Backend: index.js, seed.js, schema.sql, upload.js, notify.js, db.js');
bullet('Start: Replit runs "npm run build:web && npm start"; local "npm start" (server only)');

// ─── C) What Works ───────────────────────────────────────────────────────────
h1('C) What Works');

h2('1. Project Structure');
tableRow(['Question', 'Answer'], true);
tableRow(['Framework', 'React 18 + Vite 6, Express 4']);
tableRow(['Full-stack?', 'Yes']);
tableRow(['API routes?', 'Yes — 20+ endpoints']);
tableRow(['Database?', 'PostgreSQL via pg']);
tableRow(['Env vars?', 'Required for production']);

h2('2. QR Flow');
bullet('QR generated client-side via QRCodeSVG (qrcode.react) — no external API');
bullet('URL: {baseUrl}?token={roomToken}');
bullet('Resolve: GET /api/rooms/resolve?token= → room ID, name, floor, department, assets');
bullet('Manual room selection blocked until valid QR token');
bullet('Backend enforces qrToken on issue submit; invalid/expired tokens rejected');

h2('3. Issue Reporting');
tableRow(['Field', 'Status'], true);
tableRow(['Room', 'Locked via QR']);
tableRow(['Department', 'Derived from room']);
tableRow(['Issue type / Priority', 'Required, server-validated']);
tableRow(['Description', 'Required when issue = Other']);
tableRow(['Reporter', 'Name + Employee ID required']);
tableRow(['Image', 'Optional; Cloudinary; qrToken required']);
tableRow(['Phone/email', 'Not implemented']);
bullet('Persisted to facility_issues + issue_status_history');

h2('4. Facility Dashboard');
bullet('Command Center: KPIs, charts, ticket table');
bullet('Filters: status, priority, department, room, date');
bullet('Status: New → In Progress → Resolved → Closed; Reject');
bullet('Audit trail, room QR management, staff CRUD (admin)');

h2('5. Authentication & Roles');
tableRow(['Role', 'Access'], true);
tableRow(['Public', 'Request (QR), track (ticket+employeeId)']);
tableRow(['facility', 'Dashboard: view/update tickets, view QRs']);
tableRow(['admin', 'Full access + trash, costs, room/staff CRUD']);

h2('6. Database');
bullet('Tables: departments, rooms, room_qr_tokens, room_assets, facility_issues, users, issue_status_history, ticket_counters');
bullet('Seed: 3 departments, 10 rooms, admin + facility users');

// ─── D) Broken / Missing ─────────────────────────────────────────────────────
doc.addPage();
h1('D) What Is Broken / Missing');

h2('Critical (before wide production)');
bullet('PostgreSQL mandatory — APIs return 503 without DATABASE_URL');
bullet('Default facility password: facility_user / facility123 unless overridden');
bullet('CLOUDINARY_URL required for photo uploads');

h2('Important (ops / polish)');
bullet('build:web uses bash-style cd && — on Windows PowerShell, build manually in web/');
bullet('Stale web/ARCHITECTURE.md references removed Firebase code');
bullet('Unused deps: react-router-dom, zustand, idb');
bullet('No reporter phone/email field');
bullet('No department CRUD API');
bullet('Large JS bundle (~750 KB)');
bullet('Limited test coverage (smoke tests only)');

h2('Security Status');
tableRow(['Item', 'Status'], true);
tableRow(['QR-enforced submit', 'Fixed']);
tableRow(['Rate limiting', 'Login 5/15min, issues 20/15min']);
tableRow(['CORS restricted', 'VITE_PUBLIC_BASE_URL + localhost']);
tableRow(['Attachment upload auth', 'Fixed — qrToken + room match']);
tableRow(['Tracking enumeration', 'Fixed — ticket + employeeId']);
tableRow(['Users API privacy', 'Fixed — facility: id/username only']);
tableRow(['JWT in localStorage', 'Remaining SPA risk']);

// ─── E–F) Deployment ─────────────────────────────────────────────────────────
h1('E) Required Before Replit');
bullet('Set Secrets: DATABASE_URL, JWT_SECRET, ADMIN_USER/PASS, VITE_PUBLIC_BASE_URL');
bullet('Change FACILITY_USER/PASS defaults');
bullet('CLOUDINARY_URL if photos needed; SMTP optional');
bullet('Run npm run db:init once');
bullet('Verify /api/health, QR scan, submit, dashboard, track flow');

h1('F) Required Before Real Facility Use');
bullet('Change all default passwords');
bullet('Configure SMTP and Cloudinary');
bullet('Print physical QR codes per room');
bullet('Train staff; pilot 1–2 departments first');

// ─── G–H) Schema & API ─────────────────────────────────────────────────────────
h1('G) Database Schema');
p('Already implemented — no new tables needed for MVP.');
p('departments → rooms → room_qr_tokens, room_assets → facility_issues → issue_status_history; users; ticket_counters');

h1('H) API Endpoints (MVP-complete)');
tableRow(['Method', 'Endpoint / Auth'], true);
[
  ['GET', '/api/health — Public'],
  ['POST', '/api/auth/login — Public + rate limit'],
  ['GET', '/api/users — JWT (facility: id/username only)'],
  ['POST/DELETE', '/api/users — JWT + admin'],
  ['GET', '/api/departments — Public'],
  ['GET', '/api/rooms/resolve?token= — Public'],
  ['GET', '/api/rooms — Public (id, name)'],
  ['GET', '/api/rooms/admin — JWT'],
  ['POST/PUT/DELETE', '/api/rooms* — JWT + admin'],
  ['POST', '/api/issues — Public + rate limit (qrToken)'],
  ['POST', '/api/issues/:id/attachments — qrToken + image'],
  ['GET', '/api/issues/track — ticketNumber + employeeId'],
  ['GET/PUT', '/api/issues* — JWT'],
  ['DELETE', '/api/issues/:id — JWT + admin'],
].forEach(([m, e]) => tableRow([m, e]));

// ─── I) Commands ───────────────────────────────────────────────────────────────
doc.addPage();
h1('I) Commands to Run');
p('cd QR && npm install');
p('cd web && npm install');
p('Copy .env.example → .env and fill values');
p('npm run db:init   (first time)');
p('cd web && npm run build   (after UI changes)');
p('npm start   (server at http://localhost:8080)');
p('cd web && npm run lint && npm run test && npm run build');

h2('Default logins (after seed)');
bullet('Admin: ADMIN_USER / ADMIN_PASS from .env');
bullet('Facility: facility_user / facility123 (or FACILITY_* env vars)');

// ─── J) Checklist ──────────────────────────────────────────────────────────────
h1('J) Final Checklist');

h2('Replit');
['DATABASE_URL, JWT_SECRET, ADMIN_* in Secrets',
  'VITE_PUBLIC_BASE_URL = Replit app URL',
  'npm run db:init run once',
  '/api/health returns database: true',
  'QR → submit → dashboard flow verified',
  'CLOUDINARY_URL if photos required',
].forEach(bullet);

h2('Real facility use');
['Default passwords changed',
  'SMTP configured',
  'Physical QR codes printed',
  'Staff trained',
  'Pilot completed',
].forEach(bullet);

h2('MVP Verdict');
verdictBox('READY FOR REPLIT', 'YES', true);
verdictBox('READY FOR REAL USE', 'CONDITIONAL YES', false);
verdictBox('CRITICAL BLOCKERS', 'None if PostgreSQL + secrets set', true);

doc.moveDown(0.5);
p('Suggested next steps: (1) Deploy Replit with secrets, (2) Smoke-test full flow, (3) Change default passwords, (4) Configure SMTP/Cloudinary, (5) Print QR codes and pilot.', { color: colors.primary });

doc.end();

console.log(`PDF written to: ${outPath}`);
