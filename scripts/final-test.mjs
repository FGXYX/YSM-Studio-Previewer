import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9230');
const context = browser.contexts()[0];
const page = context.pages()[0];
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.waitForTimeout(3500);
await page.locator('input[accept*=".ysm"]').setInputFiles('D:/Projects/ysm_pr/ysm-studio/test-fixtures/default-v1.ysm');
await page.waitForTimeout(5000);
await page.locator('.model-card').nth(1).click();
await page.waitForTimeout(2500);
console.log(
  await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.model-card-name')].map((e) => e.textContent),
    format: document.querySelector('.stage-format')?.textContent,
    stage: document.querySelector('.stage-title-row h1')?.textContent,
    bindLabel: document.querySelector('.clip-indicator small')?.textContent,
    toasts: [...document.querySelectorAll('.toast-message')].map((e) => e.textContent),
    canvas: Boolean(document.querySelector('canvas')),
  })),
);
await page.screenshot({ path: 'shots/31-final-v1.png' });
await context.close();
