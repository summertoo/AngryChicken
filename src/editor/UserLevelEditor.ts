import { BodyFactory } from '../game/BodyFactory';
import { Slingshot } from '../game/Slingshot';
import { CollisionTracker } from '../physics/CollisionTracker';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Renderer } from '../render/Renderer';
import { SpriteAtlas } from '../render/SpriteAtlas';
import { generateEnvironment, type EnvironmentConfig } from '../game/Environment';
import {
  BLOCK_DEFAULT_SIZE,
  BlockKind,
  BlockSpec,
  BugKind,
  BugSpec,
  CANVAS_H,
  CANVAS_W,
  DEFAULT_SLINGSHOT,
  GROUND_Y,
  LevelConfig,
} from '../levels/types';

type Tool = 'select' | 'delete' | 'rotate' | BugKind | BlockKind;

const FIXED_DT = 1 / 60;
const STORAGE_KEY = 'crazych.userlevel.draft';
const BUG_KINDS: BugKind[] = ['wormGreen', 'wormBrown', 'wormPink', 'locustMutant', 'locust', 'grasshopper'];
const BLOCK_KINDS: BlockKind[] = ['wood', 'stone', 'glass', 'brick', 'woodHouse', 'stoneTower', 'house', 'haystack'];
const ROTATE_SNAP = 15;
const CHICKENS_FOR_TEST = 5;

const BUG_LABELS: Record<BugKind, string> = {
  wormGreen: '\u{1F7E2} \u866B1', wormBrown: '\u{1F7E4} \u866B2', wormPink: '\u{1F7E3} \u866B3',
  pigSmall: '', pigMid: '', pigBig: '', wormRed: '',
  locustMutant: '\u{1F997} \u53D8\u5F02\u8757\u866B', locust: '\u{1F997} \u8757\u866B', grasshopper: '\u{1FAB1} \u8682\u86A8',
};

const BLOCK_LABELS: Record<string, string> = {
  wood: '\u{1FAB5} \u6728\u677F', stone: '\u{1FAA8} \u77F3\u5934', glass: '\u{1F4A7} \u73BB\u7483',
  brick: '\u{1F9F1} \u7816', woodHouse: '\u{1F3E0} \u6728\u5C4B', stoneTower: '\u{1F3F0} \u77F3\u5854',
  house: '\u{1F3E0} \u623F\u5B50', haystack: '\u{1F956} \u8349\u5806',
};

const TOOL_LABELS: Record<string, string> = {
  select: '\u9009\u62E9/\u79FB\u52A8', delete: '\u5220\u9664', rotate: '\u65CB\u8F6C',
  ...BUG_LABELS, ...BLOCK_LABELS,
};

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; r: number;
}

export interface UserEditorCallbacks {
  onPublish?: (name: string, desc: string, bugs: BugSpec[], blocks: BlockSpec[]) => Promise<string | null>;
  onShare?: (name: string, desc: string, bugs: BugSpec[], blocks: BlockSpec[], blobId: string | null) => Promise<void>;
}

export class UserLevelEditor {
  private canvas: HTMLCanvasElement;
  private physics: PhysicsWorld;
  private renderer: Renderer;
  private factory: BodyFactory;
  private atlas: SpriteAtlas | null;
  private callbacks: UserEditorCallbacks;

  private tool: Tool = 'select';
  private draggingBody: Box2D.b2Body | null = null;
  private dragOffset = { x: 0, y: 0 };
  private rotateStartAngle = 0;
  private tileNextId = 1;
  private blockNextId = 101;
  private accumulator = 0;
  private lastTime = performance.now();
  private selectedBody: Box2D.b2Body | null = null;
  private levelName = '';
  private levelDesc = '';
  private isTesting = false;
  private savedState: { bugs: BugSpec[]; blocks: BlockSpec[] } | null = null;
  private testSlingshot: Slingshot | null = null;
  private testCollisions: CollisionTracker | null = null;
  private testEnvironment: EnvironmentConfig | null = null;
  private particles: Particle[] = [];
  private testBodiesToKill: number[] = [];

