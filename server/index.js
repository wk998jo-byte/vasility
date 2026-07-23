import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { loadEnv } from './env.js';
import { getPool, initDb, checkDb, withTransaction } from './db.js';
import { sendNewIssueNotification } from './notify.js';
import { sendWhatsAppNotification, sendWhatsAppWelcome, sendWhatsAppNewTicketAlert, checkTwilioConfig } from './whatsapp.js';
import { USERS, getWhatsAppTargetsForCamp, siteToCamp, campsMatch } from './users-data.js';
import { initCloudinaryUpload, getUploadMiddleware, uploadBufferToCloudinary } from './upload.js';
import { warnIfDefaultPasswords } from './passwords.js';
import {
  generateTicketNumber,
  buildStaticQrToken,
  parseQrLocationKey,
  mapIssueRow,
  fetchIssueByTicketNumber,
  fetchIssueForTracking,
  fetchAllIssues,
  resolveRoomByToken,
  fetchPublicRooms,
  fetchAdminRooms,
  fetchDepartments,
  fetchUsers,
  fetchIssueHistory,
  fetchIssueComments,
  insertIssueComment,
  toPublicIssue,
} from './seed.js';

// Bypass local Windows SSL/Proxy inspection ONLY when explicitly enabled.
if (process.env.ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('[security] ALLOW_INSECURE_TLS=true — HTTPS certificate verification DISABLED');
}

loadEnv();
warnIfDefaultPasswords();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../web/dist');
const PORT = Number(process.env.PORT) || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

const allowedOrigins = new Set([
  process.env.VITE_PUBLIC_BASE_URL,
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
].filter(Boolean));

// This app's own domains, provided by the Replit environment
// (deployment domains in production, dev preview domain in the workspace).
for (const domain of (process.env.REPLIT_DOMAINS || '').split(',')) {
  if (domain.trim()) allowedOrigins.add(`https://${domain.trim()}`);
}
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    // Allow any localhost port for local dev / smoke tests
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }
    // Unknown origin: don't error out (that surfaced as HTTP 500);
    // simply omit CORS headers so browsers block cross-origin reads.
    callback(null, false);
  },
}));
app.use(express.json({ limit: '2mb' }));

const issueSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again in 15 minutes.' },
});

/** In-memory OTP store for forgot-password (single-process Replit-friendly). */
const passwordResetOtps = new Map();

function normalizePhoneDigits(p) {
  return String(p || '').replace(/\D/g, '');
}

function pruneExpiredOtps() {
  const now = Date.now();
  for (const [key, entry] of passwordResetOtps.entries()) {
    if (!entry?.expiresAt || entry.expiresAt <= now) passwordResetOtps.delete(key);
  }
}
const VALID_STATUSES = new Set(['New', 'In Progress', 'Resolved', 'Completed', 'Closed', 'Rejected']);
const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High']);
const VALID_ISSUES = new Set([
  'Broken / Not Working', 'Leaking', 'Electrical Issue', 'Needs Cleaning',
  'Noise / Vibration', 'Missing Part', 'Other',
]);

