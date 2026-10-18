import type { ImportedFile, ParsedProject } from '@/types';
import { buildProject } from './projectParser';
import { parseYsmBytes } from './wasmParser';
import { normalizePath } from '@/lib/utils';

interface DirectoryReader {
  readEntries: (
    callback: (entries: FileSystemEntryLike[]) => void,
    error?: (error: DOMException) => void,
  ) => void;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (callback: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => DirectoryReader;
}

interface NativeBridge {
  platform: string;
  getPathForFile(file: File): string | null;
  openFiles(): Promise<string[]>;
  openDirectory(): Promise<string | null>;
  readFile(path: string): Promise<{ name: string; data: Uint8Array }>;
  scanDirectory(path: string): Promise<{
    rootPath: string;
    rootName: string;
    files: string[];
  }>;
  readDirectoryFiles(rootPath: string, relativePaths: string[]): Promise<ImportedFile[]>;
  setZoomFactor(factor: number): Promise<number>;
  setTheme(theme: 'light' | 'dark'): Promise<void>;
  openExternal(url: string): Promise<void>;
  showInFolder(path: string): Promise<void>;
}

declare global {
  interface Window {
    ysmNative?: NativeBridge;
  }
}

export interface DemoManifest {
  name: string;
  description?: string;
  files: string[];
}

export interface ImportResult {
  projects: ParsedProject[];
  errors: string[];
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

async function entryFile(entry: FileSystemEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file!(resolve, reject);
  });
}

async function readAllEntries(reader: DirectoryReader): Promise<FileSystemEntryLike[]> {
  const output: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    output.push(...batch);
  }
  return output;
}

async function walkEntry(entry: FileSystemEntryLike, rootPrefix = ''): Promise<ImportedFile[]> {
  if (entry.isFile) {
    const file = await entryFile(entry);
    return [{ path: normalizePath(`${rootPrefix}${file.name}`), data: await readFileBytes(file) }];
  }
  if (entry.isDirectory) {
    const reader = entry.createReader!();
    const children = await readAllEntries(reader);
    const prefix = `${rootPrefix}${entry.name}/`;
    const files = await Promise.all(children.map((child) => walkEntry(child, prefix)));
    return files.flat();
  }
  return [];
}

async function fileListToFiles(files: File[]): Promise<ImportedFile[]> {
  const imported = await Promise.all(
    files.map(async (file) => ({
      path: normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name),
      data: await readFileBytes(file),
    })),
  );
  return imported;
}

export async function importBytes(
  bytes: Uint8Array,
  sourceName: string,
  kind: 'encrypted' | 'folder' = 'encrypted',
  format?: string,
): Promise<ParsedProject> {
  if (kind === 'encrypted') {
    const result = await parseYsmBytes(bytes);
    return buildProject(result.files, {
      name: sourceName.replace(/\.ysm$/i, ''),
      sourceName,
      kind: 'encrypted',
      format: result.version,
    });
  }
  return buildProject([{ path: 'model.ysm', data: bytes }], {
    name: sourceName,
    sourceName,
    kind: 'folder',
    format,
  });
}

