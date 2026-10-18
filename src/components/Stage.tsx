import {
  Box,
  Gamepad2,
  Grid3X3,
  Moon,
  MousePointer2,
  RotateCw,
  ScanFace,
  SquareDashed,
  Sun,
} from 'lucide-react';
import type { ParsedProject } from '@/types';
import { useStudio } from '@/store/studio';

interface Props {
  project?: ParsedProject;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

function ToggleChip({
  active,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <button
      className={`toggle-chip${active ? ' active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function Stage({ project, canvasRef }: Props) {
  const settings = useStudio((state) => state.settings);
  const patchSettings = useStudio((state) => state.patchSettings);
  const stats = useStudio((state) => state.stats);
  const mode = useStudio((state) => state.mode);
  const theme = useStudio((state) => state.theme);
  const setTheme = useStudio((state) => state.setTheme);
  const loading = useStudio((state) => state.loading);
  const loadingLabel = useStudio((state) => state.loadingLabel);

  return (
    <section className="stage">
      <div className="stage-toolbar">
        <div className="stage-title">
          <div className="eyebrow">PREVIEW STAGE</div>
          <div className="stage-title-row">
            <h1>{project?.name ?? '等待模型'}</h1>
            {project && <span className="stage-format">{project.format}</span>}
            {project && mode === 'runtime' && (
              <span className="stage-mode-badge">
                <Gamepad2 size={10} /> SIMULATION
              </span>
            )}
          </div>
        </div>

        <div className="stage-tools">
          <ToggleChip
            active={settings.showGrid}
            onClick={() => patchSettings({ showGrid: !settings.showGrid })}
            icon={<Grid3X3 size={14} />}
            label="网格"
            title="显示地面网格与接触阴影"
          />
          <ToggleChip
            active={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            icon={theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            label={theme === 'dark' ? '暗色' : '亮色'}
            title="切换亮色 / 暗色主题"
          />
          <ToggleChip
            active={settings.autoRotate}
            onClick={() => patchSettings({ autoRotate: !settings.autoRotate })}
            icon={<RotateCw size={14} />}
            label="环绕"
            title="自动环绕旋转"
          />
          <ToggleChip
            active={settings.headFollow}
            onClick={() => patchSettings({ headFollow: !settings.headFollow })}
            icon={<MousePointer2 size={14} />}
            label="视线"
            title="头部跟随鼠标"
          />
          <ToggleChip
            active={settings.wireframe}
            onClick={() => patchSettings({ wireframe: !settings.wireframe })}
            icon={<SquareDashed size={14} />}
            label="线框"
            title="线框模式"
          />
          <ToggleChip
            active={settings.pixelFilter === 'nearest'}
            onClick={() =>
              patchSettings({
                pixelFilter: settings.pixelFilter === 'nearest' ? 'linear' : 'nearest',
              })
            }
            icon={<ScanFace size={14} />}
            label={settings.pixelFilter === 'nearest' ? '像素' : '平滑'}
            title="切换贴图采样"
          />
        </div>
      </div>

      <div className="stage-viewport">
        <canvas ref={canvasRef} className="stage-canvas" />
        <div className="stage-fps">
          <strong>{stats.fps || '—'}</strong>
          <span>FPS</span>
        </div>

        {!project && !loading && (
          <div className="stage-empty">
            <div className="empty-orbit">
              <div className="empty-orbit-ring" />
              <div className="empty-orbit-ring ring-two" />
              <Box size={44} />
            </div>
            <h2>把模型带进舞台</h2>
            <p>拖入 .ysm 加密模型，或包含 ysm.json 的未加密模型目录。</p>
            <div className="empty-hints">
              <span>V1 / V2 / V3</span>
              <span>GeckoLib 动画</span>
              <span>OGG 语音</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>{loadingLabel || '正在处理…'}</span>
            <small>解密与解包都在内存中完成</small>
          </div>
        )}
      </div>
    </section>
  );
}
