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
 * Map a room.site value (e.g. "MGS BQ", "Dhahran") to the camp label used in USERS
 * (e.g. "MGS BQ", "Dhahran Camp").
 */
export function siteToCamp(site) {
  const s = String(site || '').trim();
  if (!s) return '';
  if (/^dhahran$/i.test(s)) return 'Dhahran Camp';
  if (/^mgs\s*bq$/i.test(s)) return 'MGS BQ';
  if (/^mgs\s*pmt$/i.test(s)) return 'MGS PMT';
  if (/^mgs$/i.test(s) || /^mgs camp$/i.test(s)) return 'MGS BQ';
  if (/^khurais$/i.test(s)) return 'Khurais Camp';
  if (/^juaymah$/i.test(s) || /^juyamah$/i.test(s)) return 'Juaymah Camp';
  if (/^madina camp 1\s*bq$/i.test(s)) return 'Madina Camp 1 BQ';
  if (/^madina camp 1\s*pmt$/i.test(s)) return 'Madina Camp 1 PMT';
  if (/^madina camp 2\s*bq$/i.test(s)) return 'Madina Camp 2 BQ';
  if (/^madina camp 2\s*pmt$/i.test(s)) return 'Madina Camp 2 PMT';
  if (/^madina camp 1$/i.test(s) || /^tcf-?1$/i.test(s)) return 'Madina Camp 1 PMT';
  if (/^madina camp 2$/i.test(s) || /^tcf-?2$/i.test(s)) return 'Madina Camp 2 BQ';
  if (/^jubail$/i.test(s)) return 'Jubail Camp';
  if (/camp$/i.test(s) || /\s(bq|pmt)$/i.test(s)) return s;
  return `${s} Camp`;
}

export function campsMatch(a, b) {
  const na = normalizeCamp(a);
  const nb = normalizeCamp(b);
  if (na === nb) return true;
  // Do not treat "MGS BQ" ≈ "MGS PMT" or "Madina Camp 1" ≈ "Madina Camp 1 BQ".
  // Only strip a trailing standalone "camp" word (Dhahran Camp ↔ Dhahran).
  const strip = (v) => v.replace(/\s+camp$/, '');
  const sa = strip(na);
  const sb = strip(nb);
  if (sa === sb) return true;
  // Legacy combined labels ↔ split sites (inventory migration).
  const legacy = {
    mgs: 'mgs bq',
    'mgs camp': 'mgs bq',
    'madina camp 1': 'madina camp 1 pmt',
    'madina camp 2': 'madina camp 2 bq',
    'tcf-1': 'madina camp 1 pmt',
    'tcf1': 'madina camp 1 pmt',
    'tcf-2': 'madina camp 2 bq',
    tcf2: 'madina camp 2 bq',
  };
  const la = legacy[na] || legacy[sa] || na;
  const lb = legacy[nb] || legacy[sb] || nb;
  return la === lb || la === sb || lb === sa;
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