export async function importFileList(files: File[]): Promise<ImportResult> {
  const errors: string[] = [];
  const projects: ParsedProject[] = [];
  const encrypted = files.filter((file) => /\.ysm$/i.test(file.name));
  const plain = files.filter((file) => !/\.ysm$/i.test(file.name));

  for (const file of encrypted) {
    try {
      projects.push(
        await importBytes(await readFileBytes(file), file.name, 'encrypted'),
      );
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (plain.length > 0) {
    try {
      const imported = await fileListToFiles(plain);
      const root = imported[0]?.path.split('/')[0];
      const stripRoot = root && plain.some((file) => Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath));
      const normalized = stripRoot
        ? imported.map((file) => ({
            ...file,
            path: file.path.startsWith(`${root}/`) ? file.path.slice(root.length + 1) : file.path,
          }))
        : imported;
      projects.push(
        await buildProject(normalized, {
          name: root ?? 'Imported model',
          sourceName: root ?? 'Imported model',
          kind: 'folder',
          format: '未加密目录',
        }),
      );
    } catch (error) {
      errors.push(`目录: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { projects, errors };
}

export async function importDropTransfer(transfer: DataTransfer): Promise<ImportResult> {
  const errors: string[] = [];
  const projects: ParsedProject[] = [];
  const plain: ImportedFile[] = [];
  const entries: FileSystemEntryLike[] = [];

  for (const item of Array.from(transfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return importFileList(Array.from(transfer.files));
  }

  for (const entry of entries) {
    if (entry.isFile) {
      const file = await entryFile(entry);
      if (/\.ysm$/i.test(file.name)) {
        try {
          projects.push(await importBytes(await readFileBytes(file), file.name, 'encrypted'));
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        plain.push({ path: normalizePath(file.name), data: await readFileBytes(file) });
      }
    } else if (entry.isDirectory) {
      try {
        const files = (await walkEntry(entry)).map((file) => ({
          ...file,
          path: file.path.startsWith(`${entry.name}/`)
            ? file.path.slice(entry.name.length + 1)
            : file.path,
        }));
        if (files.some((file) => /\.ysm$/i.test(file.path))) {
          for (const file of files.filter((f) => /\.ysm$/i.test(f.path))) {
            try {
              projects.push(await importBytes(file.data, file.path, 'encrypted'));
            } catch (error) {
              errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        } else {
          plain.push(...files);
        }
      } catch (error) {
        errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (plain.length > 0) {
    try {
      projects.push(
        await buildProject(plain, {
          name: plain[0]?.path.split('/')[0] || 'Dropped model',
          sourceName: 'Dropped model',
          kind: 'folder',
          format: '未加密目录',
        }),
      );
    } catch (error) {
      errors.push(`目录: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { projects, errors };
}

interface FolderModelPlan {
  kind: 'folder';
  root: string;
  name: string;
  sourceName: string;
  paths: string[];
}

interface EncryptedModelPlan {
  kind: 'encrypted';
  path: string;
  name: string;
}

interface ModelPlan {
  folders: FolderModelPlan[];
  encrypted: EncryptedModelPlan[];
}

function pathDirectory(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function folderName(root: string, rootName: string): string {
  return root.split('/').filter(Boolean).pop() ?? rootName;
}

function planModels(paths: string[], rootName: string): ModelPlan {
  const normalized = paths.map(normalizePath).filter(Boolean);
  const encrypted = normalized
    .filter((path) => /\.ysm$/i.test(path))
    .map((path) => ({
      kind: 'encrypted' as const,
      path,
      name: path.split('/').pop()?.replace(/\.ysm$/i, '') ?? 'model',
    }));

  let roots: string[] = [];
  if (normalized.includes('ysm.json')) {
    roots = [''];
  } else {
    const manifests = normalized
      .filter((path) => path.endsWith('/ysm.json'))
      .map((path) => pathDirectory(path));
    if (manifests.length > 0) {
      roots = manifests;
    } else {
      for (const path of normalized) {
        if (path === 'main.json' || path === 'models/main.json') {
          roots.push('');
        } else if (path.endsWith('/models/main.json')) {
          roots.push(path.slice(0, -'/models/main.json'.length));
        } else if (path.endsWith('/main.json')) {
          const directory = pathDirectory(path);
          if (directory && !directory.endsWith('/models')) roots.push(directory);
        }
      }
    }
  }

  roots = [...new Set(roots)];
  if (roots.includes('')) roots = [''];
  // If both a parent and its child declare a model, keep the parent to avoid
  // importing the same files twice.
  roots = roots.filter(
    (root) => !roots.some((other) => other && other !== root && root.startsWith(`${other}/`)),
  );
  if (roots.length === 0) roots = [''];

  const folders = roots.map((root) => {
    const prefix = root ? `${root}/` : '';
    return {
      kind: 'folder' as const,
      root,
      name: folderName(root, rootName),
      sourceName: root ? `${rootName}/${root}` : rootName,
      paths: normalized.filter((path) => !root || path === root || path.startsWith(prefix)),
    };
  });

  return { folders, encrypted };
}

function stripRoot(path: string, root: string): string {
  if (!root) return path;
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

async function buildFolderProject(
  files: ImportedFile[],
  plan: FolderModelPlan,
): Promise<ParsedProject> {
  const stripped = files.map((file) => ({
    ...file,
    path: stripRoot(file.path, plan.root),
  }));
  return buildProject(stripped, {
    name: plan.name,
    sourceName: plan.sourceName,
    kind: 'folder',
    format: '未加密目录',
  });
}

export async function importFolderFiles(files: File[]): Promise<ImportResult> {
  const errors: string[] = [];
  const projects: ParsedProject[] = [];
  if (files.length === 0) return { projects, errors };
  const paths = files.map((file) =>
    normalizePath(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    ),
  );
  const rootName = paths[0]?.split('/')[0] ?? '模型文件夹';
  const plans = planModels(paths, rootName);
  const byPath = new Map(paths.map((path, index) => [path, files[index]]));

  for (const plan of plans.encrypted) {
    const file = byPath.get(plan.path);
    if (!file) continue;
    try {
      projects.push(await importBytes(await readFileBytes(file), plan.path, 'encrypted'));
    } catch (error) {
      errors.push(`${plan.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const plan of plans.folders) {
    const selected = plan.paths
      .map((path) => ({ path, file: byPath.get(path) }))
      .filter(
        (entry): entry is { path: string; file: File } => Boolean(entry.file),
      );
    // A .ysm file is imported separately above.
    const plain = selected.filter((entry) => !/\.ysm$/i.test(entry.path));
    if (plain.length === 0) continue;
    try {
      const imported = await Promise.all(
        plain.map(async (entry) => ({
          path: entry.path,
          data: await readFileBytes(entry.file),
        })),
      );
      projects.push(await buildFolderProject(imported, plan));
    } catch (error) {
      errors.push(`${plan.sourceName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { projects, errors };
}

export async function openDirectoryDialog(): Promise<ImportResult> {
  if (window.ysmNative) {
    const directory = await window.ysmNative.openDirectory();
    if (!directory) return { projects: [], errors: [] };
    try {
      const scanned = await window.ysmNative.scanDirectory(directory);
      const plans = planModels(scanned.files, scanned.rootName);
      const projects: ParsedProject[] = [];
      const errors: string[] = [];

      for (const plan of plans.encrypted) {
        try {
          const [file] = await window.ysmNative.readDirectoryFiles(scanned.rootPath, [
            plan.path,
          ]);
          projects.push(await importBytes(file.data, plan.path, 'encrypted'));
        } catch (error) {
          errors.push(`${plan.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      for (const plan of plans.folders) {
        const plain = plan.paths.filter((path) => !/\.ysm$/i.test(path));
        if (plain.length === 0) continue;
        try {
          const imported = await window.ysmNative.readDirectoryFiles(
            scanned.rootPath,
            plain,
          );
          projects.push(await buildFolderProject(imported, plan));
        } catch (error) {
          errors.push(
            `${plan.sourceName}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return { projects, errors };
    } catch (error) {
      return { projects: [], errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  return { projects: [], errors: ['浏览器模式请使用“选择模型文件夹”输入框。'] };
}

export async function openFilesDialog(): Promise<ImportResult> {
  if (window.ysmNative) {
    const paths = await window.ysmNative.openFiles();
    if (paths.length === 0) return { projects: [], errors: [] };
    const projects: ParsedProject[] = [];
    const errors: string[] = [];
    for (const path of paths) {
      try {
        const file = await window.ysmNative.readFile(path);
        projects.push(await importBytes(file.data, file.name, 'encrypted'));
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { projects, errors };
  }
  return { projects: [], errors: ['浏览器模式请使用“导入 .ysm”输入框。'] };
}

let demoProjectPromise: Promise<ParsedProject> | null = null;

export async function loadDemoProject(): Promise<ParsedProject> {
  if (!demoProjectPromise) {
    demoProjectPromise = (async () => {
      const base = import.meta.env.BASE_URL || './';
      const manifestUrl = new URL(`${base}samples/default/manifest.json`, window.location.href).href;
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error('示例模型资源缺失。');
      const manifest = (await response.json()) as DemoManifest;
      const files = await Promise.all(
        manifest.files.map(async (path) => {
          const url = new URL(`${base}samples/default/${path}`, window.location.href).href;
          const fileResponse = await fetch(url);
          if (!fileResponse.ok) throw new Error(`示例资源缺失：${path}`);
          return {
            path,
            data: new Uint8Array(await fileResponse.arrayBuffer()),
          };
        }),
      );
      return buildProject(files, {
        name: manifest.name,
        sourceName: '内置示例 · Default',
        kind: 'demo',
        format: 'Bedrock · 未加密示例',
      });
    })().catch((error) => {
      demoProjectPromise = null;
      throw error;
    });
  }
  return demoProjectPromise;
}
