/**
 * Staff directory for WhatsApp RBAC routing.
 * Single source: web/src/campUsersData.js (Excel + official staff, RBAC-enforced).
 */
import { USERS as CAMP_USERS } from '../web/src/campUsersData.js';

export const USERS = { ...CAMP_USERS };

/** Normalize camp / site labels for comparison. */
export function normalizeCamp(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Map a room.site value (e.g. "MGS", "Dhahran") to the camp label used in USERS
 * (e.g. "MGS Camp", "Dhahran Camp").
 */
export function siteToCamp(site) {
  const s = String(site || '').trim();
  if (!s || /^dhahran$/i.test(s)) return 'Dhahran Camp';
  if (/^mgs$/i.test(s)) return 'MGS Camp';
  if (/^khurais$/i.test(s)) return 'Khurais Camp';
  if (/^juaymah$/i.test(s) || /^juyamah$/i.test(s)) return 'Juaymah Camp';
  if (/^madina camp 1$/i.test(s) || /^tcf-?1$/i.test(s)) return 'Madina Camp 1';
  if (/^madina camp 2$/i.test(s) || /^tcf-?2$/i.test(s)) return 'Madina Camp 2';
  if (/^jubail$/i.test(s)) return 'Jubail Camp';
  if (/camp$/i.test(s)) return s;
  return `${s} Camp`;
}

export function campsMatch(a, b) {
  const na = normalizeCamp(a);
  const nb = normalizeCamp(b);
  if (na === nb) return true;
  const strip = (v) => v.replace(/\s+camp$/, '');
  return strip(na) === strip(nb);
}

/**
 * Strict WhatsApp RBAC: main admins (role admin / camp All) + sub-admins whose camp
 * exactly matches the ticket camp. Dhahran sub-admins never receive MGS tickets.
 */
export function getWhatsAppTargetsForCamp(camp) {
  if (!camp) return [];
  const list = Object.values(USERS || {});
  const targets = [];

  for (const u of list) {
    const phone = String(u.phone || '').trim();
    if (!phone) continue;

    const isMainAdmin = u.role === 'admin' || normalizeCamp(u.camp) === 'all';
    const isCampSubAdmin = u.role === 'subadmin' && campsMatch(u.camp, camp);

    if (isMainAdmin || isCampSubAdmin) {
      targets.push({
        username: u.username,
        name: u.name,
        phone,
        role: u.role,
        camp: u.camp,
      });
    }
  }

  return targets;
}
