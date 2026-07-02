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
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

CREATE INDEX IF NOT EXISTS idx_rooms_department ON rooms (department_id);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms (is_active) WHERE is_active = true;

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
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'facility')),
  is_active BOOLEAN NOT NULL DEFAULT true,
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
  rejection_reason TEXT,
  cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_facility_issues_status ON facility_issues (status);
CREATE INDEX IF NOT EXISTS idx_facility_issues_room ON facility_issues (room_id);
CREATE INDEX IF NOT EXISTS idx_facility_issues_department ON facility_issues (department_id);
CREATE INDEX IF NOT EXISTS idx_facility_issues_created ON facility_issues (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_issues_ticket_number ON facility_issues (ticket_number);
CREATE INDEX IF NOT EXISTS idx_facility_issues_employee ON facility_issues (employee_id);
CREATE INDEX IF NOT EXISTS idx_facility_issues_priority ON facility_issues (priority);

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

-- ─── Sequential ticket numbering ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ticket_counters (
  year INT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);

-- ─── Migrate legacy status values ────────────────────────────────────────────

UPDATE facility_issues SET status = 'New' WHERE status = 'Pending';
UPDATE facility_issues SET status = 'Resolved' WHERE status = 'Completed';
