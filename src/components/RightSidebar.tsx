import { useEffect, useMemo, useState } from 'react';
import {
  AudioLines,
  Bike,
  Bone,
  Disc3,
  EyeOff,
  Footprints,
  Gauge,
  Ghost,
  Hand,
  Moon,
  Pause,
  PersonStanding,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import type {
  BaseAction,
  BoneVisibilityState,
  ExtraAction,
  ParsedProject,
  SoundAsset,
} from '@/types';
import { useStudio, type SidebarTab } from '@/store/studio';
import { audioEngine } from '@/audio/AudioEngine';
import { getBaseActionsFor, getExtras } from '@/parser/projectParser';
import { formatTime } from '@/lib/utils';
import { ConfigPanel } from './ConfigPanel';
import { BoneTree } from './BoneTree';

interface Props {
  project?: ParsedProject;
  onSetBoneVisibility?: (name: string, state: BoneVisibilityState) => void;
  onResetBoneVisibility?: () => void;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  idle: <PersonStanding size={19} />,
  walk: <Footprints size={19} />,
  run: <Gauge size={19} />,
  sneak: <EyeOff size={19} />,
  swim: <Waves size={19} />,
  fly: <Wind size={19} />,
  ride: <Bike size={19} />,
  sleep: <Moon size={19} />,
};

function SpeedButtons() {
  const speed = useStudio((state) => state.speed);
  const setSpeed = useStudio((state) => state.setSpeed);
  return (
    <div className="speed-buttons">
      {[0.5, 1, 1.5, 2].map((value) => (
        <button
          key={value}
          className={speed === value ? 'active' : ''}
          onClick={() => setSpeed(value)}
        >
          {value}×
        </button>
      ))}
    </div>
  );
}

function ActionsTab({ project }: { project: ParsedProject }) {
  const baseAction = useStudio((state) => state.baseAction);
  const setBaseAction = useStudio((state) => state.setBaseAction);
  const stats = useStudio((state) => state.stats);
  const speed = useStudio((state) => state.speed);
  const actions = useMemo(() => getBaseActionsFor(project), [project]);

  return (
    <div className="tab-body">
      <section className="side-section">
        <div className="side-section-head">
          <div>
            <span className="eyebrow">LOCOMOTION</span>
            <h3>基础动作</h3>
          </div>
          <span className="section-count">{actions.length}</span>
        </div>
        <div className="action-grid">
          {actions.map((action) => (
            <button
              key={action.id}
              className={`action-tile${baseAction === action.clip ? ' active' : ''}`}
              onClick={() => setBaseAction(action.clip)}
            >
              <span className="action-icon">{ACTION_ICONS[action.id] ?? <Zap size={19} />}</span>
              <span className="action-label">{action.label}</span>
              <span className="action-clip">{action.clip}</span>
            </button>
          ))}
          {actions.length === 0 && <div className="small-empty">没有基础动作。</div>}
        </div>
      </section>

      <section className="side-section now-playing">
        <div className="playing-orb">
          <span className={`orb-ring${stats.loop ? ' spin' : ''}`} />
          <Play size={18} fill="currentColor" />
        </div>
        <div className="playing-copy">
          <span className="eyebrow">NOW PLAYING</span>
          <h3>{stats.clipName || '—'}</h3>
          <p>
            {formatTime(stats.time)} / {formatTime(stats.duration)}
          </p>
        </div>
        <div className="playing-meta">
          <span>{stats.loop ? 'LOOP' : 'ONCE'}</span>
        </div>
      </section>

      <section className="side-section">
        <div className="side-section-head compact">
          <h3>播放速率</h3>
          <span className="mono muted">{speed.toFixed(1)}×</span>
        </div>
        <SpeedButtons />
        <p className="hint-copy">
          动作轮盘播放期间，骨架会继续叠加基础层；切换主状态时 Extra 演出会停止。
        </p>
      </section>
    </div>
  );
}

function ExtrasTab({ project }: { project: ParsedProject }) {
  const extraAction = useStudio((state) => state.extraAction);
  const setExtraAction = useStudio((state) => state.setExtraAction);
  const setPaused = useStudio((state) => state.setPaused);
  const mode = useStudio((state) => state.mode);
  const allExtras = useMemo(() => getExtras(project), [project]);
  const extras = useMemo(
    () => allExtras.filter((extra) => mode === 'studio' || !extra.debug),
    [allExtras, mode],
  );
  const configGroups = project.configGroups;
  const [openConfigId, setOpenConfigId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const result = new Map<string, ExtraAction[]>();
    for (const extra of extras) {
      const key = extra.debug ? '调试动作' : extra.group ?? '演出动作';
      const list = result.get(key) ?? [];
      list.push(extra);
      result.set(key, list);
    }
    return [...result.entries()];
  }, [extras]);
  const activeConfigGroup = configGroups.find((group) => group.id === openConfigId);

  useEffect(() => {
    setOpenConfigId(null);
  }, [project.id]);

  const openConfig = (configId?: string) => {
    if (!configId) return;
    setPaused(false);
    setOpenConfigId(configId);
  };

  const playExtra = (extra: ExtraAction) => {
    if (extra.kind === 'config') {
      openConfig(extra.configId);
      return;
    }
    setOpenConfigId(null);
    setPaused(false);
    setExtraAction(extra.clip);
  };

  return (
    <div className="tab-body">
      <section className="wheel-section">
        <div className="wheel">
          <div className="wheel-ring ring-one" />
          <div className="wheel-ring ring-two" />
          <div className="wheel-center">
            <Sparkles size={16} />
            <strong>EXTRA</strong>
            <span>{extras.length} 槽位</span>
          </div>
          {extras.slice(0, 8).map((extra, index, all) => {
            const angle = (index / Math.max(1, all.length)) * Math.PI * 2 - Math.PI / 2;
            const radius = 92;
            const active =
              extra.kind === 'config'
                ? openConfigId === extra.configId
                : extraAction === extra.clip;
            return (
              <button
                key={extra.id}
                className={`wheel-slot${active ? ' active' : ''}${
                  extra.kind === 'config' ? ' config-slot' : ''
                }`}
                style={{
                  transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`,
                }}
                title={extra.label}
                onClick={() => playExtra(extra)}
              >
                {extra.kind === 'config' ? (
                  <Settings2 size={11} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="wheel-caption">
          {activeConfigGroup
            ? `正在调整：${activeConfigGroup.name}`
            : extraAction
              ? `正在演出：${extras.find((item) => item.clip === extraAction)?.label ?? extraAction}`
              : '选择一个轮盘动作或设置项'}
        </p>
      </section>

      {activeConfigGroup && (
        <ConfigPanel group={activeConfigGroup} onClose={() => setOpenConfigId(null)} />
      )}

      {extraAction && (
        <button className="stop-action" onClick={() => setExtraAction(null)}>
          <Square size={13} fill="currentColor" />
          停止 Extra 演出
        </button>
      )}

      {groups.map(([group, actions]) => (
        <section className="side-section" key={group}>
          <div className="side-section-head compact">
            <h3>{group}</h3>
            <span className="section-count">{actions.length}</span>
          </div>
          <div className="extra-list">
            {actions.map((extra) => {
              const active =
                extra.kind === 'config'
                  ? openConfigId === extra.configId
                  : extraAction === extra.clip;
              return (
                <button
                  key={extra.id}
                  className={`extra-row${active ? ' active' : ''}${
                    extra.kind === 'config' ? ' config-row' : ''
                  }`}
                  onClick={() => playExtra(extra)}
                >
                  <span className="extra-dot" />
                  <span className="extra-label">{extra.label}</span>
                  <span className="extra-clip mono">
                    {extra.kind === 'config' ? '打开' : extra.clip}
                  </span>
                  {extra.kind === 'config' ? <Settings2 size={13} /> : <Play size={13} />}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {extras.length === 0 && (
        <div className="side-empty">
          <Disc3 size={25} />
          <h3>没有 Extra 动作</h3>
          <p>该模型包未在 ysm.json 中声明额外演出。</p>
        </div>
      )}
    </div>
  );
}

function SoundsTab({ project }: { project: ParsedProject }) {
  const volume = useStudio((state) => state.volume);
  const muted = useStudio((state) => state.muted);
  const setVolume = useStudio((state) => state.setVolume);
  const setMuted = useStudio((state) => state.setMuted);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ time: 0, duration: 0 });

  useEffect(() => {
    setPlayingPath(null);
    setPaused(false);
    audioEngine.stopSound();
  }, [project.id]);

  useEffect(() => {
    if (!playingPath) {
      setProgress({ time: 0, duration: 0 });
      return;
    }
    const timer = window.setInterval(() => {
      setProgress(audioEngine.getSoundProgress());
      if (!paused && !audioEngine.isPlaying()) {
        setPlayingPath(null);
        setProgress({ time: 0, duration: 0 });
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [playingPath, paused]);

  const toggle = (asset: SoundAsset) => {
    if (playingPath === asset.path) {
      if (audioEngine.isPlaying()) {
        audioEngine.pauseSound();
        setPaused(true);
      } else {
        audioEngine.resumeSound();
        setPaused(false);
      }
      return;
    }
    audioEngine.playSound(asset);
    setPlayingPath(asset.path);
    setPaused(false);
    setProgress({ time: 0, duration: 0 });
  };

  return (
    <div className="tab-body">
      <section className="sound-header">
        <div className="volume-line">
          <button
            className="icon-button"
            onClick={() => setMuted(!muted)}
            title={muted ? '取消静音' : '静音'}
          >
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => {
              setMuted(false);
              setVolume(Number(event.target.value));
            }}
          />
          <span className="mono">{Math.round((muted ? 0 : volume) * 100)}%</span>
        </div>
        <p className="hint-copy">
          独立语音鉴赏；动画中的 <span className="mono">sound_effects</span> 事件也会走同一声轨。
        </p>
      </section>

      <section className="sound-list">
        {project.sounds.map((sound, index) => {
          const active = playingPath === sound.path;
          const percent =
            active && progress.duration > 0
              ? Math.min(100, (progress.time / progress.duration) * 100)
              : 0;
          return (
            <div className={`sound-row${active ? ' active' : ''}`} key={sound.path}>
              <button className="sound-play" onClick={() => toggle(sound)}>
                {active && !paused ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </button>
              <div className="sound-copy">
                <div className="sound-title-line">
                  <strong>{sound.label}</strong>
                  <span className="mono">{active ? formatTime(progress.time) : String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="sound-path mono">{sound.path}</div>
                <div className="sound-progress">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>
          );
        })}
        {project.sounds.length === 0 && (
          <div className="side-empty">
            <AudioLines size={26} />
            <h3>没有语音文件</h3>
            <p>拖入包含 sounds/*.ogg 的模型包后，会在这里生成音轨列表。</p>
          </div>
        )}
      </section>
    </div>
  );
}

const TABS: Array<{ id: SidebarTab; label: string; icon: React.ReactNode }> = [
  { id: 'actions', label: '基础动作', icon: <PersonStanding size={15} /> },
  { id: 'extras', label: '轮盘', icon: <Disc3 size={15} /> },
  { id: 'sounds', label: '语音', icon: <AudioLines size={15} /> },
  { id: 'bones', label: '骨骼', icon: <Bone size={15} /> },
];

export function RightSidebar({
  project,
  onSetBoneVisibility,
  onResetBoneVisibility,
}: Props) {
  const tab = useStudio((state) => state.tab);
  const setTab = useStudio((state) => state.setTab);
  const mode = useStudio((state) => state.mode);
  const allExtras = useMemo(() => (project ? getExtras(project) : []), [project]);
  const extras = useMemo(
    () => allExtras.filter((extra) => mode === 'studio' || !extra.debug),
    [allExtras, mode],
  );
  const counts: Record<SidebarTab, number> = {
    actions: project ? getBaseActionsFor(project).length : 0,
    extras: extras.length,
    sounds: project?.sounds.length ?? 0,
    bones: project?.bones ?? 0,
  };

  return (
    <aside className="right-panel panel">
      <div className="right-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`right-tab${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            <small>{counts[item.id]}</small>
          </button>
        ))}
      </div>

      {project ? (
        <>
          {tab === 'actions' && <ActionsTab project={project} />}
          {tab === 'extras' && <ExtrasTab project={project} />}
          {tab === 'sounds' && <SoundsTab project={project} />}
          {tab === 'bones' && (
            <div className="tab-body bone-tab-body">
              <BoneTree
                project={project}
                readOnly={mode === 'runtime'}
                onSetVisibility={(name, state) => onSetBoneVisibility?.(name, state)}
                onResetVisibility={() => onResetBoneVisibility?.()}
              />
            </div>
          )}
        </>
      ) : (
        <div className="side-empty full">
          <Hand size={28} />
          <h3>控制台待机</h3>
          <p>载入模型后可在这里切换动作、触发轮盘演出与试听语音。</p>
        </div>
      )}

      <div className="right-footer">
        <button title="刷新视图" onClick={() => setTab('actions')}>
          <RotateCcw size={13} />
        </button>
      </div>
    </aside>
  );
}
