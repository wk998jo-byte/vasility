const fs = require('fs');

let src = fs.readFileSync('C:/Users/User1/Desktop/QR/app.js', 'utf8');

function removeBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return text;
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return text;
  return text.slice(0, start) + text.slice(end);
}

// 1) Replace api import + animation/ui block with module imports
const importBlockEnd = 'const LOGO_SRC = ';
const logoIdx = src.indexOf(importBlockEnd);
if (logoIdx < 0) throw new Error('LOGO_SRC not found');

const newImports = `import { t, applyI18n, toggleLanguage, getLang, setI18nAfterApply } from './i18n-service.js';
import {
  animateKPI,
  animateViewEnter,
  showModal,
  hideModal,
  showToast,
  escapeHtml,
  setModalHooks,
} from './ui-utils.js';
import {
  getTickets,
  loadLocal,
  syncFromDatabase,
  persistTicket,
  addTicket,
  generateId,
  getActiveTickets,
  getDeletedTickets,
  getSpendTickets,
  isSlaBreached,
  isTicketDeleted,
  softDeleteTicket,
  restoreTicket,
  permanentlyDeleteTicket,
  updateDeletedTicketsBadge,
  migrateTicketsForRoomRename,
  setTicketHooks,
} from './tickets-manager.js';

`;

src = src.slice(0, src.indexOf('import {')) + newImports + src.slice(logoIdx);

// 2) Remove inline animation + modal functions (before ROOM ISSUES)
src = removeBetween(src, '// ═══ ANIMATIONS ═══', '// ═══ ROOM ISSUES ═══');

// 3) Remove I18N dictionary
src = removeBetween(src, 'const I18N = {', '// ═══ ADMIN SESSION');

// 4) Remove SLA_HOURS (in tickets-manager)
src = src.replace('const SLA_HOURS = 24;\n', '');

// 5) Remove Firebase block
src = removeBetween(src, '// ═══ FIREBASE ═══', 'function getRoomDeepLink');

// 6) Remove firebase state vars
src = src.replace("let firebaseReady = false;\nlet db = null, ticketsCol = null;\n\n", '');

// 7) Remove duplicated ticket persistence + i18n helpers
src = removeBetween(src, 'function saveLocal() {', '// ═══ HELPERS ═══');
src = removeBetween(src, 'function t(key)', 'function updatePortalStats()');
src = removeBetween(src, 'function showToast(msg', 'function updatePortalStats()');

// 8) Remove duplicated isSlaBreached - keep local getFilteredTickets with extended filters
src = src.replace(
  /function isSlaBreached\(t\) \{[\s\S]*?\}\n\nfunction getFilteredTickets\(\)/,
  'function getFilteredTickets()'
);

// 9) Fix getFilteredTickets to use getActiveTickets
src = src.replace(
  'return tickets.filter(t => {',
  'return getActiveTickets().filter(t => {'
);

// 10) Replace bare tickets references
src = src.replace(/\btickets\.find\(/g, 'getTickets().find(');
src = src.replace(/\btickets\.unshift\(/g, '/* moved to tickets-manager */ getTickets().unshift(');
src = src.replace(/while \(tickets\.some/g, 'while (getTickets().some');
src = src.replace(
  /const blob = new Blob\(\[JSON\.stringify\(\{ tickets, /,
  'const blob = new Blob([JSON.stringify({ tickets: getTickets(), '
);

// Fix erroneous unshift comment - addTicket should be used instead
src = src.replace(/\/\* moved to tickets-manager \*\/ getTickets\(\)\.unshift\(ticket\);\s*await persistTicket\(ticket, \{ isNew: true \}\);\s*renderAll\(\);/g,
  'await addTicket(ticket);');

// 11) Fix lang references in applyI18n remnants and charts
src = src.replace(/lang === 'ar'/g, "getLang() === 'ar'");
src = src.replace(/lang === 'en'/g, "getLang() === 'en'");
src = src.replace(/toLocaleDateString\(lang ===/g, 'toLocaleDateString(getLang() ===');

// 12) Add showOfflineBannerIfNeeded if missing
if (!src.includes('function showOfflineBannerIfNeeded')) {
  const bannerFn = `
function showOfflineBannerIfNeeded() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const isFile = location.protocol === 'file:';
  if (isFile) banner.classList.add('visible');
}

`;
  src = src.replace('function initApp() {', bannerFn + 'function initApp() {');
}

// 13) Update initApp header
src = src.replace(
  /function initApp\(\) \{\n  if \(localStorage\.getItem\('ssc_dark'\)/,
  `function initApp() {
  showOfflineBannerIfNeeded();
  setI18nAfterApply(updatePortalStats);
  setModalHooks({ onPrepareOpen: destroyTicketPanel });
  setTicketHooks({
    onTicketsChanged: renderAll,
    requireAdmin: requireAdminAuth,
    getAdminUser: () => adminUser,
    syncAuth: syncAuthState,
    onCloseTicketModal: closeTicketModal,
    onRenderDeletedList: renderDeletedTicketsList,
  });
  ensureRoomsVisible();
  if (localStorage.getItem('ssc_dark')`
);

// 14) Remove initNewProduct and initFirebase
src = src.replace(/\s*initNewProduct\(\);\n/, '\n');
src = src.replace(/\s*initFirebase\(\);\n/, '\n');

// 15) Add syncFromDatabase after loadLocal
if (!src.includes('syncFromDatabase()')) {
  src = src.replace('loadLocal();\n', 'loadLocal();\n  syncFromDatabase();\n');
}

// 16) Fix lang toggle
src = src.replace(
  /document\.getElementById\('lang-toggle'\)\.addEventListener\('click', \(\) => \{\n    lang = lang === 'en' \? 'ar' : 'en';\n    localStorage\.setItem\('ssc_lang', lang\);\n    applyI18n\(\); renderAll\(\);\n  \}\);/,
  `document.getElementById('lang-toggle')?.addEventListener('click', () => {
    toggleLanguage();
    renderAll();
  });`
);

// 17) Fix openTicketModal tickets.find
src = src.replace(
  'const ticket = tickets.find(t => t.id === id);',
  'const ticket = getTickets().find(t => t.id === id);'
);

// 18) Clean duplicate renderTrack in switchView
src = src.replace("  if (view === 'track') renderTrack();\n  if (view === 'track') renderTrack();\n", "  if (view === 'track') renderTrack();\n");

fs.writeFileSync('C:/Users/User1/Desktop/QR/app.js', src, 'utf8');
console.log('Lines:', src.split('\n').length);
console.log('i18n-service:', src.includes('./i18n-service.js'));
console.log('ui-utils:', src.includes('./ui-utils.js'));
console.log('tickets-manager:', src.includes('./tickets-manager.js'));
console.log('setTicketHooks:', src.includes('setTicketHooks'));
console.log('showOfflineBanner:', src.includes('showOfflineBannerIfNeeded'));
