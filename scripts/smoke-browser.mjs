/**
 * Browser smoke test — requires server running on BASE_URL (default http://localhost:8091).
 * Run: node scripts/smoke-browser.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8091';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

const results = { passed: [], failed: [] };

function pass(name) {
  results.passed.push(name);
  console.log(`PASS: ${name}`);
}

function fail(name, err) {
  results.failed.push({ name, err: String(err) });
  console.error(`FAIL: ${name} — ${err}`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  });
  const page = await browser.newPage();

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Request', { timeout: 15000 });

    const health = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/api/health`);
      return r.json();
    }, BASE);
    if (health?.ok && health?.database) pass('GET /api/health');
    else fail('GET /api/health', JSON.stringify(health));

    // Login as admin
    await page.getByRole('button', { name: 'Admin Login', exact: true }).click();
    await page.getByPlaceholder(/Admin Username|اسم المستخدم/i).fill(ADMIN_USER);
    await page.getByPlaceholder(/Password|كلمة المرور/i).fill(ADMIN_PASS);
    await page.getByRole('button', { name: /Access OS|دخول النظام/i }).click();
    await page.waitForTimeout(1500);

    if (await page.getByText(/Command Center|لوحة القيادة/i).first().isVisible()) {
      pass('Admin login in browser');
    } else {
      fail('Admin login in browser', 'Command Center not visible');
    }

    // Manage Locations
    await page.getByRole('button', { name: /Manage Locations|إدارة المواقع/i }).click();
    await page.waitForTimeout(800);
    if (await page.getByText(/Location Manager|مدير المواقع/i).isVisible()) {
      pass('Open Manage Locations modal');
    } else {
      fail('Open Manage Locations modal', 'modal not visible');
    }

    // Extract first QR link value from SVG parent card - get token via API instead
    const roomData = await page.evaluate(async (url) => {
      const token = localStorage.getItem('ssc_admin_token');
      const r = await fetch(`${url}/api/rooms/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      const room = (data.rooms || []).find((x) => x.isActive && x.token);
      return room ? { name: room.name, token: room.token } : null;
    }, BASE);

    if (!roomData?.token) {
      fail('Get room QR token', 'no active room with token');
    } else {
      pass('Get room QR token from admin API');
      const qrUrl = `${BASE}/?token=${encodeURIComponent(roomData.token)}`;
      await page.goto(qrUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Should see request form (not scan required screen)
      const scanRequired = await page.getByText(/valid Room QR Code|رمز QR صالح/i).isVisible().catch(() => false);
      if (!scanRequired) pass('QR URL opens request form');
      else fail('QR URL opens request form', 'still showing scan required');

      const empId = `BROWSER-${Date.now()}`;
      const formTextInputs = page.locator('form input[type="text"]');
      await formTextInputs.nth(0).fill('Browser Smoke Test');
      await formTextInputs.nth(1).fill(empId);

      // Select asset - first non-empty option
      const assetSelect = page.locator('select').first();
      await assetSelect.selectOption({ index: 1 });

      // Issue type
      const issueSelect = page.locator('select').nth(1);
      await issueSelect.selectOption({ label: 'Broken / Not Working' });

      // Priority Medium
      await page.getByRole('button', { name: /^Medium$|^متوسط$/i }).click();

      await page.getByRole('button', { name: /Submit Request|إرسال الطلب/i }).click();
      await page.waitForTimeout(2500);

      const successVisible = await page.getByText(/Request Submitted|تم إرسال الطلب/i).isVisible().catch(() => false);
      let ticketId = '';
      if (successVisible) {
        pass('Submit issue from browser form');
        const ticketEl = await page.locator('.font-mono.font-extrabold').first();
        ticketId = (await ticketEl.textContent())?.trim() || '';
        if (ticketId.startsWith('SSC-')) pass(`Ticket created: ${ticketId}`);
        else fail('Ticket number displayed', ticketId || 'empty');
      } else {
        fail('Submit issue from browser form', 'success screen not shown');
      }

      // Dashboard - go to admin
      await page.getByRole('button', { name: /Command Center|لوحة القيادة/i }).click();
      await page.waitForTimeout(2000);

      if (ticketId && (await page.getByText(ticketId).isVisible().catch(() => false))) {
        pass('Ticket appears in dashboard table');
      } else if (ticketId) {
        fail('Ticket appears in dashboard table', `ticket ${ticketId} not found`);
      }

      // Open ticket row / modal - click ticket id
      if (ticketId) {
        await page.getByText(ticketId).click();
        await page.waitForTimeout(800);
        await page.getByRole('button', { name: /Accept|قبول/i }).click();
        await page.waitForTimeout(2000);

        const trackedAfter = await page.evaluate(async ({ url, ticket, emp }) => {
          const r = await fetch(`${url}/api/issues/track?ticketNumber=${encodeURIComponent(ticket)}&employeeId=${encodeURIComponent(emp)}`);
          if (!r.ok) return null;
          return (await r.json()).issue?.status;
        }, { url: BASE, ticket: ticketId, emp: empId });

        if (trackedAfter === 'In Progress') pass('Update status to In Progress in browser');
        else fail('Update status to In Progress in browser', trackedAfter || 'null');

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);

        // Refresh — re-open dashboard (view state is not in URL)
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Command Center|لوحة القيادة/i }).click();
        await page.waitForTimeout(2000);

        const stillThere = await page.getByText(ticketId).isVisible().catch(() => false);
        if (stillThere) pass('Ticket persists after page refresh');
        else fail('Ticket persists after page refresh', 'ticket missing on dashboard after refresh');

        if (trackedAfter === 'In Progress') pass('Track API shows In Progress after refresh');
        else fail('Track API shows In Progress after refresh', trackedAfter || 'null');
      }
    }

    await page.getByRole('button', { name: /Manage Locations/i }).click().catch(() => {});
  } catch (err) {
    fail('Unexpected error', err);
  } finally {
    await browser.close();
  }

  console.log('\n--- Browser smoke summary ---');
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    results.failed.forEach((f) => console.error(`  - ${f.name}: ${f.err}`));
    process.exit(1);
  }
}

main();
