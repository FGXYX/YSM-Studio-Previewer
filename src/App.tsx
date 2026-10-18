import { useCallback, useEffect, useRef, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { LeftSidebar } from './components/LeftSidebar';
import { Stage } from './components/Stage';
import { RightSidebar } from './components/RightSidebar';
import { BottomBar } from './components/BottomBar';
import { Toasts } from './components/Toasts';
import { DragOverlay } from './components/DragOverlay';
import { YsmViewer } from './viewer/YsmViewer';
import { useActiveProject, useStudio } from './store/studio';
import { audioEngine } from './audio/AudioEngine';
import {
  importDropTransfer,
  importFileList,
  importFolderFiles,
  loadDemoProject,
  openDirectoryDialog,
} from './parser/importers';
import { getBaseActionsFor } from './parser/projectParser';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<YsmViewer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  const project = useActiveProject();
  const {
    addProjects,
    activeProjectId,
    texturePath,
    baseAction,
    extraAction,
    extraNonce,
    paused,
    speed,
    settings,
    molang,
    configValues,
    mode,
    setMode,
    theme,
    uiScale,
    setUiScale,
    volume,
    muted,
    setLoading,
    setPaused,
    setSpeed,
    setBaseAction,
    setTexture,
    setStats,
    notify,
  } = useStudio();

  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new YsmViewer(canvasRef.current, {
      onStats: (stats) => useStudio.getState().setStats(stats),
      onSound: (effect) => {
        const played = audioEngine.playEffect(effect);
        if (!played) console.debug('[sound] missing effect', effect);
      },
      onError: (message) => useStudio.getState().notify(message, 'error'),
    });
    viewerRef.current = viewer;
    if (import.meta.env.DEV) {
      (window as unknown as { __ysmViewer?: YsmViewer }).__ysmViewer = viewer;
    }
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      useStudio.getState().setLoading(true, '载入内置示例模型');
      try {
        const demo = await loadDemoProject();
        if (cancelled) return;
        useStudio.getState().addProjects([demo]);
      } catch (error) {
        if (!cancelled) {
          useStudio
            .getState()
            .notify(
              `内置示例载入失败：${error instanceof Error ? error.message : String(error)}`,
              'error',
            );
        }
      } finally {
        if (!cancelled) useStudio.getState().setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!project || !viewerRef.current) return;
    let cancelled = false;
    const viewer = viewerRef.current;
    (async () => {
      setLoading(true, `解析模型 · ${project.name}`);
      setStats({ clipName: '', time: 0, duration: 0, loop: true, fps: 0, triangles: 0 });
      audioEngine.setProject(project);
      try {
        const texture = project.textures.find((item) => item.path === texturePath) ?? project.textures[0];
        await viewer.load(project, texture);
        viewer.setConfigValues(useStudio.getState().configValues);
        viewer.setRuntimeMode(useStudio.getState().mode === 'runtime');
        if (cancelled) return;
        const baseActions = getBaseActionsFor(project);
        const initialBase =
          baseActions.find((action) => action.clip === baseAction)?.clip ??
          baseActions.find((action) => /^idle$/i.test(action.clip))?.clip ??
          baseActions[0]?.clip ??
          null;
        if (!project.textures.some((item) => item.path === texturePath)) {
          setTexture(project.textures[0]?.path ?? null);
        }
        setBaseAction(initialBase);
        setPaused(false);
        setSpeed(1);
        if (project.warnings.length > 0) {
          notify(project.warnings[0], 'info');
        }
      } catch (error) {
        if (!cancelled) {
          notify(
            `模型加载失败：${error instanceof Error ? error.message : String(error)}`,
            'error',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The viewer instance is stable; project identity changes are the reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __ysmProject?: typeof project }).__ysmProject = project;
    }
  }, [project]);

  useEffect(() => {
    if (!project) {
      viewerRef.current?.unload();
      setStats({ clipName: '', time: 0, duration: 0, loop: true, fps: 0, triangles: 0 });
    }
  }, [project, setStats]);

  useEffect(() => {
    if (!project || !texturePath || !viewerRef.current) return;
    const texture = project.textures.find((item) => item.path === texturePath);
    if (texture) void viewerRef.current.setTexture(texture);
  }, [project, texturePath]);

  useEffect(() => {
    if (!viewerRef.current) return;
    if (baseAction) viewerRef.current.setBaseClip(baseAction);
  }, [baseAction]);

  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.playExtra(extraAction);
  }, [extraAction, extraNonce]);

  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setShowGrid(settings.showGrid);
    viewer.setAutoRotate(settings.autoRotate);
    viewer.setHeadFollow(settings.headFollow);
    viewer.setWireframe(settings.wireframe);
    viewer.setPixelFilter(settings.pixelFilter);
  }, [settings]);

  useEffect(() => {
    viewerRef.current?.setMolangState(molang);
  }, [molang]);

  useEffect(() => {
    viewerRef.current?.setConfigValues(configValues);
  }, [configValues]);

  useEffect(() => {
    viewerRef.current?.setRuntimeMode(mode === 'runtime');
    if (mode !== 'runtime') return;
    viewerRef.current?.clearBoneVisibilityOverrides();
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('ysm.theme', theme);
    } catch {
      // Restricted profile: keep the in-memory theme only.
    }
    viewerRef.current?.setTheme(theme);
    if (window.ysmNative?.setTheme) {
      void window.ysmNative.setTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('ysm.uiScale', String(uiScale));
    } catch {
      // Restricted profile: keep the in-memory scale only.
    }
    if (window.ysmNative?.setZoomFactor) {
      void window.ysmNative.setZoomFactor(uiScale);
    } else {
      document.documentElement.style.zoom = String(uiScale);
    }
  }, [uiScale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const current = useStudio.getState().uiScale;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setUiScale(current + 0.1);
      } else if (event.key === '-') {
        event.preventDefault();
        setUiScale(current - 0.1);
      } else if (event.key === '0') {
        event.preventDefault();
        setUiScale(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setUiScale]);

  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    audioEngine.setMuted(muted);
  }, [muted]);

  const applyImportResult = useCallback(
    (result: { projects: Awaited<ReturnType<typeof loadDemoProject>>[]; errors: string[] }) => {
      if (result.projects.length > 0) {
        addProjects(result.projects);
        notify(
          `已载入 ${result.projects.length} 个模型${result.projects[0] ? ` · ${result.projects[0].name}` : ''}`,
          'success',
        );
      }
      for (const error of result.errors.slice(0, 3)) notify(error, 'error');
    },
    [addProjects, notify],
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoading(true, '解密并解析模型');
      try {
        const result = await importFileList(files);
        applyImportResult(result);
      } catch (error) {
        notify(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        setLoading(false);
      }
    },
    [applyImportResult, notify, setLoading],
  );

  const onFolderClick = useCallback(async () => {
    if (window.ysmNative) {
      setLoading(true, '扫描模型文件夹');
      try {
        const result = await openDirectoryDialog();
        applyImportResult(result);
      } finally {
        setLoading(false);
      }
      return;
    }
    folderInputRef.current?.click();
  }, [applyImportResult, setLoading]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0 && event.dataTransfer.items.length === 0) {
        notify('没有检测到可读取的文件。', 'error');
        return;
      }
      setLoading(true, '读取拖入的模型');
      try {
        const result = await importDropTransfer(event.dataTransfer);
        applyImportResult(result);
      } catch (error) {
        notify(`拖入解析失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        setLoading(false);
      }
    },
    [applyImportResult, notify, setLoading],
  );

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes('Files')) setDragActive(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }, []);

  return (
    <div
      className="app-shell"
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <TitleBar
        project={project}
        mode={mode}
        onModeChange={setMode}
        onOpenFolder={onFolderClick}
      />

      <div className="workspace">
        <LeftSidebar
          project={project}
          activeProjectId={activeProjectId}
          onOpenFolder={onFolderClick}
          onAddFiles={() => fileInputRef.current?.click()}
        />
        <main className="center-column">
          <Stage project={project} canvasRef={canvasRef} />
          <BottomBar
            onSeek={(seconds) => viewerRef.current?.seek(seconds)}
            onResetView={() => viewerRef.current?.resetView()}
          />
        </main>
        <RightSidebar
          project={project}
          onSetBoneVisibility={(name, state) =>
            viewerRef.current?.setBoneVisibility(name, state)
          }
          onResetBoneVisibility={() => viewerRef.current?.clearBoneVisibilityOverrides()}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".ysm,application/octet-stream"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void importFiles(files);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        // Chromium-specific folder selection attributes.
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length === 0) return;
          setLoading(true, '扫描模型文件夹');
          void importFolderFiles(files)
            .then(applyImportResult)
            .catch((error) =>
              notify(
                `文件夹解析失败：${error instanceof Error ? error.message : String(error)}`,
                'error',
              ),
            )
            .finally(() => setLoading(false));
        }}
      />

      <DragOverlay visible={dragActive} />
      <Toasts />
    </div>
  );
}
