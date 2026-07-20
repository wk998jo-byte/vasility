import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { SEED_DEPARTMENTS, SEED_ROOMS_BY_DEPT } from './seed-data.js';

export function generateQrToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export async function seedUsers(db) {
  const { rows: userCount } = await db.query('SELECT COUNT(*)::int AS count FROM users');
  if (userCount[0].count === 0) {
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (!adminUser || !adminPass) {
      console.warn('[seed] ADMIN_USER and ADMIN_PASS required to seed admin user');
      return { seeded: false };
    }
    const passwordHash = await bcrypt.hash(adminPass, 12);
    await db.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'admin', true)`,
      [adminUser, passwordHash],
    );
    console.log(`[seed] Created admin user "${adminUser}"`);

    const facilityUser = process.env.FACILITY_USER || 'facility_user';
    const facilityPass = process.env.FACILITY_PASS || 'facility123';
    const facilityHash = await bcrypt.hash(facilityPass, 12);
    await db.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'facility', true)`,
      [facilityUser, facilityHash],
    );
    console.log(`[seed] Created facility user "${facilityUser}"`);

    await seedViewerUser(db);

    return { seeded: true };
  }

  // Keep seeded account passwords in sync with env vars / Secrets.
  // If ADMIN_PASS or FACILITY_PASS changes, the stored hash is updated on restart.
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  if (adminUser && adminPass) {
    await syncUserPassword(db, adminUser, adminPass);
  }

  const facilityUser = process.env.FACILITY_USER || 'facility_user';
  const facilityPass = process.env.FACILITY_PASS || 'facility123';
  const { rows: facilityExists } = await db.query(
    'SELECT id FROM users WHERE username = $1',
    [facilityUser],
  );
  if (facilityExists.length === 0) {
    const facilityHash = await bcrypt.hash(facilityPass, 12);
    await db.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'facility', true)`,
      [facilityUser, facilityHash],
    );
    console.log(`[seed] Created facility user "${facilityUser}"`);
  } else if (process.env.FACILITY_PASS) {
    await syncUserPassword(db, facilityUser, facilityPass);
  }

  await seedViewerUser(db);

  return { seeded: false };
}

// Read-only monitoring account (dashboard access, no changes allowed).
// Override via VIEWER_USER / VIEWER_PASS env vars; VIEWER_PASS syncs on restart.
async function seedViewerUser(db) {
  const viewerUser = process.env.VIEWER_USER || 'irfanmohammad';
  const viewerPass = process.env.VIEWER_PASS || 'irfan@1111';

  // Migration: rename the old spaced username to the new one (if not taken).
  await db.query(
    `UPDATE users SET username = $1
     WHERE LOWER(username) = 'irfan mohammad' AND role = 'viewer'
       AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))`,
    [viewerUser],
  );

  const { rows } = await db.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
    [viewerUser],
  );
  if (rows.length === 0) {
    const hash = await bcrypt.hash(viewerPass, 12);
    await db.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'viewer', true)`,
      [viewerUser, hash],
    );
    console.log(`[seed] Created viewer user "${viewerUser}"`);
  } else if (process.env.VIEWER_PASS) {
    await syncUserPassword(db, viewerUser, viewerPass);
  }
}

async function syncUserPassword(db, username, password) {
  const { rows } = await db.query(
    'SELECT id, password_hash FROM users WHERE username = $1',
    [username],
  );
  if (rows.length === 0) return;
  const { id, password_hash: hash } = rows[0];
  const matches = hash ? await bcrypt.compare(password, hash) : false;
  if (matches) return;
  const newHash = await bcrypt.hash(password, 12);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, id]);
  console.log(`[seed] Synced password for "${username}" from environment`);
}

