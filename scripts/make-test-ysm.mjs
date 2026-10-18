import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = path.join(root, 'public', 'samples', 'default');
const output = path.join(root, 'test-fixtures', 'default-v1.ysm');
fs.mkdirSync(path.dirname(output), { recursive: true });

const files = [];
async function walk(dir, prefix = '') {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'manifest.json' || entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
    else files.push(relative);
  }
}
await walk(sample);
files.sort();

const header = Buffer.alloc(24);
header.write('YSGP', 0, 'ascii');
header.writeUInt32BE(1, 4);
const chunks = [header];

for (const relative of files) {
  const plain = await fs.promises.readFile(path.join(sample, relative));
  const compressed = zlib.deflateSync(plain);
  const padded = Buffer.alloc(Math.ceil(compressed.length / 16) * 16);
  compressed.copy(padded);
  const key = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  const name = Buffer.from(relative, 'utf8');
  const nameLength = Buffer.alloc(4);
  nameLength.writeUInt32BE(name.length, 0);
  const dataLength = Buffer.alloc(4);
  dataLength.writeUInt32BE(encrypted.length, 0);
  chunks.push(nameLength, name, dataLength, key, iv, encrypted);
}

fs.writeFileSync(output, Buffer.concat(chunks));
console.log(`Wrote ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(2)} MB, ${files.length} files)`);
