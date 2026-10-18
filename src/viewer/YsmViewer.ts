import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  AnimationClip,
  BedrockBone,
  BedrockCube,
  BedrockGeometry,
  BoneVisibilityState,
  MolangState,
  ParsedProject,
  TextureAsset,
  Vec3,
  ViewerStats,
} from '@/types';
import {
  getClipLength,
  getSoundEvents,
  isLooping,
  makeMolangVariables,
  sampleClip,
  type BoneSample,
  type SoundEvent,
} from './animation';

const DEG = Math.PI / 180;
const FACE_NAMES = ['east', 'west', 'up', 'down', 'south', 'north'] as const;

const DEFAULT_MOLANG_STATE: MolangState = {
  groundSpeed: 0,
  verticalSpeed: 0,
  health: 20,
  maxHealth: 20,
  isSneaking: false,
  isSprinting: false,
  isRiding: false,
  isInWater: false,
  isOnGround: true,
  isFlying: false,
  hasHelmet: false,
  hasChestplate: false,
  hasLeggings: false,
  hasBoots: false,
  hasMainhand: false,
  hasOffhand: false,
  headYaw: 0,
  headPitch: 0,
  lifeTime: 0,
};

interface BoneNode {
  def: BedrockBone;
  group: THREE.Group;
  bindPosition: THREE.Vector3;
  bindRotation: THREE.Euler;
  parentPivot: Vec3;
}

interface ClipRuntime {
  name: string;
  clip: AnimationClip;
  time: number;
  length: number;
  loop: boolean;
  finished: boolean;
  events: SoundEvent[];
  previousTime: number;
}

export interface ViewerCallbacks {
  onStats?: (stats: ViewerStats) => void;
  onSound?: (effect: string) => void;
  onError?: (message: string) => void;
}

export interface ViewerOptions {
  showGrid: boolean;
  autoRotate: boolean;
  pixelFilter: 'nearest' | 'linear';
  headFollow: boolean;
  wireframe?: boolean;
}

