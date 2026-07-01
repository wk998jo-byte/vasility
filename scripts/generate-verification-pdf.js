import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'Facilities-QR-Verification-Report.pdf');

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 45, bottom: 45, left: 48, right: 48 },
  info: {
    Title: 'Facilities QR — Senior Engineering Verification Report',
    Author: 'SSC Building Portal',
    Subject: 'Final verification report with live API test results',
  },
});

doc.pipe(fs.createWriteStream(outPath));

const C = {
  primary: '#111111',
  muted: '#444444',
  line: '#cccccc',
  pass: '#166534',
  warn: '#b45309',
  fail: '#b91c1c',
  bgOk: '#ecfdf5',
  bgWarn: '#fff7ed',
};

function ensureSpace(h = 60) {
  if (doc.y > 780 - h) doc.addPage();
}

function h1(text) {
  ensureSpace(50);
  doc.moveDown(0.4);
  doc.fontSize(17).fillColor(C.primary).font('Helvetica-Bold').text(text);
  doc.moveDown(0.2);
  doc.strokeColor(C.line).lineWidth(0.8).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown(0.35);
}

function h2(text) {
  ensureSpace(40);
  doc.moveDown(0.25);
  doc.fontSize(12).fillColor(C.primary).font('Helvetica-Bold').text(text);
  doc.moveDown(0.15);
}

function h3(text) {
  ensureSpace(30);
  doc.fontSize(10).fillColor(C.primary).font('Helvetica-Bold').text(text);
  doc.moveDown(0.1);
}

function p(text, color = C.muted) {
  ensureSpace(20);
  doc.fontSize(9).fillColor(color).font('Helvetica').text(text, { lineGap: 2 });
  doc.moveDown(0.1);
}

function bullet(text) {
  ensureSpace(16);
  doc.fontSize(9).fillColor(C.muted).font('Helvetica').text(`•  ${text}`, { indent: 8, lineGap: 1.5 });
}

function code(text) {
  ensureSpace(16);
  doc.fontSize(8).fillColor(C.primary).font('Courier').text(text, { lineGap: 1 });
  doc.moveDown(0.15);
}

function verdict(label, value, ok) {
  ensureSpace(32);
  const y = doc.y;
  doc.rect(48, y, 499, 24).fillAndStroke(ok ? C.bgOk : C.bgWarn, C.line);
  doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(9).text(`${label}:  `, 56, y + 7, { continued: true });
  doc.fillColor(ok ? C.pass : C.warn).text(value);
  doc.moveDown(1);
}

function row(cols, bold = false) {
  ensureSpace(18);
  const y = doc.y;
  const w = [115, 380];
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
  cols.forEach((c, i) => {
    doc.fillColor(C.primary).text(c, 48 + (i ? w[0] : 0), y, { width: w[i], lineGap: 1 });
  });
  doc.moveDown(0.35);
}

// ─── Cover ───────────────────────────────────────────────────────────────────
doc.fontSize(22).fillColor(C.primary).font('Helvetica-Bold')
  .text('Senior Engineering\nVerification Report', { align: 'center' });
doc.moveDown(0.4);
doc.fontSize(13).font('Helvetica').fillColor(C.muted)
  .text('Facilities QR Room Reporting System', { align: 'center' });
