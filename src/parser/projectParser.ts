import type {
  AnimationClip,
  BaseAction,
  BedrockGeometry,
  BedrockModelFile,
  ConfigAssignment,
  ConfigForm,
  ConfigGroup,
  ConfigOption,
  ExtraAction,
  ImportedFile,
  ParsedProject,
  SoundAsset,
  TextureAsset,
  YsmDefinition,
} from '@/types';
import {
  cleanMinecraftText,
  fileExt,
  fileStem,
  findFile,
  isVector,
  makeId,
  normalizePath,
  parseJson,
  uniqueBy,
} from '@/lib/utils';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']);
const AUDIO_EXT = new Set(['ogg', 'wav', 'mp3', 'flac']);
const LOCALES = ['zh_cn', 'zh_tw', 'en_us'];

export interface BuildProjectOptions {
  name?: string;
  kind?: 'encrypted' | 'folder' | 'demo';
  format?: string;
  sourceName?: string;
}

function flattenLanguage(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenLanguage(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else if (prefix) {
    out[prefix] = value == null ? '' : String(value);
  }
  return out;
}

function pickLanguage(files: Map<string, Uint8Array>): { lang: Record<string, string>; locale: string } {
  const candidates = [...files.keys()].filter((path) => /^lang\/[^/]+\.json$/i.test(path));
  const ordered = [
    ...LOCALES.map((locale) => candidates.find((path) => path.toLowerCase().endsWith(`/${locale}.json`))),
    ...candidates,
  ].filter((path): path is string => Boolean(path));

  const lang: Record<string, string> = {};
  let locale = 'zh_cn';
  const seen = new Set<string>();
  for (const path of uniqueBy(ordered, (item) => item.toLowerCase())) {
    if (seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    try {
      const parsed = parseJson<Record<string, unknown>>(findFile(files, path)!, path);
      const flat = flattenLanguage(parsed);
      if (Object.keys(lang).length === 0) {
        locale = fileStem(path);
      }
      // Later files fill only missing keys, so zh_cn wins over en_us.
      for (const [key, value] of Object.entries(flat)) {
        if (!(key in lang)) lang[key] = value;
      }
    } catch {
      // A broken localisation file should not prevent the model from loading.
    }
  }
  return { lang, locale };
}

function resolveModelPath(definition: YsmDefinition, files: Map<string, Uint8Array>): string | null {
  const player = definition.files?.player;
  if (typeof player?.model === 'string') return normalizePath(player.model);
  if (player?.model && typeof player.model === 'object') {
    const preferred = player.model.main ?? player.model.Main ?? Object.values(player.model)[0];
    if (preferred) return normalizePath(String(preferred));
  }
  const modelFiles = [...files.keys()].filter((path) => /\.json$/i.test(path));
  return (
    modelFiles.find((path) => /(^|\/)models\/main\.json$/i.test(path)) ??
    modelFiles.find((path) => /(^|\/)main\.json$/i.test(path)) ??
    modelFiles.find((path) => /^models\//i.test(path)) ??
    modelFiles.find((path) => /model/i.test(path)) ??
    modelFiles[0] ??
    null
  );
}

function resolveAnimationPaths(definition: YsmDefinition, files: Map<string, Uint8Array>): string[] {
  const paths: string[] = [];
  const animation = definition.files?.player?.animation;
  if (typeof animation === 'string') paths.push(animation);
  else if (animation && typeof animation === 'object') {
    for (const value of Object.values(animation)) {
      if (typeof value === 'string') paths.push(value);
    }
  }
  for (const path of files.keys()) {
    if (/\.animation\.json$/i.test(path) || /^animations\/.*\.json$/i.test(path)) {
      paths.push(path);
    }
  }
  return uniqueBy(paths.map(normalizePath), (path) => path.toLowerCase()).filter((path) =>
    Boolean(findFile(files, path)),
  );
}

function resolveTexturePaths(definition: YsmDefinition, files: Map<string, Uint8Array>): string[] {
  const player = definition.files?.player;
  const listed: string[] = [];
  const texture = player?.texture;
  if (typeof texture === 'string') listed.push(texture);
  if (Array.isArray(texture)) {
    for (const item of texture) {
      if (typeof item === 'string') listed.push(item);
      else if (item && typeof item === 'object' && 'uv' in item && typeof item.uv === 'string') {
        listed.push(item.uv);
      }
    }
  }
  if (listed.length > 0) return listed.map(normalizePath);

  const textureFolder = [...files.keys()].filter(
    (path) => /^textures\//i.test(path) && IMAGE_EXT.has(fileExt(path)),
  );
  const source = textureFolder.length > 0
    ? textureFolder
    : [...files.keys()].filter(
        (path) =>
          IMAGE_EXT.has(fileExt(path)) &&
          !/^avatar\//i.test(path) &&
          !/_e\.[^.]+$/i.test(path),
      );
  return source.filter((path) => !/_e\.[^.]+$/i.test(path)).sort();
}

function makeEmissivePath(path: string, files: Map<string, Uint8Array>): string | undefined {
  const ext = fileExt(path);
  const base = path.slice(0, -(ext.length + 1));
  const candidates = [`${base}_e.${ext}`, `${base}_e.PNG`, `${base}_e.png`];
  return candidates.find((candidate) => Boolean(findFile(files, candidate)));
}

function blobUrl(data: Uint8Array, mime: string): string {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return URL.createObjectURL(new Blob([buffer], { type: mime }));
}

function mimeForImage(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

function mimeForAudio(ext: string): string {
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/ogg';
  }
}

function buildTextures(
  definition: YsmDefinition,
  files: Map<string, Uint8Array>,
  lang: Record<string, string>,
): TextureAsset[] {
  const paths = resolveTexturePaths(definition, files).filter((path) =>
    Boolean(findFile(files, path)),
  );
  return paths.map((path) => {
    const data = findFile(files, path)!;
    const ext = fileExt(path);
    const stem = fileStem(path);
    const emissivePath = makeEmissivePath(path, files);
    const emissiveData = emissivePath ? findFile(files, emissivePath) : undefined;
    return {
      path,
      label:
        cleanMinecraftText(
          lang[`files.player.texture.${stem}`] ??
            lang[`files.player.texture.${stem.toLowerCase()}`] ??
            stem.replaceAll('_', ' '),
        ),
      url: blobUrl(data, mimeForImage(ext)),
      emissiveUrl: emissiveData ? blobUrl(emissiveData, mimeForImage(ext)) : undefined,
    };
  });
}

function buildSounds(
  definition: YsmDefinition,
  files: Map<string, Uint8Array>,
  lang: Record<string, string>,
): SoundAsset[] {
  const soundRoot = normalizePath(
    typeof definition.files?.sound_path === 'string' ? definition.files.sound_path : 'sounds',
  );
  const paths = [...files.keys()].filter((path) => {
    if (!AUDIO_EXT.has(fileExt(path))) return false;
    return path.startsWith(soundRoot) || soundRoot === 'sounds' || path.startsWith('sounds/');
  });
  const allAudio = [...files.keys()].filter((path) => AUDIO_EXT.has(fileExt(path)));
  return (paths.length > 0 ? paths : allAudio)
    .map((path) => {
      const data = findFile(files, path)!;
      const key = fileStem(path);
      return {
        path,
        key,
        label: cleanMinecraftText(
          lang[`sounds.${key}`] ??
            lang[`sounds.${key.toLowerCase()}`] ??
            lang[`sound.${key}`] ??
            key.replaceAll('_', ' '),
        ),
        url: blobUrl(data, mimeForAudio(fileExt(path))),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

function findClip(
  animations: Record<string, AnimationClip>,
  candidates: string[],
): string | undefined {
  const lower = new Map(Object.keys(animations).map((name) => [name.toLowerCase(), name]));
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (animations[candidate]) return candidate;
    const exact = lower.get(candidate.toLowerCase());
    if (exact) return exact;
  }
  return undefined;
}

function parseConfigAssignments(expression: string): ConfigAssignment[] {
  const assignments: ConfigAssignment[] = [];
  const pattern = /([A-Za-z_][\w.]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;?/g;
  for (const match of expression.matchAll(pattern)) {
    assignments.push({ variable: match[1], value: Number(match[2]) });
  }
  return assignments;
}

function numberField(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildConfigGroups(
  definition: YsmDefinition,
  lang: Record<string, string>,
): { groups: ConfigGroup[]; defaults: Record<string, number> } {
  const groups: ConfigGroup[] = [];
  const defaults: Record<string, number> = {};
  const buttons = definition.properties?.extra_animation_buttons ?? [];

  for (const rawButton of buttons) {
    const button = rawButton as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      config_forms?: Array<Record<string, unknown>>;
    };
    const id = String(button.id ?? '');
    if (!id) continue;
    const name =
      lang[`properties.extra_animation_buttons.${id}.name`] ??
      (typeof button.name === 'string' ? button.name : id);
    const displayName = /^\s*\d+\s*$/.test(name) || !name.trim() ? '模型设置' : name;
    const description =
      lang[`properties.extra_animation_buttons.${id}.description`] ??
      (typeof button.description === 'string' ? button.description : '');
    const forms: ConfigForm[] = [];

    (button.config_forms ?? []).forEach((rawForm, formIndex) => {
      const type = String(rawForm.type ?? '');
      if (type !== 'checkbox' && type !== 'radio' && type !== 'range') return;
      const variable = String(rawForm.value ?? '');
      if (!variable) return;

      const prefix = `properties.extra_animation_buttons.${id}.config_forms.${formIndex}`;
      const title =
        lang[`${prefix}.title`] ??
        (typeof rawForm.title === 'string' ? rawForm.title : variable);
      const formDescription =
        lang[`${prefix}.description`] ??
        (typeof rawForm.description === 'string' ? rawForm.description : '');
      const min = numberField(rawForm.min, 0);
      const max = numberField(rawForm.max, 1);
      const step = numberField(rawForm.step, type === 'range' ? 1 : 0.01);
      const options: ConfigOption[] = [];

      if (type === 'radio' && rawForm.labels && typeof rawForm.labels === 'object') {
        Object.entries(rawForm.labels as Record<string, unknown>).forEach(
          ([rawLabel, rawValue], optionIndex) => {
            const expression = String(rawValue ?? '');
            const assignments = parseConfigAssignments(expression);
            if (assignments.length === 0) {
              assignments.push({ variable, value: optionIndex });
            }
            options.push({
              label:
                lang[`${prefix}.labels.${optionIndex}`] ??
                cleanMinecraftText(rawLabel),
              assignments,
            });
          },
        );
      }

      let initial = 0;
      if (type === 'range') {
        const requested = numberField(rawForm.defaultValue ?? rawForm.default, Number.NaN);
        if (Number.isFinite(requested)) {
          initial = requested;
        } else if (0 >= min && 0 <= max) {
          initial = 0;
        } else if (1 >= min && 1 <= max) {
          initial = 1;
        } else {
          initial = min;
        }
        initial = Math.min(max, Math.max(min, initial));
      }

      defaults[variable] = initial;
      forms.push({
        index: formIndex,
        type,
        title: cleanMinecraftText(title),
        description: cleanMinecraftText(formDescription),
        variable,
        min,
        max,
        step,
        options,
      });
    });

    groups.push({
      id,
      name: cleanMinecraftText(displayName),
      description: cleanMinecraftText(description),
      forms,
    });
  }

  return { groups, defaults };
}

function buildExtras(
  definition: YsmDefinition,
  animations: Record<string, AnimationClip>,
  lang: Record<string, string>,
  configGroups: ConfigGroup[],
): ExtraAction[] {
  const extras: ExtraAction[] = [];
  const configIds = new Set(configGroups.map((group) => group.id));
  const props = definition.properties ?? {};
  const table = props.extra_animation ?? {};

  const add = (clip: string, label: string, group?: string) => {
    const resolved = findClip(animations, [
      clip,
      clip.replace(/^extra:/i, ''),
      `extra${clip}`,
      clip.toLowerCase(),
    ]);
    if (!resolved) return;
    if (extras.some((extra) => extra.clip === resolved)) return;
    extras.push({
      id: `${group ?? 'extra'}:${resolved}`,
      clip: resolved,
      label: cleanMinecraftText(label || resolved),
      group,
    });
  };

  for (const [key, rawLabel] of Object.entries(table)) {
    const label =
      lang[`properties.extra_animation.${key}`] ??
      lang[`properties.extra_animation.${key}.name`] ??
      (rawLabel && !rawLabel.startsWith('#') ? rawLabel : key);
    if (String(rawLabel).startsWith('#')) {
      const configId = String(rawLabel).slice(1);
      if (!configIds.has(configId)) continue;
      if (extras.some((extra) => extra.configId === configId)) continue;
      const configGroup = configGroups.find((group) => group.id === configId);
      extras.push({
        id: `config:${configId}`,
        clip: '',
        label: cleanMinecraftText(configGroup?.name ?? (label || configId)),
        group: '模型设置',
        kind: 'config',
        configId,
      });
      continue;
    }
    add(key, label);
  }

  for (const group of props.extra_animation_classify ?? []) {
    const groupName = group.id ?? 'Extra';
    for (const [clip, labelKey] of Object.entries(group.extra_animation ?? {})) {
      const label =
        lang[`properties.extra_animation.${labelKey}`] ??
        lang[`properties.extra_animation.${clip}`] ??
        labelKey ??
        clip;
      add(clip, label, groupName);
    }
  }

  // Controllers sometimes point at clips that are not in extra_animation.
  for (const name of Object.keys(animations)) {
    if (!/^extra\d*$/i.test(name) && !/^extra[:_]/i.test(name)) continue;
    if (extras.some((extra) => extra.clip === name)) continue;
    extras.push({
      id: `extra:${name}`,
      clip: name,
      label: cleanMinecraftText(
        lang[`properties.extra_animation.${name}`] ??
          lang[`properties.extra_animation.${name}.name`] ??
          name,
      ),
      debug: true,
    });
  }

  return extras;
}

function buildBaseActions(animations: Record<string, AnimationClip>): BaseAction[] {
  const candidates: Array<Omit<BaseAction, 'clip'>> = [
    { id: 'idle', label: '待机', icon: 'idle' },
    { id: 'walk', label: '行走', icon: 'walk' },
    { id: 'run', label: '奔跑', icon: 'run' },
    { id: 'sneak', label: '潜行', icon: 'sneak' },
    { id: 'swim', label: '游泳', icon: 'swim' },
    { id: 'fly', label: '飞行', icon: 'fly' },
    { id: 'ride', label: '骑乘', icon: 'ride' },
    { id: 'sleep', label: '睡眠', icon: 'sleep' },
  ];
  const aliases: Record<string, string[]> = {
    idle: ['idle', 'gui'],
    walk: ['walk'],
    run: ['run'],
    sneak: ['sneak', 'sneaking'],
    swim: ['swim', 'swim_stand'],
    fly: ['fly', 'fly_stand'],
    ride: ['ride', 'ride_pig'],
    sleep: ['sleep'],
  };
  const actions: BaseAction[] = [];
  for (const item of candidates) {
    const clip = findClip(animations, aliases[item.id]);
    if (clip) actions.push({ ...item, clip });
  }
  return actions;
}

function countGeometry(model: BedrockGeometry): { bones: number; cubes: number } {
  let bones = 0;
  let cubes = 0;
  for (const bone of model.bones ?? []) {
    bones += 1;
    cubes += bone.cubes?.length ?? 0;
    cubes += bone.raw_meshes?.length ?? 0;
  }
  return { bones, cubes };
}

function geometryFromFile(modelFile: BedrockModelFile): BedrockGeometry {
  const geometry = modelFile['minecraft:geometry'];
  if (Array.isArray(geometry) && geometry.length > 0) {
    return geometry[0];
  }
  // Some old exporters write a bare geometry object.
  const loose = modelFile as unknown as BedrockGeometry;
  if (Array.isArray(loose.bones)) return loose;
  throw new Error('模型文件缺少 minecraft:geometry[0].bones。');
}

function normalizeDefinition(value: unknown): YsmDefinition {
  if (value && typeof value === 'object') return value as YsmDefinition;
  return {};
}

export async function buildProject(
  inputFiles: ImportedFile[],
  options: BuildProjectOptions = {},
): Promise<ParsedProject> {
  const files = new Map<string, Uint8Array>();
  for (const file of inputFiles) {
    files.set(normalizePath(file.path), file.data);
  }
  if (files.size === 0) throw new Error('没有读取到任何模型文件。');

  const warnings: string[] = [];
  const ysmPath = [...files.keys()].find((path) => /(^|\/)ysm\.json$/i.test(path));
  let definition: YsmDefinition = {};
  if (ysmPath) {
    try {
      definition = normalizeDefinition(
        parseJson<unknown>(findFile(files, ysmPath)!, ysmPath),
      );
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    warnings.push('未找到 ysm.json，已按旧版目录结构推断模型与动画。');
  }

  const modelPath = resolveModelPath(definition, files);
  if (!modelPath) throw new Error('模型包中没有 models/*.json。');
  const modelFile = parseJson<BedrockModelFile>(findFile(files, modelPath)!, modelPath);
  const model = geometryFromFile(modelFile);

  const animations: Record<string, AnimationClip> = {};
  const animationSources: Record<string, string> = {};
  for (const animationPath of resolveAnimationPaths(definition, files)) {
    try {
      const parsed = parseJson<{ animations?: Record<string, AnimationClip> }>(
        findFile(files, animationPath)!,
        animationPath,
      );
      for (const [name, clip] of Object.entries(parsed.animations ?? {})) {
        const incoming = { ...(clip as AnimationClip), name };
        const existing = animations[name];
        // Helper animation files (notably arrow.animation.json) declare the
        // same parallel0..7 names but with no bones. They must not replace the
        // real config/visibility layer from main.animation.json.
        if (
          existing &&
          Object.keys(existing.bones ?? {}).length > 0 &&
          Object.keys(incoming.bones ?? {}).length === 0
        ) {
          continue;
        }
        animations[name] = incoming;
        animationSources[name] = animationPath;
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (Object.keys(animations).length === 0) warnings.push('模型包中没有可播放的动画。');

  const { lang, locale } = pickLanguage(files);
  const textures = buildTextures(definition, files, lang);
  if (textures.length === 0) warnings.push('未找到可用的 PNG/WebP/AVIF 贴图。');
  const sounds = buildSounds(definition, files, lang);
  const config = buildConfigGroups(definition, lang);
  const extras = buildExtras(definition, animations, lang, config.groups);
  const baseActions = buildBaseActions(animations);
  const { bones, cubes } = countGeometry(model);

  let avatarUrl: string | undefined;
  const avatarPath =
    definition.metadata?.authors?.find((author) => author.avatar)?.avatar ??
    [...files.keys()].find((path) => /^avatar\/avatar\.(png|jpe?g|webp|avif|gif)$/i.test(path)) ??
    [...files.keys()].find((path) => /^avatar\//i.test(path));
  if (avatarPath) {
    const data = findFile(files, avatarPath);
    if (data) avatarUrl = blobUrl(data, mimeForImage(fileExt(avatarPath)));
  }

  const rawName = cleanMinecraftText(
    lang['metadata.name'] ??
      definition.metadata?.name ??
      options.name ??
      (ysmPath ? fileStem(ysmPath) : 'Untitled model'),
  );
  const tips = cleanMinecraftText(
    lang['metadata.tips'] ??
      definition.metadata?.tips ??
      (cubes > 0 ? `${bones} 根骨骼 · ${cubes} 个几何体` : 'YSM model'),
  );
  const format =
    options.format ??
    (model.raw_mesh_format
      ? 'V3 · raw baked mesh'
      : modelFile.format_version
        ? `Bedrock ${modelFile.format_version}`
        : 'Bedrock geometry');

  const project: ParsedProject = {
    id: makeId('ysm'),
    name: rawName,
    tips,
    sourceName: options.sourceName ?? options.name ?? rawName,
    sourceKind: options.kind ?? 'folder',
    format,
    metadata: definition.metadata,
    properties: definition.properties ?? {},
    definition,
    modelPath,
    model,
    animations,
    animationSources,
    textures,
    sounds,
    configGroups: config.groups,
    configDefaults: config.defaults,
    lang,
    locale,
    avatarUrl,
    allFiles: inputFiles,
    warnings,
    bones,
    cubes,
  };

  // These are attached non-enumerably so the public type stays focused.
  Object.defineProperty(project, '__extras', { value: extras, enumerable: false });
  Object.defineProperty(project, '__baseActions', { value: baseActions, enumerable: false });
  return project;
}

export function getExtras(project: ParsedProject): ExtraAction[] {
  return ((project as ParsedProject & { __extras?: ExtraAction[] }).__extras ?? []).slice();
}

export function getBaseActionsFor(project: ParsedProject): BaseAction[] {
  return (
    (project as ParsedProject & { __baseActions?: BaseAction[] }).__baseActions ?? []
  ).slice();
}

export function detectYsmVersion(bytes: Uint8Array): string {
  if (bytes.length < 8) return 'Unknown';
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'YSGP V3';
  }
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'YSGP') return 'Unknown';
  const crypto = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  if (crypto === 1) return 'YSGP V1';
  if (crypto === 2) return 'YSGP V2';
  return `YSGP crypto ${crypto}`;
}