  private containerEl!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private angleLabelEl!: HTMLSpanElement;
  private nameInput!: HTMLInputElement;
  private descInput!: HTMLInputElement;
  private testBtn!: HTMLButtonElement;
  private shareBtn!: HTMLButtonElement;
  private lastBlobId: string | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    renderer: Renderer,
    factory: BodyFactory,
    atlas: SpriteAtlas | null,
    callbacks: UserEditorCallbacks = {},
  ) {
    this.canvas = canvas;
    this.physics = physics;
    this.renderer = renderer;
    this.factory = factory;
    this.atlas = atlas;
    this.callbacks = callbacks;
  }

  start(initialLevel?: LevelConfig): void {
    this.renderer.setSpriteAtlas(this.atlas);
    if (initialLevel) {
      this.loadFromLevelConfig(initialLevel);
    } else {
      this.loadDraft();
    }
    this.physics.setGravity(0);
    this.buildUI();
    this.bindPointerEvents();
    this.bindKeyboard();
    requestAnimationFrame(this.frame);
  }

  destroy(): void {
    if (this.containerEl) this.containerEl.remove();
  }

  // ─── Frame loop ──────────────────────────────────────

  private frame = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      this.physics.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }

    if (this.isTesting) {
      this.testSlingshot?.updateChickenDamping(this.physics.metas);
      this.processTestCollisions();
      this.renderer.updateWeather(FIXED_DT * steps || FIXED_DT);
    }

    this.updateParticles(FIXED_DT * steps || FIXED_DT);
    this.render();
    requestAnimationFrame(this.frame);
  };

  // ─── Collision processing during test ────────────────

  private processTestCollisions(): void {
    const events = this.testCollisions?.drainEvents() ?? [];
    for (const ev of events) {
      if (ev.type === 'bug_killed') {
        const body = this.findBodyById(ev.bugId);
        if (body) {
          const p = body.GetPosition();
          const px = this.physics.m2px(p.x);
          const py = this.physics.m2px(p.y);
          this.spawnParticles(px, py, ev.killer === 'ground' ? '#8B7355' : '#228B22');
          this.physics.destroyBody(body);
        }
      }
    }
  }

  private findBodyById(id: number): Box2D.b2Body | null {
    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (meta && meta.id === id) return body;
    }
    return null;
  }

  // ─── Particles ───────────────────────────────────────

  private spawnParticles(x: number, y: number, color: string): void {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x, y, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 1, maxLife: 0.4 + Math.random() * 0.4,
        r: 2 + Math.random() * 4,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 150 * dt;
      p.life -= dt / p.maxLife;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─── Render ──────────────────────────────────────────

  private render(): void {
    this.renderer.clear();
    const ctx = this.renderer.ctx;

    if (this.isTesting && this.testEnvironment) {
      this.renderer.drawFarmBackground(this.testEnvironment, GROUND_Y);
    } else {
      for (const body of this.physics.bodies) {
        const meta = this.physics.metas.get(body);
        if (!meta || meta.role !== 'ground') continue;
        this.renderer.drawGround(this.physics, body);
      }
    }
    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground' || meta.shape !== 'box') continue;
      this.renderer.drawBox(this.physics, body);
    }
    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground' || meta.shape !== 'circle') continue;
      const p = body.GetPosition();
      const radius = meta.radius ?? 22;
      const pos = { x: this.physics.m2px(p.x), y: this.physics.m2px(p.y) };
      if (meta.role === 'bug') {
        this.renderer.drawBugCircle(pos, radius, meta.color, meta.kind);
      } else {
        this.renderer.drawChickenCircle(pos, radius, meta.color, meta.kind as any);
      }
    }

    if (this.isTesting && this.testSlingshot) {
      const frameGeom = this.testSlingshot.getFrameGeometry();
      this.renderer.drawSlingshotFrame(frameGeom);

      if (this.testSlingshot.isDragging) {
        this.renderer.drawRubberBand(frameGeom.leftTip, frameGeom.rightTip, this.testSlingshot.getChickenRenderPos());
        this.renderer.drawTrajectory(this.testSlingshot.computeTrajectory());
      }

      if (this.testSlingshot.isLoaded) {
        const skinPos = this.testSlingshot.getChickenRenderPos();
        const skinR = this.testSlingshot.getLoadedRadius();
        this.renderer.drawChickenCircle(skinPos, skinR, this.testSlingshot.getLoadedColor(), this.testSlingshot.getLoadedKind());
      }
    }

    this.drawParticles(ctx);
    this.renderer.drawWeather();

    if (this.selectedBody && !this.isTesting) this.drawSelectionHighlight();
  }

  private drawSelectionHighlight(): void {
    const b = this.selectedBody!;
    const meta = this.physics.metas.get(b);
    if (!meta) return;
    const p = b.GetPosition();
    const cx = this.physics.m2px(p.x);
    const cy = this.physics.m2px(p.y);
    const angle = b.GetAngle();
    const ctx = this.renderer.ctx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    if (meta.shape === 'box' && meta.width && meta.height) {
      ctx.strokeRect(-meta.width / 2 - 5, -meta.height / 2 - 5, meta.width + 10, meta.height + 10);
    } else if (meta.shape === 'circle' && meta.radius) {
      ctx.beginPath();
      ctx.arc(0, 0, meta.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (this.tool === 'rotate') {
      ctx.strokeStyle = '#64c8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 40, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(35, -12);
      ctx.lineTo(40, 0);
      ctx.lineTo(30, -8);
      ctx.stroke();
    }
    ctx.restore();

    if (this.tool === 'rotate') {
      const deg = ((angle * 180 / Math.PI) % 360).toFixed(0);
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#64c8ff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(`${deg}\u00B0`, cx, cy - 30);
      ctx.restore();
    }
  }

  // ─── UI ──────────────────────────────────────────────

  private buildUI(): void {
    const existing = document.getElementById('user-editor-ui');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'user-editor-ui';
    root.innerHTML = `
      <div class="ue-palette">
        <button class="ue-palette-btn active" data-tool="select">\u{1F446}</button>
        <button class="ue-palette-btn" data-tool="delete">\u{1F5D1}\uFE0F</button>
        <button class="ue-palette-btn" data-tool="rotate">\u{1F504}</button>
        <div class="ue-divider"></div>
        <div class="ue-group-label">\u866B</div>
        ${BUG_KINDS.map(k => `<button class="ue-palette-btn ue-bug" data-tool="${k}">${BUG_LABELS[k]}</button>`).join('')}
        <div class="ue-divider"></div>
        <div class="ue-group-label">\u65B9\u5757</div>
        ${BLOCK_KINDS.map(k => `<button class="ue-palette-btn ue-block" data-tool="${k}">${BLOCK_LABELS[k]}</button>`).join('')}
      </div>
      <div class="ue-topbar">
        <input id="ue-name" class="ue-input" type="text" placeholder="\u{1F3F7}\uFE0F \u5173\u5361\u540D\u79F0\uFF08\u6700\u591A50\u5B57\uFF09" value="${this.levelName}" maxlength="50">
        <input id="ue-desc" class="ue-input ue-desc" type="text" placeholder="\u{1F4DD} \u7B80\u77ED\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09" value="${this.levelDesc}" maxlength="120">
      </div>
      <div class="ue-bottombar">
        <div class="ue-bottombar-left">
          <span id="ue-status" class="ue-status">\u{1F446} \u5DE5\u5177: \u9009\u62E9</span>
          <span id="ue-angle" class="ue-status ue-angle hidden"></span>
        </div>
        <div class="ue-actions">
          <button id="ue-test" class="ue-btn ue-btn-test">\u25B6 \u6D4B\u8BD5</button>
          <button id="ue-save" class="ue-btn">\u{1F4BE} \u4FDD\u5B58</button>
          <button id="ue-share" class="ue-btn">\u{1F517} \u5206\u4EAB</button>
          <button id="ue-publish" class="ue-btn ue-btn-primary">\u{1F310} \u53D1\u5E03</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    this.containerEl = root;
    this.statusEl = root.querySelector('#ue-status') as HTMLSpanElement;
    this.angleLabelEl = root.querySelector('#ue-angle') as HTMLSpanElement;
    this.nameInput = root.querySelector('#ue-name') as HTMLInputElement;
    this.descInput = root.querySelector('#ue-desc') as HTMLInputElement;
    this.testBtn = root.querySelector('#ue-test') as HTMLButtonElement;

    root.querySelectorAll('.ue-palette-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = (btn as HTMLElement).dataset.tool as Tool;
        this.setTool(tool, btn);
      });
    });

    root.querySelector('#ue-save')?.addEventListener('click', () => this.saveDraft());
    root.querySelector('#ue-publish')?.addEventListener('click', async () => {
      if (!this.callbacks.onPublish) { this.setStatus('\u53D1\u5E03\u56DE\u8C03\u672A\u8BBE\u7F6E'); return; }
      const { bugs, blocks } = this.serialize();
      this.setStatus('\u6B63\u5728\u53D1\u5E03...');
      try {
        const blobId = await this.callbacks.onPublish(this.getLevelName(), this.getLevelDesc(), bugs, blocks);
        if (blobId) this.lastBlobId = blobId;
        this.setStatus('\u2705 \u53D1\u5E03\u6210\u529F');
      } catch (err) {
        this.setStatus(`\u53D1\u5E03\u5931\u8D25: ${err}`);
      }
    });
    root.querySelector('#ue-share')?.addEventListener('click', async () => {
      if (!this.callbacks.onShare) { this.setStatus('\u5206\u4EAB\u56DE\u8C03\u672A\u8BBE\u7F6E'); return; }
      const { bugs, blocks } = this.serialize();
      try {
        await this.callbacks.onShare(this.getLevelName(), this.getLevelDesc(), bugs, blocks, this.lastBlobId);
      } catch (err) {
        this.setStatus(`\u5206\u4EAB\u5931\u8D25: ${err}`);
      }
    });

    this.testBtn.addEventListener('click', () => this.toggleTest());
  }

  private setTool(tool: Tool, btn?: Element): void {
    if (!btn) {
      btn = this.containerEl?.querySelector(`[data-tool="${tool}"]`) ?? undefined;
    }
    this.tool = tool;
    this.selectedBody = null;
    this.draggingBody = null;
    this.containerEl?.querySelectorAll('.ue-palette-btn').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    this.setStatus(`${this.toolIcon(tool)} \u5DE5\u5177: ${TOOL_LABELS[tool] ?? tool}`);
    this.angleLabelEl?.classList.toggle('hidden', tool !== 'rotate');
  }

  private toolIcon(tool: Tool): string {
    if (tool === 'select') return '\u{1F446}';
    if (tool === 'delete') return '\u{1F5D1}\uFE0F';
    if (tool === 'rotate') return '\u{1F504}';
    if (BUG_KINDS.includes(tool as BugKind)) return '\u{1FAB1}';
    if (BLOCK_KINDS.includes(tool as BlockKind)) return '\u{1F9F1}';
    return '';
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  private getLevelName(): string {
    return this.nameInput?.value.trim() || '\u672A\u547D\u540D\u5173\u5361';
  }

  private getLevelDesc(): string {
    return this.descInput?.value.trim() || '';
  }

  // ─── Test mode ───────────────────────────────────────

  private toggleTest(): void {
    if (!this.isTesting) {
      this.savedState = this.serialize();
      this.enterTest();
    } else {
      this.exitTest();
    }
  }

  private enterTest(): void {
    this.isTesting = true;
    this.selectedBody = null;
    this.draggingBody = null;

    this.testCollisions = new CollisionTracker(
      this.physics.world, PhysicsWorld.box2d!, this.physics.metas, 30,
    );
    this.testCollisions.install();

    this.testSlingshot = new Slingshot(
      this.physics, this.factory,
      DEFAULT_SLINGSHOT.x, DEFAULT_SLINGSHOT.y,
      CHICKENS_FOR_TEST, 1, GROUND_Y,
    );
    this.testSlingshot.loadChicken();

    this.testEnvironment = generateEnvironment(Math.floor(Math.random() * 10000) + 1);
    this.renderer.setEnvironment(this.testEnvironment);

    this.physics.setGravity(9.8);
    this.testBtn.textContent = '\u23F9 \u505C\u6B62';
    this.testBtn.classList.add('ue-btn-testing');
    this.setStatus('\u25B6 \u6D4B\u8BD5\u4E2D\u2026\u62D6\u52A8\u5C0F\u9E21\u5C1D\u8BD5\u7834\u89E3');
  }

  private exitTest(): void {
    this.isTesting = false;
    this.testSlingshot = null;
    this.testEnvironment = null;
    if (this.testCollisions) {
      this.testCollisions.reset();
      this.testCollisions = null;
    }

    const box2d = PhysicsWorld.box2d!;
    const bodiesToDestroy = [...this.physics.bodies].filter(body => {
      const meta = this.physics.metas.get(body);
      return meta && meta.role !== 'ground';
    });
    for (const body of bodiesToDestroy) {
      this.physics.destroyBody(body);
    }

    if (this.savedState) {
      for (const bug of this.savedState.bugs) this.factory.createBug(bug);
      for (const block of this.savedState.blocks) this.factory.createBlock(block);
      this.tileNextId = Math.max(0, ...this.savedState.bugs.map(b => b.id)) + 1;
      this.blockNextId = Math.max(100, ...this.savedState.blocks.map(b => b.id)) + 1;
      this.savedState = null;
    }

    this.particles = [];
    this.physics.setGravity(0);
    this.testBtn.textContent = '\u25B6 \u6D4B\u8BD5';
    this.testBtn.classList.remove('ue-btn-testing');
    this.setStatus(`${this.toolIcon(this.tool)} \u5DE5\u5177: ${TOOL_LABELS[this.tool]}`);
  }

  // ─── Persistence ─────────────────────────────────────

  private loadDraft(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { this.initBlank(); return; }
      const data = JSON.parse(raw) as { name: string; desc: string; bugs: BugSpec[]; blocks: BlockSpec[] };
      this.levelName = data.name || '';
      this.levelDesc = data.desc || '';
      this.tileNextId = Math.max(0, ...data.bugs.map(b => b.id)) + 1;
      this.blockNextId = Math.max(100, ...data.blocks.map(b => b.id)) + 1;
      this.physics.createGround(CANVAS_W / 2, GROUND_Y, CANVAS_W, 40, '#8B7355', 0, 'ground');
      for (const bug of data.bugs) this.factory.createBug(bug);
      for (const block of data.blocks) this.factory.createBlock(block);
    } catch {
      this.initBlank();
    }
  }

  private initBlank(): void {
    this.tileNextId = 1;
    this.blockNextId = 101;
    this.physics.createGround(CANVAS_W / 2, GROUND_Y, CANVAS_W, 40, '#8B7355', 0, 'ground');
  }

  private loadFromLevelConfig(level: LevelConfig): void {
    this.levelName = level.name || '';
    this.levelDesc = level.description || '';
    this.tileNextId = Math.max(0, ...level.bugs.map(b => b.id)) + 1;
    this.blockNextId = Math.max(100, ...level.blocks.map(b => b.id)) + 1;
    this.physics.createGround(CANVAS_W / 2, GROUND_Y, CANVAS_W, 40, '#8B7355', 0, 'ground');
    for (const bug of level.bugs) this.factory.createBug(bug);
    for (const block of level.blocks) this.factory.createBlock(block);
  }

  private saveDraft(): void {
    if (this.isTesting) return;
    const { bugs, blocks } = this.serialize();
    const data = { name: this.getLevelName(), desc: this.getLevelDesc(), bugs, blocks };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      this.setStatus('\u{2705} \u5DF2\u4FDD\u5B58');
    } catch {
      this.setStatus('\u{274C} \u4FDD\u5B58\u5931\u8D25');
    }
  }

  serialize(): { bugs: BugSpec[]; blocks: BlockSpec[] } {
    const bugs: BugSpec[] = [];
    const blocks: BlockSpec[] = [];
    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') continue;
      const p = body.GetPosition();
      const x = Math.round(this.physics.m2px(p.x));
      const y = Math.round(this.physics.m2px(p.y));
      if (meta.role === 'bug' && meta.radius !== undefined && meta.kind) {
        bugs.push({ id: meta.id, type: meta.kind as BugKind, x, y, radius: meta.radius });
      }
      if (meta.role === 'block' && meta.width !== undefined && meta.height !== undefined && meta.kind) {
        const angle = body.GetAngle();
        blocks.push({
          id: meta.id, type: meta.kind as BlockKind, x, y, w: meta.width, h: meta.height,
          rotation: Math.abs(angle) > 0.001 ? angle : undefined,
        });
      }
    }
    return { bugs, blocks };
  }

  // ─── Keyboard ────────────────────────────────────────

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (this.isTesting) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.tool !== 'select') return;
        const body = this.selectedBody ?? this.draggingBody;
        if (!body) return;
        const meta = this.physics.metas.get(body);
        if (!meta || meta.role === 'ground') return;
        e.preventDefault();
        this.selectedBody = null;
        this.draggingBody = null;
        this.physics.destroyBody(body);
        this.setStatus('\u5220\u9664\u4E86\u9009\u4E2D\u5BF9\u8C61');
      }
    });
  }

  // ─── Pointer ─────────────────────────────────────────

  private bindPointerEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      const pos = this.getCanvasPos(e.clientX, e.clientY);
      this.onPointerDown(pos.x, pos.y);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this.getCanvasPos(e.clientX, e.clientY);
      this.onPointerMove(pos.x, pos.y);
    });
    this.canvas.addEventListener('mouseup', () => this.onPointerUp());
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const pos = this.getCanvasPos(t.clientX, t.clientY);
      this.onPointerDown(pos.x, pos.y);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const pos = this.getCanvasPos(t.clientX, t.clientY);
      this.onPointerMove(pos.x, pos.y);
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onPointerUp();
    }, { passive: false });
  }

  private onPointerDown(x: number, y: number): void {
    if (this.isTesting) {
      this.testSlingshot?.onPointerDown(x, y);
      return;
    }
    const body = this.pickBody(x, y);

    if (this.tool === 'select') {
      if (!body) { this.selectedBody = null; return; }
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') return;
      this.selectedBody = body;
      this.draggingBody = body;
      const p = body.GetPosition();
      this.dragOffset = { x: x - this.physics.m2px(p.x), y: y - this.physics.m2px(p.y) };
      return;
    }

    if (this.tool === 'delete') {
      if (!body) return;
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') return;
      this.selectedBody = null;
      this.physics.destroyBody(body);
      this.setStatus(`\u5220\u9664\u4E86 ${meta.kind ?? meta.id}`);
      return;
    }

    if (this.tool === 'rotate') {
      if (!body) { this.selectedBody = null; return; }
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') return;
      this.selectedBody = body;
      this.draggingBody = body;
      this.rotateStartAngle = body.GetAngle();
      const p = body.GetPosition();
      this.dragOffset = { x: Math.atan2(y - this.physics.m2px(p.y), x - this.physics.m2px(p.x)), y: 0 };
      return;
    }

    if (BUG_KINDS.includes(this.tool as BugKind)) {
      this.factory.createBug({ id: this.tileNextId++, type: this.tool as BugKind, x, y, radius: 22 });
      this.setStatus(`\u653E\u7F6E\u4E86 ${BUG_LABELS[this.tool as BugKind]}`);
      return;
    }

    if (BLOCK_KINDS.includes(this.tool as BlockKind)) {
      const kind = this.tool as BlockKind;
      const size = BLOCK_DEFAULT_SIZE[kind];
      this.factory.createBlock({ id: this.blockNextId++, type: kind, x, y, w: size.w, h: size.h });
      this.setStatus(`\u653E\u7F6E\u4E86 ${BLOCK_LABELS[kind]}`);
    }
  }

  private onPointerMove(x: number, y: number): void {
    if (this.isTesting) {
      this.testSlingshot?.onPointerMove(x, y);
      this.canvas.style.cursor = this.testSlingshot?.isDragging ? 'grabbing' : 'grab';
      return;
    }
    if (!this.draggingBody || !this.selectedBody) { this.canvas.style.cursor = 'default'; return; }

    if (this.tool === 'rotate') {
      const p = this.selectedBody.GetPosition();
      const ang = Math.atan2(y - this.physics.m2px(p.y), x - this.physics.m2px(p.x));
      let delta = ang - (this.dragOffset.x as number);
      const snapped = Math.round(delta / (ROTATE_SNAP * Math.PI / 180)) * (ROTATE_SNAP * Math.PI / 180);
      this.selectedBody.SetTransform(p, this.rotateStartAngle + snapped);
      const deg = (((this.rotateStartAngle + snapped) * 180 / Math.PI) % 360).toFixed(0);
      this.angleLabelEl!.textContent = `${deg}\u00B0`;
      this.setStatus(`\u65CB\u8F6C\u4E2D\u2026 ${deg}\u00B0`);
      return;
    }

    const box2d = PhysicsWorld.box2d!;
    const px = x - this.dragOffset.x;
    const py = y - this.dragOffset.y;
    const zero = new box2d.b2Vec2(0, 0);
    this.draggingBody!.SetLinearVelocity(zero);
    zero.__destroy__();
    this.draggingBody!.SetAngularVelocity(0);
    const pos = new box2d.b2Vec2(this.physics.px2m(px), this.physics.px2m(py));
    this.draggingBody!.SetTransform(pos, this.draggingBody!.GetAngle());
    pos.__destroy__();
  }

  private onPointerUp(): void {
    if (this.isTesting) {
      const launched = this.testSlingshot?.onPointerUp();
      if (launched) {
        this.setStatus('\u25B6 \u6D4B\u8BD5\u4E2D\u2026\u5C0F\u9E21\u5DF2\u53D1\u5C04');
      }
      return;
    }
    this.draggingBody = null;
  }

  private pickBody(x: number, y: number): Box2D.b2Body | null {
    const bodies = [...this.physics.bodies].reverse();
    for (const body of bodies) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') continue;
      const p = body.GetPosition();
      const cx = this.physics.m2px(p.x);
      const cy = this.physics.m2px(p.y);
      if (meta.shape === 'circle' && meta.radius !== undefined) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= meta.radius * meta.radius) return body;
      } else if (meta.shape === 'box' && meta.width !== undefined && meta.height !== undefined) {
        const rx = x - cx, ry = y - cy;
        const ca = Math.cos(-body.GetAngle()), sa = Math.sin(-body.GetAngle());
        const rotatedX = rx * ca - ry * sa, rotatedY = rx * sa + ry * ca;
        if (rotatedX >= -meta.width / 2 && rotatedX <= meta.width / 2 && rotatedY >= -meta.height / 2 && rotatedY <= meta.height / 2) return body;
      }
    }
    return null;
  }

  private getCanvasPos(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (this.canvas.width / rect.width),
      y: (clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }
}