doc.fontSize(10).text('SSC Building Portal · Full-Stack', { align: 'center' });
doc.text(`Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, { align: 'center' });
doc.moveDown(1.2);

verdict('READY FOR REPLIT DEPLOYMENT', 'YES', true);
verdict('READY FOR REAL FACILITY PILOT', 'YES (conditional — change secrets first)', false);
verdict('STACK', 'FULL STACK (React + Express + PostgreSQL)', true);
verdict('DATABASE PERSISTENCE', 'YES — verified live', true);
verdict('AUTH PROTECTION', 'PARTIAL — backend JWT OK; weak .env secrets flagged', false);

doc.addPage();

// ─── 1. Change Summary ───────────────────────────────────────────────────────
h1('1. Change Summary');

h2('package.json (root) — Deployment');
bullet('Before: start rebuilt web every run; && failed on PowerShell');
bullet('After: start = node server/index.js; build:web = cd web && npm install && npm run build');

h2('.replit — Deployment');
bullet('Before: run = npm start');
bullet('After: run = npm run build:web && npm start');

h2('server/index.js — Backend / Auth / Security');
bullet('CORS restricted to VITE_PUBLIC_BASE_URL + localhost');
bullet('Rate limits: login 5/15min, issues/uploads 20/15min');
bullet('POST/DELETE /api/users (admin); PUT /api/rooms/:id');
bullet('Attachments require qrToken matching ticket room');
bullet('Tracking requires ticketNumber + employeeId');
bullet('GET /api/users: facility sees id/username only');

h2('server/seed.js — Backend / Database');
bullet('Added fetchIssueForTracking, expanded fetchUsers, imageUrl in mapIssueRow');

h2('server/upload.js — Backend');
bullet('Rewrote: multer memory + cloudinary upload_stream (no peer conflict)');

h2('server/schema.sql — Database');
bullet('image_url, assignee, department_id on facility_issues');

h2('server/notify.js — Backend');
bullet('Real nodemailer HTML email with console fallback');

h2('web/src/App.jsx — Frontend');
bullet('QRCodeSVG (client-side QR); Room Edit modal; Manage Staff modal');
bullet('Image upload with qrToken; Tracking: ticket + employee ID');
bullet('QR-locked form (hasValidToken); Scanner + SLA imports fixed');

h2('Testing & cleanup');
bullet('Vitest smoke tests (web/src/App.test.jsx, sla.test.js)');
bullet('Deleted server/scripts/migrate_data.js (legacy)');

// ─── 2. System Type ──────────────────────────────────────────────────────────
h1('2. Current System Type');
row(['Question', 'Answer'], true);
row(['Frontend-only or full-stack?', 'FULL STACK']);
row(['Framework', 'React 18 + Vite 6, Express 4']);
row(['Real backend/API?', 'Yes — server/index.js, 20+ routes']);
row(['Real database?', 'PostgreSQL via pg']);
row(['Reports stored?', 'Yes — facility_issues table (not localStorage)']);

// ─── 3. Verification Commands ────────────────────────────────────────────────
h1('3. Verification Commands — Actual Results');

h2('Root package (c:\\Users\\User1\\Desktop\\QR)');
code('npm install  → PASS (124 packages, 0 vulnerabilities)');
code('npm run lint → FAIL — Missing script (only in web/)');
code('npm run build → FAIL — Missing script (use npm run build:web)');
code('npm run test → FAIL — Missing script (only in web/)');

h2('web/ directory');
code('npm run lint  → PASS');
code('npm run test  → PASS — 3/3 tests');
code('npm run build → PASS (~10s)');
code('WARNING: JS chunk 749 KB > 500 KB limit (not a failure)');

h2('Database');
code('npm run db:init → PASS — Database schema ready');

h2('Server runtime (PORT=8090 — current codebase)');
code('[db] Connected to PostgreSQL');
code('WARNING: CLOUDINARY_URL not set — uploads disabled');
code('NOTE: Port 8080 had stale/different process (room routes 404)');

// ─── 4. QR Flow ──────────────────────────────────────────────────────────────
doc.addPage();
h1('4. QR Flow Verification');
row(['Check', 'Result'], true);
row(['QR generation', 'Client-side QRCodeSVG in Location Manager']);
row(['URL format', '{baseUrl}?token={crypto-random-token}']);
row(['Room ID in URL?', 'No — opaque token, not UUID']);
row(['Auto room + dept?', 'YES — TESTED via /api/rooms/resolve']);
row(['Manual room pick?', 'Blocked — hasValidToken required']);
row(['Invalid QR?', 'TESTED — Invalid QR token on submit']);
row(['After build?', 'TESTED — GET / → 200 SPA index']);
row(['Camera scan', 'NOT TESTED — requires real device']);

p('Live test: token resolved room "4S R&D ROOM", dept "SSC Facilities", 14 assets.', C.pass);

// ─── 5. Issue Submission ─────────────────────────────────────────────────────
h1('5. Issue Submission Verification');

h2('Code review');
bullet('Required: name, employeeId, asset, issueType, priority, qrToken');
bullet('Notes required when issue = Other');
bullet('Duplicate protection: submitting flag disables button');
bullet('Image upload: needs CLOUDINARY_URL — NOT TESTED');

h2('Live API tests');
code('POST /api/issues → CREATED SSC-2026-0001');
code('GET /api/issues (admin) → ticket found in dashboard');
code('PUT status → In Progress → persisted');
code('GET /api/issues/track → status=In Progress after update');
p('Browser UI form submit: NOT TESTED this session.', C.warn);

// ─── 6. Dashboard ────────────────────────────────────────────────────────────
h1('6. Facility Dashboard Verification');
row(['Check', 'API tested?', 'UI tested?'], true);
row(['See issues', 'YES', 'No']);
row(['Filters', 'Code present', 'No']);
row(['Update status', 'YES — persisted', 'No']);
row(['Permanent save', 'YES — PostgreSQL', 'No']);
row(['Empty/loading states', 'Code present', 'No']);

// ─── 7. Auth ─────────────────────────────────────────────────────────────────
h1('7. Authentication & Access Control');
bullet('Login: POST /api/auth/login — bcrypt + JWT (30-day)');
bullet('Roles: admin, facility');
bullet('Public: request + track only');
bullet('Backend JWT on protected routes — TESTED');
bullet('Admin login: username/password → localStorage JWT');
bullet('RISK: .env has ADMIN_PASS=1234, weak JWT_SECRET');

p('TESTED: admin users list → id,username,role,is_active,created_at', C.pass);
p('TESTED: facility users list → id,username only', C.pass);

// ─── 8. Database ─────────────────────────────────────────────────────────────
doc.addPage();
h1('8. Database / Schema Verification');
p('Schema: server/schema.sql — applied on startup. Seed: 3 depts, 10 rooms.');

h3('Tables');
bullet('departments — id, code, name_en, name_ar, is_active');
bullet('rooms — id, department_id, name, floor, is_active');
bullet('room_qr_tokens — room_id, token (unique), is_active');
bullet('room_assets — room_id, name');
bullet('facility_issues — ticket_number, room_id, status, reporter, employee_id, image_url, etc.');
bullet('users — username, password_hash, role (admin|facility)');
bullet('issue_status_history — from_status, to_status, changed_by, note');
bullet('ticket_counters — SSC-YYYY-NNNN numbering');

// ─── 9. API Endpoints ────────────────────────────────────────────────────────
h1('9. API Endpoints');
row(['Method', 'Endpoint / Status'], true);
[
  ['GET', '/api/health — Working'],
  ['POST', '/api/auth/login — Working'],
  ['GET', '/api/users — Working (role-based fields)'],
  ['POST/DELETE', '/api/users — Admin (not re-tested)'],
  ['GET', '/api/departments — Working'],
  ['GET', '/api/rooms/resolve — Working'],
  ['GET', '/api/rooms — Working'],
  ['GET', '/api/rooms/admin — Working'],
  ['POST/PUT/DELETE', '/api/rooms* — Admin (not re-tested)'],
  ['POST', '/api/issues — Working (qrToken required)'],
  ['POST', '/api/issues/:id/attachments — 503 without CLOUDINARY'],
  ['GET', '/api/issues/track — Working (ticket+employeeId)'],
  ['GET/PUT', '/api/issues* — Working'],
  ['DELETE', '/api/issues/:id — Admin (not re-tested)'],
  ['GET', '/* SPA — Working'],
].forEach(([m, e]) => row([m, e]));

// ─── 10. Replit ──────────────────────────────────────────────────────────────
h1('10. Replit Readiness');

h3('Required Secrets');
code('DATABASE_URL, JWT_SECRET, ADMIN_USER, ADMIN_PASS');
code('VITE_PUBLIC_BASE_URL=https://your-repl.replit.app');
code('FACILITY_USER, FACILITY_PASS (strong passwords)');

h3('Optional');
code('CLOUDINARY_URL (photos), SMTP_* + NOTIFY_EMAIL (alerts)');

h3('Commands');
code('Replit run: npm run build:web && npm start');
code('First-time: npm run db:init');
code('Binds: 0.0.0.0:${PORT}');

bullet('Database: Replit PostgreSQL or Neon/Supabase');
bullet('Images: Cloudinary (ephemeral Replit disk)');
bullet('No replit.nix required');

// ─── 11. Risks ─────────────────────────────────────────────────────────────
h1('11. Production / MVP Risk Check');
row(['Risk', 'Status'], true);
row(['QR spam', 'Mitigated — rate limit + qrToken']);
row(['Invalid QR links', 'Handled — 404/400']);
row(['Dashboard exposed', 'JWT-protected API']);
row(['DB persistence', 'Verified PostgreSQL']);
row(['Uploads on redeploy', 'Lost without Cloudinary']);
row(['Hardcoded localhost', 'Dev-only (Vite 5173)']);
row(['Weak .env secrets', 'FLAGGED — change before pilot']);
row(['Mobile layout', 'NOT device-tested']);

// ─── 12. Final Verdict ───────────────────────────────────────────────────────
doc.addPage();
h1('12. Final Verdict');

verdict('READY FOR REPLIT DEPLOYMENT', 'YES', true);
verdict('READY FOR REAL FACILITY PILOT', 'YES (conditional)', false);
verdict('FRONTEND ONLY OR FULL STACK', 'FULL STACK', true);
verdict('DATABASE PERSISTENCE', 'YES', true);
verdict('AUTH PROTECTION', 'PARTIAL', false);

h2('Critical blockers');
p('None for Replit if PostgreSQL + secrets configured.', C.pass);

h2('Important fixes before upload');
bullet('Strong JWT_SECRET, ADMIN_PASS, FACILITY_PASS');
bullet('Set VITE_PUBLIC_BASE_URL to Replit URL');
bullet('CLOUDINARY_URL if photos needed');
bullet('Run npm run db:init once');

h2('Nice to have after upload');
bullet('Root-level lint/test scripts');
bullet('Browser E2E tests; SMTP alerts; remove unused deps');

h2('What was actually tested');
p('VERIFIED: npm install, web lint/build/test, db:init, full API flow (QR resolve → submit → dashboard → update → track), SPA serve.', C.pass);
p('NOT TESTED: Browser UI clicks, camera QR scan, mobile device, Cloudinary upload, SMTP, Replit deploy.', C.warn);

// ─── 13–14. Next steps ───────────────────────────────────────────────────────
h1('13. Smallest Safe Fix Plan');
bullet('1. Set Replit Secrets (strong passwords, DATABASE_URL, VITE_PUBLIC_BASE_URL)');
bullet('2. npm run db:init on Replit once');
bullet('3. Deploy via .replit run command');
bullet('4. Login → Manage Locations → verify QR prints');
bullet('5. Scan QR on phone → submit test → confirm in dashboard');
bullet('6. Add CLOUDINARY_URL only if photos required');

h1('14. Replit Setup & QR Printing');
bullet('Run: npm run build:web && npm start');
bullet('First test: GET /api/health → database: true');
bullet('Print QR: Admin → Command Center → Manage Locations → Print');
bullet('QR URL: https://your-repl.replit.app?token=XXXX');
bullet('Facility workflow: Login → view tickets → Accept → Resolve → Close');
bullet('Reporter tracking: Track tab → Ticket Number + Employee ID');

doc.moveDown(0.5);
doc.fontSize(8).fillColor(C.muted).font('Helvetica-Oblique')
  .text('Report generated by scripts/generate-verification-pdf.js — no code changes made during PDF export.', { align: 'center' });

doc.end();
console.log(`PDF written to: ${outPath}`);