export class YsmViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: ViewerCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly modelRoot = new THREE.Group();
  private grid: THREE.GridHelper;
  private readonly shadowPlane: THREE.Mesh;
  private readonly resizeObserver: ResizeObserver;
  private readonly clock = new THREE.Clock();
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();

  private project: ParsedProject | null = null;
  private bones = new Map<string, BoneNode>();
  private boneParent = new Map<string, string | undefined>();
  private boneMeshes = new Map<string, THREE.Mesh[]>();
  private visibilityOverrides = new Map<string, boolean>();
  private meshes: THREE.Mesh[] = [];
  private materials: THREE.MeshStandardMaterial[] = [];
  private textures: THREE.Texture[] = [];
  private baseTexture: THREE.Texture | null = null;
  private emissiveTexture: THREE.Texture | null = null;
  private headNodes: THREE.Object3D[] = [];

  private baseClip: ClipRuntime | null = null;
  private extraClip: ClipRuntime | null = null;
  private preLayerClips: ClipRuntime[] = [];
  private parallelLayerClips: ClipRuntime[] = [];
  private runtimeMode = false;
  private molangState: MolangState = { ...DEFAULT_MOLANG_STATE };
  private configValues: Record<string, number> = {};
  private options: ViewerOptions = {
    showGrid: true,
    autoRotate: false,
    pixelFilter: 'nearest',
    headFollow: true,
  };
  private paused = false;
  private speed = 1;
  private frameLimit = 0;
  private lastFrameAt = 0;
  private previewMode = false;
  private suspended = false;
  private disposed = false;
  private lastStatsAt = 0;
  private frames = 0;
  private fps = 0;
  private animationFrame = 0;
  private textureRequest = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: ViewerCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    this.camera.position.set(2.8, 1.7, 4.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI * 0.93;
    this.controls.target.set(0, 1, 0);

    this.root.scale.setScalar(1 / 16);
    this.root.add(this.modelRoot);
    this.scene.add(this.root);

    this.scene.add(new THREE.HemisphereLight(0xeee6db, 0x1c1713, 1.65));

    const keyLight = new THREE.DirectionalLight(0xfff3df, 2.7);
    keyLight.position.set(3.5, 6.5, 4.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -2;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb49b83, 0.85);
    fillLight.position.set(-5, 2.5, -2);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe6d8c7, 1.2);
    rimLight.position.set(0, 2.5, -6);
    this.scene.add(rimLight);

    this.grid = new THREE.GridHelper(8, 32, 0xb28e9a, 0xd9c1c9);
    this.grid.position.y = 0.001;
    const gridMaterial = this.grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.34;
    this.scene.add(this.grid);

    this.shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        map: makeContactShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.26,
      }),
    );
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = 0.003;
    this.scene.add(this.shadowPlane);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.animate();
  }

  async load(project: ParsedProject, texture?: TextureAsset): Promise<void> {
    this.project = project;
    this.clearModel();
    this.buildSkeleton(project);
    const selected = texture ?? this.pickDefaultTexture(project);
    if (selected) await this.applyTexture(selected);
    this.setAllAnimationClips(project);
    this.root.updateMatrixWorld(true);
    this.frameCamera();
    this.grid.visible = this.options.showGrid;
    this.shadowPlane.visible = this.options.showGrid;
  }

  private pickDefaultTexture(project: ParsedProject): TextureAsset | undefined {
    const preferred = project.properties.default_texture;
    if (preferred) {
      const hit = project.textures.find(
        (texture) =>
          texture.path.toLowerCase().includes(String(preferred).toLowerCase()) ||
          texture.label.toLowerCase() === String(preferred).toLowerCase(),
      );
      if (hit) return hit;
    }
    return project.textures[0];
  }

  private buildSkeleton(project: ParsedProject) {
    const geometry = project.model;
    // YSM/OpenYSM converts Blockbench X to a mirrored model space:
    //   bone pivot x -> -x, bone rotation -> (-x, -y, +z)
    // V3 raw meshes are already exported in that space by YSMParser.
    const mirrorX = !geometry.raw_mesh_format;
    this.visibilityOverrides.clear();
    const parentMap = new Map<string, string | undefined>();
    this.boneParent = parentMap;
    const defs = new Map<string, BedrockBone>();

    const convertPivot = (value: Vec3 | undefined): Vec3 => {
      const pivot = value ?? [0, 0, 0];
      return mirrorX ? [-pivot[0], pivot[1], pivot[2]] : [pivot[0], pivot[1], pivot[2]];
    };

    for (const bone of geometry.bones ?? []) {
      defs.set(bone.name, bone);
      parentMap.set(bone.name, bone.parent);
      const group = new THREE.Group();
      group.name = bone.name;
      const pivot = convertPivot(bone.pivot);
      const parent = bone.parent ? defs.get(bone.parent) : undefined;
      const parentPivot = convertPivot(parent?.pivot);
      group.position.set(
        pivot[0] - parentPivot[0],
        pivot[1] - parentPivot[1],
        pivot[2] - parentPivot[2],
      );
      const rotation = bone.rotation ?? [0, 0, 0];
      const euler = new THREE.Euler(
        (mirrorX ? -rotation[0] : rotation[0]) * DEG,
        (mirrorX ? -rotation[1] : rotation[1]) * DEG,
        rotation[2] * DEG,
        'ZYX',
      );
      group.quaternion.setFromEuler(euler);
      this.bones.set(bone.name, {
        def: bone,
        group,
        bindPosition: group.position.clone(),
        bindRotation: euler.clone(),
        parentPivot,
      });
      if (/^head$/i.test(bone.name) || (/head/i.test(bone.name) && !/allhead/i.test(bone.name))) {
        this.headNodes.push(group);
      }
    }

    // Attach after all groups exist, so parents may appear later in the file.
    for (const [name, node] of this.bones) {
      const parentName = parentMap.get(name);
      const parent = parentName ? this.bones.get(parentName) : undefined;
      if (parent) parent.group.add(node.group);
      else this.modelRoot.add(node.group);
    }

    const textureWidth = geometry.description?.texture_width ?? 64;
    const textureHeight = geometry.description?.texture_height ?? 64;
    const geometriesByBone = new Map<string, THREE.BufferGeometry>();

    for (const node of this.bones.values()) {
      const geometries: THREE.BufferGeometry[] = [];
      const rawBonePivot = node.def.pivot ?? [0, 0, 0];
      const bonePivot: Vec3 = mirrorX
        ? [-rawBonePivot[0], rawBonePivot[1], rawBonePivot[2]]
        : rawBonePivot;
      if (node.def.raw_meshes?.length) {
        const geo = buildRawGeometry(node.def, bonePivot);
        if (geo) geometries.push(geo);
      }
      for (const cube of node.def.cubes ?? []) {
        const geo = buildCubeGeometry(cube, bonePivot, textureWidth, textureHeight, mirrorX);
        if (geo) geometries.push(geo);
      }
      if (geometries.length === 0) continue;
      const merged =
        geometries.length === 1
          ? geometries[0]
          : mergeGeometries(geometries, false) ?? geometries[0];
      if (geometries.length > 1) geometries.forEach((geometry) => geometry.dispose());
      merged.computeBoundingSphere();
      geometriesByBone.set(node.def.name, merged);
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.76,
      metalness: 0.02,
      transparent: true,
      alphaTest: 0.04,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.materials.push(material);
    this.boneMeshes = new Map();

    for (const [boneName, geometryData] of geometriesByBone) {
      const node = this.bones.get(boneName);
      if (!node) continue;
      const mesh = new THREE.Mesh(geometryData, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      node.group.add(mesh);
      this.meshes.push(mesh);
      const list = this.boneMeshes.get(boneName) ?? [];
      list.push(mesh);
      this.boneMeshes.set(boneName, list);
    }

    if (this.meshes.length === 0) {
      this.callbacks.onError?.('模型中没有可渲染的几何体。');
    }
  }

  private async applyTexture(texture: TextureAsset) {
    const request = ++this.textureRequest;
    try {
      const loader = new THREE.TextureLoader();
      const [base, emissive] = await Promise.all([
        loader.loadAsync(texture.url),
        texture.emissiveUrl ? loader.loadAsync(texture.emissiveUrl) : Promise.resolve(null),
      ]);
      if (request !== this.textureRequest || this.disposed) {
        base.dispose();
        emissive?.dispose();
        return;
      }
      this.configureTexture(base);
      if (emissive) this.configureTexture(emissive);
      this.baseTexture?.dispose();
      this.emissiveTexture?.dispose();
      this.baseTexture = base;
      this.emissiveTexture = emissive;
      for (const material of this.materials) {
        material.map = base;
        material.emissiveMap = emissive;
        material.emissive = new THREE.Color(emissive ? 0xffffff : 0x000000);
        material.emissiveIntensity = emissive ? 1.15 : 0;
        material.needsUpdate = true;
      }
    } catch (error) {
      this.callbacks.onError?.(`贴图加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private configureTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    const filter = this.options.pixelFilter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    texture.magFilter = filter;
    texture.minFilter = filter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  }

  async setTexture(texture: TextureAsset) {
    await this.applyTexture(texture);
  }

  unload() {
    this.clearModel();
    this.project = null;
  }

  setPixelFilter(mode: 'nearest' | 'linear') {
    this.options.pixelFilter = mode;
    if (this.baseTexture) this.configureTexture(this.baseTexture);
    if (this.emissiveTexture) this.configureTexture(this.emissiveTexture);
    if (this.baseTexture) this.baseTexture.needsUpdate = true;
  }

  private setAllAnimationClips(project: ParsedProject) {
    const names = Object.keys(project.animations);
    const idle =
      names.find((name) => /^idle$/i.test(name)) ??
      names[0];
    if (idle) this.setBaseClip(idle);
    else {
      this.baseClip = null;
      this.extraClip = null;
    }

    const numericOrder = (a: string, b: string) =>
      Number(a.match(/\d+$/)?.[0] ?? 0) - Number(b.match(/\d+$/)?.[0] ?? 0);
    const makeLayer = (name: string) => {
      const runtime = this.makeRuntime(name, project.animations[name], true);
      // Static scale-only layers often have no animation_length.
      if (runtime.length <= 0) runtime.length = 1;
      return runtime;
    };

    this.preLayerClips = names
      .filter((name) => /^pre_parallel\d+$/i.test(name))
      .filter((name) => Object.keys(project.animations[name]?.bones ?? {}).length > 0)
      .sort(numericOrder)
      .map(makeLayer);
    this.parallelLayerClips = names
      .filter((name) => /^parallel\d+$/i.test(name))
      .filter((name) => !/fp\.arm/i.test(project.animationSources[name] ?? ''))
      .filter((name) => Object.keys(project.animations[name]?.bones ?? {}).length > 0)
      .sort(numericOrder)
      .map(makeLayer);
  }

  setBaseClip(name: string) {
    if (!this.project?.animations[name]) return;
    const clip = this.project.animations[name];
    this.baseClip = this.makeRuntime(name, clip, true);
  }

  playExtra(name: string | null) {
    if (!name) {
      this.extraClip = null;
      return;
    }
    const clip = this.project?.animations[name];
    if (!clip) return;
    this.extraClip = this.makeRuntime(name, clip, isLooping(clip));
  }

  private makeRuntime(name: string, clip: AnimationClip, loop: boolean): ClipRuntime {
    return {
      name,
      clip,
      time: 0,
      length: getClipLength(clip),
      loop,
      finished: false,
      events: getSoundEvents(clip),
      previousTime: 0,
    };
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.05, speed);
  }

  setFrameLimit(fps: number) {
    this.frameLimit = Math.max(0, fps);
    this.lastFrameAt = 0;
  }

  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (!suspended) this.lastFrameAt = 0;
  }

  setPreviewMode(enabled: boolean) {
    this.previewMode = enabled;
    this.options.showGrid = !enabled;
    this.options.headFollow = false;
    this.grid.visible = !enabled;
    this.shadowPlane.visible = !enabled;
    this.renderer.shadowMap.enabled = !enabled;
    this.controls.enabled = !enabled;
    this.setFrameLimit(enabled ? 15 : 0);
    if (enabled) {
      this.setRuntimeMode(true);
      for (const mesh of this.meshes) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    }
  }

  playPreview(name?: string) {
    if (!this.project) return;
    const animations = this.project.animations;
    const preferred = name && animations[name] ? name : undefined;
    const idle = Object.keys(animations).find((clip) => /^idle$/i.test(clip));
    const clipName = preferred ?? idle ?? Object.keys(animations)[0];
    if (!clipName) return;
    this.baseClip = this.makeRuntime(clipName, animations[clipName], true);
    this.extraClip = null;
    this.paused = false;
    this.applyCurrentPose();
  }

  setMolangState(state: Partial<MolangState>) {
    this.molangState = { ...this.molangState, ...state };
  }

  setConfigValues(values: Record<string, number>) {
    this.configValues = { ...values };
  }

  setRuntimeMode(enabled: boolean) {
    if (this.runtimeMode === enabled) return;
    this.runtimeMode = enabled;
    if (enabled) {
      for (const layer of [...this.preLayerClips, ...this.parallelLayerClips]) {
        layer.time = 0;
        layer.previousTime = 0;
      }
    }
    this.applyCurrentPose();
  }

  setShowGrid(show: boolean) {
    this.options.showGrid = show;
    this.grid.visible = show;
    this.shadowPlane.visible = show;
  }

  setTheme(theme: 'light' | 'dark') {
    const dark = theme === 'dark';
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.grid = new THREE.GridHelper(
      8,
      32,
      dark ? 0x7a6c5b : 0xb28e9a,
      dark ? 0x322b24 : 0xd9c1c9,
    );
    this.grid.position.y = 0.001;
    const material = this.grid.material as THREE.Material;
    material.transparent = true;
    material.opacity = 0.34;
    this.grid.visible = this.options.showGrid;
    this.scene.add(this.grid);
    (this.shadowPlane.material as THREE.MeshBasicMaterial).opacity = dark ? 0.5 : 0.26;
  }

  setAutoRotate(autoRotate: boolean) {
    this.options.autoRotate = autoRotate;
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 0.9;
  }

  setHeadFollow(enabled: boolean) {
    this.options.headFollow = enabled;
    if (!enabled) {
      this.pointer.set(0, 0);
    }
  }

  setWireframe(enabled: boolean) {
    this.options.wireframe = enabled;
    for (const material of this.materials) {
      material.wireframe = enabled;
      material.needsUpdate = true;
    }
  }

  setBoneVisibility(name: string, state: BoneVisibilityState) {
    if (!this.bones.has(name)) return;
    if (state === 'inherit') this.visibilityOverrides.delete(name);
    else this.visibilityOverrides.set(name, state === 'visible');
    this.applyBoneVisibility();
  }

  /** @deprecated Use setBoneVisibility for explicit child overrides. */
  setBoneVisible(name: string, visible: boolean) {
    this.setBoneVisibility(name, visible ? 'visible' : 'hidden');
  }

  clearBoneVisibilityOverrides() {
    this.visibilityOverrides.clear();
    this.applyBoneVisibility();
  }

  private resolveBoneVisibility(name: string): boolean {
    const chain: string[] = [];
    const guard = new Set<string>();
    let current: string | undefined = name;
    while (current && !guard.has(current)) {
      chain.push(current);
      guard.add(current);
      current = this.boneParent.get(current);
    }
    let visible = true;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const override = this.visibilityOverrides.get(chain[index]);
      if (override !== undefined) visible = override;
    }
    return visible;
  }

  private applyBoneVisibility() {
    for (const [name, meshList] of this.boneMeshes) {
      const visible = this.resolveBoneVisibility(name);
      for (const mesh of meshList) mesh.visible = visible;
    }
  }

  getBoneNames(): string[] {
    return [...this.bones.keys()];
  }

  seek(seconds: number) {
    const runtime = this.currentRuntime();
    if (!runtime) return;
    runtime.time = Math.max(0, Math.min(seconds, runtime.length));
    runtime.previousTime = runtime.time;
    runtime.finished = false;
    this.applyCurrentPose();
    this.emitStats();
  }

  restartExtra() {
    if (!this.extraClip) return;
    this.extraClip.time = 0;
    this.extraClip.previousTime = 0;
    this.extraClip.finished = false;
  }

  /** Debug helper used by the visual smoke tests. */
  showBindPose() {
    this.paused = true;
    this.baseClip = null;
    this.extraClip = null;
    this.applyCurrentPose();
  }

  /** Debug helper: report the world-space bounding box of every bone. */
  debugBoneBounds(): Record<string, [number, number, number, number, number, number]> {
    this.modelRoot.updateMatrixWorld(true);
    const output: Record<string, [number, number, number, number, number, number]> = {};
    for (const [name, node] of this.bones) {
      const box = new THREE.Box3().setFromObject(node.group);
      output[name] = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
    }
    return output;
  }

  resetView() {
    this.frameCamera();
  }

  /** Debug helper used by visual tests; azimuth 0 looks from +Z. */
  setViewAngles(azimuthDegrees: number, polarDegrees = 78) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical(
      offset.length(),
      THREE.MathUtils.degToRad(polarDegrees),
      THREE.MathUtils.degToRad(azimuthDegrees),
    );
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.controls.update();
  }

  private currentRuntime(): ClipRuntime | null {
    return this.extraClip ?? this.baseClip;
  }

  private advance(runtime: ClipRuntime, delta: number) {
    if (runtime.finished && !runtime.loop) return;
    const previous = runtime.time;
    let next = runtime.time + delta;
    if (runtime.loop) {
      if (next >= runtime.length) {
        next %= runtime.length;
        this.fireSoundEvents(runtime, previous, runtime.length, true);
        this.fireSoundEvents(runtime, 0, next, false);
      } else {
        this.fireSoundEvents(runtime, previous, next, false);
      }
    } else {
      if (next >= runtime.length) {
        next = runtime.length;
        this.fireSoundEvents(runtime, previous, next, false);
        runtime.finished = true;
      } else {
        this.fireSoundEvents(runtime, previous, next, false);
      }
    }
    runtime.previousTime = previous;
    runtime.time = next;
  }

  private fireSoundEvents(runtime: ClipRuntime, from: number, to: number, includeStart: boolean) {
    for (const event of runtime.events) {
      const afterStart = includeStart ? event.time >= from : event.time > from;
      if (afterStart && event.time <= to) {
        this.callbacks.onSound?.(event.effect);
      }
    }
  }

  private applyCurrentPose() {
    for (const node of this.bones.values()) {
      node.group.position.copy(node.bindPosition);
      node.group.quaternion.setFromEuler(node.bindRotation);
      node.group.scale.set(1, 1, 1);
    }

    const merged: Record<string, BoneSample> = {};
    const apply = (runtime: ClipRuntime | null) => {
      if (!runtime) return;
      const variables = makeMolangVariables(
        this.molangState,
        runtime.time,
        this.configValues,
      );
      const sampled = sampleClip(runtime.clip, runtime.time, variables);
      for (const [boneName, sample] of Object.entries(sampled)) {
        const previous = merged[boneName] ?? {};
        merged[boneName] = {
          rotation: sample.rotation ?? previous.rotation,
          position: sample.position ?? previous.position,
          scale: sample.scale ?? previous.scale,
        };
      }
    };

    if (this.runtimeMode) {
      for (const layer of this.preLayerClips) apply(layer);
    }
    apply(this.baseClip);
    if (this.runtimeMode) {
      for (const layer of this.parallelLayerClips) apply(layer);
    }
    apply(this.extraClip);

    for (const [boneName, sample] of Object.entries(merged)) {
      const node = this.bones.get(boneName);
      if (!node) continue;
      const bind = node.bindRotation;
      const rotation = sample.rotation ?? [0, 0, 0];
      // OpenYSM converts every animation rotation from Blockbench degrees to
      // engine space: (-x, -y, +z). This applies to cube and raw-V3 rigs alike;
      // only the bind pose differs between the two paths.
      node.group.quaternion.setFromEuler(
        new THREE.Euler(
          bind.x - rotation[0] * DEG,
          bind.y - rotation[1] * DEG,
          bind.z + rotation[2] * DEG,
          'ZYX',
        ),
      );
      if (sample.position) {
        // OpenYSM's RenderUtils translates animated positions as (-x, y, z).
        node.group.position.set(
          node.bindPosition.x - sample.position[0],
          node.bindPosition.y + sample.position[1],
          node.bindPosition.z + sample.position[2],
        );
      }
      if (sample.scale) {
        node.group.scale.set(
          Math.max(0.001, sample.scale[0]),
          Math.max(0.001, sample.scale[1]),
          Math.max(0.001, sample.scale[2]),
        );
      }
    }

    if (this.options.headFollow && this.pointer.lengthSq() > 0.0001) {
      const yaw = -this.pointer.x * 26 * DEG;
      const pitch = -this.pointer.y * 18 * DEG;
      for (const head of this.headNodes) {
        head.rotateY(yaw);
        head.rotateX(pitch);
      }
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.options.headFollow) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    this.pointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  };

  private onPointerLeave = () => {
    this.pointer.set(0, 0);
  };

  private animate = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    if (this.suspended) return;
    const now = performance.now();
    if (this.frameLimit > 0 && now - this.lastFrameAt < 1000 / this.frameLimit) return;
    this.lastFrameAt = now;
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (!this.paused) {
      if (this.runtimeMode) {
        for (const layer of this.preLayerClips) this.advance(layer, delta * this.speed);
      }
      if (this.baseClip) this.advance(this.baseClip, delta * this.speed);
      if (this.runtimeMode) {
        for (const layer of this.parallelLayerClips) this.advance(layer, delta * this.speed);
      }
      if (this.extraClip) {
        this.advance(this.extraClip, delta * this.speed);
        if (this.extraClip.finished && !this.extraClip.loop) {
          // Keep hold_on_last_frame clips visible; normal one-shots yield to idle.
          if (!holdsLastFrame(this.extraClip.clip)) this.extraClip = null;
        }
      }
    }

    this.molangState.lifeTime += delta;
    this.applyCurrentPose();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.frames += 1;
    if (now - this.lastStatsAt > 350) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastStatsAt));
      this.frames = 0;
      this.lastStatsAt = now;
      this.emitStats();
    }
  };

  private emitStats() {
    const runtime = this.currentRuntime();
    this.callbacks.onStats?.({
      clipName: runtime?.name ?? '',
      time: runtime?.time ?? 0,
      duration: runtime?.length ?? 0,
      loop: runtime?.loop ?? false,
      fps: this.fps,
      triangles: this.renderer.info.render.triangles,
    });
  }

  private frameCamera() {
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = this.camera.fov * DEG;
    const distance = (sphere.radius / Math.sin(fov / 2)) * 1.12;
    this.controls.target.copy(sphere.center);
    const direction = new THREE.Vector3(0.62, 0.22, -1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = Math.max(30, distance * 12);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.shadowPlane.position.x = sphere.center.x;
    this.shadowPlane.position.z = sphere.center.z;
  }

  private resize() {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || this.canvas.clientWidth || 1;
    const height = parent?.clientHeight || this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private clearModel() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.parent?.remove(mesh);
    }
    this.meshes = [];
    for (const material of this.materials) material.dispose();
    this.materials = [];
    for (const texture of this.textures) texture.dispose();
    this.textures = [];
    this.baseTexture?.dispose();
    this.emissiveTexture?.dispose();
    this.baseTexture = null;
    this.emissiveTexture = null;
    this.modelRoot.clear();
    this.bones.clear();
    this.boneParent.clear();
    this.boneMeshes.clear();
    this.visibilityOverrides.clear();
    this.headNodes = [];
    this.baseClip = null;
    this.extraClip = null;
    this.preLayerClips = [];
    this.parallelLayerClips = [];
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.dispose();
    this.clearModel();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.shadowPlane.geometry.dispose();
    (this.shadowPlane.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.shadowPlane.material as THREE.Material).dispose();
  }
}

function holdsLastFrame(clip: AnimationClip) {
  return clip.loop === 'hold_on_last_frame';
}

function uvRectForFace(cube: BedrockCube, face: (typeof FACE_NAMES)[number]): [number, number, number, number] {
  const uv = cube.uv;
  const size = cube.size.map((value) => Math.abs(value)) as Vec3;
  const width = size[0];
  const height = size[1];
  const depth = size[2];

  if (Array.isArray(uv)) {
    const [u, v] = uv;
    const rects: Record<(typeof FACE_NAMES)[number], [number, number, number, number]> = {
      east: [u, v + depth, depth, height],
      north: [u + depth, v + depth, width, height],
      south: [u + depth + width, v + depth, width, height],
      west: [u + depth + width + depth, v + depth, depth, height],
      up: [u + depth, v, width, depth],
      down: [u + depth + width, v, width, depth],
    };
    return rects[face];
  }

  if (uv && typeof uv === 'object') {
    const entry = uv[face] ?? uv[face.toUpperCase()];
    if (entry) return [entry.uv[0], entry.uv[1], entry.uv_size[0], entry.uv_size[1]];
  }

  return [0, 0, 0, 0];
}

function buildCubeGeometry(
  cube: BedrockCube,
  bonePivot: Vec3,
  textureWidth: number,
  textureHeight: number,
  mirrorX: boolean,
): THREE.BufferGeometry | null {
  const size = cube.size.map((value) => Math.abs(value)) as Vec3;
  const inflate = (cube.inflate ?? 0) * 2;
  if (size[0] < 1e-5 && size[1] < 1e-5 && size[2] < 1e-5) return null;

  const geometry = new THREE.BoxGeometry(
    Math.max(0.0001, size[0] + inflate),
    Math.max(0.0001, size[1] + inflate),
    Math.max(0.0001, size[2] + inflate),
  );

  const index = geometry.index;
  const uvAttribute = geometry.getAttribute('uv') as THREE.BufferAttribute;
  if (index && uvAttribute) {
    for (const group of geometry.groups) {
      const face = FACE_NAMES[group.materialIndex ?? 0];
      if (!face) continue;
      const [u, v, width, height] = uvRectForFace(cube, face);
      if (width === 0 && height === 0) continue;
      const unique = new Set<number>();
      for (let i = 0; i < group.count; i += 1) {
        unique.add(index.getX(group.start + i));
      }
      for (const vertexIndex of unique) {
        const originalU = uvAttribute.getX(vertexIndex);
        const originalV = uvAttribute.getY(vertexIndex);
        // YSM mirrors X for V1/V2 cube assets. OpenYSM compensates by
        // reversing the U axis on every face, so do the same here.
        const faceU = mirrorX ? 1 - originalU : originalU;
        const uu = (u + faceU * width) / textureWidth;
        const vv = (v + (1 - originalV) * height) / textureHeight;
        uvAttribute.setXY(vertexIndex, uu, 1 - vv);
      }
    }
    uvAttribute.needsUpdate = true;
  }

  const center = new THREE.Vector3(
    (mirrorX ? -1 : 1) * (cube.origin[0] + cube.size[0] / 2),
    cube.origin[1] + cube.size[1] / 2,
    cube.origin[2] + cube.size[2] / 2,
  );
  const pivot = cube.pivot ?? [0, 0, 0];
  const pivotVector = new THREE.Vector3(
    (mirrorX ? -1 : 1) * pivot[0],
    pivot[1],
    pivot[2],
  );
  const bonePivotVector = new THREE.Vector3(bonePivot[0], bonePivot[1], bonePivot[2]);
  const rotation = cube.rotation ?? [0, 0, 0];

  // BoxGeometry is centered on the origin. Move it to the cube pivot offset,
  // rotate around that pivot, then place it in bone-local space.
  geometry.translate(
    center.x - pivotVector.x,
    center.y - pivotVector.y,
    center.z - pivotVector.z,
  );
  if (rotation.some((value) => Math.abs(value) > 1e-6)) {
    const matrix = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        (mirrorX ? -rotation[0] : rotation[0]) * DEG,
        (mirrorX ? -rotation[1] : rotation[1]) * DEG,
        rotation[2] * DEG,
        'ZYX',
      ),
    );
    geometry.applyMatrix4(matrix);
  }
  geometry.translate(
    pivotVector.x - bonePivotVector.x,
    pivotVector.y - bonePivotVector.y,
    pivotVector.z - bonePivotVector.z,
  );
  return geometry;
}

function buildRawGeometry(bone: BedrockBone, bonePivot: Vec3): THREE.BufferGeometry | null {
  const geometries: THREE.BufferGeometry[] = [];
  for (const raw of bone.raw_meshes ?? []) {
    if (!raw.positions?.length || !raw.indices?.length) continue;
    const positions = new Float32Array(raw.positions.length);
    for (let i = 0; i < raw.positions.length; i += 3) {
      positions[i] = raw.positions[i] - bonePivot[0];
      positions[i + 1] = raw.positions[i + 1] - bonePivot[1];
      positions[i + 2] = raw.positions[i + 2] - bonePivot[2];
    }
    const uvs = new Float32Array(raw.uvs.length);
    for (let i = 0; i < raw.uvs.length; i += 2) {
      uvs[i] = raw.uvs[i];
      uvs[i + 1] = 1 - raw.uvs[i + 1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(raw.normals ?? []), 3),
    );
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(raw.indices);
    if (!raw.normals?.length) geometry.computeVertexNormals();
    geometries.push(geometry);
  }
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0];
  const merged = mergeGeometries(geometries, false);
  if (merged) {
    geometries.forEach((geometry) => geometry.dispose());
    return merged;
  }
  return geometries[0];
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  gradient.addColorStop(0.42, 'rgba(0, 0, 0, 0.34)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
