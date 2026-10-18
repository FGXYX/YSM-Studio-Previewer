import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

await mkdir('shots', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 960 }, deviceScaleFactor: 1 });
const messages = [];
page.on('console', (message) => messages.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => messages.push(`[pageerror] ${error.stack ?? error.message}`));
page.on('requestfailed', (request) =>
  messages.push(`[requestfailed] ${request.url()} :: ${request.failure()?.errorText}`),
);

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.stage-canvas', { timeout: 30000 });
await page.waitForTimeout(6000);

const summary = await page.evaluate(() => ({
  title: document.title,
  modelCards: [...document.querySelectorAll('.model-card-name')].map((el) => el.textContent),
  stageTitle: document.querySelector('.stage-title-row h1')?.textContent,
  stats: [...document.querySelectorAll('.meta-grid strong')].map((el) => el.textContent),
  clip: document.querySelector('.clip-indicator strong')?.textContent,
  fps: document.querySelector('.status-pill')?.textContent,
  bodyText: document.body.innerText.slice(0, 2000),
  canvas: (() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return {
      width: canvas.width,
      height: canvas.height,
      renderer: gl?.getParameter(gl.RENDERER),
      vendor: gl?.getParameter(gl.VENDOR),
    };
  })(),
}));

await page.screenshot({ path: 'shots/01-initial.png', fullPage: false });

await page.getByRole('button', { name: /轮盘/ }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/02-extras.png', fullPage: false });

const extraNames = await page.locator('.extra-label').allTextContents();
const wheelSlots = await page.locator('.wheel-slot').count();

await page.getByRole('button', { name: /语音/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/03-sounds.png', fullPage: false });
const sounds = await page.locator('.sound-title-line strong').allTextContents();

await page.getByRole('button', { name: /基础动作/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/04-actions.png', fullPage: false });

await page.getByRole('button', { name: /Molang/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/05-molang.png', fullPage: false });

console.log(JSON.stringify({ summary, extraNames, wheelSlots, sounds, messages: messages.slice(0, 80) }, null, 2));
await browser.close();
