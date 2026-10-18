import type { ParsedProject } from '@/types';
import { CardPreview } from './CardPreview';

interface Props {
  project?: ParsedProject;
  visible: boolean;
  top: number;
  left: number;
}

export function ModelHoverPreview({ project, visible, top, left }: Props) {
  const animation = project?.properties.preview_animation || 'idle';
  return (
    <div
      className={`model-hover-preview${visible ? ' visible' : ''}`}
      style={{ top, left }}
      aria-hidden={!visible}
    >
      <div className="model-hover-stage">
        <CardPreview project={project} active={visible} />
        <span className="model-hover-tag">PREVIEW</span>
      </div>
      <div className="model-hover-meta">
        <strong>{project?.name ?? '模型预览'}</strong>
        <span>
          {project ? `${animation} · ${project.bones} bones` : '悬停模型以预览'}
        </span>
      </div>
    </div>
  );
}
