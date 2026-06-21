import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SlingshotFrameGeometry, Vec2 } from '../game/Slingshot';
import type { BlockKind, BugKind, ChickenKind } from '../levels/types';
import type { SpriteAtlas } from './SpriteAtlas';
import type { SkinData } from '../web3/SuiClient';
import { SkinRenderer } from '../web3/SkinRenderer';
import type { EnvironmentConfig } from '../game/Environment';
import { getSkyColor, getGroundColor, getGroundLineColor, getStarCount, Season, Weather, TimeOfDay } from '../game/Environment';

export class Renderer {
  private _ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private atlas: SpriteAtlas | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this._ctx = ctx;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  get ctx(): CanvasRenderingContext2D {
    return this._ctx;
  }

  private _env: EnvironmentConfig | null = null;
  private weatherParticles: { x: number; y: number; speed: number; wind: number; len: number }[] = [];
  private starPositions: { x: number; y: number; r: number; a: number }[] = [];
  private cloudPositions: { x: number; y: number; w: number; h: number; a: number }[] = [];
  private farmSeed = 0;

  setEnvironment(env: EnvironmentConfig): void {
    this._env = env;
    const rng = this.seededRandom(env.seed + 999);
    this.farmSeed = env.seed + 777;

    this.starPositions = [];
    const stars = getStarCount(env.timeOfDay);
    for (let i = 0; i < stars; i++) {
      this.starPositions.push({
        x: rng() * this.canvas.width,
        y: rng() * this.canvas.height * 0.55,
        r: 0.5 + rng() * 1.5,
        a: 0.3 + rng() * 0.7,
      });
    }

    this.cloudPositions = [];
    const cloudCount = env.weather === Weather.Sunny ? 3 + Math.floor(rng() * 4) : 5 + Math.floor(rng() * 5);
    for (let i = 0; i < cloudCount; i++) {
      this.cloudPositions.push({
        x: rng() * this.canvas.width * 1.3 - this.canvas.width * 0.15,
        y: 20 + rng() * this.canvas.height * 0.2,
        w: 60 + rng() * 120,
        h: 20 + rng() * 30,
        a: 0.4 + rng() * 0.5,
      });
    }

    if (env.weather === Weather.Rainy) {
      this.weatherParticles = [];
      for (let i = 0; i < 200; i++) {
        this.weatherParticles.push({
          x: rng() * this.canvas.width,
          y: rng() * this.canvas.height,
          speed: 300 + rng() * 200,
          wind: 50 + rng() * 100,
          len: 8 + rng() * 12,
        });
      }
    } else if (env.weather === Weather.Snowy) {
      this.weatherParticles = [];
      for (let i = 0; i < 120; i++) {
        this.weatherParticles.push({
          x: rng() * this.canvas.width,
          y: rng() * this.canvas.height,
          speed: 30 + rng() * 50,
          wind: 15 + rng() * 30,
          len: 2 + rng() * 3,
        });
      }
    } else {
      this.weatherParticles = [];
    }
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  drawFarmBackground(env: EnvironmentConfig, groundY: number): void {
    const ctx = this._ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const sky = getSkyColor(env.timeOfDay, env.season);

    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(1, sky.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, groundY);

    if (env.timeOfDay === TimeOfDay.Night || env.timeOfDay === TimeOfDay.Twilight) {
      for (const star of this.starPositions) {
        ctx.fillStyle = `rgba(255,255,255,${star.a})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (env.timeOfDay === TimeOfDay.Day || env.timeOfDay === TimeOfDay.Twilight) {
      const sunX = env.timeOfDay === TimeOfDay.Day ? w * 0.85 : w * 0.15;
      const sunY = env.timeOfDay === TimeOfDay.Day ? 60 : groundY * 0.7;
      const sunR = 30;
      ctx.save();
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3);
      const sunColor = env.timeOfDay === TimeOfDay.Day ? '255,200,50' : '220,150,80';
      sunGrad.addColorStop(0, `rgba(${sunColor},1)`);
      sunGrad.addColorStop(0.3, `rgba(${sunColor},0.6)`);
      sunGrad.addColorStop(1, `rgba(${sunColor},0)`);
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (env.timeOfDay === TimeOfDay.Night) {
      const moonX = w * 0.8;
      const moonY = 60;
      ctx.save();
      ctx.fillStyle = '#F5F5DC';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sky.top;
      ctx.beginPath();
      ctx.arc(moonX + 7, moonY - 4, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const cloud of this.cloudPositions) {
      ctx.save();
      ctx.globalAlpha = cloud.a;
      const cColor = env.timeOfDay === TimeOfDay.Night ? 'rgba(60,60,80,' : 'rgba(255,255,255,';
      ctx.fillStyle = `${cColor}0.8)`;
      const cx = cloud.x;
      const cy = cloud.y;
      const cw = cloud.w;
      const ch = cloud.h;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.5, ch * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - cw * 0.3, cy + ch * 0.1, cw * 0.35, ch * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + cw * 0.3, cy + ch * 0.05, cw * 0.3, ch * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const rng = this.seededRandom(this.farmSeed);

    const groundColor = getGroundColor(env.season);
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, groundY, w, h - groundY);

    const lineColor = getGroundLineColor(env.season);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= w; x += 40) {
      const wave = Math.sin(x * 0.02 + this.farmSeed) * 3 + Math.sin(x * 0.05 + this.farmSeed * 2) * 1.5;
      ctx.lineTo(x, groundY + wave);
    }
    ctx.stroke();

    if (env.season !== Season.Winter) {
      ctx.fillStyle = env.season === Season.Autumn ? '#8B6914' : '#5D8A3C';
      const grassCount = 80;
      for (let i = 0; i < grassCount; i++) {
        const gx = rng() * w;
        const gy = groundY + 2 + rng() * 8;
        const gh = 6 + rng() * 14;
        const lean = (rng() - 0.5) * 6;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + lean, gy - gh * 0.6, gx + lean * 1.5, gy - gh);
        ctx.strokeStyle = env.season === Season.Autumn ? '#A0782C' : `hsl(${90 + rng() * 30}, 50%, ${35 + rng() * 20}%)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (env.season === Season.Spring) {
      const flowerCount = 6 + Math.floor(rng() * 8);
      for (let i = 0; i < flowerCount; i++) {
        const fx = rng() * w;
        const fy = groundY + 4 + rng() * 12;
        const colors = ['#FF69B4', '#FFD700', '#FF6347', '#DA70D6', '#FF4500'];
        ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(a) * 2.5, fy + Math.sin(a) * 2.5, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (env.season === Season.Winter) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (let i = 0; i < 40; i++) {
        const sx = rng() * w;
        const sy = groundY + 4 + rng() * (h - groundY - 4);
        const sr = 4 + rng() * 12;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr, sr * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const fenceRng = this.seededRandom(this.farmSeed + 444);
    const fenceCount = 3 + Math.floor(fenceRng() * 4);
    for (let f = 0; f < fenceCount; f++) {
      const fx = 60 + fenceRng() * (w - 120);
      const fy = groundY - 18 - fenceRng() * 10;
      ctx.strokeStyle = env.timeOfDay === TimeOfDay.Night ? '#3E2723' : '#5D4037';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy + 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx + 12, fy - 4);
      ctx.lineTo(fx + 12, fy + 28);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx - 2, fy + 6);
      ctx.lineTo(fx + 14, fy + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx - 2, fy + 18);
      ctx.lineTo(fx + 14, fy + 18);
      ctx.stroke();
    }
  }

  updateWeather(dt: number): void {
    if (!this._env) return;
    for (const p of this.weatherParticles) {
      p.x += p.wind * dt;
      p.y += p.speed * dt;
      if (p.y > this.canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * this.canvas.width;
      }
      if (p.x > this.canvas.width + 20) p.x = -20;
      if (p.x < -20) p.x = this.canvas.width + 20;
    }
  }

  drawWeather(): void {
    if (!this._env) return;
    const ctx = this._ctx;
    if (this._env.weather === Weather.Rainy) {
      ctx.strokeStyle = 'rgba(180, 200, 230, 0.4)';
      ctx.lineWidth = 1.5;
      for (const p of this.weatherParticles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.wind * 0.03, p.y - p.len);
        ctx.stroke();
      }
    } else if (this._env.weather === Weather.Snowy) {
      for (const p of this.weatherParticles) {
        ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  clear(): void {
    this._ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setSpriteAtlas(atlas: SpriteAtlas | null): void {
    this.atlas = atlas;
  }

  drawGround(physics: PhysicsWorld, body: Box2D.b2Body): void {
    const meta = physics.metas.get(body);
    if (!meta || meta.role !== 'ground' || meta.width === undefined || meta.height === undefined) return;
    const p = body.GetPosition();
    const px = physics.m2px(p.x);
    const py = physics.m2px(p.y);
    const ctx = this._ctx;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(body.GetAngle());
    ctx.fillStyle = meta.color;
    ctx.fillRect(-meta.width / 2, -meta.height / 2, meta.width, meta.height);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-meta.width / 2, -meta.height / 2, meta.width, meta.height);
    const topY = -meta.height / 2;
    const ctx2 = ctx;
    ctx2.fillStyle = '#6DA832';
    ctx2.fillRect(-meta.width / 2, topY, meta.width, 6);

    ctx2.fillStyle = '#5D9A2A';
    const left = -meta.width / 2;
    const right = meta.width / 2;
    const spacing = 5;
    for (let x = left; x < right; x += spacing) {
      const seed = ((x | 0) * 9301 + 49297) % 233280;
      const f = (seed & 7) / 7;
      const h1 = 12 + (seed % 7) * 3 + ((seed >> 4) & 1) * 5;
      const h2 = 8 + ((seed >> 6) % 5) * 3;
      const h3 = 6 + (seed % 5) * 2;
      const dx1 = (f - 0.5) * spacing * 0.6;
      const dx2 = ((seed >> 3) & 3) / 3 - 0.5;
      const dx3 = ((seed >> 8) & 3) / 3 - 0.5;

      const c1 = (seed & 1) ? '#7CB342' : '#6DA832';
      const c2 = (seed & 4) ? '#8BC34A' : '#7CB342';
      const c3 = (seed & 16) ? '#6DA832' : '#5D9A2A';

      ctx2.fillStyle = c1;
      ctx2.beginPath();
      ctx2.moveTo(x - 1, topY);
      ctx2.lineTo(x + dx1, topY - h1);
      ctx2.lineTo(x + 3, topY);
      ctx2.fill();

      ctx2.fillStyle = c2;
      ctx2.beginPath();
      ctx2.moveTo(x + 1, topY);
      ctx2.lineTo(x + spacing * 0.4 + dx2 * spacing * 0.3, topY - h2);
      ctx2.lineTo(x + spacing * 0.6, topY);
      ctx2.fill();

      ctx2.fillStyle = c3;
      ctx2.beginPath();
      ctx2.moveTo(x + spacing * 0.3, topY);
      ctx2.lineTo(x + spacing * 0.6 + dx3 * spacing * 0.3, topY - h3);
      ctx2.lineTo(x + spacing * 0.9, topY);
      ctx2.fill();
    }

    ctx.restore();
  }

  drawBox(physics: PhysicsWorld, body: Box2D.b2Body): void {
    const meta = physics.metas.get(body);
    if (!meta || meta.shape !== 'box' || meta.width === undefined || meta.height === undefined) return;
    const p = body.GetPosition();
    const px = physics.m2px(p.x);
    const py = physics.m2px(p.y);
    const ctx = this._ctx;
    if (this.atlas && meta.kind && meta.role !== 'ground') {
      if (this.atlas.drawBlock(ctx, meta.kind as BlockKind, px, py, meta.width, meta.height, body.GetAngle())) {
        return;
      }
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(body.GetAngle());
    ctx.fillStyle = meta.color;
    ctx.fillRect(-meta.width / 2, -meta.height / 2, meta.width, meta.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-meta.width / 2, -meta.height / 2, meta.width, meta.height);
    ctx.restore();
  }

  drawCircle(physics: PhysicsWorld, body: Box2D.b2Body): void {
    const meta = physics.metas.get(body);
    if (!meta || meta.shape !== 'circle' || meta.radius === undefined) return;
    const p = body.GetPosition();
    const px = physics.m2px(p.x);
    const py = physics.m2px(p.y);
    const ctx = this._ctx;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(body.GetAngle());
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.arc(0, 0, meta.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawImage(img: HTMLImageElement, x: number, y: number, w: number, h: number, alpha = 1): void {
    this._ctx.save();
    this._ctx.globalAlpha = alpha;
    this._ctx.drawImage(img, x, y, w, h);
    this._ctx.restore();
  }

  drawSlingshotFrame(geom: SlingshotFrameGeometry): void {
    const ctx = this._ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = '#3E2516';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(geom.trunkBase.x, geom.trunkBase.y);
    ctx.lineTo(geom.fork.x, geom.fork.y);
    ctx.stroke();

    ctx.strokeStyle = '#5C3317';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(geom.trunkBase.x, geom.trunkBase.y);
    ctx.lineTo(geom.fork.x, geom.fork.y);
    ctx.stroke();

    ctx.strokeStyle = '#8B5A2B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(geom.trunkBase.x - 4, geom.trunkBase.y + 4);
    ctx.lineTo(geom.fork.x - 4, geom.fork.y + 4);
    ctx.stroke();

    ctx.strokeStyle = '#7A4525';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(geom.fork.x, geom.fork.y);
    ctx.lineTo(geom.leftTip.x, geom.leftTip.y);
    ctx.moveTo(geom.fork.x, geom.fork.y);
    ctx.lineTo(geom.rightTip.x, geom.rightTip.y);
    ctx.stroke();

    ctx.fillStyle = '#3A2010';
    ctx.beginPath();
    ctx.arc(geom.leftTip.x, geom.leftTip.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(geom.rightTip.x, geom.rightTip.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawRubberBand(leftTip: Vec2, rightTip: Vec2, chickenPos: Vec2): void {
    const ctx = this._ctx;
    ctx.save();
    ctx.strokeStyle = '#1A0F08';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftTip.x, leftTip.y);
    ctx.lineTo(chickenPos.x, chickenPos.y);
    ctx.lineTo(rightTip.x, rightTip.y);
    ctx.stroke();
    ctx.restore();
  }

  drawTrajectory(points: Vec2[]): void {
    if (points.length === 0) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const r = i === 0 ? 5 : 3.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawChickenCircle(pos: Vec2, radius: number, color: string, kind?: ChickenKind): void {
    const ctx = this._ctx;
    if (this.atlas && kind) {
      this.atlas.drawChicken(ctx, kind, pos.x, pos.y, radius);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(radius * 0.3, -radius * 0.2, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(radius * 0.32, -radius * 0.2, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(radius * 0.7, -radius * 0.05);
    ctx.lineTo(radius * 1.15, -radius * 0.1);
    ctx.lineTo(radius * 0.7, radius * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawChickenSkin(pos: Vec2, radius: number, skin: SkinData): void {
    SkinRenderer.drawChickenSkin(this._ctx, pos.x, pos.y, radius, skin);
  }

  drawPresetSkinImage(pos: Vec2, radius: number, img: HTMLImageElement): void {
    const ctx = this._ctx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    const s = Math.min(radius * 2 / img.naturalWidth, radius * 2 / img.naturalHeight);
    ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
  }

  drawBugCircle(pos: Vec2, radius: number, color: string, kind?: string): void {
    const ctx = this._ctx;
    if (this.atlas && kind) {
      this.atlas.drawBug(ctx, kind as BugKind, pos.x, pos.y, radius);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const eyeR = radius * 0.18;
    const eyeOffset = radius * 0.3;
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(-eyeOffset, -radius * 0.15, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeOffset, -radius * 0.15, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-eyeOffset + 1, -radius * 0.15, eyeR * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeOffset + 1, -radius * 0.15, eyeR * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, radius * 0.15, radius * 0.35, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }
}
