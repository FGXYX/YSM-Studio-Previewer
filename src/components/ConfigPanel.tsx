import { useEffect, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { ConfigForm, ConfigGroup } from '@/types';
import { cleanMinecraftText } from '@/lib/utils';
import { useStudio } from '@/store/studio';

interface Props {
  group: ConfigGroup;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatValue(value: number): string {
  if (Math.abs(value) < 1e-9) return '0';
  return Number(value.toFixed(3)).toString();
}

function ConfigFormRow({ form }: { form: ConfigForm }) {
  const configValues = useStudio((state) => state.configValues);
  const patchConfigValues = useStudio((state) => state.patchConfigValues);
  const previewRef = useRef<Record<string, number> | null>(null);
  const committedRef = useRef(false);
  const current = configValues[form.variable] ?? 0;

  const assignmentsFor = (optionIndex: number): Record<string, number> => {
    const option = form.options[optionIndex];
    const changes: Record<string, number> = {};
    for (const assignment of option?.assignments ?? []) {
      changes[assignment.variable] = assignment.value;
    }
    if (Object.keys(changes).length === 0) changes[form.variable] = optionIndex;
    return changes;
  };

  const previewOption = (optionIndex: number) => {
    if (previewRef.current) return;
    const changes = assignmentsFor(optionIndex);
    const previous: Record<string, number> = {};
    for (const variable of Object.keys(changes)) {
      previous[variable] = configValues[variable] ?? 0;
    }
    previewRef.current = previous;
    patchConfigValues(changes);
  };

  const clearPreview = () => {
    if (!previewRef.current) return;
    if (committedRef.current) {
      committedRef.current = false;
      previewRef.current = null;
      return;
    }
    patchConfigValues(previewRef.current);
    previewRef.current = null;
  };

  const commitOption = (optionIndex: number) => {
    committedRef.current = true;
    patchConfigValues(assignmentsFor(optionIndex));
  };

  useEffect(
    () => () => {
      if (previewRef.current && !committedRef.current) {
        patchConfigValues(previewRef.current);
      }
    },
    [patchConfigValues],
  );

  if (form.type === 'checkbox') {
    const checked = current > 0;
    return (
      <div className="config-form-row">
        <div className="config-form-head">
          <span className="config-form-title">{cleanMinecraftText(form.title)}</span>
          <button
            className={`config-switch${checked ? ' on' : ''}`}
            aria-pressed={checked}
            onClick={() => patchConfigValues({ [form.variable]: checked ? 0 : 1 })}
          >
            <span />
          </button>
        </div>
        {form.description && <p className="config-form-desc">{form.description}</p>}
      </div>
    );
  }

  if (form.type === 'range') {
    const value = clamp(current, form.min, form.max);
    return (
      <div className="config-form-row">
        <div className="config-form-head">
          <span className="config-form-title">{cleanMinecraftText(form.title)}</span>
          <span className="config-form-value mono">{formatValue(value)}</span>
        </div>
        <input
          className="config-range"
          type="range"
          min={form.min}
          max={form.max}
          step={form.step || 0.01}
          value={value}
          onChange={(event) =>
            patchConfigValues({ [form.variable]: Number(event.target.value) })
          }
        />
        <div className="config-range-scale mono">
          <span>{formatValue(form.min)}</span>
          <span>{formatValue(form.max)}</span>
        </div>
        {form.description && <p className="config-form-desc">{form.description}</p>}
      </div>
    );
  }

  const selected = clamp(Math.round(current), 0, Math.max(0, form.options.length - 1));
  return (
    <div className="config-form-row">
      <div className="config-form-head">
        <span className="config-form-title">{cleanMinecraftText(form.title)}</span>
        <span className="config-form-value mono">{form.options[selected]?.label ?? '—'}</span>
      </div>
      <div className="config-options">
        {form.options.map((option, index) => (
          <button
            key={`${form.variable}:${index}`}
            className={`config-option${selected === index ? ' active' : ''}`}
            onMouseEnter={() => previewOption(index)}
            onMouseLeave={clearPreview}
            onFocus={() => previewOption(index)}
            onBlur={clearPreview}
            onClick={() => commitOption(index)}
          >
            {cleanMinecraftText(option.label)}
          </button>
        ))}
      </div>
      <p className="config-preview-hint">悬停预览 · 点击应用</p>
      {form.description && <p className="config-form-desc">{form.description}</p>}
    </div>
  );
}

export function ConfigPanel({ group, onClose }: Props) {
  const mode = useStudio((state) => state.mode);
  const setMode = useStudio((state) => state.setMode);
  return (
    <section className="config-panel">
      <div className="config-panel-head">
        <div>
          <span className="eyebrow">MODEL SETTINGS</span>
          <h3>
            <SlidersHorizontal size={13} /> {cleanMinecraftText(group.name)}
          </h3>
          {group.description && <p>{cleanMinecraftText(group.description)}</p>}
        </div>
        <button className="config-close" onClick={onClose} title="关闭设置">
          <X size={13} />
        </button>
      </div>
      {mode === 'studio' && (
        <button className="config-runtime-hint" onClick={() => setMode('runtime')}>
          当前是「编辑」模式，会显示全部资产。切到「模拟」模式查看配置效果。
        </button>
      )}
      <div className="config-form-list">
        {group.forms.map((form) => (
          <ConfigFormRow key={`${group.id}:${form.index}`} form={form} />
        ))}
        {group.forms.length === 0 && (
          <p className="config-empty">此设置组没有可用的配置项。</p>
        )}
      </div>
    </section>
  );
}
