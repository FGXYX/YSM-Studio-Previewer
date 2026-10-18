import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const messages = [];
page.on('console', (message) => messages.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.locator('input[accept*=".ysm"]').setInputFiles('D:/Projects/ysm_pr/ysm-studio/test-fixtures/default-v1.ysm');
await page.waitForTimeout(7000);
await page.screenshot({ path: 'shots/18-v1-import.png' });
console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      cards: [...document.querySelectorAll('.model-card-name')].map((e) => e.textContent),
      stage: document.querySelector('.stage-title-row h1')?.textContent,
      format: document.querySelector('.stage-format')?.textContent,
      tags: [...document.querySelectorAll('.tag')].map((e) => e.textContent),
      meta: [...document.querySelectorAll('.meta-grid strong')].map((e) => e.textContent),
      toasts: [...document.querySelectorAll('.toast-message')].map((e) => e.textContent),
      loading: Boolean(document.querySelector('.loading-overlay')),
      canvas: Boolean(document.querySelector('.stage-canvas')),
    })),
    null,
    2,
  ),
);
console.log(messages.slice(-30).join('\n'));
await browser.close();
