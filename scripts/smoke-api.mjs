/**
 * API smoke test — requires server on SMOKE_BASE_URL (default http://localhost:8091).
 */
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8091').replace(/\/$/, '');
const API = `${BASE}/api`;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

const results = { passed: [], failed: [] };
const pass = (n) => { results.passed.push(n); console.log(`PASS: ${n}`); };
const fail = (n, e) => { results.failed.push({ n, e }); console.error(`FAIL: ${n} — ${e}`); };

async function main() {
  try {
    const health = await fetch(`${API}/health`).then((r) => r.json());
    if (health.ok && health.database) pass('GET /api/health');
    else fail('GET /api/health', JSON.stringify(health));

    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    }).then((r) => r.json());
    if (!login.token) { fail('POST /api/auth/login', JSON.stringify(login)); return; }
    pass('POST /api/auth/login');
    const auth = { Authorization: `Bearer ${login.token}` };

    const adminRooms = await fetch(`${API}/rooms/admin`, { headers: auth }).then((r) => r.json());
    const room = (adminRooms.rooms || []).find((r) => r.isActive && r.token);
    if (!room) { fail('GET /api/rooms/admin', 'no room with token'); return; }
    pass('GET /api/rooms/admin');

    const qrUrl = `${BASE}/?token=${encodeURIComponent(room.token)}`;
    pass(`QR URL: ${qrUrl}`);

    const resolved = await fetch(`${API}/rooms/resolve?token=${encodeURIComponent(room.token)}`).then((r) => r.json());
    if (!resolved?.room?.id) { fail('GET /api/rooms/resolve', JSON.stringify(resolved)); return; }
    pass('GET /api/rooms/resolve');

    const empId = `SMOKE-${Date.now()}`;
    const created = await fetch(`${API}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporterName: 'API Smoke',
        employeeId: empId,
        assetName: resolved.assets[0],
        issueType: 'Broken / Not Working',
        priority: 'Medium',
        description: 'smoke test',
        qrToken: room.token,
      }),
    }).then(async (r) => ({ ok: r.ok, data: await r.json() }));
    if (!created.ok) { fail('POST /api/issues', JSON.stringify(created.data)); return; }
    const ticket = created.data.issue.id;
    pass(`POST /api/issues → ${ticket}`);

    const list = await fetch(`${API}/issues`, { headers: auth }).then((r) => r.json());
    if ((list.issues || []).some((i) => i.id === ticket)) pass('GET /api/issues — ticket in dashboard');
    else fail('GET /api/issues', 'ticket not in list');

    const upd = await fetch(`${API}/issues/${encodeURIComponent(ticket)}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'In Progress' }),
    }).then((r) => r.json());
    if (upd.issue?.status === 'In Progress') pass('PUT /api/issues — In Progress');
    else fail('PUT /api/issues', JSON.stringify(upd));

    const track = await fetch(`${API}/issues/track?ticketNumber=${encodeURIComponent(ticket)}&employeeId=${encodeURIComponent(empId)}`).then((r) => r.json());
    if (track.issue?.status === 'In Progress') pass('GET /api/issues/track — In Progress');
    else fail('GET /api/issues/track', JSON.stringify(track));

    // Re-fetch after simulated refresh
    const refetch = await fetch(`${BASE}/issues/${encodeURIComponent(ticket)}`, { headers: auth }).catch(() => null);
    const issues2 = await fetch(`${API}/issues?status=In%20Progress`, { headers: auth }).then((r) => r.json());
    if ((issues2.issues || []).some((i) => i.id === ticket && i.status === 'In Progress')) {
      pass('Persistence after re-fetch');
    } else fail('Persistence after re-fetch', 'status not In Progress');
  } catch (e) {
    fail('Unexpected', e);
  }

  console.log(`\nAPI smoke: ${results.passed.length} passed, ${results.failed.length} failed`);
  if (results.failed.length) process.exit(1);
}

main();
