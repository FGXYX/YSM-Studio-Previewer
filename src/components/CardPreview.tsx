import { useEffect, useRef, useState } from 'react';
import type { ParsedProject } from '@/types';
import { YsmViewer } from '@/viewer/YsmViewer';

function defaultTexture(project: ParsedProject) {
  const requested = String(project.properties.default_texture ?? '')
    .trim()
    .toLowerCase();
  if (!requested) return project.textures[0];
  const requestedStem = requested.replace(/\.[^.]+$/, '');
  return (
    project.textures.find((texture) => {
      const path = texture.path.toLowerCase();
      const base = path.split('/').pop() ?? path;
      return (
        path === requested ||
        base === requested ||
        base.replace(/\.[^.]+$/, '') === requestedStem
      );
    }) ?? project.textures[0]
  );
}

interface Props {
  project?: ParsedProject;
  active: boolean;
}

export function CardPreview({ project, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<YsmViewer | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // One persistent WebGL context shared by every card hover. Creating a new
  // YsmViewer per hover exhausts the browser's ~16 context limit.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new YsmViewer(canvas, {
      onError: () => {
        setFailed(true);
        setLoading(false);
      },
    });
    viewer.setPreviewMode(true);
    viewer.setSuspended(true);
    viewerRef.current = viewer;
    return () => {
      loadTokenRef.current += 1;
      viewer.dispose();
      viewerRef.current = null;
      loadedIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const token = ++loadTokenRef.current;
    viewer.setSuspended(!active);
    if (!active || !project) return;
    if (loadedIdRef.current === project.id) {
      viewer.setSuspended(false);
      return;
    }

    setLoading(true);
    setFailed(false);

    (async () => {
      try {
        const texture = defaultTexture(project);
        await viewer.load(project, texture);
        if (token !== loadTokenRef.current) return;
        viewer.setConfigValues(project.configDefaults);
        viewer.setPreviewMode(true);
        viewer.playPreview(project.properties.preview_animation);
        viewer.resetView();
        viewer.setViewAngles(180, 80);
        viewer.setSuspended(false);
        loadedIdRef.current = project.id;
        setLoading(false);
      } catch {
        if (token === loadTokenRef.current) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();
  }, [active, project]);

  return (
    <div className="card-preview-stage">
      <canvas ref={canvasRef} className="card-preview-canvas" aria-hidden="true" />
      {loading && <span className="card-preview-loading">预览加载中…</span>}
      {failed && <span className="card-preview-loading">预览不可用</span>}
    </div>
  );
}
