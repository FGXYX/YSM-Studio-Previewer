import { Howl, Howler } from 'howler';
import type { ParsedProject, SoundAsset } from '@/types';

interface SoundHandle {
  asset: SoundAsset;
  howl: Howl;
  duration: number;
}

export class AudioEngine {
  private project: ParsedProject | null = null;
  private cache = new Map<string, SoundHandle>();
  private current: SoundHandle | null = null;
  private volume = 0.8;
  private muted = false;

  setProject(project: ParsedProject) {
    this.stopAll();
    for (const handle of this.cache.values()) handle.howl.unload();
    this.cache.clear();
    this.project = project;
    Howler.volume(this.volume);
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    Howler.volume(this.volume);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    Howler.mute(muted);
  }

  getVolume() {
    return this.volume;
  }

  isMuted() {
    return this.muted;
  }

  private resolve(effect: string): SoundAsset | undefined {
    if (!this.project) return undefined;
    const normalized = effect.replaceAll('\\', '/');
    return this.project.sounds.find(
      (sound) =>
        sound.key === effect ||
        sound.key.toLowerCase() === effect.toLowerCase() ||
        sound.path === normalized ||
        sound.path.toLowerCase() === normalized.toLowerCase() ||
        sound.path.toLowerCase().endsWith(`/${normalized.toLowerCase()}`),
    );
  }

  private ensure(asset: SoundAsset): SoundHandle {
    const existing = this.cache.get(asset.path);
    if (existing) return existing;
    const howl = new Howl({
      src: [asset.url],
      format: [asset.path.split('.').pop()?.toLowerCase() ?? 'ogg'],
      html5: true,
      preload: true,
      volume: this.volume,
      onloaderror: () => {
        // Codec errors are surfaced by the UI only when the user asks to play.
      },
    });
    const handle: SoundHandle = { asset, howl, duration: 0 };
    howl.once('load', () => {
      handle.duration = howl.duration();
    });
    this.cache.set(asset.path, handle);
    return handle;
  }

  playEffect(effect: string) {
    const asset = this.resolve(effect);
    if (!asset) return false;
    const handle = this.ensure(asset);
    const id = handle.howl.play();
    if (id !== undefined) {
      handle.howl.volume(this.volume, id);
      return true;
    }
    return false;
  }

  playSound(asset: SoundAsset): SoundHandle | null {
    this.stopSound();
    const handle = this.ensure(asset);
    this.current = handle;
    handle.howl.stop();
    handle.howl.volume(this.volume);
    handle.howl.play();
    return handle;
  }

  pauseSound() {
    this.current?.howl.pause();
  }

  resumeSound() {
    this.current?.howl.play();
  }

  stopSound() {
    this.current?.howl.stop();
    this.current = null;
  }

  isPlaying() {
    return Boolean(this.current?.howl.playing());
  }

  getSoundProgress(): { time: number; duration: number } {
    if (!this.current) return { time: 0, duration: 0 };
    const howl = this.current.howl;
    const time = howl.seek();
    return {
      time: typeof time === 'number' ? time : 0,
      duration: howl.duration() || this.current.duration,
    };
  }

  stopAll() {
    for (const handle of this.cache.values()) handle.howl.stop();
    this.current = null;
  }

  unload() {
    this.stopAll();
    for (const handle of this.cache.values()) handle.howl.unload();
    this.cache.clear();
    this.project = null;
  }
}

export const audioEngine = new AudioEngine();
