/** Default login passwords (override via .env). */
export const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_PASS
  || process.env.ADMIN_DEFAULT_PASSWORD
  || 'FMC@2026@@';

export const STAFF_DEFAULT_PASSWORD = process.env.STAFF_DEFAULT_PASSWORD
  || process.env.FACILITY_PASS
  || 'Staff2026@@';

export function passwordForRole(role) {
  return role === 'admin' ? ADMIN_DEFAULT_PASSWORD : STAFF_DEFAULT_PASSWORD;
}
