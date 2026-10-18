import {
  Bug,
  ChevronDown,
  ChevronUp,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
} from 'lucide-react';
import { useStudio } from '@/store/studio';
import { formatTime } from '@/lib/utils';

interface Props {
  onSeek: (seconds: number) => void;
  onResetView: () => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="molang-slider">
      <span className="molang-slider-head">
        <span>{label}</span>
        <strong className="mono">
          {value.toFixed(step < 0.1 ? 2 : 0)}
          {unit ?? ''}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function BottomBar({ onSeek, onResetView }: Props) {
  const stats = useStudio((state) => state.stats);
  const paused = useStudio((state) => state.paused);
  const speed = useStudio((state) => state.speed);
  const molang = useStudio((state) => state.molang);
  const settings = useStudio((state) => state.settings);
  const setPaused = useStudio((state) => state.setPaused);
  const setSpeed = useStudio((state) => state.setSpeed);
  const patchMolang = useStudio((state) => state.patchMolang);
  const resetMolang = useStudio((state) => state.resetMolang);
  const patchSettings = useStudio((state) => state.patchSettings);

  const duration = Math.max(stats.duration, 0.001);
  const percent = Math.min(100, Math.max(0, (stats.time / duration) * 100));

  return (
    <section className={`bottom-bar${settings.showMolang ? ' expanded' : ''}`}>
      <div className="molang-drawer">
        <div className="molang-drawer-head">
          <div>
            <span className="eyebrow">MOLANG SIMULATOR</span>
            <h3>Mock 玩家环境</h3>
          </div>
          <div className="molang-actions">
            <span className="live-pill">
              <span /> LIVE QUERY
            </span>
            <button className="ghost-button" onClick={resetMolang}>
              <RotateCcw size={12} /> 重置
            </button>
          </div>
        </div>

        <div className="molang-grid">
          <div className="molang-group">
            <SliderRow
              label="地面速度 query.ground_speed"
              value={molang.groundSpeed}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => patchMolang({ groundSpeed: value })}
            />
            <SliderRow
              label="垂直速度 query.vertical_speed"
              value={molang.verticalSpeed}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) => patchMolang({ verticalSpeed: value })}
            />
            <SliderRow
              label="生命值 query.health"
              value={molang.health}
              min={0}
              max={molang.maxHealth}
              step={1}
              onChange={(value) => patchMolang({ health: value })}
            />
          </div>

          <div className="molang-group">
            <SliderRow
              label="头部偏航 ysm.head_yaw"
              value={molang.headYaw}
              min={-90}
              max={90}
              step={1}
              unit="°"
              onChange={(value) => patchMolang({ headYaw: value })}
            />
            <SliderRow
              label="头部俯仰 ysm.head_pitch"
              value={molang.headPitch}
              min={-90}
              max={90}
              step={1}
              unit="°"
              onChange={(value) => patchMolang({ headPitch: value })}
            />
            <div className="query-readout">
              <span>life_time</span>
              <strong className="mono">{molang.lifeTime.toFixed(2)}s</strong>
              <span>anim_time</span>
              <strong className="mono">{stats.time.toFixed(2)}s</strong>
              <span>clip</span>
              <strong className="mono ellipsis">{stats.clipName || '—'}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="transport">
        <div className="transport-main">
          <button className="transport-icon" onClick={() => onSeek(0)} title="回到起点">
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button
            className="play-button"
            onClick={() => setPaused(!paused)}
            title={paused ? '播放' : '暂停'}
          >
            {paused ? <Play size={19} fill="currentColor" /> : <Pause size={19} fill="currentColor" />}
          </button>
          <div className="time-readout">
            <strong className="mono">{formatTime(stats.time)}</strong>
            <span>/</span>
            <span className="mono">{formatTime(stats.duration)}</span>
          </div>

          <div className="timeline-wrap">
            <input
              className="timeline-range"
              type="range"
              min={0}
              max={duration}
              step={0.001}
              value={stats.time}
              onChange={(event) => onSeek(Number(event.target.value))}
              style={{ ['--timeline-progress' as string]: `${percent}%` }}
            />
          </div>

          <div className="transport-right">
            <button
              className="speed-cycle"
              onClick={() => {
                const values = [0.5, 1, 1.5, 2];
                const index = values.indexOf(speed);
                setSpeed(values[(index + 1) % values.length]);
              }}
              title="播放速率"
            >
              <Gauge size={14} />
              <span>{speed}×</span>
            </button>
            <button
              className={`tool-button${settings.showMolang ? ' active' : ''}`}
              onClick={() => patchSettings({ showMolang: !settings.showMolang })}
              title="Molang 模拟器"
            >
              <Bug size={15} />
              <span>Molang</span>
              {settings.showMolang ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
            <button className="tool-button" onClick={onResetView} title="重置摄像机">
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
