import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { loadEnv } from './env.js';
import { getPool, initDb, checkDb } from './db.js';
import { sendNewIssueNotification } from './notify.js';
import { initCloudinaryUpload, getUploadMiddleware, uploadBufferToCloudinary } from './upload.js';
import {
  generateTicketNumber,
  generateQrToken,
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
} from './seed.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../web/dist');
const PORT = Number(process.env.PORT) || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

const allowedOrigins = [
  process.env.VITE_PUBLIC_BASE_URL,
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    // Allow any localhost port for local dev / smoke tests
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
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

const VALID_STATUSES = new Set(['New', 'In Progress', 'Resolved', 'Closed', 'Rejected']);
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

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
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
      'SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER($1) AND is_active = true',
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
      { sub: user.id, user: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' },
    );
    res.status(200).json({ token, role: user.role });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/users', requireDb, authenticateToken, async (req, res) => {
  const role = typeof req.query.role === 'string' && req.query.role.trim()
    ? req.query.role.trim()
    : undefined;

  try {
    const users = await fetchUsers(req.db, { role });
    const isAdmin = req.user?.role === 'admin';
    const sanitized = isAdmin
      ? users
      : users.map(({ id, username }) => ({ id, username }));
    res.status(200).json({ users: sanitized });
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = req.body?.password;
  const role = req.body?.role === 'admin' ? 'admin' : 'facility';

  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'password must be at least 6 characters' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await req.db.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, username, role`,
      [username, passwordHash, role],
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

app.delete('/api/users/:id', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;

  if (req.user?.sub === userId) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  try {
    const { rowCount } = await req.db.query(
      'DELETE FROM users WHERE id = $1',
      [userId],
    );
    if (!rowCount) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
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
    const rooms = await fetchAdminRooms(req.db);
    res.status(200).json({ rooms });
  } catch {
    res.status(500).json({ error: 'Failed to fetch admin rooms' });
  }
});

app.post('/api/rooms', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const departmentId = typeof req.body?.departmentId === 'string' ? req.body.departmentId.trim() : '';
  const floor = typeof req.body?.floor === 'string' ? req.body.floor.trim() : null;
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
      `INSERT INTO rooms (department_id, name, floor, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, floor, department_id`,
      [departmentId, name, floor],
    );
    const roomId = room.rows[0].id;
    const token = generateQrToken();

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

app.put('/api/rooms/:id', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  const roomId = req.params.id;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const floor = req.body?.floor !== undefined
    ? (typeof req.body.floor === 'string' ? req.body.floor.trim() || null : null)
    : undefined;

  if (name === undefined && floor === undefined) {
    res.status(400).json({ error: 'name or floor required' });
    return;
  }

  try {
    const existing = await req.db.query(
      'SELECT id, name, floor, department_id FROM rooms WHERE id = $1 AND is_active = true',
      [roomId],
    );
    if (!existing.rowCount) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const current = existing.rows[0];
    const newName = name ?? current.name;
    const newFloor = floor !== undefined ? floor : current.floor;

    const { rows } = await req.db.query(
      `UPDATE rooms SET name = $1, floor = $2 WHERE id = $3
       RETURNING id, name, floor, department_id`,
      [newName, newFloor, roomId],
    );

    res.status(200).json({
      ok: true,
      room: {
        id: rows[0].id,
        name: rows[0].name,
        floor: rows[0].floor,
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

app.post('/api/rooms/:id/qr/regenerate', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  const roomId = req.params.id;

  try {
    const roomCheck = await req.db.query(
      'SELECT id FROM rooms WHERE id = $1 AND is_active = true',
      [roomId],
    );
    if (!roomCheck.rowCount) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const newToken = generateQrToken();

    await req.db.query('BEGIN');
    await req.db.query(
      'UPDATE room_qr_tokens SET is_active = false WHERE room_id = $1 AND is_active = true',
      [roomId],
    );
    await req.db.query(
      'INSERT INTO room_qr_tokens (room_id, token, is_active) VALUES ($1, $2, true)',
      [roomId, newToken],
    );
    await req.db.query('COMMIT');

    res.status(200).json({ ok: true, token: newToken, roomId });
  } catch {
    await req.db.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Failed to regenerate QR token' });
  }
});

app.delete('/api/rooms/:id', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  const roomId = req.params.id;

  try {
    const roomCheck = await req.db.query(
      'SELECT id FROM rooms WHERE id = $1 AND is_active = true',
      [roomId],
    );
    if (!roomCheck.rowCount) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    await req.db.query('BEGIN');
    await req.db.query(
      'UPDATE rooms SET is_active = false WHERE id = $1',
      [roomId],
    );
    await req.db.query(
      'UPDATE room_qr_tokens SET is_active = false WHERE room_id = $1',
      [roomId],
    );
    await req.db.query('COMMIT');

    res.status(200).json({ ok: true, roomId });
  } catch {
    await req.db.query('ROLLBACK').catch(() => {});
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

  if (!reporterName || !employeeId || !assetName || !issueType || !priority) {
    res.status(400).json({ error: 'reporterName, employeeId, assetName, issueType, and priority are required' });
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

    const ticketNumber = await generateTicketNumber(req.db);

    const { rows } = await req.db.query(
      `INSERT INTO facility_issues (
         ticket_number, room_id, department_id, asset_name, issue_type, priority, description,
         reporter_name, employee_id, status, qr_token_used
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'New', $10)
       RETURNING id`,
      [
        ticketNumber, resolvedRoomId, departmentId, assetName, issueType, priority, description,
        reporterName, employeeId, qrToken,
      ],
    );

    const issue = await fetchIssueByTicketNumber(req.db, ticketNumber);

    await req.db.query(
      `INSERT INTO issue_status_history (issue_id, from_status, to_status, note)
       VALUES ($1, NULL, 'New', 'Issue reported via QR')`,
      [rows[0].id],
    );

    sendNewIssueNotification(issue).catch(() => {});

    res.status(201).json({ ok: true, issue });
  } catch {
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
    res.status(200).json({ ok: true, imageUrl, issue });
  } catch {
    res.status(500).json({ error: 'Failed to save image' });
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
    res.status(200).json({ issue });
  } catch {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

app.get('/api/issues', requireDb, authenticateToken, async (req, res) => {
  try {
    const filters = parseIssueFilters(req.query);
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
      'SELECT id FROM facility_issues WHERE ticket_number = $1',
      [ticketNumber],
    );
    if (!issue.rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const history = await fetchIssueHistory(req.db, issue.rows[0].id);
    res.status(200).json({ history });
  } catch {
    res.status(500).json({ error: 'Failed to fetch ticket history' });
  }
});

app.put('/api/issues/:ticketNumber', requireDb, authenticateToken, async (req, res) => {
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
    const isAdmin = req.user?.role === 'admin';

    if (!VALID_STATUSES.has(newStatus)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    if (!isAdmin && body.isDeleted !== undefined && Boolean(body.isDeleted) !== current.is_deleted) {
      res.status(403).json({ error: 'Admin access required to delete tickets' });
      return;
    }

    const statusNote = body.statusNote ?? body.rejectionReason ?? null;
    const newCost = isAdmin && body.cost !== undefined ? Number(body.cost) || 0 : current.cost;
    const newParts = isAdmin && body.parts !== undefined ? body.parts : current.parts;
    const newAssignee = isAdmin && body.assignee !== undefined ? String(body.assignee).trim() : current.assignee;
    const newIsDeleted = isAdmin && body.isDeleted !== undefined
      ? Boolean(body.isDeleted)
      : current.is_deleted;
    const newRejection = body.rejectionReason !== undefined
      ? body.rejectionReason
      : current.rejection_reason ?? '';

    await req.db.query('BEGIN');

    await req.db.query(
      `UPDATE facility_issues
       SET status = $1,
           rejection_reason = $2,
           cost = $3,
           parts = $4,
           assignee = $5,
           is_deleted = $6,
           updated_at = now()
       WHERE ticket_number = $7`,
      [
        newStatus,
        newRejection,
        newCost,
        newParts,
        newAssignee,
        newIsDeleted,
        ticketNumber,
      ],
    );

    if (newStatus !== current.status) {
      await req.db.query(
        `INSERT INTO issue_status_history (issue_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [current.id, current.status, newStatus, changedBy, statusNote],
      );
    }

    await req.db.query('COMMIT');

    const issue = await fetchIssueByTicketNumber(req.db, ticketNumber);
    res.status(200).json({ ok: true, issue });
  } catch {
    await req.db.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

app.delete('/api/issues/:ticketNumber', requireDb, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await req.db.query(
      'DELETE FROM facility_issues WHERE ticket_number = $1',
      [req.params.ticketNumber],
    );
    if (!rowCount) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

app.get('/api/tickets', requireDb, authenticateToken, async (req, res) => {
  try {
    const filters = parseIssueFilters(req.query);
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
  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    initCloudinaryUpload();
    if (process.env.DATABASE_URL) {
      await initDb();
      await checkDb();
      console.log('[db] Connected to PostgreSQL');
    }
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    console.error('[db] Check DATABASE_URL in .env and ensure the database exists.');
  }

  if (!JWT_SECRET) {
    console.warn('[auth] Set JWT_SECRET in .env for admin login.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SSC Building Portal → http://0.0.0.0:${PORT}`);
  });
}

start();