export async function seedDb(db) {
  await seedUsers(db);

  const { rows: roomCount } = await db.query('SELECT COUNT(*)::int AS count FROM rooms');
  if (roomCount[0].count > 0) {
    return { seeded: false, rooms: roomCount[0].count };
  }

  const deptIds = {};
  for (const dept of SEED_DEPARTMENTS) {
    const existing = await db.query(
      'SELECT id FROM departments WHERE code = $1',
      [dept.code],
    );
    if (existing.rowCount > 0) {
      deptIds[dept.code] = existing.rows[0].id;
    } else {
      const inserted = await db.query(
        `INSERT INTO departments (code, name_en, name_ar, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [dept.code, dept.name_en, dept.name_ar],
      );
      deptIds[dept.code] = inserted.rows[0].id;
    }
  }

  let roomsCreated = 0;

  for (const [deptCode, rooms] of Object.entries(SEED_ROOMS_BY_DEPT)) {
    const deptId = deptIds[deptCode];
    if (!deptId) continue;

    for (const [roomName, assets] of Object.entries(rooms)) {
      const room = await db.query(
        `INSERT INTO rooms (department_id, name, is_active)
         VALUES ($1, $2, true)
         RETURNING id`,
        [deptId, roomName],
      );
      const roomId = room.rows[0].id;

      await db.query(
        `INSERT INTO room_qr_tokens (room_id, token, is_active)
         VALUES ($1, $2, true)`,
        [roomId, generateQrToken()],
      );

      for (const assetName of assets) {
        await db.query(
          'INSERT INTO room_assets (room_id, name) VALUES ($1, $2)',
          [roomId, assetName],
        );
      }

      roomsCreated += 1;
    }
  }

  console.log(`[seed] Populated ${roomsCreated} rooms across ${SEED_DEPARTMENTS.length} departments`);
  return { seeded: true, rooms: roomsCreated };
}

export async function generateTicketNumber(db) {
  const year = new Date().getFullYear();
  const { rows } = await db.query(
    `INSERT INTO ticket_counters (year, last_number)
     VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE
     SET last_number = ticket_counters.last_number + 1
     RETURNING last_number`,
    [year],
  );
  const num = String(rows[0].last_number).padStart(4, '0');
  return `FMC-${year}-${num}`;
}

export function mapIssueRow(row) {
  return {
    id: row.ticket_number,
    ticketNumber: row.ticket_number,
    requesterName: row.reporter_name,
    name: row.reporter_name,
    employeeId: row.employee_id,
    phone: row.reporter_phone || '',
    email: row.reporter_email || '',
    room: row.room_name,
    roomId: row.room_id,
    departmentId: row.department_id,
    departmentName: row.department_name_en || row.department_name || null,
    asset: row.asset_name,
    issue: row.issue_type,
    priority: row.priority,
    notes: row.description,
    status: row.status,
    createdAt: row.created_at,
    cost: Number(row.cost) || 0,
    parts: row.parts || '',
    assignee: row.assignee || '',
    imageUrl: row.image_url || null,
    resolutionImageUrl: row.resolution_image_url || null,
    isDeleted: row.is_deleted,
    rejectionReason: row.rejection_reason || '',
  };
}

export async function fetchIssueByTicketNumber(db, ticketNumber) {
  const { rows } = await db.query(
    `SELECT fi.*, r.name AS room_name, d.name_en AS department_name_en
     FROM facility_issues fi
     JOIN rooms r ON r.id = fi.room_id
     LEFT JOIN departments d ON d.id = fi.department_id
     WHERE fi.ticket_number = $1 AND fi.is_deleted = false`,
    [ticketNumber],
  );
  return rows[0] ? mapIssueRow(rows[0]) : null;
}

// Strips internal-only fields (technician resolution photo) from an issue
// before it is returned on any public / requester-facing endpoint.
export function toPublicIssue(issue) {
  if (!issue) return issue;
  const { resolutionImageUrl, ...publicIssue } = issue;
  return publicIssue;
}

export async function fetchIssueForTracking(db, ticketNumber, employeeId) {
  const { rows } = await db.query(
    `SELECT fi.*, r.name AS room_name, d.name_en AS department_name_en
     FROM facility_issues fi
     JOIN rooms r ON r.id = fi.room_id
     LEFT JOIN departments d ON d.id = fi.department_id
     WHERE fi.ticket_number = $1 AND fi.employee_id = $2 AND fi.is_deleted = false`,
    [ticketNumber, employeeId],
  );
  return rows[0] ? mapIssueRow(rows[0]) : null;
}

export async function fetchAllIssues(db, filters = {}) {
  const {
    includeDeleted = false,
    status,
    departmentId,
    roomId,
    priority,
    dateFrom,
    dateTo,
  } = filters;

  const conditions = [];
  const params = [];
  let n = 1;

  if (!includeDeleted) {
    conditions.push('fi.is_deleted = false');
  }
  if (status) {
    conditions.push(`fi.status = $${n++}`);
    params.push(status);
  }
  if (departmentId) {
    conditions.push(`fi.department_id = $${n++}`);
    params.push(departmentId);
  }
  if (roomId) {
    conditions.push(`fi.room_id = $${n++}`);
    params.push(roomId);
  }
  if (priority) {
    conditions.push(`fi.priority = $${n++}`);
    params.push(priority);
  }
  if (dateFrom) {
    conditions.push(`fi.created_at >= $${n++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`fi.created_at <= $${n++}`);
    params.push(dateTo);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT fi.*, r.name AS room_name, d.name_en AS department_name_en
     FROM facility_issues fi
     JOIN rooms r ON r.id = fi.room_id
     LEFT JOIN departments d ON d.id = fi.department_id
     ${where}
     ORDER BY fi.created_at DESC`,
    params,
  );
  return rows.map(mapIssueRow);
}

export async function resolveRoomByToken(db, token) {
  const { rows } = await db.query(
    `SELECT r.id, r.name, r.floor, r.is_active, r.department_id,
            d.id AS dept_id, d.code AS department_code, d.name_en AS department_name_en, d.name_ar AS department_name_ar
     FROM room_qr_tokens t
     JOIN rooms r ON r.id = t.room_id
     LEFT JOIN departments d ON d.id = r.department_id
     WHERE t.token = $1 AND t.is_active = true AND r.is_active = true`,
    [token],
  );
  if (!rows[0]) return null;

  const room = rows[0];
  const assets = await db.query(
    'SELECT name FROM room_assets WHERE room_id = $1 ORDER BY name',
    [room.id],
  );

  return {
    room: {
      id: room.id,
      name: room.name,
      floor: room.floor,
      departmentId: room.department_id,
      department: room.dept_id
        ? {
            id: room.dept_id,
            code: room.department_code,
            nameEn: room.department_name_en,
            nameAr: room.department_name_ar,
          }
        : null,
    },
    assets: assets.rows.map((a) => a.name),
  };
}

export async function fetchPublicRooms(db) {
  const { rows } = await db.query(
    `SELECT r.id, r.name
     FROM rooms r
     WHERE r.is_active = true
     ORDER BY r.name`,
  );
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function fetchUsers(db, { role } = {}) {
  const params = [];
  let sql = 'SELECT id, username, role, is_active, created_at FROM users WHERE is_active = true';
  if (role) {
    sql += ' AND role = $1';
    params.push(role);
  }
  sql += ' ORDER BY username';
  const { rows } = await db.query(sql, params);
  return rows;
}

export async function fetchIssueComments(db, issueId) {
  const { rows } = await db.query(
    `SELECT id, user_name, role, comment_text, created_at
     FROM issue_comments
     WHERE issue_id = $1
     ORDER BY created_at ASC`,
    [issueId],
  );
  return rows.map((row) => ({
    id: row.id,
    userName: row.user_name,
    role: row.role,
    commentText: row.comment_text,
    createdAt: row.created_at,
  }));
}

export async function insertIssueComment(db, issueId, userName, role, commentText) {
  const { rows } = await db.query(
    `INSERT INTO issue_comments (issue_id, user_name, role, comment_text)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_name, role, comment_text, created_at`,
    [issueId, userName, role, commentText],
  );
  const row = rows[0];
  return {
    id: row.id,
    userName: row.user_name,
    role: row.role,
    commentText: row.comment_text,
    createdAt: row.created_at,
  };
}

export async function fetchIssueHistory(db, issueId) {
  const { rows } = await db.query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            u.username AS changed_by_username
     FROM issue_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.issue_id = $1
     ORDER BY h.created_at DESC`,
    [issueId],
  );
  return rows.map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    createdAt: row.created_at,
    changedBy: row.changed_by_username || 'System',
  }));
}

export async function fetchAdminRooms(db) {
  const { rows } = await db.query(
    `SELECT r.id, r.name, r.floor, r.is_active, r.department_id,
            t.token,
            d.name_en AS department_name_en
     FROM rooms r
     LEFT JOIN room_qr_tokens t ON t.room_id = r.id AND t.is_active = true
     LEFT JOIN departments d ON d.id = r.department_id
     ORDER BY r.name`,
  );

  const rooms = [];
  for (const row of rows) {
    const assets = await db.query(
      'SELECT name FROM room_assets WHERE room_id = $1 ORDER BY name',
      [row.id],
    );
    rooms.push({
      id: row.id,
      name: row.name,
      floor: row.floor,
      departmentId: row.department_id,
      departmentName: row.department_name_en,
      isActive: row.is_active,
      token: row.token,
      assets: assets.rows.map((a) => a.name),
    });
  }
  return rooms;
}

export async function fetchDepartments(db) {
  const { rows } = await db.query(
    `SELECT id, code, name_en, name_ar FROM departments WHERE is_active = true ORDER BY name_en`,
  );
  return rows;
}
