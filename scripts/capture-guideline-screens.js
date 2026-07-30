/**
 * Capture real FMC UI screenshots from a running local server.
 * Usage: node scripts/capture-guideline-screens.js [baseUrl]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
import { loadEnv } from '../server/env.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'docs', 'guideline', 'screens');
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const chromePath = process.env.CHROME_PATH
  || 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';

fs.mkdirSync(outDir, { recursive: true });

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', name);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1) Request / scan gate
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '01-request-scan.png');

  // 2) Try resolve a real room token from API inventory sample
  let token = 'MGS BQ - A-01';
  try {
    const res = await page.request.get(base + '/api/rooms');
    // public rooms may not include tokens — try resolve directly
    const resolve = await page.request.get(base + '/api/rooms/resolve?token=' + encodeURIComponent(token));
    if (!resolve.ok()) {
      // fallback common names
      for (const t of ['MGS BQ - A-01', 'Dhahran Camp - MANAGERS ROOM', 'Madina Camp 1 PMT - A-01']) {
        const r = await page.request.get(base + '/api/rooms/resolve?token=' + encodeURIComponent(t));
        if (r.ok()) { token = t; break; }
      }
    }
  } catch { /* ignore */ }

  await page.goto(base + '/?token=' + encodeURIComponent(token), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '02-report-form.png');

  // 3) Track
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /track|تتبع/i }).first().click();
  await page.waitForTimeout(800);
  await shot(page, '03-track.png');

  // 4) Admin login
  await page.getByRole('button', { name: /command center|admin|لوحة|قيادة/i }).first().click();
  await page.waitForTimeout(600);
  await shot(page, '04-admin-login.png');

  const candidates = [
    [process.env.GUIDELINE_ADMIN_USER, process.env.GUIDELINE_ADMIN_PASS],
    [process.env.ADMIN_USER, process.env.ADMIN_PASS],
    ['m.irfan', process.env.STAFF_DEFAULT_PASSWORD || process.env.FACILITY_PASS],
    ['abdulaziz.bq', process.env.STAFF_DEFAULT_PASSWORD || process.env.FACILITY_PASS],
  ].filter(([u, p]) => u && p);

  let loggedIn = false;
  for (const [user, pass] of candidates) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /command center|admin login|لوحة/i }).first().click();
    await page.waitForTimeout(500);
    await page.locator('input').nth(0).fill('');
    await page.locator('input').nth(0).fill(user);
    await page.locator('input[type="password"]').fill(pass);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForTimeout(1500);
    const invalid = await page.getByText(/invalid username|password|غير صحيح|خطأ/i).count();
    if (!invalid) {
      loggedIn = true;
      console.log('Logged in as', user);
      break;
    }
    console.warn('Login failed for', user);
  }

  if (loggedIn) {
    await shot(page, '05-dashboard.png');

    const locBtn = page.getByRole('button', { name: /Manage Locations|إدارة المواقع/i });
    if (await locBtn.count()) {
      await locBtn.first().click();
      await page.waitForTimeout(1200);
      await shot(page, '06-locations.png');
      // Close location modal (X button) before opening Staff
      const closeLoc = page.locator('.modal-panel').filter({ hasText: /Location Manager|مدير المواقع/i }).getByRole('button').last();
      if (await page.locator('.modal-backdrop').count()) {
        await page.locator('.modal-backdrop').first().click({ force: true }).catch(() => {});
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }

    const staffBtn = page.getByRole('button', { name: /Manage Staff|إدارة الموظفين/i });
    if (await staffBtn.count()) {
      await staffBtn.first().click({ force: true });
      await page.waitForTimeout(1200);
      await shot(page, '07-staff-manager.png');
      // Try open Create Staff
      const createBtn = page.getByRole('button', { name: /Create Staff|إنشاء|إضافة موظف|create/i });
      if (await createBtn.count()) {
        await createBtn.first().click({ force: true });
        await page.waitForTimeout(800);
        await shot(page, '08-create-staff.png');
      }
    }
  } else {
    console.warn('Skip admin screens — no working admin credentials in env');
    await shot(page, '05-dashboard.png');
  }

  await browser.close();
  console.log('Done. Screens in', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
