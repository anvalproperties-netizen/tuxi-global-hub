const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function capture() {
  const browser = await chromium.launch({
    executablePath: '/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const outDir = path.resolve(__dirname, '../public/screenshots-auth1a');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const BASE_URL = 'http://localhost:3000';

  async function dismissCookie(page) {
    try {
      const btn = page.locator('button:has-text("Accept All"), button:has-text("Essential Only")').first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch (e) {}
  }

  console.log('Capturing 1. Mobile 320px...');
  let page = await browser.newPage({ viewport: { width: 320, height: 750 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '01-welcome-mobile-320px.png') });
  await page.close();

  console.log('Capturing 2. Smartphone 390px...');
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '02-welcome-smartphone-390px.png') });
  await page.close();

  console.log('Capturing 3. Tablet 768px...');
  page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '03-welcome-tablet-768px.png') });
  await page.close();

  console.log('Capturing 4. Desktop 1280px...');
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '04-welcome-desktop-1280px.png') });
  await page.close();

  console.log('Capturing 5. Email Sign-In Modal (390px)...');
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Continue with Email")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '05-email-signin-modal.png') });
  await page.close();

  console.log('Capturing 6. Apple "Coming Soon" Modal (390px)...');
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Continue with Apple")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '06-apple-unavailable-modal.png') });
  await page.close();

  console.log('Capturing 7. Authorized Role Switcher (Desktop)...');
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissCookie(page);
  // Open email modal and register a live customer session
  await page.locator('button:has-text("Continue with Email")').click();
  await page.waitForTimeout(400);
  // Switch to register tab
  await page.locator('button:has-text("Create Account")').click();
  await page.waitForTimeout(300);
  const ts = Date.now();
  await page.locator('input[placeholder="Amara"]').fill('Thabo');
  await page.locator('input[placeholder="Ndlovu"]').fill('Molefe');
  await page.locator('input[type="email"]').fill(`cust_${ts}@tuxi.co.za`);
  await page.locator('input[placeholder="+27 82 123 4567"]').fill('+27821110001');
  await page.locator('input[type="password"]').fill('ValidSecurePass123!');
  // Submit registration form
  await page.locator('form button:has-text("Create Account")').click();
  await page.waitForTimeout(2000);

  // Authenticated state! Click profile dropdown in TopBar
  const profileDropdown = page.locator('button:has-text("Switch Role"), button:has-text("Customer")').first();
  if (await profileDropdown.isVisible({ timeout: 3000 })) {
    await profileDropdown.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(outDir, '07-authorized-role-switcher.png') });
  await page.close();

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
