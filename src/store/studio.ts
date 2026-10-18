import { create } from 'zustand';
import type { MolangState, ParsedProject, StudioMode, ViewerStats } from '@/types';

export type SidebarTab = 'actions' | 'extras' | 'sounds' | 'bones';
export type ThemeMode = 'light' | 'dark';

export const MIN_UI_SCALE = 0.8;
export const MAX_UI_SCALE = 1.4;

function initialTheme(): ThemeMode {
  try {
    return window.localStorage.getItem('ysm.theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = initialTheme();
}

function initialUiScale(): number {
  try {
    const raw = window.localStorage.getItem('ysm.uiScale');
    if (raw === null || raw.trim() === '') return 1;
    const value = Number(raw);
    if (Number.isFinite(value)) {
      return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value));
    }
  } catch {
    // Ignore unavailable storage (private mode / restricted profile).
  }
  return 1;
}

export interface ViewerSettings {
  showGrid: boolean;
  autoRotate: boolean;
  pixelFilter: 'nearest' | 'linear';
  headFollow: boolean;
  wireframe: boolean;
  showMolang: boolean;
}

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

interface StudioState {
  projects: ParsedProject[];
  activeProjectId: string | null;
  texturePath: string | null;
  baseAction: string | null;
  extraAction: string | null;
  extraNonce: number;
  paused: boolean;
  speed: number;
  stats: ViewerStats;
  settings: ViewerSettings;
  molang: MolangState;
  configValues: Record<string, number>;
  mode: StudioMode;
  theme: ThemeMode;
  uiScale: number;
  tab: SidebarTab;
  loading: boolean;
  loadingLabel: string;
  toasts: Toast[];
  volume: number;
  muted: boolean;

  addProjects: (projects: ParsedProject[]) => void;
  removeProject: (id: string) => void;
  selectProject: (id: string) => void;
  setTexture: (path: string) => void;
  setBaseAction: (clip: string | null) => void;
  setExtraAction: (clip: string | null) => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  setStats: (stats: ViewerStats) => void;
  patchSettings: (settings: Partial<ViewerSettings>) => void;
  patchMolang: (state: Partial<MolangState>) => void;
  resetMolang: () => void;
  setMode: (mode: StudioMode) => void;
  setTheme: (theme: ThemeMode) => void;
  setUiScale: (scale: number) => void;
  patchConfigValues: (values: Record<string, number>) => void;
  setConfigValues: (values: Record<string, number>) => void;
  setTab: (tab: SidebarTab) => void;
  setLoading: (loading: boolean, label?: string) => void;
  notify: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

const initialStats: ViewerStats = {
  clipName: '',
  time: 0,
  duration: 0,
  loop: true,
  fps: 0,
  triangles: 0,
};

const initialMolang: MolangState = {
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

let toastId = 0;

export const useStudio = create<StudioState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  texturePath: null,
  baseAction: null,
  extraAction: null,
  extraNonce: 0,
  paused: false,
  speed: 1,
  stats: initialStats,
  settings: {
    showGrid: true,
    autoRotate: false,
    pixelFilter: 'nearest',
    headFollow: true,
    wireframe: false,
    showMolang: false,
  },
  molang: initialMolang,
  configValues: {},
  mode: 'studio',
  theme: initialTheme(),
  uiScale: initialUiScale(),
  tab: 'actions',
  loading: false,
  loadingLabel: '',
  toasts: [],
  volume: 0.8,
  muted: false,

  addProjects: (projects) =>
    set((state) => {
      const merged = [...state.projects];
      for (const project of projects) {
        const existing = merged.findIndex(
          (item) => item.sourceName === project.sourceName && item.name === project.name,
        );
        if (existing >= 0) merged[existing] = project;
        else merged.push(project);
      }
      const nextActive =
        state.activeProjectId && merged.some((item) => item.id === state.activeProjectId)
          ? state.activeProjectId
          : merged[0]?.id ?? null;
      const active = merged.find((item) => item.id === nextActive);
      return {
        projects: merged,
        activeProjectId: nextActive,
        texturePath: active?.textures[0]?.path ?? null,
        baseAction: null,
        extraAction: null,
        stats: initialStats,
        configValues:
          state.activeProjectId === active?.id
            ? state.configValues
            : { ...(active?.configDefaults ?? {}) },
      };
    }),

  removeProject: (id) =>
    set((state) => {
      const projects = state.projects.filter((item) => item.id !== id);
      const activeProjectId =
        state.activeProjectId === id ? projects[0]?.id ?? null : state.activeProjectId;
      const active = projects.find((item) => item.id === activeProjectId);
      return {
        projects,
        activeProjectId,
        configValues:
          state.activeProjectId === id ? { ...(active?.configDefaults ?? {}) } : state.configValues,
      };
    }),

  selectProject: (id) =>
    set((state) => {
      const project = state.projects.find((item) => item.id === id);
      return {
        activeProjectId: id,
        texturePath: project?.textures[0]?.path ?? null,
        baseAction: null,
        extraAction: null,
        paused: false,
        stats: initialStats,
        configValues: { ...(project?.configDefaults ?? {}) },
      };
    }),

  setTexture: (path) => set({ texturePath: path }),
  setBaseAction: (clip) => set({ baseAction: clip, extraAction: null }),
  setExtraAction: (clip) =>
    set((state) => ({ extraAction: clip, extraNonce: state.extraNonce + 1 })),
  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
  setStats: (stats) => set({ stats }),
  patchSettings: (settings) =>
    set((state) => ({ settings: { ...state.settings, ...settings } })),
  patchMolang: (molang) => set((state) => ({ molang: { ...state.molang, ...molang } })),
  resetMolang: () => set({ molang: { ...initialMolang } }),
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => set({ theme }),
  setUiScale: (scale) =>
    set({
      uiScale: Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(scale * 100) / 100)),
    }),
  patchConfigValues: (values) =>
    set((state) => ({ configValues: { ...state.configValues, ...values } })),
  setConfigValues: (values) => set({ configValues: { ...values } }),
  setTab: (tab) => set({ tab }),
  setLoading: (loading, label = '') => set({ loading, loadingLabel: label }),

  notify: (message, kind = 'info') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, kind }] }));
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setVolume: (volume) => set({ volume }),
  setMuted: (muted) => set({ muted }),
}));

export function useActiveProject(): ParsedProject | undefined {
  return useStudio((state) =>
    state.projects.find((project) => project.id === state.activeProjectId),
  );
}
