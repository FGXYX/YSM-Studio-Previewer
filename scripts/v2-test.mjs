import { chromium } from 'playwright-core';
import fs from 'node:fs';

const testFile = process.env.YSM_TEST_FILE ?? 'test-fixtures/sample-v2.ysm';
if (!fs.existsSync(testFile)) {
  console.error(`Missing V2 fixture: ${testFile}\nSet YSM_TEST_FILE to a local V2 .ysm file.`);
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE', message.text());
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.locator('input[accept*=".ysm"]').setInputFiles(testFile);
await page.waitForTimeout(6000);
await page.locator('.model-card').nth(1).click();
await page.waitForTimeout(3000);
console.log(
  await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.model-card-name')].map((e) => e.textContent),
    format: document.querySelector('.stage-format')?.textContent,
    stage: document.querySelector('.stage-title-row h1')?.textContent,
    meta: [...document.querySelectorAll('.meta-grid strong')].map((e) => e.textContent),
    toasts: [...document.querySelectorAll('.toast-message')].map((e) => e.textContent),
  })),
);
await page.screenshot({ path: 'shots/26-v2.png' });
await browser.close();
