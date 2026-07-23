/**
 * Default login passwords — MUST be overridden via env in production.
 * Never rely on these defaults on a public deployment.
 */
const FALLBACK_ADMIN = 'FMC@2026@@';
const FALLBACK_STAFF = 'Staff2026@@';

function isProductionLike() {
  return process.env.NODE_ENV === 'production'
    || Boolean(process.env.REPL_ID)
    || Boolean(process.env.REPLIT_DEPLOYMENT);
}

export const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_PASS
  || process.env.ADMIN_DEFAULT_PASSWORD
  || (isProductionLike() ? '' : FALLBACK_ADMIN);

export const STAFF_DEFAULT_PASSWORD = process.env.STAFF_DEFAULT_PASSWORD
  || process.env.FACILITY_PASS
  || (isProductionLike() ? '' : FALLBACK_STAFF);

export function passwordForRole(role) {
  const pass = role === 'admin' ? ADMIN_DEFAULT_PASSWORD : STAFF_DEFAULT_PASSWORD;
  if (!pass) {
    throw new Error(
      `[security] Missing ${role === 'admin' ? 'ADMIN_PASS' : 'STAFF_DEFAULT_PASSWORD'} — refuse to seed default passwords in production.`,
    );
  }
  return pass;
}

export function warnIfDefaultPasswords() {
  if (!isProductionLike()) return;
  if (!process.env.ADMIN_PASS && !process.env.ADMIN_DEFAULT_PASSWORD) {
    console.error('[security] ADMIN_PASS is not set — set it in Secrets before creating admin users.');
  }
  if (!process.env.STAFF_DEFAULT_PASSWORD && !process.env.FACILITY_PASS) {
    console.error('[security] STAFF_DEFAULT_PASSWORD / FACILITY_PASS is not set.');
  }
  if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).length < 32) {
    console.error('[security] JWT_SECRET must be set to a long random string (32+ chars).');
  }
}
