const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
const utf8 = new TextDecoder('utf-8');
let gb18030: TextDecoder | null = null;
try {
  gb18030 = new TextDecoder('gb18030');
} catch {
  gb18030 = null;
}

export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function findFile(files: Map<string, Uint8Array>, path: string): Uint8Array | undefined {
  const normalized = normalizePath(path).toLowerCase();
  if (files.has(path)) return files.get(path);
  for (const [key, value] of files) {
    if (key.toLowerCase() === normalized) return value;
  }
  return undefined;
}

export function decodeText(bytes: Uint8Array): string {
  try {
    return utf8Fatal.decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    if (gb18030) {
      try {
        return gb18030.decode(bytes).replace(/^\uFEFF/, '');
      } catch {
        // fall through
      }
    }
    return utf8.decode(bytes).replace(/^\uFEFF/, '');
  }
}

export function parseJson<T = unknown>(bytes: Uint8Array, label: string): T {
  let text = decodeText(bytes);
  // Some exporters emit a trailing comma in otherwise valid JSON.
  text = text.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} 不是有效 JSON：${detail}`);
  }
}

export function fileStem(path: string): string {
  const file = normalizePath(path).split('/').pop() ?? path;
  return file.replace(/\.[^.]+$/, '');
}

export function fileExt(path: string): string {
  const match = /\.([^.]+)$/.exec(path);
  return match ? match[1].toLowerCase() : '';
}

export function fileDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00.00';
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function makeId(prefix = 'model'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function isVector(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length >= 3 && value.every((v) => typeof v === 'number');
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Strip Minecraft formatting codes such as `§6` or `&a` from display text. */
export function cleanMinecraftText(value: string): string {
  return value
    .replace(/§[0-9a-fk-orx]/gi, '')
    .replace(/&[0-9a-fk-orx]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
