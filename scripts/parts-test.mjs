import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
const chips = page.locator('.part-chip');
console.log('chips', await chips.allTextContents());
await chips.filter({ hasText: '头发' }).click();
await page.waitForTimeout(900);
console.log('hidden class', await chips.filter({ hasText: '头发' }).getAttribute('class'));
await page.screenshot({ path: 'shots/28-hair-hidden.png' });
await chips.filter({ hasText: '头发' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/29-hair-shown.png' });
await browser.close();
