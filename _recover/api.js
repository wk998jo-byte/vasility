/**
 * Client API layer — PostgreSQL REST client with offline queue fallback.
 */

const OFFLINE_QUEUE_KEY = 'ssc_offline_queue';

let apiReady = false;

export function isApiReady() {
  return apiReady;
}

function getAuthToken() {
  try {
    return localStorage.getItem('ssc_admin_token');
  } catch {
    return null;
  }
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText || 'Request failed');
  }
  return res.json();
}

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOfflineAction(action) {
  const queue = getOfflineQueue();
  queue.push({
    ...action,
    queuedAt: action.queuedAt || new Date().toISOString(),
  });
  setOfflineQueue(queue);
}

export async function flushOfflineQueue() {
  if (!(await probeApi())) return { flushed: 0, remaining: getOfflineQueue().length };

  const queue = getOfflineQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  const remaining = [];
  let flushed = 0;

  for (const action of queue) {
    try {
      if (action.type === 'create') await createTicketToApi(action.ticket);
      else if (action.type === 'upsert') await upsertTicketToApi(action.ticket);
      else if (action.type === 'delete') await deleteTicketFromApi(action.id);
      else continue;
      flushed++;
    } catch {
      remaining.push(action);
    }
  }

  setOfflineQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export async function probeApi() {
  try {
    const data = await request('/api/health');
    apiReady = Boolean(data.ok && data.database);
    return apiReady;
  } catch {
    apiReady = false;
    return false;
  }
}

export async function fetchTicketsFromApi(status) {
  const url = status
    ? `/api/tickets?status=${encodeURIComponent(status)}`
    : '/api/tickets';
  const data = await request(url);
  return Array.isArray(data.tickets) ? data.tickets : [];
}

export async function createTicketToApi(ticket) {
  await request('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(ticket),
  });
}

export async function upsertTicketToApi(ticket) {
  await request(`/api/tickets/${encodeURIComponent(ticket.id)}`, {
    method: 'PUT',
    body: JSON.stringify(ticket),
  });
}

export async function deleteTicketFromApi(id) {
  await request(`/api/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchPortalFromApi() {
  return request('/api/portal');
}

export async function savePortalToApi(exportData) {
  await request('/api/portal', {
    method: 'PUT',
    body: JSON.stringify(exportData),
  });
}
