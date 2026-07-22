-- SSC Building Portal — normalized PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Departments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Rooms ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id),
  name TEXT NOT NULL,
  floor TEXT,
  site TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

-- Allow the same room name (e.g. A-01) in different camps/sites.
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_department_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rooms_dept_site_name
  ON rooms (department_id, COALESCE(site, ''), name);

CREATE INDEX IF NOT EXISTS idx_rooms_department ON rooms (department_id);
CREATE INDEX IF NOT EXISTS idx_rooms_site ON rooms (site);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms (is_active) WHERE is_active = true;

-- Migration: add site column to existing rooms and backfill from floor
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS site TEXT;
ALTER TABLE rooms ALTER COLUMN site SET DEFAULT 'Dhahran';
UPDATE rooms SET site = CASE
  WHEN floor IN ('A Block', 'B Block', 'C Block', 'Mess Hall', 'Gym Hall') THEN 'MGS'
  ELSE 'Dhahran'
END WHERE site IS NULL;

-- ─── QR tokens ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_qr_tokens_token ON room_qr_tokens (token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_room_qr_tokens_room ON room_qr_tokens (room_id);

-- ─── Room assets ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_assets_room ON room_assets (room_id);

-- ─── Users (production auth) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  -- see CREATE UNIQUE INDEX users_username_lower_idx below (case-insensitive uniqueness)
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'site_admin', 'sub_admin', 'facility', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  site TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

-- ─── Facility issues ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facility_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  room_id UUID NOT NULL REFERENCES rooms(id),
  department_id UUID REFERENCES departments(id),
  asset_name TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reporter_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  qr_token_used TEXT,
  reporter_phone TEXT NOT NULL DEFAULT '',
  reporter_email TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT,
  cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 1,
  parts TEXT NOT NULL DEFAULT '',
  assignee TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS assignee TEXT NOT NULL DEFAULT '';
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS resolution_image_url TEXT;
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS reporter_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS reporter_email TEXT NOT NULL DEFAULT '';

-- Migration: split cost into unit price × units (total kept in cost)
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE facility_issues ADD COLUMN IF NOT EXISTS units INTEGER NOT NULL DEFAULT 1;
UPDATE facility_issues SET unit_price = cost WHERE unit_price = 0 AND cost > 0;

-- Migration: allow the read-only 'viewer' role on existing databases.
-- Migration: role hierarchy — 'admin' = main admin (all sites),
-- 'site_admin' = admin of one site, 'sub_admin' = limited admin of one site.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'site_admin', 'sub_admin', 'facility', 'viewer'));

-- Migration: full user profile (name, phone, email) + site assignment.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS site TEXT;

CREATE INDEX IF NOT EXISTS idx_facility_issues_status ON facility_issues (status);
CREATE INDEX IF NOT EXISTS idx_facility_issues_room ON facility_issues (room_id);
CREATE INDEX IF NOT EXISTS idx_facility_issues_department ON facility_issues (department_id);
CREATE INDEX IF NOT EXISTS idx_facility_issues_created ON facility_issues (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_issues_ticket_number ON facility_issues (ticket_number);
CREATE INDEX IF NOT EXISTS idx_facility_issues_employee ON facility_issues (employee_id);
CREATE INDEX IF NOT EXISTS idx_facility_issues_priority ON facility_issues (priority);

-- At most one active (non-deleted, New/In Progress) ticket per room + issue type.
-- Wrapped in a DO block so startup never fails if legacy duplicate rows exist —
-- the API-level duplicate check still applies in that case.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_facility_issues_active_room_issue
    ON facility_issues (room_id, issue_type)
    WHERE is_deleted = false AND status IN ('New', 'In Progress');
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Skipping unique active-ticket index (legacy duplicate rows exist): %', SQLERRM;
END $$;

-- ─── Issue comments (admin/tech discussion, visible on tracking page) ────────

CREATE TABLE IF NOT EXISTS issue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES facility_issues(id) ON DELETE CASCADE,
  user_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments (issue_id, created_at);

-- ─── Issue status audit trail ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS issue_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES facility_issues(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_status_history_issue ON issue_status_history (issue_id, created_at DESC);

-- ─── Notifications (per-user or role broadcast) ──────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50),
  message TEXT NOT NULL,
  ticket_number VARCHAR(50),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications (role, created_at DESC) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_ticket ON notifications (ticket_number) WHERE ticket_number IS NOT NULL;

-- ─── Sequential ticket numbering ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ticket_counters (
  year INT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);

-- ─── Migrate legacy status values ────────────────────────────────────────────

UPDATE facility_issues SET status = 'New' WHERE status = 'Pending';
UPDATE facility_issues SET status = 'Resolved' WHERE status = 'Completed';
