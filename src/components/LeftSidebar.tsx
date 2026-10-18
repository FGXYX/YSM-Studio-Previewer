import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Database,
  FileArchive,
  FolderOpen,
  Layers3,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { ParsedProject } from '@/types';
import { useStudio } from '@/store/studio';
import { fileStem } from '@/lib/utils';
import { ModelHoverPreview } from './ModelHoverPreview';

interface Props {
  project?: ParsedProject;
  activeProjectId: string | null;
  onOpenFolder: () => void;
  onAddFiles: () => void;
}

export function LeftSidebar({
  project,
  activeProjectId,
  onOpenFolder,
  onAddFiles,
}: Props) {
  const projects = useStudio((state) => state.projects);
  const selectProject = useStudio((state) => state.selectProject);
  const removeProject = useStudio((state) => state.removeProject);
  const texturePath = useStudio((state) => state.texturePath);
  const setTexture = useStudio((state) => state.setTexture);
  const [hoverPreview, setHoverPreview] = useState<{
    project: ParsedProject;
    top: number;
    left: number;
  } | null>(null);
  const [query, setQuery] = useState('');
  const visibleProjects = projects.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [item.name, item.sourceName, item.format, item.sourceKind]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  useEffect(() => {
    if (!hoverPreview) return;
    if (!projects.some((item) => item.id === hoverPreview.project.id)) {
      setHoverPreview(null);
    }
  }, [hoverPreview, projects]);

  return (
    <>
      <aside className="left-panel panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ASSET LIBRARY</div>
          <h2>模型库</h2>
        </div>
        <span className="count-badge">{projects.length.toString().padStart(2, '0')}</span>
      </div>

      <div className="import-row">
        <button className="import-button" onClick={onOpenFolder}>
          <FolderOpen size={15} />
          选择模型文件夹
        </button>
        <button className="icon-button soft" onClick={onAddFiles} title="添加 .ysm 文件">
          <Plus size={16} />
        </button>
      </div>

      <label className="model-search">
        <Search size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索模型…"
          spellCheck={false}
        />
        {query && (
          <button onClick={() => setQuery('')} title="清除搜索">
            ×
          </button>
        )}
      </label>

      <div className="model-list">
        {projects.length === 0 && (
          <div className="empty-list">
            <FileArchive size={22} />
            <p>拖入 .ysm 或未压缩模型文件夹</p>
          </div>
        )}
        {projects.length > 0 && visibleProjects.length === 0 && (
          <div className="empty-list">
            <Search size={20} />
            <p>没有匹配 “{query}” 的模型</p>
          </div>
        )}
        {visibleProjects.map((item) => {
          const active = item.id === activeProjectId;
          return (
            <button
              key={item.id}
              className={`model-card${active ? ' active' : ''}`}
              onClick={() => selectProject(item.id)}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setHoverPreview({
                  project: item,
                  top: Math.max(64, Math.min(rect.top - 8, window.innerHeight - 286)),
                  left: Math.min(rect.right + 10, window.innerWidth - 232),
                });
              }}
              onMouseLeave={() => setHoverPreview(null)}
            >
              <span className="model-avatar">
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt="" loading="lazy" />
                ) : (
                  <span>{item.name.slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <span className="model-card-body">
                <span className="model-card-name">{item.name}</span>
                <span className="model-card-meta">
                  {item.format} · {item.bones} bones
                </span>
              </span>
              <span
                className="model-remove"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  removeProject(item.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.stopPropagation();
                    removeProject(item.id);
                  }
                }}
                title="从列表移除"
              >
                <Trash2 size={13} />
              </span>
              {active && <span className="active-rail" />}
            </button>
          );
        })}
      </div>

      {project ? (
        <div className="inspector-scroll">
          <section className="inspector-section identity-section">
            <div className="identity-head">
              <div className="identity-avatar">
                {project.avatarUrl ? (
                  <img src={project.avatarUrl} alt="" />
                ) : (
                  project.name.slice(0, 1)
                )}
              </div>
              <div className="identity-copy">
                <h3>{project.name}</h3>
                <p>{project.tips}</p>
              </div>
            </div>
            <div className="tag-row">
              <span className="tag accent">{project.format}</span>
              <span className="tag">{project.locale.toUpperCase()}</span>
              <span className="tag">{project.sourceKind === 'demo' ? '示例' : project.sourceKind === 'encrypted' ? '加密包' : '目录'}</span>
            </div>
            <div className="meta-grid">
              <div>
                <span>骨骼</span>
                <strong>{project.bones}</strong>
              </div>
              <div>
                <span>几何体</span>
                <strong>{project.cubes}</strong>
              </div>
              <div>
                <span>动画</span>
                <strong>{Object.keys(project.animations).length}</strong>
              </div>
              <div>
                <span>音频</span>
                <strong>{project.sounds.length}</strong>
              </div>
            </div>
            {project.metadata?.authors?.length ? (
              <div className="author-list">
                <div className="sub-label">
                  <UserRound size={13} /> 创作者
                </div>
                {project.metadata.authors.slice(0, 4).map((author) => (
                  <div className="author-row" key={`${author.name}-${author.role ?? ''}`}>
                    <span className="author-name">{author.name}</span>
                    <span className="author-role">{author.role ?? 'Author'}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="inspector-section">
            <div className="section-title">
              <span>
                <Layers3 size={13} /> 皮肤 / 贴图
              </span>
              <span className="section-hint">{project.textures.length} 套</span>
            </div>
            <div className="texture-grid">
              {project.textures.map((texture) => (
                <button
                  key={texture.path}
                  className={`texture-card${texture.path === texturePath ? ' active' : ''}`}
                  onClick={() => setTexture(texture.path)}
                  title={texture.path}
                >
                  <span className="texture-preview checker">
                    <img src={texture.url} alt={texture.label} />
                  </span>
                  <span className="texture-name">{texture.label}</span>
                </button>
              ))}
              {project.textures.length === 0 && (
                <div className="small-empty">该模型包没有独立贴图。</div>
              )}
            </div>
          </section>

          <section className="inspector-section compact">
            <div className="section-title">
              <span>
                <Database size={13} /> 数据源
              </span>
            </div>
            <div className="data-row">
              <span>{fileStem(project.modelPath)}.json</span>
              <strong>{project.modelPath}</strong>
            </div>
            <div className="data-row">
              <span>输入文件</span>
              <strong>{project.allFiles.length}</strong>
            </div>
            <div className="data-row">
              <span>语音样本</span>
              <strong>{project.sounds.length > 0 ? `${project.sounds.length} tracks` : '—'}</strong>
            </div>
          </section>

          {project.warnings.length > 0 && (
            <section className="inspector-section warning-section">
              <div className="section-title">
                <span>解析提示</span>
              </div>
              {project.warnings.slice(0, 3).map((warning) => (
                <p key={warning} className="warning-text">
                  {warning}
                </p>
              ))}
            </section>
          )}
        </div>
      ) : (
        <div className="sidebar-placeholder">
          <Box size={26} />
          <p>从模型库选择一个模型开始预览</p>
        </div>
      )}

      </aside>
      {createPortal(
        <ModelHoverPreview
          project={hoverPreview?.project}
          visible={Boolean(hoverPreview)}
          top={hoverPreview?.top ?? 80}
          left={hoverPreview?.left ?? 300}
        />,
        document.body,
      )}
    </>
  );
}
