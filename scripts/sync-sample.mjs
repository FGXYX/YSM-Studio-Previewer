import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(
  root,
  '..',
  'OpenYSM',
  'common',
  'src',
  'main',
  'resources',
  'assets',
  'yes_steve_model',
  'builtin',
  'default',
);
const destination = path.join(root, 'public', 'samples', 'default');
const audioSource = path.resolve(
  root,
  '..',
  'OpenYSM',
  'common',
  'src',
  'main',
  'resources',
  'assets',
  'yes_steve_model',
  'builtin',
  'wine_fox',
  '14_momo',
  'sounds',
  'fly_on.ogg',
);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

// Add a tiny sound cue to the demo so the soundboard and the animation event
// timeline both have something to show. The audio is CC BY-NC-SA 4.0 and comes
// from the bundled OpenYSM Wine Fox sample.
await mkdir(path.join(destination, 'sounds'), { recursive: true });
await cp(audioSource, path.join(destination, 'sounds', 'chime.ogg'));

const extraPath = path.join(destination, 'animations', 'extra.animation.json');
const extra = JSON.parse(await readFile(extraPath, 'utf8'));
if (extra.animations?.extra1 && !extra.animations.extra1.sound_effects) {
  extra.animations.extra1.sound_effects = {
    '0.05': { effect: 'chime' },
  };
}
await writeFile(extraPath, `${JSON.stringify(extra, null, 2)}\n`, 'utf8');

async function listFiles(dir, prefix = '') {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...(await listFiles(path.join(dir, entry.name), relative)));
    else output.push(relative);
  }
  return output;
}

const files = (await listFiles(destination)).sort();
await writeFile(
  path.join(destination, 'manifest.json'),
  `${JSON.stringify(
    {
      name: 'Default · 史蒂夫',
      description: 'OpenYSM 内置默认模型（CC0），包含基础动作、Extra 演出与语音示例。',
      files,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`Synced ${files.length} files to ${destination}`);
