import { chromium } from 'playwright-core';
import fs from 'node:fs';

const testFile = process.env.YSM_TEST_FILE ?? 'test-fixtures/sample-v3.ysm';
if (!fs.existsSync(testFile)) {
  console.error(`Missing V3 fixture: ${testFile}\nSet YSM_TEST_FILE to a local V3 .ysm file.`);
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
await page.waitForTimeout(8000);
await page.locator('.model-card').nth(1).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/23-v3-raw.png' });
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const project = window.__ysmProject;
      return {
        cards: [...document.querySelectorAll('.model-card-name')].map((e) => e.textContent),
        stage: document.querySelector('.stage-title-row h1')?.textContent,
        format: document.querySelector('.stage-format')?.textContent,
        meta: [...document.querySelectorAll('.meta-grid strong')].map((e) => e.textContent),
        toasts: [...document.querySelectorAll('.toast-message')].map((e) => e.textContent),
        rawFormat: project?.model?.raw_mesh_format,
        uvSpace: project?.model?.uv_space,
        boneCount: project?.model?.bones?.length,
        rawBones: project?.model?.bones?.filter((b) => b.raw_meshes?.length).length,
        cubeBones: project?.model?.bones?.filter((b) => b.cubes?.length).length,
        firstRaw: project?.model?.bones?.find((b) => b.raw_meshes?.length)?.raw_meshes?.[0]
          ? {
              positions: project.model.bones.find((b) => b.raw_meshes?.length).raw_meshes[0].positions.length,
              normals: project.model.bones.find((b) => b.raw_meshes?.length).raw_meshes[0].normals.length,
              uvs: project.model.bones.find((b) => b.raw_meshes?.length).raw_meshes[0].uvs.length,
              indices: project.model.bones.find((b) => b.raw_meshes?.length).raw_meshes[0].indices.length,
            }
          : null,
      };
    }),
    null,
    2,
  ),
);
await browser.close();
