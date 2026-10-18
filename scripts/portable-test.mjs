import { chromium } from 'playwright-core';
import fs from 'node:fs';

const testFile = process.env.YSM_TEST_FILE ?? 'test-fixtures/sample-v3.ysm';
if (!fs.existsSync(testFile)) {
  console.error(`Missing V3 fixture: ${testFile}\nSet YSM_TEST_FILE to a local V3 .ysm file.`);
  process.exit(2);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9226');
const context = browser.contexts()[0];
const page = context.pages()[0];
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE', message.text());
});
await page.waitForTimeout(4000);
console.log(
  await page.evaluate(() => ({
    title: document.title,
    cards: [...document.querySelectorAll('.model-card-name')].map((e) => e.textContent),
    native: Boolean(window.ysmNative),
    canvas: Boolean(document.querySelector('canvas')),
  })),
);
await page.locator('input[accept*=".ysm"]').setInputFiles(testFile);
await page.waitForTimeout(7000);
await page.locator('.model-card').nth(1).click();
await page.waitForTimeout(2500);
console.log(
  await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.model-card-name')].map((e) => e.textContent),
    format: document.querySelector('.stage-format')?.textContent,
    stage: document.querySelector('.stage-title-row h1')?.textContent,
    toasts: [...document.querySelectorAll('.toast-message')].map((e) => e.textContent),
  })),
);
await page.screenshot({ path: 'shots/30-portable-v3.png' });
await context.close();