async function requireDb(req, res, next) {
  try {
    const db = await getPool();
    if (!db) {
      res.status(503).json({ error: 'Database not configured. Set DATABASE_URL in .env' });
      return;
    }
    req.db = db;
    next();
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!JWT_SECRET) {
    res.status(503).json({ error: 'JWT_SECRET not configured' });
    return;
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Role hierarchy:
//   'admin'      → main admin, all sites, full control
//   'site_admin' → admin of a single site (manages rooms/users of that site, gets WhatsApp alerts)
//   'sub_admin'  → limited admin of a single site (updates tickets only)
const ADMIN_ROLES = new Set(['admin', 'site_admin', 'sub_admin']);
const SITE_SCOPED_ROLES = new Set(['site_admin', 'sub_admin', 'facility']);

// Main admin only.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Main admin or site admin — may manage rooms/users (site admins: own site only).
function requireManager(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'site_admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Any staff — blocks read-only 'viewer' accounts from mutations.
function requireStaff(req, res, next) {
  if (!ADMIN_ROLES.has(req.user?.role) && req.user?.role !== 'facility') {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }
  next();
}

// Returns the site a user is restricted to, or null for global roles.
function userSite(user) {
  return SITE_SCOPED_ROLES.has(user?.role) ? (user?.site || null) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveTicketCamp(site, roomName) {
  const parsed = parseQrLocationKey(String(roomName || ''));
  if (parsed?.camp) return parsed.camp;
  if (site) {
    const staticKey = buildStaticQrToken(site, roomName);
    const fromKey = parseQrLocationKey(staticKey);
    if (fromKey?.camp) return fromKey.camp;
    const mapped = siteToCamp(site);
    if (mapped) return mapped;
  }
  return '';
}

// WhatsApp alert fan-out for a new ticket (RBAC):
// - USERS with role admin / camp All → every ticket
// - USERS with role subadmin → only when user.camp matches ticket camp
// - Also DB users (admin / matching site_admin|sub_admin|facility with phone)
// - Plus legacy ADMIN_WHATSAPP env number
async function notifyAdminsOfNewTicket(db, roomId, ticketNumber, summary, issue = null) {
  let site = null;
  let roomName = issue?.roomName || issue?.room_name || '';
  try {
    const { rows } = await db.query('SELECT site, name FROM rooms WHERE id = $1', [roomId]);
    site = rows[0]?.site || null;
    if (!roomName) roomName = rows[0]?.name || '';
  } catch { /* fall through — still alert main admins */ }

  const ticketCamp = deriveTicketCamp(site, roomName);
  const ticketPayload = {
    id: ticketNumber,
    ticketNumber,
    room: roomName,
    location: roomName,
    issue: issue?.issueType || issue?.issue_type || summary,
    issueType: issue?.issueType || issue?.issue_type || '',
    camp: ticketCamp,
    site,
  };

  const phones = new Map(); // digits → original phone string
  const addPhone = (phone, label = '') => {
    const raw = String(phone || '').trim();
    if (!raw) return;
    const digits = raw.replace(/\D/g, '');
    if (!digits || phones.has(digits)) return;
    phones.set(digits, raw.startsWith('+') ? raw : `+${digits.replace(/^00/, '')}`);
    if (label) console.log(`[whatsapp] queue ${label} (${raw})`);
  };

  // 1) Central USERS directory (campUsersData — strict RBAC filter)
  for (const user of getWhatsAppTargetsForCamp(ticketCamp)) {
    addPhone(user.phone, `${user.name || user.username} / ${user.role}`);
  }

  // 2) Live DB admins/sub-admins only (never facility technicians cross-camp)
  try {
    const { rows: dbUsers } = await db.query(
      `SELECT full_name, username, role, site, phone FROM users
       WHERE is_active = true AND phone IS NOT NULL AND phone <> ''
         AND role IN ('admin', 'site_admin', 'sub_admin')`,
    );
    for (const u of dbUsers) {
      const role = String(u.role || '').toLowerCase();
      if (role === 'admin') {
        addPhone(u.phone, `${u.full_name || u.username} / db-admin`);
        continue;
      }
      const userCamp = siteToCamp(u.site) || u.site;
      if (['site_admin', 'sub_admin'].includes(role) && campsMatch(userCamp, ticketCamp)) {
        addPhone(u.phone, `${u.full_name || u.username} / db-${role}`);
      }
    }
  } catch (err) {
    console.error('[whatsapp] DB recipient lookup failed:', err?.message || err);
  }

  const envPhone = (process.env.ADMIN_WHATSAPP || '').trim();
  if (envPhone) addPhone(envPhone, 'ADMIN_WHATSAPP env');

  const results = [];
  for (const phone of phones.values()) {
    results.push(
      sendWhatsAppNewTicketAlert(phone, ticketPayload)
        .catch((err) => console.error(`[whatsapp] new-ticket alert to ${phone} failed:`, err?.message || err)),
    );
  }

  if (!results.length) {
    console.log(`[whatsapp] No recipients with phone for ticket ${ticketNumber} (camp=${ticketCamp})`);
    // Keep USERS in scope for debugging empty-phone directories
    console.log(`[whatsapp] USERS directory size: ${Object.keys(USERS).length}`);
  }

  await Promise.all(results);
}

async function createNotification(db, {
  userId = null, role = null, message, ticketNumber = null,
}) {
  await db.query(
    `INSERT INTO notifications (user_id, role, message, ticket_number)
     VALUES ($1, $2, $3, $4)`,
    [userId, role, message, ticketNumber],
  );
}

function parseIssueFilters(query) {
  return {
    includeDeleted: query.includeDeleted === 'true',
    status: typeof query.status === 'string' && query.status.trim() ? query.status.trim() : undefined,
    departmentId: typeof query.department_id === 'string' && query.department_id.trim()
      ? query.department_id.trim() : undefined,
    roomId: typeof query.room_id === 'string' && query.room_id.trim()
      ? query.room_id.trim() : undefined,
    priority: typeof query.priority === 'string' && query.priority.trim()
      ? query.priority.trim() : undefined,
    site: typeof query.site === 'string' && query.site.trim()
      ? query.site.trim() : undefined,
    dateFrom: typeof query.date_from === 'string' && query.date_from.trim()
      ? query.date_from.trim() : undefined,
    dateTo: typeof query.date_to === 'string' && query.date_to.trim()
      ? `${query.date_to.trim()}T23:59:59.999Z` : undefined,
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getPool();
    if (!db) {
      res.status(200).json({ ok: true, database: false });
      return;
    }
    await checkDb();
    res.status(200).json({ ok: true, database: true });
  } catch {
    res.status(503).json({ ok: false, database: false });
  }
});

app.post('/api/auth/login', loginLimiter, requireDb, async (req, res) => {
  if (!JWT_SECRET) {
    res.status(503).json({ error: 'JWT_SECRET not configured' });
    return;
  }

  const username = req.body?.username?.trim();
  const password = req.body?.password;

  if (!username || password === undefined) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  try {
    const { rows } = await req.db.query(
      'SELECT id, username, password_hash, role, site, full_name FROM users WHERE LOWER(username) = LOWER($1) AND is_active = true',
      [username],
    );
    const user = rows[0];
    if (!user?.password_hash) {
      console.warn(`[auth] Failed login: unknown or inactive user "${username}"`);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.warn(`[auth] Failed login: wrong password for "${user.username}"`);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = jwt.sign(
      { sub: user.id, user: user.username, role: user.role, site: user.site || null },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    );
    res.status(200).json({
      token, role: user.role, site: user.site || null, fullName: user.full_name || '',
    });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', requireDb, authenticateToken, async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { rows } = await req.db.query(
      `SELECT username, full_name, phone, email, role, site, title
       FROM users WHERE id = $1 AND is_active = true`,
      [userId],
    );
    const user = rows[0];
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const camp = user.role === 'admin' || !user.site
      ? 'All'
      : (siteToCamp(user.site) || user.site);

    res.status(200).json({
      username: user.username,
      name: user.full_name || user.username,
      title: user.title || '',
      role: user.role,
      camp,
      site: user.site || null,
      phone: user.phone || '',
      email: user.email || '',
    });
  } catch {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.put('/api/auth/change-password', requireDb, authenticateToken, async (req, res) => {
  const oldPassword = req.body?.oldPassword;
  const newPassword = req.body?.newPassword;

  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: 'oldPassword and newPassword required' });
    return;
  }
  if (String(newPassword).length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { rows } = await req.db.query(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
      [userId],
    );
    const user = rows[0];
    if (!user?.password_hash) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(String(oldPassword), user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid current password' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    await req.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId],
    );
    res.status(200).json({ ok: true, message: 'Password updated successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.get('/api/users', requireDb, authenticateToken, async (req, res) => {
  const role = typeof req.query.role === 'string' && req.query.role.trim()
    ? req.query.role.trim()
    : undefined;

  try {
    const users = await fetchUsers(req.db, { role });
    const isManager = req.user?.role === 'admin' || req.user?.role === 'site_admin';
    const mySite = userSite(req.user);
    const scoped = mySite
      ? users.filter((u) => !u.site || u.site === mySite || u.role === 'admin')
      : users;
    const sanitized = isManager
      ? scoped
      : scoped.map(({ id, username }) => ({ id, username }));
    res.status(200).json({ users: sanitized });
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const CREATABLE_ROLES = new Set(['admin', 'site_admin', 'sub_admin', 'facility', 'viewer']);

app.post('/api/users', requireDb, authenticateToken, requireManager, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = req.body?.password;
  const role = typeof req.body?.role === 'string' && CREATABLE_ROLES.has(req.body.role)
    ? req.body.role : 'facility';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().slice(0, 120) : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim().slice(0, 30) : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 254) : '';
  let site = typeof req.body?.site === 'string' && req.body.site.trim() ? req.body.site.trim() : null;

  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }

  if (!fullName || !phone || !email) {
    res.status(400).json({ error: 'fullName, phone and email are required' });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email address is required' });
    return;
  }

  // Site admins may only create sub-admins / facility staff for their own site.
  const mySite = userSite(req.user);
  if (req.user?.role === 'site_admin') {
    if (role !== 'sub_admin' && role !== 'facility') {
      res.status(403).json({ error: 'Site admins can only create sub-admins or facility staff' });
      return;
    }
    site = mySite;
  }

  if ((role === 'site_admin' || role === 'sub_admin') && !site) {
    res.status(400).json({ error: 'site is required for site admins and sub-admins' });
    return;
  }
  if (role === 'admin') site = null;

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await req.db.query(
      `INSERT INTO users (username, password_hash, role, is_active, full_name, phone, email, site)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7)
       RETURNING id, username, role, full_name, phone, email, site`,
      [username, passwordHash, role, fullName, phone, email, site],
    );
    res.status(201).json({ ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/users/:id', requireDb, authenticateToken, requireManager, async (req, res) => {
  const userId = req.params.id;

  if (!UUID_RE.test(userId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  if (String(req.user?.sub || '') === String(userId)) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  try {
    const { rows: targetRows } = await req.db.query(
      'SELECT id, username, role, site FROM users WHERE id = $1',
      [userId],
    );
    const target = targetRows[0];
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Site admins may only delete sub-admins / facility staff of their own site.
    if (req.user?.role === 'site_admin') {
      const mySite = userSite(req.user);
      const allowedRole = target.role === 'sub_admin' || target.role === 'facility';
      if (!allowedRole || target.site !== mySite) {
        res.status(403).json({ error: 'Not allowed to delete this user' });
        return;
      }
    } else if (req.user?.role === 'admin' && target.role === 'admin') {
      res.status(403).json({ error: 'Cannot delete another admin account' });
      return;
    }

    await withTransaction(req.db, async (client) => {
      // Clear FK references that block hard delete (no ON DELETE SET NULL in schema).
      await client.query(
        'UPDATE issue_status_history SET changed_by = NULL WHERE changed_by = $1',
        [userId],
      );
      const { rowCount } = await client.query(
        'DELETE FROM users WHERE id = $1',
        [userId],
      );
      if (!rowCount) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
      }
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    if (err?.status === 404) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.error('[users] delete failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
});

/** Admin/site-admin resets another user's password. */
app.post('/api/users/:id/reset-password', requireDb, authenticateToken, requireManager, async (req, res) => {
  const userId = req.params.id;
  const newPassword = req.body?.newPassword ?? req.body?.password;

  if (!UUID_RE.test(userId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (!newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }
  if (String(req.user?.sub || '') === String(userId)) {
    res.status(400).json({ error: 'Use Profile to change your own password' });
    return;
  }

  try {
    const { rows } = await req.db.query(
      'SELECT id, username, role, site FROM users WHERE id = $1 AND is_active = true',
      [userId],
    );
    const target = rows[0];
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (req.user?.role === 'site_admin') {
      const mySite = userSite(req.user);
      const allowedRole = target.role === 'sub_admin' || target.role === 'facility';
      if (!allowedRole || target.site !== mySite) {
        res.status(403).json({ error: 'Not allowed to reset this user password' });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    await req.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId],
    );
    res.status(200).json({ ok: true, username: target.username });
  } catch (err) {
    console.error('[users] reset-password failed:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * Forgot password — step 1: username + registered phone → WhatsApp OTP.
 * Always returns a generic success when possible (limits user enumeration).
 */
app.post('/api/auth/forgot-password/request', forgotPasswordLimiter, requireDb, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

  if (!username || !phone) {
    res.status(400).json({ error: 'username and phone required' });
    return;
  }

  pruneExpiredOtps();
  const generic = {
    ok: true,
    message: 'If the account matches, a reset code was sent to WhatsApp.',
  };

  try {
    const { rows } = await req.db.query(
      `SELECT id, phone, username FROM users
       WHERE LOWER(username) = LOWER($1) AND is_active = true`,
      [username],
    );
    const user = rows[0];
    const phoneOk = user
      && normalizePhoneDigits(user.phone)
      && normalizePhoneDigits(user.phone) === normalizePhoneDigits(phone);

    if (!phoneOk) {
      // Same response shape — do not confirm whether the user exists.
      res.status(200).json(generic);
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const key = String(user.username).toLowerCase();
    passwordResetOtps.set(key, {
      userId: user.id,
      codeHash,
      phoneDigits: normalizePhoneDigits(user.phone),
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });

    sendWhatsAppNotification(
      user.phone,
      'PWD-RESET',
      'admin',
      `Password reset code: ${code}. Valid 10 minutes.`,
    ).catch((err) => console.error('[auth] OTP WhatsApp failed:', err?.message || err));

    res.status(200).json(generic);
  } catch (err) {
    console.error('[auth] forgot-password request failed:', err.message);
    res.status(500).json({ error: 'Failed to start password reset' });
  }
});

/**
 * Forgot password — step 2: confirm OTP + set new password (min 8 chars).
 */
app.post('/api/auth/forgot-password', forgotPasswordLimiter, requireDb, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const newPassword = req.body?.newPassword ?? req.body?.password;
  const confirmPassword = req.body?.confirmPassword;

  if (!username || !phone || !code) {
    res.status(400).json({ error: 'username, phone and code required' });
    return;
  }
  if (!newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }
  if (confirmPassword !== undefined && String(confirmPassword) !== String(newPassword)) {
    res.status(400).json({ error: 'passwords do not match' });
    return;
  }

  pruneExpiredOtps();
  const key = username.toLowerCase();
  const entry = passwordResetOtps.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    passwordResetOtps.delete(key);
    res.status(400).json({ error: 'Invalid or expired reset code' });
    return;
  }
  if (entry.phoneDigits !== normalizePhoneDigits(phone)) {
    res.status(400).json({ error: 'Username and registered phone do not match' });
    return;
  }

  entry.attempts += 1;
  if (entry.attempts > 5) {
    passwordResetOtps.delete(key);
    res.status(429).json({ error: 'Too many invalid code attempts' });
    return;
  }

  const codeOk = await bcrypt.compare(code, entry.codeHash);
  if (!codeOk) {
    res.status(400).json({ error: 'Invalid or expired reset code' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    await req.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, entry.userId],
    );
    passwordResetOtps.delete(key);
    res.status(200).json({ ok: true, message: 'Password updated. You can log in now.' });
  } catch (err) {
    console.error('[auth] forgot-password confirm failed:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.get('/api/departments', requireDb, async (req, res) => {
  try {
    const departments = await fetchDepartments(req.db);
    res.status(200).json({ departments });
  } catch {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

app.get('/api/rooms/resolve', requireDb, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token) {
    res.status(400).json({ error: 'token query parameter required' });
    return;
  }

  try {
    const resolved = await resolveRoomByToken(req.db, token);
    if (!resolved) {
      res.status(404).json({ error: 'Invalid or expired QR token' });
      return;
    }
    res.status(200).json(resolved);
  } catch {
    res.status(500).json({ error: 'Failed to resolve token' });
  }
});

app.get('/api/rooms', requireDb, async (req, res) => {
  try {
    const rooms = await fetchPublicRooms(req.db);
    res.status(200).json({ rooms });
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.get('/api/rooms/admin', requireDb, authenticateToken, async (req, res) => {
  try {
    let rooms = await fetchAdminRooms(req.db);
    const mySite = userSite(req.user);
    if (mySite) {
      rooms = rooms.filter((r) => !r.site || String(r.site).toLowerCase() === String(mySite).toLowerCase()
        || siteToCamp(r.site) === siteToCamp(mySite));
    }
    res.status(200).json({ rooms });
  } catch {
    res.status(500).json({ error: 'Failed to fetch admin rooms' });
  }
});

app.post('/api/rooms', requireDb, authenticateToken, requireManager, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const departmentId = typeof req.body?.departmentId === 'string' ? req.body.departmentId.trim() : '';
  const floor = typeof req.body?.floor === 'string' ? req.body.floor.trim() : null;
  const mySiteCreate = userSite(req.user);
  const site = mySiteCreate
    || (typeof req.body?.site === 'string' && req.body.site.trim() ? req.body.site.trim() : 'Dhahran');
  const assets = Array.isArray(req.body?.assets)
    ? req.body.assets.map((a) => String(a).trim()).filter(Boolean)
    : [];

  if (!name || !departmentId) {
    res.status(400).json({ error: 'name and departmentId are required' });
    return;
  }

  try {
    const dept = await req.db.query(
      'SELECT id FROM departments WHERE id = $1 AND is_active = true',
      [departmentId],
    );
    if (!dept.rowCount) {
      res.status(400).json({ error: 'Invalid department' });
      return;
    }

    const room = await req.db.query(
      `INSERT INTO rooms (department_id, name, floor, site, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, floor, site, department_id`,
      [departmentId, name, floor, site],
    );
    const roomId = room.rows[0].id;
    const token = buildStaticQrToken(site, name);

    await req.db.query(
      'INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)',
      [roomId, token],
    );

    const assetList = assets.length ? assets : ['OTHER ASSET'];
    for (const assetName of assetList) {
      await req.db.query(
        'INSERT INTO room_assets (room_id, name) VALUES ($1, $2)',
        [roomId, assetName],
      );
    }

    res.status(201).json({
      ok: true,
      room: {
        id: roomId,
        name,
        floor,
        site,
        departmentId,
        token,
        assets: assetList,
        isActive: true,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Room already exists in this department' });
      return;
    }
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.put('/api/rooms/:id', requireDb, authenticateToken, requireManager, async (req, res) => {
  const roomId = req.params.id;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const floor = req.body?.floor !== undefined
    ? (typeof req.body.floor === 'string' ? req.body.floor.trim() || null : null)
    : undefined;
  const site = req.body?.site !== undefined
    ? (typeof req.body.site === 'string' ? req.body.site.trim() || null : null)
    : undefined;

  if (name === undefined && floor === undefined && site === undefined) {
    res.status(400).json({ error: 'name, floor or site required' });
    return;
  }

  try {
    const existing = await req.db.query(
      'SELECT id, name, floor, site, department_id FROM rooms WHERE id = $1 AND is_active = true',
      [roomId],
    );
    if (!existing.rowCount) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const current = existing.rows[0];
    const mySiteEdit = userSite(req.user);
    if (mySiteEdit && current.site !== mySiteEdit) {
      res.status(403).json({ error: 'Not allowed to manage rooms of another site' });
      return;
    }
    const newName = name ?? current.name;
    const newFloor = floor !== undefined ? floor : current.floor;
    const newSite = mySiteEdit || (site !== undefined ? site : current.site);

    const { rows } = await req.db.query(
      `UPDATE rooms SET name = $1, floor = $2, site = $3 WHERE id = $4
       RETURNING id, name, floor, site, department_id`,
      [newName, newFloor, newSite, roomId],
    );

    res.status(200).json({
      ok: true,
      room: {
        id: rows[0].id,
        name: rows[0].name,
        floor: rows[0].floor,
        site: rows[0].site,
        departmentId: rows[0].department_id,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Room already exists in this department' });
      return;
    }
    res.status(500).json({ error: 'Failed to update room' });
  }
});

app.post('/api/rooms/:id/qr/regenerate', requireDb, authenticateToken, requireManager, async (req, res) => {
  const roomId = req.params.id;

  try {
    const roomCheck = await req.db.query(
      'SELECT id, name, site FROM rooms WHERE id = $1 AND is_active = true',
      [roomId],
    );
    if (!roomCheck.rowCount) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const mySiteQr = userSite(req.user);
    if (mySiteQr && roomCheck.rows[0].site !== mySiteQr) {
      res.status(403).json({ error: 'Not allowed to manage rooms of another site' });
      return;
    }

    const roomRow = roomCheck.rows[0];
    const newToken = buildStaticQrToken(roomRow.site, roomRow.name);

    await withTransaction(req.db, async (client) => {
      await client.query(
        'UPDATE room_qr_tokens SET is_active = false WHERE room_id = $1 AND is_active = true',
        [roomId],
      );
      await client.query(
        'INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)',
        [roomId, newToken],
      );
    });

    res.status(200).json({ ok: true, token: newToken, roomId });
  } catch {
    res.status(500).json({ error: 'Failed to regenerate QR token' });
  }
});

app.delete('/api/rooms/:id', requireDb, authenticateToken, requireManager, async (req, res) => {
  const roomId = req.params.id;

  try {
    const roomCheck = await req.db.query(
      'SELECT id, site FROM rooms WHERE id = $1 AND is_active = true',
      [roomId],
    );
    if (!roomCheck.rowCount) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const mySiteDel = userSite(req.user);
    if (mySiteDel && roomCheck.rows[0].site !== mySiteDel) {
      res.status(403).json({ error: 'Not allowed to manage rooms of another site' });
      return;
    }

    await withTransaction(req.db, async (client) => {
      await client.query(
        'UPDATE rooms SET is_active = false WHERE id = $1',
        [roomId],
      );
      await client.query(
        'UPDATE room_qr_tokens SET is_active = false WHERE room_id = $1',
        [roomId],
      );
    });

    res.status(200).json({ ok: true, roomId });
  } catch {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

app.post('/api/issues', issueSubmitLimiter, requireDb, async (req, res) => {
  const body = req.body || {};
  const reporterName = typeof body.reporterName === 'string' ? body.reporterName.trim() : '';
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
  const assetName = typeof body.assetName === 'string' ? body.assetName.trim() : '';
  const issueType = typeof body.issueType === 'string' ? body.issueType.trim() : '';
  const priority = typeof body.priority === 'string' ? body.priority.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const qrToken = typeof body.qrToken === 'string' ? body.qrToken.trim() : '';
  const reporterPhone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
  const reporterEmail = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';

  if (!reporterName || !employeeId || !assetName || !issueType || !priority) {
    res.status(400).json({ error: 'reporterName, employeeId, assetName, issueType, and priority are required' });
    return;
  }

  const phoneDigits = reporterPhone.replace(/\D/g, '');
  if (!reporterPhone || phoneDigits.length < 8) {
    res.status(400).json({ error: 'A valid phone number is required (for WhatsApp notifications)' });
    return;
  }

  if (!reporterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
    res.status(400).json({ error: 'A valid email address is required' });
    return;
  }

  if (!qrToken) {
    res.status(400).json({ error: 'qrToken required — scan a valid Room QR code' });
    return;
  }

  if (!VALID_PRIORITIES.has(priority)) {
    res.status(400).json({ error: 'Invalid priority' });
    return;
  }

  if (!VALID_ISSUES.has(issueType)) {
    res.status(400).json({ error: 'Invalid issue type' });
    return;
  }

  if (issueType === 'Other' && !description) {
    res.status(400).json({ error: 'description required when issue type is Other' });
    return;
  }

  try {
    const resolved = await resolveRoomByToken(req.db, qrToken);
    if (!resolved) {
      res.status(400).json({ error: 'Invalid QR token' });
      return;
    }

    const resolvedRoomId = resolved.room.id;
    const departmentId = resolved.room.departmentId || resolved.room.department?.id || null;

    const assetValid = resolved.assets.some(
      (a) => a.toLowerCase() === assetName.toLowerCase(),
    );
    if (!assetValid) {
      res.status(400).json({ error: 'Asset does not belong to this room' });
      return;
    }

    const duplicate = await req.db.query(
      `SELECT id FROM facility_issues
       WHERE room_id = $1 AND issue_type = $2
         AND status IN ('New', 'In Progress') AND is_deleted = false
       LIMIT 1`,
      [resolvedRoomId, issueType],
    );
    if (duplicate.rowCount > 0) {
      res.status(409).json({ error: 'An active ticket already exists for this issue in this location.' });
      return;
    }

    const ticketNumber = await generateTicketNumber(req.db);

    const { rows } = await req.db.query(
      `INSERT INTO facility_issues (
         ticket_number, room_id, department_id, asset_name, issue_type, priority, description,
         reporter_name, employee_id, status, qr_token_used, reporter_phone, reporter_email
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'New', $10, $11, $12)
       RETURNING id`,
      [
        ticketNumber, resolvedRoomId, departmentId, assetName, issueType, priority, description,
        reporterName, employeeId, qrToken, reporterPhone, reporterEmail,
      ],
    );

    const issue = await fetchIssueByTicketNumber(req.db, ticketNumber);

    await req.db.query(
      `INSERT INTO issue_status_history (issue_id, from_status, to_status, note)
       VALUES ($1, NULL, 'New', 'Issue reported via QR')`,
      [rows[0].id],
    );

    sendNewIssueNotification(issue).catch(() => {});
    if (reporterPhone) {
      console.log('\n--- META DEBUG: TRIGGERING WHATSAPP ---');
      console.log('Target Phone:', reporterPhone);
      console.log('Ticket ID:', ticketNumber);
      console.log('Path: welcome template to reporter (on ticket create)');
      // Fire-and-forget so the HTTP response is never delayed by WhatsApp.
      sendWhatsAppWelcome(reporterPhone, ticketNumber)
        .then((result) => {
          console.log('[whatsapp] welcome result:', JSON.stringify(result));
        })
        .catch((err) => {
          console.error('\n❌ META WHATSAPP FATAL ERROR ❌');
          console.error('Error Message:', err?.message || err);
          console.error('---------------------------\n');
        });
    } else {
      console.warn('[whatsapp] No reporter phone on ticket — skipping welcome WhatsApp');
    }
    createNotification(req.db, {
      role: 'admin',
      message: `New Ticket created: ${ticketNumber}`,
      ticketNumber,
    }).catch((err) => console.error('[notifications] insert failed:', err.message));

    const adminSummary = [issue?.roomName || issue?.room_name, assetName, issueType]
      .filter(Boolean).join(' — ');
    // WhatsApp RBAC fan-out (USERS + DB) — fire-and-forget; never blocks HTTP response.
    console.log('[whatsapp] Queuing admin RBAC fan-out for ticket', ticketNumber);
    notifyAdminsOfNewTicket(req.db, resolvedRoomId, ticketNumber, adminSummary, issue)
      .then(() => console.log('[whatsapp] admin fan-out finished for', ticketNumber))
      .catch((err) => {
        console.error('\n❌ META WHATSAPP FATAL ERROR ❌');
        console.error('Error Message:', err?.message || err);
        console.error('---------------------------\n');
      });

    res.status(201).json({ ok: true, issue: toPublicIssue(issue) });
  } catch (err) {
    if (err?.code === '23505' && err?.constraint === 'uniq_facility_issues_active_room_issue') {
      res.status(409).json({ error: 'An active ticket already exists for this issue in this location.' });
      return;
    }
    console.error('[issues] create failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

app.post('/api/issues/:ticketNumber/attachments', issueSubmitLimiter, requireDb, (req, res, next) => {
  const upload = getUploadMiddleware();
  if (!upload) {
    res.status(503).json({ error: 'Issue photo uploads are not enabled on this deployment.' });
    return;
  }
  upload.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed' });
      return;
    }
    next();
  });
}, async (req, res) => {
  const ticketNumber = req.params.ticketNumber;
  const qrToken = typeof req.body?.qrToken === 'string' ? req.body.qrToken.trim() : '';

  if (!qrToken) {
    res.status(400).json({ error: 'qrToken required — must match the Room QR used when reporting' });
    return;
  }

  if (!req.file?.buffer) {
    res.status(400).json({ error: 'image file required' });
    return;
  }

  try {
    const existing = await req.db.query(
      `SELECT id, room_id, qr_token_used FROM facility_issues
       WHERE ticket_number = $1 AND is_deleted = false`,
      [ticketNumber],
    );
    if (!existing.rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticket = existing.rows[0];
    const resolved = await resolveRoomByToken(req.db, qrToken);
    if (!resolved || resolved.room.id !== ticket.room_id) {
      res.status(403).json({ error: 'Invalid QR token for this ticket' });
      return;
    }
    // Bind upload to the exact QR token used when the ticket was created.
    if (ticket.qr_token_used && String(ticket.qr_token_used).trim() !== qrToken) {
      res.status(403).json({ error: 'QR token does not match this ticket' });
      return;
    }

    const uploadResult = await uploadBufferToCloudinary(req.file.buffer);
    const imageUrl = uploadResult?.secure_url;

    if (!imageUrl) {
      res.status(500).json({ error: 'Cloudinary upload failed' });
      return;
    }

    await req.db.query(
      'UPDATE facility_issues SET image_url = $1, updated_at = now() WHERE ticket_number = $2',
      [imageUrl, ticketNumber],
    );

    const issue = await fetchIssueByTicketNumber(req.db, ticketNumber);
    res.status(200).json({ ok: true, imageUrl, issue: toPublicIssue(issue) });
  } catch (err) {
    console.error('[upload] Issue photo upload failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

app.get('/api/issues/:ticketNumber/comments', requireDb, async (req, res) => {
  const ticketNumber = req.params.ticketNumber;
  const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : '';

  // Access: staff with a valid JWT, or the reporter proving identity with
  // ticketNumber + employeeId (same gate as the public tracking endpoint).
  let isStaff = false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && JWT_SECRET) {
    try {
      jwt.verify(authHeader.slice('Bearer '.length), JWT_SECRET);
      isStaff = true;
    } catch {
      // fall through to employeeId check
    }
  }

  if (!isStaff && !employeeId) {
    res.status(401).json({ error: 'employeeId query parameter or authentication required' });
    return;
  }

  try {
    const issue = await req.db.query(
      'SELECT id, employee_id FROM facility_issues WHERE ticket_number = $1 AND is_deleted = false',
      [ticketNumber],
    );
    if (!issue.rowCount || (!isStaff && issue.rows[0].employee_id !== employeeId)) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const comments = await fetchIssueComments(req.db, issue.rows[0].id);
    res.status(200).json({ comments });
  } catch {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/issues/:ticketNumber/comments', requireDb, authenticateToken, requireStaff, async (req, res) => {
  const ticketNumber = req.params.ticketNumber;
  const commentText = typeof req.body?.commentText === 'string'
    ? req.body.commentText.trim()
    : (typeof req.body?.comment === 'string' ? req.body.comment.trim() : '');

  if (!commentText) {
    res.status(400).json({ error: 'commentText required' });
    return;
  }
  if (commentText.length > 2000) {
    res.status(400).json({ error: 'comment too long (max 2000 characters)' });
    return;
  }

  try {
    const issue = await req.db.query(
      'SELECT id FROM facility_issues WHERE ticket_number = $1 AND is_deleted = false',
      [ticketNumber],
    );
    if (!issue.rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const comment = await insertIssueComment(
      req.db,
      issue.rows[0].id,
      req.user?.user || 'Unknown',
      req.user?.role || 'facility',
      commentText,
    );
    res.status(201).json({ ok: true, comment });
  } catch {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

app.post('/api/issues/:ticketNumber/resolution', requireDb, authenticateToken, (req, res, next) => {
  const role = req.user?.role;
  // Admins/facility always; sub_admin/site_admin allowed too (they are often assigned technicians).
  // Exact assignee check happens after we load the ticket below.
  if (!ADMIN_ROLES.has(role) && role !== 'facility') {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }
  const upload = getUploadMiddleware();
  if (!upload) {
    res.status(503).json({ error: 'Photo uploads are not enabled on this deployment.' });
    return;
  }
  upload.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed' });
      return;
    }
    next();
  });
}, async (req, res) => {
  const ticketNumber = req.params.ticketNumber;
  const changedBy = req.user?.sub || null;
  const username = String(req.user?.user || '').trim().toLowerCase();

  if (!req.file?.buffer) {
    res.status(400).json({ error: 'image file required' });
    return;
  }

  try {
    const existing = await req.db.query(
      'SELECT id, status, reporter_phone, assignee FROM facility_issues WHERE ticket_number = $1 AND is_deleted = false',
      [ticketNumber],
    );
    if (!existing.rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticket = existing.rows[0];
    const assignee = String(ticket.assignee || '').trim().toLowerCase();
    let isAssignee = Boolean(username && assignee && username === assignee);
    if (!isAssignee && req.user?.sub && assignee) {
      try {
        const me = await req.db.query(
          'SELECT username, full_name FROM users WHERE id = $1 AND is_active = true',
          [req.user.sub],
        );
        const row = me.rows[0];
        if (row) {
          const aliases = [row.username, row.full_name]
            .map((v) => String(v || '').trim().toLowerCase())
            .filter(Boolean);
          isAssignee = aliases.includes(assignee);
        }
      } catch {
        // fall through with username-only match
      }
    }
    const role = req.user?.role;
    // Main admin may upload for any ticket; everyone else only if assigned to them.
    if (role !== 'admin' && !isAssignee) {
      res.status(403).json({ error: 'Only the assigned technician can upload a resolution photo' });
      return;
    }
    if (ticket.status !== 'In Progress' && ticket.status !== 'Resolved') {
      res.status(409).json({ error: 'Resolution photo can only be uploaded for tickets that are In Progress.' });
      return;
    }
    const uploadResult = await uploadBufferToCloudinary(req.file.buffer);
    const imageUrl = uploadResult?.secure_url;

    if (!imageUrl) {
      res.status(500).json({ error: 'Cloudinary upload failed' });
      return;
    }

    await withTransaction(req.db, async (client) => {
      await client.query(
        `UPDATE facility_issues
         SET resolution_image_url = $1, status = 'Resolved', updated_at = now()
         WHERE ticket_number = $2`,
        [imageUrl, ticketNumber],
      );

      if (ticket.status !== 'Resolved') {
        await client.query(
          `INSERT INTO issue_status_history (issue_id, from_status, to_status, changed_by, note)
           VALUES ($1, $2, 'Resolved', $3, 'Resolution photo uploaded')`,
          [ticket.id, ticket.status, changedBy],
        );
      }
    });

    if (ticket.status !== 'Resolved' && ticket.reporter_phone) {
      sendWhatsAppNotification(ticket.reporter_phone, req.params.ticketNumber, 'done')
        .catch((err) => console.error('[whatsapp] notify failed:', err?.message || err));
    }

    const issue = await fetchIssueByTicketNumber(req.db, ticketNumber);
    res.status(200).json({ ok: true, resolutionImageUrl: imageUrl, issue });
  } catch (err) {
    console.error('[upload] Resolution photo upload failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to save resolution photo' });
  }
});

app.get('/api/issues/track', requireDb, async (req, res) => {
  const ticketNumber = typeof req.query.ticketNumber === 'string'
    ? req.query.ticketNumber.trim()
    : '';
  const employeeId = typeof req.query.employeeId === 'string'
    ? req.query.employeeId.trim()
    : '';

  if (!ticketNumber || !employeeId) {
    res.status(400).json({ error: 'ticketNumber and employeeId query parameters required' });
    return;
  }

  try {
    const issue = await fetchIssueForTracking(req.db, ticketNumber, employeeId);
    if (!issue) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    // Resolution photos are for internal admin/facility review only —
    // never expose them on the public tracking endpoint.
    res.status(200).json({ issue: toPublicIssue(issue) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

app.get('/api/issues', requireDb, authenticateToken, async (req, res) => {
  try {
    const filters = parseIssueFilters(req.query);
    const mySite = userSite(req.user);
    const role = req.user?.role;
    if (mySite) {
      filters.site = mySite;
      // Always include tickets assigned to this user, even outside their site.
      if (req.user?.user) filters.assigneeUsername = req.user.user;
    } else if (role === 'facility' && req.user?.user) {
      // Facility without a site: only tickets assigned to them.
      filters.assigneeOnly = req.user.user;
    }
    const issues = await fetchAllIssues(req.db, filters);
    res.status(200).json({ issues });
  } catch {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

app.get('/api/issues/:ticketNumber/history', requireDb, authenticateToken, async (req, res) => {
  const ticketNumber = req.params.ticketNumber;

  try {
    const issue = await req.db.query(
      `SELECT fi.id, fi.assignee, r.site AS room_site
       FROM facility_issues fi
       JOIN rooms r ON r.id = fi.room_id
       WHERE fi.ticket_number = $1`,
      [ticketNumber],
    );
    if (!issue.rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const row = issue.rows[0];
    const mySite = userSite(req.user);
    const username = String(req.user?.user || '').trim().toLowerCase();
    const assignee = String(row.assignee || '').trim().toLowerCase();
    const isAssignee = Boolean(username && assignee && username === assignee);
    if (mySite) {
      const siteOk = String(row.room_site || '').toLowerCase() === String(mySite).toLowerCase()
        || siteToCamp(row.room_site) === siteToCamp(mySite);
      if (!siteOk && !isAssignee) {
        res.status(403).json({ error: 'Not allowed to view history of another site' });
        return;
      }
    } else if (req.user?.role === 'facility' && !isAssignee) {
      res.status(403).json({ error: 'Not allowed to view this ticket history' });
      return;
    }

    const history = await fetchIssueHistory(req.db, row.id);
    res.status(200).json({ history });
  } catch {
    res.status(500).json({ error: 'Failed to fetch ticket history' });
  }
});

app.put('/api/issues/:ticketNumber', requireDb, authenticateToken, requireStaff, async (req, res) => {
  const ticketNumber = req.params.ticketNumber;
  const body = req.body || {};
  const changedBy = req.user?.sub || null;

  try {
    const existing = await req.db.query(
      'SELECT * FROM facility_issues WHERE ticket_number = $1',
      [ticketNumber],
    );
    if (!existing.rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const current = existing.rows[0];
    const newStatus = body.status ?? current.status;
    // Any admin tier may manage ticket status/cost; site-scoped roles only within their site.
    const isAdmin = ADMIN_ROLES.has(req.user?.role);
    const canDelete = req.user?.role === 'admin' || req.user?.role === 'site_admin';
    const role = req.user?.role;
    const username = String(req.user?.user || '').trim().toLowerCase();
    const currentAssignee = String(current.assignee || '').trim().toLowerCase();
    const isAssignee = Boolean(username && currentAssignee && username === currentAssignee);

    const mySite = userSite(req.user);
    if (mySite) {
      const roomSite = await req.db.query('SELECT site FROM rooms WHERE id = $1', [current.room_id]);
      const ticketSite = roomSite.rows[0]?.site || '';
      const siteOk = String(ticketSite).toLowerCase() === String(mySite).toLowerCase()
        || siteToCamp(ticketSite) === siteToCamp(mySite);
      // Assignees may update (e.g. close) even when the ticket is outside their home site.
      if (!siteOk && !isAssignee) {
        res.status(403).json({ error: 'Not allowed to manage tickets of another site' });
        return;
      }
    }

    // Facility staff may only mutate tickets assigned to them.
    if (role === 'facility' && !isAssignee) {
      res.status(403).json({ error: 'Only the assigned technician can update this ticket' });
      return;
    }

    if (!VALID_STATUSES.has(newStatus)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    if (!canDelete && body.isDeleted !== undefined && Boolean(body.isDeleted) !== current.is_deleted) {
      res.status(403).json({ error: 'Admin access required to delete tickets' });
      return;
    }

    const statusNote = body.statusNote ?? body.rejectionReason ?? null;
    const newUnitPrice = isAdmin && body.unitPrice !== undefined
      ? Number(body.unitPrice) || 0
      : Number(current.unit_price) || 0;
    const newUnits = isAdmin && body.units !== undefined
      ? Math.max(1, Math.round(Number(body.units)) || 1)
      : Number(current.units) || 1;
    const costFieldsChanged = isAdmin && (body.unitPrice !== undefined || body.units !== undefined);
    const newCost = costFieldsChanged
      ? newUnitPrice * newUnits
      : (isAdmin && body.cost !== undefined ? Number(body.cost) || 0 : current.cost);
    const newParts = isAdmin && body.parts !== undefined ? body.parts : current.parts;
    let newAssignee = isAdmin && body.assignee !== undefined ? String(body.assignee).trim() : current.assignee;
    // Prefer canonical DB username when assignee was stored as a display name.
    if (isAdmin && body.assignee !== undefined && newAssignee) {
      try {
        const found = await req.db.query(
          `SELECT username FROM users
           WHERE is_active = true
             AND (LOWER(username) = LOWER($1) OR LOWER(COALESCE(full_name, '')) = LOWER($1))
           ORDER BY CASE WHEN LOWER(username) = LOWER($1) THEN 0 ELSE 1 END
           LIMIT 1`,
          [newAssignee],
        );
        if (found.rowCount) newAssignee = found.rows[0].username;
      } catch {
        // keep raw assignee string
      }
    }
    const newIsDeleted = canDelete && body.isDeleted !== undefined
      ? Boolean(body.isDeleted)
      : current.is_deleted;
    const newRejection = body.rejectionReason !== undefined
      ? body.rejectionReason
      : current.rejection_reason ?? '';

    await withTransaction(req.db, async (client) => {
      await client.query(
        `UPDATE facility_issues
         SET status = $1,
             rejection_reason = $2,
             cost = $3,
             unit_price = $4,
             units = $5,
             parts = $6,
             assignee = $7,
             is_deleted = $8,
             updated_at = now()
         WHERE ticket_number = $9`,
        [
          newStatus,
          newRejection,
          newCost,
          newUnitPrice,
          newUnits,
          newParts,
          newAssignee,
          newIsDeleted,
          ticketNumber,
        ],
      );

      if (newStatus !== current.status) {
        await client.query(
          `INSERT INTO issue_status_history (issue_id, from_status, to_status, changed_by, note)
           VALUES ($1, $2, $3, $4, $5)`,
          [current.id, current.status, newStatus, changedBy, statusNote],
        );
      }

      // Moving a ticket to trash also removes its notifications.
      if (newIsDeleted && !current.is_deleted) {
        await client.query(
          'DELETE FROM notifications WHERE ticket_number = $1',
          [ticketNumber],
        );
      }
    });

    let assignmentWarning = null;
    if (newAssignee && newAssignee !== current.assignee) {
      try {
        const assigneeUser = await req.db.query(
          `SELECT id, phone, username, full_name FROM users
           WHERE LOWER(username) = LOWER($1) AND is_active = true`,
          [newAssignee],
        );
        const assigneeRow = assigneeUser.rows[0] || null;
        if (assigneeRow) {
          await createNotification(req.db, {
            userId: assigneeRow.id,
            message: `You have been assigned a new ticket: ${ticketNumber}`,
            ticketNumber,
          });
        }

        let phone = String(assigneeRow?.phone || '').trim();
        const uname = String(assigneeRow?.username || newAssignee).trim().toLowerCase();
        if (!phone) {
          const dir = USERS[uname]
            || Object.values(USERS).find((u) => String(u.username || '').toLowerCase() === uname);
          phone = String(dir?.phone || '').trim();
        }

        if (phone) {
          let roomName = '';
          try {
            const roomRow = await req.db.query('SELECT name FROM rooms WHERE id = $1', [current.room_id]);
            roomName = roomRow.rows[0]?.name || '';
          } catch { /* ignore */ }
          const summary = ['Assigned to you', roomName, current.asset_name || current.issue_type]
            .filter(Boolean)
            .join(' — ')
            .slice(0, 200);
          console.log(`[whatsapp] Queuing assignment alert to ${phone} for ${ticketNumber}`);
          sendWhatsAppNotification(phone, ticketNumber, 'admin', summary)
            .then((result) => console.log('[whatsapp] assignment result:', JSON.stringify(result)))
            .catch((err) => console.error('[whatsapp] assignment notify failed:', err?.message || err));
        } else {
          assignmentWarning = `Assigned, but "${newAssignee}" has no phone — WhatsApp was not sent. Add a phone in Staff Manager.`;
          console.warn(`[whatsapp] assignee "${newAssignee}" has no phone — skipping WhatsApp`);
        }
      } catch (err) {
        console.error('[notifications] assignment insert failed:', err.message);
      }
    }

    if (
      newStatus !== current.status
      && (newStatus === 'Resolved' || newStatus === 'Completed' || newStatus === 'Closed')
      && current.reporter_phone
    ) {
      sendWhatsAppNotification(current.reporter_phone, req.params.ticketNumber, 'done')
        .catch((err) => console.error('[whatsapp] notify failed:', err?.message || err));
    }

    const issue = await fetchIssueByTicketNumber(req.db, ticketNumber);
    res.status(200).json({ ok: true, issue, ...(assignmentWarning ? { warning: assignmentWarning } : {}) });
  } catch (err) {
    if (err?.code === '23505' && err?.constraint === 'uniq_facility_issues_active_room_issue') {
      res.status(409).json({ error: 'Cannot make this ticket active: another active ticket already exists for the same issue in this location.' });
      return;
    }
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

app.get('/api/notifications', requireDb, authenticateToken, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, user_id, role, message, ticket_number, is_read, created_at
       FROM notifications
       WHERE user_id = $1 OR (user_id IS NULL AND role = $2)
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user?.sub || null, req.user?.role || ''],
    );
    res.status(200).json({
      notifications: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        message: row.message,
        ticketNumber: row.ticket_number,
        isRead: row.is_read,
        createdAt: row.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.put('/api/notifications/:id/read', requireDb, authenticateToken, requireStaff, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  try {
    const { rowCount } = await req.db.query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND (user_id = $2 OR (user_id IS NULL AND role = $3))`,
      [id, req.user?.sub || null, req.user?.role || ''],
    );
    if (!rowCount) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.delete('/api/issues/:ticketNumber', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await withTransaction(req.db, async (client) => {
      await client.query(
        'DELETE FROM notifications WHERE ticket_number = $1',
        [req.params.ticketNumber],
      );
      const { rowCount } = await client.query(
        'DELETE FROM facility_issues WHERE ticket_number = $1',
        [req.params.ticketNumber],
      );
      if (!rowCount) {
        // Roll back the notification delete too — nothing existed for this ticket.
        const notFound = new Error('Ticket not found');
        notFound.code = 'TICKET_NOT_FOUND';
        throw notFound;
      }
      return rowCount;
    });
    res.status(200).json({ ok: true, deleted });
  } catch (err) {
    if (err?.code === 'TICKET_NOT_FOUND') {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

app.get('/api/tickets', requireDb, authenticateToken, async (req, res) => {
  try {
    const filters = parseIssueFilters(req.query);
    const mySite = userSite(req.user);
    if (mySite) filters.site = mySite;
    const issues = await fetchAllIssues(req.db, filters);
    res.status(200).json({ tickets: issues });
  } catch {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

app.use(express.static(distDir));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  // Open the port immediately so deployment health checks pass, then finish
  // database initialization in the background. The '/' healthcheck serves the
  // static frontend and does not depend on the database.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Facility Maintenance Center (FMC) → http://0.0.0.0:${PORT}`);
  });

  checkTwilioConfig();

  if (!JWT_SECRET) {
    console.warn('[auth] Set JWT_SECRET in .env for admin login.');
  }

  try {
    const uploadEnabled = await initCloudinaryUpload();
    console.log(`[upload] Cloudinary photo uploads: ${uploadEnabled ? 'enabled' : 'disabled'}`);
    if (process.env.DATABASE_URL) {
      await initDb();
      await checkDb();
      console.log('[db] Connected to PostgreSQL');
    }
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    console.error('[db] Check DATABASE_URL in .env and ensure the database exists.');
  }
}

start();
