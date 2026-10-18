import { Box, FolderOpen, Gamepad2, Github, Minus, Plus } from 'lucide-react';
import type { ParsedProject, StudioMode } from '@/types';
import { MAX_UI_SCALE, MIN_UI_SCALE, useStudio } from '@/store/studio';

const AUTHOR_URL = 'https://github.com/FGXYX';
const AUTHOR_NAME = 'SunriseSnow';

interface Props {
  project?: ParsedProject;
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  onOpenFolder: () => void;
}

export function TitleBar({ project, mode, onModeChange, onOpenFolder }: Props) {
  const uiScale = useStudio((state) => state.uiScale);
  const setUiScale = useStudio((state) => state.setUiScale);
  const openAuthor = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!window.ysmNative?.openExternal) return;
    event.preventDefault();
    void window.ysmNative.openExternal(AUTHOR_URL);
  };
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <div className="brand-mark">
          <Box size={17} strokeWidth={2.2} />
        </div>
        <div className="brand-text">
          <span className="brand-name">YSM Studio</span>
          <span className="brand-edition">PREVIEWER</span>
        </div>
      </div>

      <a
        className="author-credit"
        href={AUTHOR_URL}
        target="_blank"
        rel="noreferrer noopener"
        onClick={openAuthor}
        title={`GitHub · ${AUTHOR_NAME}`}
      >
        <Github size={12} />
        <span>{AUTHOR_NAME}</span>
      </a>

      <div className="titlebar-divider" />

      <div className="titlebar-context">
        <span className="context-label">工作区</span>
        <span className="context-separator">/</span>
        <span className="context-value">{project?.name ?? '未载入模型'}</span>
        {project && (
          <>
            <span className="context-separator">/</span>
            <span className="context-muted">{project.modelPath}</span>
          </>
        )}
      </div>

      <div className="titlebar-actions">
        <div className="ui-zoom" title="界面缩放（Ctrl + / Ctrl - / Ctrl 0）">
          <button
            onClick={() => setUiScale(uiScale - 0.1)}
            disabled={uiScale <= MIN_UI_SCALE}
            title="缩小界面"
          >
            <Minus size={11} />
          </button>
          <button className="ui-zoom-value" onClick={() => setUiScale(1)} title="恢复 100%">
            {Math.round(uiScale * 100)}%
          </button>
          <button
            onClick={() => setUiScale(uiScale + 0.1)}
            disabled={uiScale >= MAX_UI_SCALE}
            title="放大界面"
          >
            <Plus size={11} />
          </button>
        </div>
        <div className="mode-switch" role="group" aria-label="预览模式">
          <button
            className={mode === 'studio' ? 'active' : ''}
            onClick={() => onModeChange('studio')}
            title="编辑模式：显示全部部件，可手动显隐"
          >
            <Box size={12} />
            编辑
          </button>
          <button
            className={mode === 'runtime' ? 'active' : ''}
            onClick={() => onModeChange('runtime')}
            title="模拟模式：按游戏运行状态与模型配置显示"
          >
            <Gamepad2 size={12} />
            模拟
          </button>
        </div>
        <button
          className="title-button primary"
          onClick={onOpenFolder}
          title="选择包含 .ysm 或未加密模型的文件夹"
        >
          <FolderOpen size={15} />
          <span>选择模型文件夹</span>
        </button>
      </div>
    </header>
  );
}
