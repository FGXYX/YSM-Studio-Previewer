import Molang from 'molangjs';
import type { AnimationClip, MolangState } from '@/types';

const parser = new Molang();
parser.cache_enabled = true;

export function evaluateMolang(expression: string, variables: Record<string, unknown>): number {
  if (typeof expression !== 'string' || expression.trim() === '') return 0;
  try {
    const value = parser.parse(expression, variables);
    return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
  } catch {
    // Some packs use a bare variable name or return-controlled syntax.
    const numeric = Number(expression);
    if (Number.isFinite(numeric)) return numeric;
    return 0;
  }
}

export function makeMolangVariables(
  state: MolangState,
  animTime: number,
  extra: Record<string, number> = {},
): Record<string, number> {
  const vars: Record<string, number> = {
    'query.anim_time': animTime,
    'query.life_time': state.lifeTime,
    'query.ground_speed': state.groundSpeed,
    'query.vertical_speed': state.verticalSpeed,
    'query.health': state.health,
    'query.max_health': state.maxHealth,
    'query.is_sneaking': state.isSneaking ? 1 : 0,
    'query.is_sprinting': state.isSprinting ? 1 : 0,
    'query.is_riding': state.isRiding ? 1 : 0,
    'query.is_in_water': state.isInWater ? 1 : 0,
    'query.is_on_ground': state.isOnGround ? 1 : 0,
    'query.is_flying': state.isFlying ? 1 : 0,
    'query.is_on_fire': 0,
    'query.is_sleeping': 0,
    'query.modified_distance_moved': state.lifeTime * Math.abs(state.groundSpeed) * 4,
    'query.head_x_rotation': state.headPitch,
    'query.head_y_rotation': state.headYaw,
    'query.body_x_rotation': state.headPitch,
    'query.body_y_rotation': state.headYaw,
    'query.yaw_speed': 0,
    'query.pitch': state.headPitch,
    'query.time_of_day': 6000,
    'query.moon_phase': 0,
    'query.weather': 0,
    'ysm.head_pitch': state.headPitch,
    'ysm.head_yaw': state.headYaw,
    'ysm.has_helmet': state.hasHelmet ? 1 : 0,
    'ysm.has_chestplate': state.hasChestplate ? 1 : 0,
    'ysm.has_leggings': state.hasLeggings ? 1 : 0,
    'ysm.has_boots': state.hasBoots ? 1 : 0,
    'ysm.has_mainhand': state.hasMainhand ? 1 : 0,
    'ysm.has_offhand': state.hasOffhand ? 1 : 0,
    'ysm.is_playing_extra': 0,
    'ysm.armor_count':
      (state.hasHelmet ? 1 : 0) +
      (state.hasChestplate ? 1 : 0) +
      (state.hasLeggings ? 1 : 0) +
      (state.hasBoots ? 1 : 0),
    ...extra,
  };

  // UI/config values are exposed as v.* and v.roaming.*.
  // molangjs rewrites `v.foo` to `variable.foo`, so the flat lookup key must
  // be `variable.foo` (not `v.foo`).
  // Molang identifiers are case-insensitive and molangjs lowercases variable
  // paths. YSM packs commonly use `v.roaming.Dress`, so both the original and
  // lowercase spellings must be present or the lookup silently resolves to 0.
  for (const [key, value] of Object.entries(extra)) {
    vars[key] = value;
    if (key.startsWith('v.')) {
      const path = key.slice(2);
      vars[`variable.${path}`] = value;
      vars[`variable.${path.toLowerCase()}`] = value;
      vars[`v.${path.toLowerCase()}`] = value;
    } else if (key.startsWith('variable.')) {
      vars[key] = value;
      vars[key.toLowerCase()] = value;
    } else if (!key.includes('.')) {
      vars[`v.${key}`] = value;
      vars[`variable.${key}`] = value;
      vars[`v.${key.toLowerCase()}`] = value;
      vars[`variable.${key.toLowerCase()}`] = value;
    }
  }
  return vars;
}

type ChannelValue =
  | number
  | string
  | [number | string, number | string, number | string]
  | Record<string, unknown>
  | null
  | undefined;

interface Keyframe {
  time: number;
  value: ChannelValue;
  mode: string;
}

function channelValue(value: unknown): ChannelValue {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0] as [
      number | string,
      number | string,
      number | string,
    ];
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

function getKeyframeValue(value: unknown): ChannelValue {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (Array.isArray(value)) return channelValue(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('post' in record) return channelValue(record.post);
    if ('pre' in record) return channelValue(record.pre);
  }
  return channelValue(value);
}

