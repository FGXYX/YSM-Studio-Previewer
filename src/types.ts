export type Vec3 = [number, number, number];

export interface RawMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export interface BedrockCube {
  origin: Vec3;
  size: Vec3;
  pivot?: Vec3;
  rotation?: Vec3;
  inflate?: number;
  uv?:
    | [number, number]
    | Record<string, { uv: [number, number]; uv_size: [number, number] }>;
}

export interface BedrockBone {
  name: string;
  parent?: string;
  pivot?: Vec3;
  rotation?: Vec3;
  cubes?: BedrockCube[];
  raw_meshes?: RawMesh[];
  [key: string]: unknown;
}

export interface BedrockGeometry {
  description?: {
    identifier?: string;
    texture_width?: number;
    texture_height?: number;
    visible_bounds_width?: number;
    visible_bounds_height?: number;
    visible_bounds_offset?: Vec3;
  };
  bones: BedrockBone[];
  raw_mesh_format?: number;
  uv_space?: string;
}

export interface BedrockModelFile {
  format_version?: string;
  'minecraft:geometry'?: BedrockGeometry[];
}

export interface Author {
  name: string;
  role?: string;
  avatar?: string;
  comment?: string;
  contact?: Record<string, string>;
}

export interface YsmDefinition {
  spec?: number;
  metadata?: {
    name?: string;
    tips?: string;
    license?: { type?: string; [key: string]: unknown };
    authors?: Author[];
    link?: Record<string, string>;
  };
  properties?: {
    height_scale?: number;
    width_scale?: number;
    default_texture?: string;
    preview_animation?: string;
    extra_animation?: Record<string, string>;
    extra_animation_classify?: Array<{
      id?: string;
      extra_animation?: Record<string, string>;
    }>;
    extra_animation_buttons?: Array<Record<string, unknown>>;
    all_cutout?: boolean;
    disable_preview_rotation?: boolean;
    free?: boolean;
    [key: string]: unknown;
  };
  files?: {
    player?: {
      model?: Record<string, string> | string;
      animation?: Record<string, string> | string;
      animation_controllers?: Array<string | Record<string, string>>;
      texture?: Array<string | { uv: string }>;
    };
    sound_path?: string;
    [key: string]: unknown;
  };
}

export interface TextureAsset {
  path: string;
  label: string;
  url: string;
  emissiveUrl?: string;
}

export interface SoundAsset {
  path: string;
  key: string;
  label: string;
  url: string;
}

export interface ExtraAction {
  id: string;
  clip: string;
  label: string;
  group?: string;
  configOnly?: boolean;
  kind?: 'animation' | 'config';
  configId?: string;
  debug?: boolean;
}

export interface ConfigAssignment {
  variable: string;
  value: number;
}

export interface ConfigOption {
  label: string;
  assignments: ConfigAssignment[];
}

export interface ConfigForm {
  index: number;
  type: 'checkbox' | 'radio' | 'range';
  title: string;
  description: string;
  variable: string;
  min: number;
  max: number;
  step: number;
  options: ConfigOption[];
}

export interface ConfigGroup {
  id: string;
  name: string;
  description: string;
  forms: ConfigForm[];
}

export interface BaseAction {
  id: string;
  label: string;
  clip: string;
  icon: string;
}

export interface ParsedProject {
  id: string;
  name: string;
  tips: string;
  sourceName: string;
  sourceKind: 'encrypted' | 'folder' | 'demo';
  format: string;
  metadata: YsmDefinition['metadata'];
  properties: NonNullable<YsmDefinition['properties']>;
  definition: YsmDefinition;
  modelPath: string;
  model: BedrockGeometry;
  animations: Record<string, AnimationClip>;
  animationSources: Record<string, string>;
  textures: TextureAsset[];
  sounds: SoundAsset[];
  configGroups: ConfigGroup[];
  configDefaults: Record<string, number>;
  lang: Record<string, string>;
  locale: string;
  avatarUrl?: string;
  allFiles: Array<{ path: string; data: Uint8Array }>;
  warnings: string[];
  bones: number;
  cubes: number;
}

export interface AnimationClip {
  name: string;
  animation_length?: number;
  loop?: boolean | 'hold_on_last_frame' | 'once';
  bones?: Record<
    string,
    {
      rotation?: unknown;
      position?: unknown;
      scale?: unknown;
    }
  >;
  sound_effects?: Record<string, string | { effect: string }>;
  timeline?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ImportedFile {
  path: string;
  data: Uint8Array;
}

export interface MolangState {
  groundSpeed: number;
  verticalSpeed: number;
  health: number;
  maxHealth: number;
  isSneaking: boolean;
  isSprinting: boolean;
  isRiding: boolean;
  isInWater: boolean;
  isOnGround: boolean;
  isFlying: boolean;
  hasHelmet: boolean;
  hasChestplate: boolean;
  hasLeggings: boolean;
  hasBoots: boolean;
  hasMainhand: boolean;
  hasOffhand: boolean;
  headYaw: number;
  headPitch: number;
  lifeTime: number;
}

export type StudioMode = 'studio' | 'runtime';

export interface ViewerStats {
  clipName: string;
  time: number;
  duration: number;
  loop: boolean;
  fps: number;
  triangles: number;
}

export type BoneVisibilityState = 'inherit' | 'visible' | 'hidden';
