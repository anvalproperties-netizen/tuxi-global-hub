const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({
    executablePath: '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const outDir = path.resolve(__dirname, '../public/screenshots-auth1a');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const BASE_URL = 'http://localhost:3000';

  async function createCleanPage(width, height) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript(() => {
      localStorage.setItem('tuxi_cookie_consent_v1', JSON.stringify({ necessary: true }));
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    return page;
  }

  // 1. Mobile 320px
  console.log('1. Mobile 320px');
  let page = await createCleanPage(320, 720);
  await page.screenshot({ path: path.join(outDir, '01-welcome-mobile-320px.png') });
  await page.close();

  // 2. Smartphone 390px
  console.log('2. Smartphone 390px');
  page = await createCleanPage(390, 844);
  await page.screenshot({ path: path.join(outDir, '02-welcome-smartphone-390px.png') });
  await page.close();

  // 3. Tablet 768px
  console.log('3. Tablet 768px');
  page = await createCleanPage(768, 1024);
  await page.screenshot({ path: path.join(outDir, '03-welcome-tablet-768px.png') });
  await page.close();

  // 4. Desktop 1280px
  console.log('4. Desktop 1280px');
  page = await createCleanPage(1280, 800);
  await page.screenshot({ path: path.join(outDir, '04-welcome-desktop-1280px.png') });
  await page.close();

  // 5. Email Sign-In Modal (on 390px)
  console.log('5. Email Sign-In Modal');
  page = await createCleanPage(390, 844);
  await page.locator('button:has-text("Continue with Email")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '05-email-signin-modal.png') });
  await page.close();

  // 6. Apple Unavailable Modal (on 390px)
  console.log('6. Apple Modal');
  page = await createCleanPage(390, 844);
  await page.locator('button:has-text("Continue with Apple")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '06-apple-unavailable-modal.png') });
  await page.close();

  // 7. Authorized Role Switcher
  console.log('7. Authorized Role Switcher');
  page = await createCleanPage(1280, 800);
  // Open Email modal
  await page.locator('button:has-text("Continue with Email")').click();
  await page.waitForTimeout(400);
  // Switch to Create Account
  await page.locator('button:has-text("Create Account")').first().click();
  await page.waitForTimeout(400);
  const ts = Date.now();
  await page.locator('input[placeholder="Jane"]').fill('Thabo');
  await page.locator('input[placeholder="Doe"]').fill('Molefe');
  await page.locator('input[type="tel"]').fill('+27821110001');
  await page.locator('input[type="email"]').fill(`thabo_${ts}@tuxi.co.za`);
  await page.locator('input[type="password"]').fill('ValidPassword123!');
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(2500);

  // Click profile trigger in TopBar
  const switcher = page.locator('button[title="Switch profile role or manage account"]');
  await switcher.waitFor({ state: 'visible', timeout: 5000 });
  await switcher.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '07-authorized-role-switcher.png') });
  await page.close();

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED PERFECTLY!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
