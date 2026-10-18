import type { ImportedFile } from '@/types';
import { detectYsmVersion } from './projectParser';

interface EmscriptenFS {
  mkdirTree(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
  readdir(path: string): string[];
  stat(path: string): { mode: number };
  isDir(mode: number): boolean;
  readFile(path: string): Uint8Array;
  unlink(path: string): void;
  rmdir(path: string): void;
}

interface EmscriptenModule {
  FS: EmscriptenFS;
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _ysm_parse_bytes?: (
    dataPtr: number,
    size: number,
    outputDirPtr: number,
    rawMeshes: number,
    errorPtr: number,
    errorSize: number,
  ) => number;
  ccall(
    name: string,
    returnType: string,
    argTypes: string[],
    args: unknown[],
  ): number;
  writeArrayToMemory?: (array: Uint8Array, ptr: number) => void;
  UTF8ToString(ptr: number, maxBytesToRead?: number): string;
}

declare global {
  interface Window {
    YSMParserModule?: (options?: Record<string, unknown>) => Promise<EmscriptenModule>;
  }
}

export interface WasmParseResult {
  files: ImportedFile[];
  version: string;
}

let modulePromise: Promise<EmscriptenModule> | null = null;
let parseCounter = 0;

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  return new URL(`${base}${path}`, window.location.href).href;
}

async function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-ysm-wasm="1"]`);
  if (existing) {
    if (existing.dataset.loaded === '1') return;
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('无法加载 YSMParser.js。')), {
        once: true,
      });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.ysmWasm = '1';
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.appendChild(script);
  });
}

export async function getParserModule(): Promise<EmscriptenModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      await loadScript(assetUrl('wasm/YSMParser.js'));
      if (!window.YSMParserModule) {
        throw new Error('WASM 模块未导出 YSMParserModule，请重新编译 YSMParser Web 目标。');
      }
      const module = await window.YSMParserModule({
        locateFile: (path: string) => assetUrl(`wasm/${path}`),
        print: (message: string) => console.debug('[YSMParser]', message),
        printErr: (message: string) => console.warn('[YSMParser]', message),
      });
      if (!module._ysm_parse_bytes) {
        throw new Error(
          '当前 YSMParser.wasm 不包含 ysm_parse_bytes 导出，请使用 YSM Studio 编译的 WebAssembly。',
        );
      }
      return module;
    })().catch((error) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

function readTree(module: EmscriptenModule, root: string): ImportedFile[] {
  const output: ImportedFile[] = [];
  const walk = (dir: string) => {
    for (const name of module.FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      const full = `${dir}/${name}`;
      const stat = module.FS.stat(full);
      if (module.FS.isDir(stat.mode)) {
        walk(full);
      } else {
        const relative = full.slice(root.length + 1);
        output.push({ path: relative, data: module.FS.readFile(full) });
      }
    }
  };
  walk(root);
  return output;
}

function removeTree(module: EmscriptenModule, root: string) {
  try {
    for (const name of module.FS.readdir(root)) {
      if (name === '.' || name === '..') continue;
      const full = `${root}/${name}`;
      const stat = module.FS.stat(full);
      if (module.FS.isDir(stat.mode)) removeTree(module, full);
      else module.FS.unlink(full);
    }
    module.FS.rmdir(root);
  } catch {
    // MEMFS cleanup is best effort.
  }
}

export async function parseYsmBytes(bytes: Uint8Array): Promise<WasmParseResult> {
  const module = await getParserModule();
  const version = detectYsmVersion(bytes);
  const id = ++parseCounter;
  const outputDir = `/ysm/out-${id}`;
  const errorSize = 2048;

  module.FS.mkdirTree(outputDir);
  const dataPtr = module._malloc(bytes.byteLength);
  const errorPtr = module._malloc(errorSize);
  try {
    if (module.writeArrayToMemory) {
      module.writeArrayToMemory(bytes, dataPtr);
    } else if (module.HEAPU8) {
      module.HEAPU8.set(bytes, dataPtr);
    } else {
      throw new Error('WASM 模块没有导出内存写入方法，请检查 EXPORTED_RUNTIME_METHODS。');
    }
    const code = module.ccall(
      'ysm_parse_bytes',
      'number',
      ['number', 'number', 'string', 'number', 'number', 'number'],
      [dataPtr, bytes.byteLength, outputDir, 1, errorPtr, errorSize],
    );
    if (code !== 0) {
      const detail = module.UTF8ToString(errorPtr, errorSize) || '未知解密错误。';
      throw new Error(detail);
    }
    return { files: readTree(module, outputDir), version };
  } finally {
    module._free(dataPtr);
    module._free(errorPtr);
    removeTree(module, outputDir);
  }
}
