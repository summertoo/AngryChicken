export class AudioManager {
  private ctx: AudioContext | null = null;
  private _musicMuted = false;
  private _sfxMuted = false;
  private _init = false;
  private bgm: HTMLAudioElement | null = null;
  private _bgmReady = false;
  private sfxRaw: Record<string, ArrayBuffer> = {};
  private sfxBuf: Record<string, AudioBuffer> = {};

  get musicMuted(): boolean { return this._musicMuted; }
  get sfxMuted(): boolean { return this._sfxMuted; }
  get bgmReady(): boolean { return this._bgmReady; }

  preloadBgm(): Promise<void> {
    if (this._bgmReady) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.loop = true;
        audio.volume = 0.3;
        const done = () => { this.bgm = audio; this._bgmReady = true; resolve(); };
        audio.addEventListener('canplaythrough', done, { once: true });
        audio.addEventListener('error', done, { once: true });
        audio.src = 'music.mp3';
        audio.load();
      } catch { this._bgmReady = true; resolve(); }
    });
  }

  async preloadSfx(): Promise<void> {
    const files = ['start.mp3', 'shot.mp3'];
    await Promise.all(files.map(async (name) => {
      try {
        const resp = await fetch(name);
        this.sfxRaw[name] = await resp.arrayBuffer();
      } catch { /* sfx silently unavailable */ }
    }));
  }

  init(): void {
    if (this._init) return;
    try {
      this.ctx = new AudioContext();
      this._init = true;
      for (const name of Object.keys(this.sfxRaw)) {
        this.ctx.decodeAudioData(this.sfxRaw[name].slice(0))
          .then(buf => { this.sfxBuf[name] = buf; })
          .catch(() => {});
      }
      this.sfxRaw = {};
      if (this.bgm && !this._musicMuted) this.bgm.play().catch(() => {});
    } catch { /* Web Audio not available */ }
  }

  toggleMusic(): boolean {
    this._musicMuted = !this._musicMuted;
    if (this.bgm) {
      if (this._musicMuted) this.bgm.pause();
      else this.bgm.play().catch(() => {});
    }
    return this._musicMuted;
  }

  toggleSfx(): boolean {
    this._sfxMuted = !this._sfxMuted;
    return this._sfxMuted;
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) return null;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.15): void {
    if (this._sfxMuted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private playBuffer(name: string, volume = 0.5): void {
    if (this._sfxMuted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = this.sfxBuf[name];
    if (!buf) return;
    try {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }

  startDrag(): void {
    this.playBuffer('start.mp3', 0.4);
  }

  launch(): void {
    this.playBuffer('shot.mp3', 0.5);
  }

  hit(): void {
    this.tone(80, 0.2, 'sine', 0.12);
  }

  kill(): void {
    this.tone(600, 0.08, 'square', 0.1);
    setTimeout(() => this.tone(900, 0.1, 'square', 0.08), 60);
    setTimeout(() => this.tone(1200, 0.12, 'square', 0.06), 120);
  }

  win(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.3, 'square', 0.1), i * 120);
    });
  }

  lose(): void {
    const notes = [400, 350, 300, 200];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.35, 'sawtooth', 0.08), i * 150);
    });
  }

  glassBreak(): void {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.tone(1000 + Math.random() * 2000, 0.08, 'sawtooth', 0.04), i * 30);
    }
  }

  splinter(): void {
    this.tone(150, 0.12, 'sawtooth', 0.08);
  }

  dust(): void {
    this.tone(60, 0.15, 'sine', 0.06);
  }
}

export const audio = new AudioManager();
