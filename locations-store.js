/**
 * Runtime room registry — static rooms + admin-created rooms (localStorage).
 */
import { isApiReady, savePortalToApi } from './api.js';
import { STATIC_ROOMS } from './rooms-data.js';

const STORAGE_LOCATIONS = 'ssc_locations';
const STORAGE_HIDDEN = 'ssc_hidden_rooms';

let customLocations = [];
let hiddenRoomIds = [];

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, val) {
  try { localStorage.setItem(key, val); return true; } catch { return false; }
}

function generateLocationId() {
  let id;
  do {
    id = 'loc_' + Math.floor(100000 + Math.random() * 900000);
  } while (customLocations.some(l => l.id === id));
  return id;
}

function parseLocationsPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.locations)) return raw.locations;
  return [];
}

export function loadLocationsStore() {
  try {
    customLocations = parseLocationsPayload(JSON.parse(storageGet(STORAGE_LOCATIONS) || '[]'));
  } catch {
    customLocations = [];
  }
  try {
    const hidden = JSON.parse(storageGet(STORAGE_HIDDEN) || '[]');
    hiddenRoomIds = Array.isArray(hidden) ? hidden : [];
  } catch {
    hiddenRoomIds = [];
  }
  sanitizeHiddenRooms();
}

function sanitizeHiddenRooms() {
  // Built-in SSC rooms are always shown — only custom room ids may stay hidden
  const before = hiddenRoomIds.length;
  hiddenRoomIds = hiddenRoomIds.filter(id => !STATIC_ROOMS.includes(id));
  if (hiddenRoomIds.length !== before) saveHiddenRooms();
}

export function saveLocationsStore() {
  storageSet(STORAGE_LOCATIONS, JSON.stringify(customLocations));
  if (isApiReady()) {
    savePortalToApi(getCustomLocationsExport()).catch(() => {});
  }
}

function saveHiddenRooms() {
  storageSet(STORAGE_HIDDEN, JSON.stringify(hiddenRoomIds));
  if (isApiReady()) {
    savePortalToApi(getCustomLocationsExport()).catch(() => {});
  }
}

export function getCustomLocations() {
  return customLocations;
}

export function getHiddenRoomIds() {
  return [...hiddenRoomIds];
}

export function isRoomHidden(roomId) {
  return hiddenRoomIds.includes(roomId);
}

export function getCustomLocationsExport() {
  return { locations: customLocations, hiddenRoomIds };
}

export function roomNameExists(name, excludeId) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const visibleStatic = STATIC_ROOMS;
  if (visibleStatic.some(r => r.toLowerCase() === lower)) return true;
  return customLocations.some(l => l.name.toLowerCase() === lower && l.id !== excludeId);
}

export function resolveRoomName(roomKey) {
  if (!roomKey) return '';
  const custom = customLocations.find(l => l.id === roomKey);
  if (custom) return custom.name;
  return roomKey;
}

export function isCustomLocation(roomKey) {
  return customLocations.some(l => l.id === roomKey);
}

export function getAllRoomOptions() {
  const staticRooms = STATIC_ROOMS.map(name => ({ id: name, name, isCustom: false }));
  const dynamic = customLocations
    .filter(l => !isRoomHidden(l.id))
    .map(l => ({ id: l.id, name: l.name, isCustom: true }));
  return [...staticRooms, ...dynamic].sort((a, b) => a.name.localeCompare(b.name));
}

/** Hidden custom rooms only (built-in SSC rooms are always visible). */
export function getHiddenRoomOptions() {
  return hiddenRoomIds
    .filter(id => customLocations.some(l => l.id === id))
    .map(id => {
      const custom = customLocations.find(l => l.id === id);
      if (custom) return { id, name: custom.name, isCustom: true };
      return { id, name: id, isCustom: false };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function unhideRoom(id) {
  if (!isRoomHidden(id)) return;
  hiddenRoomIds = hiddenRoomIds.filter(h => h !== id);
  saveHiddenRooms();
}

/** Bring back all built-in SSC rooms that were hidden. */
export function restoreBuiltInRooms() {
  const before = hiddenRoomIds.length;
  hiddenRoomIds = hiddenRoomIds.filter(id => !STATIC_ROOMS.includes(id));
  if (hiddenRoomIds.length !== before) saveHiddenRooms();
}

export function ensureRoomsVisible() {
  loadLocationsStore();
  restoreBuiltInRooms();
}

/**
 * Hide a room from forms, rooms manager, and QR printing (built-in or custom id).
 */
export function hideRoom(id) {
  if (!id || isRoomHidden(id)) return;
  // Never hide built-in SSC rooms
  if (STATIC_ROOMS.includes(id)) return;
  hiddenRoomIds.push(id);
  saveHiddenRooms();
}

/**
 * Create a room and register it across report forms, dispatch, and QR printing.
 */
export function addRoom(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Room name is required');
  if (roomNameExists(trimmed)) throw new Error('A room with this name already exists');

  const location = {
    id: generateLocationId(),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };

  customLocations.push(location);
  saveLocationsStore();

  return { location };
}

/**
 * Rename a custom room.
 */
export function updateRoom(id, name) {
  if (!isCustomLocation(id)) throw new Error('Built-in rooms cannot be edited');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Room name is required');
  if (roomNameExists(trimmed, id)) throw new Error('A room with this name already exists');
  const location = customLocations.find(l => l.id === id);
  if (!location) throw new Error('Room not found');
  const oldName = location.name;
  location.name = trimmed;
  location.updatedAt = new Date().toISOString();
  saveLocationsStore();
  return { location, oldName };
}

/**
 * Remove a custom room and hide it from forms and QR printing.
 */
export function deleteRoom(id) {
  if (!isCustomLocation(id)) throw new Error('Built-in rooms cannot be deleted');
  const index = customLocations.findIndex(l => l.id === id);
  if (index === -1) throw new Error('Room not found');
  const [removed] = customLocations.splice(index, 1);
  saveLocationsStore();
  hideRoom(id);
  return removed;
}

/**
 * Remove any room from the portal — deletes custom rooms, hides built-in SSC rooms.
 */
export function removeRoomFromPortal(id) {
  if (isCustomLocation(id)) return deleteRoom(id);
  throw new Error('Built-in SSC rooms cannot be removed');
}