function getKeyframes(channel: unknown): Keyframe[] {
  if (channel == null) return [];
  if (Array.isArray(channel) || typeof channel === 'number' || typeof channel === 'string') {
    return [{ time: 0, value: channelValue(channel), mode: 'linear' }];
  }
  if (typeof channel !== 'object') return [];
  return Object.entries(channel as Record<string, unknown>)
    .map(([time, raw]) => {
      const numericTime = Number(time);
      if (!Number.isFinite(numericTime)) return null;
      let mode = 'linear';
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>;
        mode = String(record.lerp_mode ?? record.ease ?? 'linear').toLowerCase();
      }
      return { time: numericTime, value: getKeyframeValue(raw), mode };
    })
    .filter((key): key is Keyframe => Boolean(key))
    .sort((a, b) => a.time - b.time);
}

function scalar(value: unknown, variables: Record<string, unknown>): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return evaluateMolang(value, variables);
  return 0;
}

function vector(value: ChannelValue, variables: Record<string, unknown>): [number, number, number] | null {
  if (value == null) return null;
  if (typeof value === 'number') return [value, value, value];
  if (typeof value === 'string') {
    const result = evaluateMolang(value, variables);
    return [result, result, result];
  }
  if (Array.isArray(value)) {
    return [scalar(value[0], variables), scalar(value[1], variables), scalar(value[2], variables)];
  }
  if ('x' in value || 'y' in value || 'z' in value) {
    return [
      scalar(value.x ?? 0, variables),
      scalar(value.y ?? 0, variables),
      scalar(value.z ?? 0, variables),
    ];
  }
  return null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function catmullRom(
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  t: number,
): [number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    out[i] =
      0.5 *
      (2 * p1[i] +
        (-p0[i] + p2[i]) * t +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  }
  return out;
}

export function sampleChannel(
  channel: unknown,
  time: number,
  variables: Record<string, unknown>,
): [number, number, number] | null {
  const keys = getKeyframes(channel);
  if (keys.length === 0) return null;
  if (keys.length === 1) return vector(keys[0].value, variables);

  if (time <= keys[0].time) return vector(keys[0].value, variables);
  if (time >= keys[keys.length - 1].time) {
    return vector(keys[keys.length - 1].value, variables);
  }

  let index = 0;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (time >= keys[i].time && time <= keys[i + 1].time) {
      index = i;
      break;
    }
  }

  const current = keys[index];
  const next = keys[index + 1];
  const span = Math.max(1e-6, next.time - current.time);
  const t = Math.min(1, Math.max(0, (time - current.time) / span));
  const a = vector(current.value, variables) ?? [0, 0, 0];
  const b = vector(next.value, variables) ?? a;

  if (current.mode.includes('step') || current.mode.includes('hold')) {
    return a;
  }
  if (current.mode.includes('catmull') || current.mode.includes('smooth')) {
    const before = index > 0 ? keys[index - 1] : current;
    const after = index + 2 < keys.length ? keys[index + 2] : next;
    const p0 = vector(before.value, variables) ?? a;
    const p3 = vector(after.value, variables) ?? b;
    return catmullRom(p0, a, b, p3, t);
  }
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export interface BoneSample {
  rotation?: [number, number, number];
  position?: [number, number, number];
  scale?: [number, number, number];
}

export function sampleClip(
  clip: AnimationClip,
  time: number,
  baseVariables: Record<string, number>,
): Record<string, BoneSample> {
  const output: Record<string, BoneSample> = {};
  const variables = { ...baseVariables, 'query.anim_time': time };
  for (const [boneName, channels] of Object.entries(clip.bones ?? {})) {
    const sample: BoneSample = {};
    const rotation = sampleChannel(channels.rotation, time, variables);
    const position = sampleChannel(channels.position, time, variables);
    const scale = sampleChannel(channels.scale, time, variables);
    if (rotation) sample.rotation = rotation;
    if (position) sample.position = position;
    if (scale) sample.scale = scale;
    if (Object.keys(sample).length > 0) output[boneName] = sample;
  }
  return output;
}

export function getClipLength(clip: AnimationClip): number {
  if (typeof clip.animation_length === 'number' && clip.animation_length > 0) {
    return clip.animation_length;
  }
  let max = 0;
  for (const channels of Object.values(clip.bones ?? {})) {
    for (const channel of Object.values(channels)) {
      for (const key of getKeyframes(channel)) {
        max = Math.max(max, key.time);
      }
    }
  }
  return max > 0 ? max : 1;
}

export function isLooping(clip: AnimationClip): boolean {
  if (clip.loop === 'hold_on_last_frame' || clip.loop === false || clip.loop === 'once') {
    return false;
  }
  return true;
}

export interface SoundEvent {
  time: number;
  effect: string;
}

export function getSoundEvents(clip: AnimationClip): SoundEvent[] {
  const events: SoundEvent[] = [];
  for (const [time, effect] of Object.entries(clip.sound_effects ?? {})) {
    const numericTime = Number(time);
    if (!Number.isFinite(numericTime)) continue;
    if (typeof effect === 'string') events.push({ time: numericTime, effect });
    else if (effect && typeof effect === 'object' && typeof effect.effect === 'string') {
      events.push({ time: numericTime, effect: effect.effect });
    }
  }
  return events.sort((a, b) => a.time - b.time);
}
