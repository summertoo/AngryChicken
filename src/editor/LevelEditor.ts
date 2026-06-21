import { BodyFactory } from '../game/BodyFactory';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Renderer } from '../render/Renderer';
import { SpriteAtlas } from '../render/SpriteAtlas';
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
import { LEVELS, getLevel } from '../levels/levels';

type Tool =
  | 'select'
  | 'delete'
  | BugKind
  | BlockKind;

const FIXED_DT = 1 / 60;
const STORAGE_PREFIX = 'crazych.editor.level.';
const BUG_KINDS: BugKind[] = ['wormGreen', 'wormBrown', 'wormPink', 'locustMutant', 'locust', 'grasshopper'];
const BLOCK_KINDS: BlockKind[] = ['wood', 'stone', 'glass', 'brick', 'woodHouse', 'stoneTower', 'house', 'haystack'];
const MAX_HISTORY = 50;
const ROTATE_STEP = 15; // degrees
const SHOW_ZONE_DEFAULT = true;

export interface EditorCallbacks {
  onPublish?: (levelData: LevelConfig) => Promise<void>;
}

export class LevelEditor {
  private canvas: HTMLCanvasElement;
  private physics: PhysicsWorld;
  private renderer: Renderer;
  private factory: BodyFactory;
  private atlas: SpriteAtlas | null;
  private currentLevelId = 1;
  private currentLevel!: LevelConfig;
  private tool: Tool = 'select';
  private draggingBody: Box2D.b2Body | null = null;
  private dragOffset = { x: 0, y: 0 };
  private nextBugId = 1;
  private nextBlockId = 101;
  private toolbar!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private accumulator = 0;
  private lastTime = performance.now();
  private undoStack: LevelConfig[] = [];
  private redoStack: LevelConfig[] = [];
  private showPlayZone = SHOW_ZONE_DEFAULT;
  private selectedBody: Box2D.b2Body | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    renderer: Renderer,
    factory: BodyFactory,
    atlas: SpriteAtlas | null,
    initialLevelId: number,
    private callbacks: EditorCallbacks = {},
  ) {
    this.canvas = canvas;
    this.physics = physics;
    this.renderer = renderer;
    this.factory = factory;
    this.atlas = atlas;
    this.currentLevelId = initialLevelId;
  }

  start(): void {
    this.renderer.setSpriteAtlas(this.atlas);
    this.buildToolbar();
    this.bindPointerEvents();
    this.bindKeyboard();
    this.loadLevel(this.currentLevelId);
    requestAnimationFrame(this.frame);
  }

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

    this.render();
    requestAnimationFrame(this.frame);
  };

  private render(): void {
    this.renderer.clear();

    if (this.showPlayZone) this.drawPlayZone();

    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role !== 'ground') continue;
      this.renderer.drawGround(this.physics, body);
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

    if (this.selectedBody) this.drawSelectionHighlight();
  }

  private drawPlayZone(): void {
    const ctx = this.renderer.ctx;
    const sx = DEFAULT_SLINGSHOT.x;
    const sy = DEFAULT_SLINGSHOT.y;
    const maxDist = 1000;
    const minDist = 100;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.15)';
    ctx.fillStyle = 'rgba(255, 255, 100, 0.04)';
    ctx.setLineDash([6, 6]);

    ctx.beginPath();
    ctx.arc(sx, sy, maxDist, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.lineTo(sx + minDist * Math.cos(Math.PI * 0.75), sy + minDist * Math.sin(Math.PI * 0.75));
    ctx.arc(sx, sy, minDist, Math.PI * 0.75, -Math.PI * 0.75, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.08)';
    for (let a = -60; a <= 60; a += 15) {
      const rad = (a * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(sx + minDist * Math.cos(rad), sy + minDist * Math.sin(rad));
      ctx.lineTo(sx + maxDist * Math.cos(rad), sy + maxDist * Math.sin(rad));
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawSelectionHighlight(): void {
    const b = this.selectedBody;
    if (!b) return;
    const meta = this.physics.metas.get(b);
    if (!meta) return;
    const p = b.GetPosition();
    const cx = this.physics.m2px(p.x);
    const cy = this.physics.m2px(p.y);
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(b.GetAngle());
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    if (meta.shape === 'box' && meta.width && meta.height) {
      ctx.strokeRect(-meta.width / 2 - 3, -meta.height / 2 - 3, meta.width + 6, meta.height + 6);
    } else if (meta.shape === 'circle' && meta.radius) {
      ctx.beginPath();
      ctx.arc(0, 0, meta.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ─── Undo / Redo ──────────────────────────────────────

  private pushUndo(): void {
    this.undoStack.push(JSON.parse(JSON.stringify(this.serializeLevel())));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.parse(JSON.stringify(this.serializeLevel())));
    const state = this.undoStack.pop()!;
    this.restoreState(state);
    this.setStatus(`Undo (${this.undoStack.length} left)`);
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.parse(JSON.stringify(this.serializeLevel())));
    const state = this.redoStack.pop()!;
    this.restoreState(state);
    this.setStatus(`Redo (${this.redoStack.length} left)`);
  }

  private restoreState(level: LevelConfig): void {
    this.draggingBody = null;
    this.selectedBody = null;
    for (const body of [...this.physics.bodies]) {
      this.physics.destroyBody(body);
    }
    this.currentLevel = level;
    this.nextBugId = Math.max(0, ...this.currentLevel.bugs.map((b) => b.id)) + 1;
    this.nextBlockId = Math.max(100, ...this.currentLevel.blocks.map((b) => b.id)) + 1;
    this.physics.createGround(CANVAS_W / 2, GROUND_Y, CANVAS_W, 40, '#8B7355', 0, 'ground');
    for (const bug of this.currentLevel.bugs) this.factory.createBug(bug);
    for (const block of this.currentLevel.blocks) this.factory.createBlock(block);
  }

  // ─── Rotation ─────────────────────────────────────────

  private rotateSelected(degrees: number): void {
    if (!this.selectedBody && !this.draggingBody) { this.setStatus('Select a body first'); return; }
    const body = (this.selectedBody ?? this.draggingBody)!;
    const meta = this.physics.metas.get(body);
    if (!meta || meta.role === 'ground') return;
    this.pushUndo();
    const box2d = PhysicsWorld.box2d!;
    const p = body.GetPosition();
    const currentAngle = body.GetAngle();
    const newAngle = currentAngle + (degrees * Math.PI) / 180;
    const newPos = new box2d.b2Vec2(p.x, p.y);
    body.SetTransform(newPos, newAngle);
    newPos.__destroy__();
    const zeroVel = new box2d.b2Vec2(0, 0);
    body.SetLinearVelocity(zeroVel);
    zeroVel.__destroy__();
    body.SetAngularVelocity(0);
    this.setStatus(`Rotated ${degrees > 0 ? '+' : ''}${degrees}° (total ${((newAngle * 180) / Math.PI).toFixed(0)}°)`);
  }

  // ─── Toolbar ──────────────────────────────────────────

  private buildToolbar(): void {
    const root = document.createElement('div');
    root.id = 'editor-toolbar';
    root.innerHTML = `
      <div class="editor-row">
        <strong>Editor</strong>
        <button data-action="play">▶ Play</button>
        <button data-action="save">💾 Save</button>
        <button data-action="publish">📤 Publish</button>
        <button data-action="reset">🗑 Reset</button>
      </div>
      <div class="editor-row" id="editor-levels"></div>
      <div class="editor-row" id="editor-tools"></div>
      <div class="editor-row">
        <button data-action="undo">↩ Undo</button>
        <button data-action="redo">↪ Redo</button>
        <button data-action="rotate-cw">↻ +15°</button>
        <button data-action="rotate-ccw">↺ -15°</button>
        <button data-action="toggle-zone">${this.showPlayZone ? '📐 Zone ON' : '📐 Zone OFF'}</button>
        <span id="editor-status" style="margin-left:8px"></span>
      </div>
    `;
    document.body.appendChild(root);
    this.toolbar = root;
    this.statusEl = root.querySelector('#editor-status') as HTMLSpanElement;

    const levelsEl = root.querySelector('#editor-levels') as HTMLDivElement;
    for (const level of LEVELS) {
      const btn = document.createElement('button');
      btn.textContent = `L${level.id}`;
      btn.dataset.level = String(level.id);
      btn.addEventListener('click', () => this.loadLevel(level.id));
      levelsEl.appendChild(btn);
    }

    const toolsEl = root.querySelector('#editor-tools') as HTMLDivElement;
    const addTool = (tool: Tool, label: string) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.tool = tool;
      btn.addEventListener('click', () => {
        this.tool = tool;
        this.selectedBody = null;
        this.setStatus(`Tool: ${label}`);
        this.refreshToolHighlight();
      });
      toolsEl.appendChild(btn);
    };
    addTool('select', '☝ Select');
    addTool('delete', '✕ Delete');
    for (const kind of BUG_KINDS) addTool(kind, kind);
    for (const kind of BLOCK_KINDS) addTool(kind, kind);

    root.querySelector('[data-action="play"]')?.addEventListener('click', () => {
      this.saveToStorage();
      const url = new URL(window.location.href);
      url.searchParams.delete('editor');
      url.searchParams.set('level', String(this.currentLevelId));
      window.location.href = url.toString();
    });

    root.querySelector('[data-action="save"]')?.addEventListener('click', () => this.saveToStorage());
    root.querySelector('[data-action="undo"]')?.addEventListener('click', () => this.undo());
    root.querySelector('[data-action="redo"]')?.addEventListener('click', () => this.redo());
    root.querySelector('[data-action="rotate-cw"]')?.addEventListener('click', () => this.rotateSelected(ROTATE_STEP));
    root.querySelector('[data-action="rotate-ccw"]')?.addEventListener('click', () => this.rotateSelected(-ROTATE_STEP));

    root.querySelector('[data-action="publish"]')?.addEventListener('click', async () => {
      if (!this.callbacks.onPublish) { this.setStatus('Publish callback not available'); return; }
      this.setStatus('Publishing...');
      try {
        await this.callbacks.onPublish(this.serializeLevel());
      } catch (err) {
        this.setStatus(`Publish failed: ${err}`);
      }
    });

    root.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      localStorage.removeItem(this.storageKey(this.currentLevelId));
      this.undoStack = [];
      this.redoStack = [];
      this.loadLevel(this.currentLevelId, true);
    });

    const zoneBtn = root.querySelector('[data-action="toggle-zone"]');
    zoneBtn?.addEventListener('click', () => {
      this.showPlayZone = !this.showPlayZone;
      zoneBtn.textContent = this.showPlayZone ? '📐 Zone ON' : '📐 Zone OFF';
    });

    this.refreshToolHighlight();
  }

  private refreshToolHighlight(): void {
    this.toolbar.querySelectorAll<HTMLButtonElement>('#editor-tools button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === this.tool);
    });
    this.toolbar.querySelectorAll<HTMLButtonElement>('#editor-levels button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.level === String(this.currentLevelId));
    });
  }

  // ─── Keyboard ─────────────────────────────────────────

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.rotateSelected(e.shiftKey ? -ROTATE_STEP : ROTATE_STEP);
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        this.showPlayZone = !this.showPlayZone;
        const zoneBtn = this.toolbar?.querySelector('[data-action="toggle-zone"]');
        if (zoneBtn) zoneBtn.textContent = this.showPlayZone ? '📐 Zone ON' : '📐 Zone OFF';
        this.setStatus(`Play zone ${this.showPlayZone ? 'ON' : 'OFF'}`);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.tool !== 'select') return;
        const body = this.selectedBody ?? this.draggingBody;
        if (!body) return;
        const meta = this.physics.metas.get(body);
        if (!meta || meta.role === 'ground') return;
        e.preventDefault();
        this.pushUndo();
        this.selectedBody = null;
        this.draggingBody = null;
        this.physics.destroyBody(body);
        this.setStatus('Deleted selected');
      }
    });
  }

  // ─── Pointer ──────────────────────────────────────────

  private bindPointerEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      const pos = this.getCanvasPos(e.clientX, e.clientY);
      this.onPointerDown(pos.x, pos.y);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this.getCanvasPos(e.clientX, e.clientY);
      this.onPointerMove(pos.x, pos.y);
    });

    this.canvas.addEventListener('mouseup', () => {
      this.onPointerUp();
    });

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.touches[0];
        if (!t) return;
        const pos = this.getCanvasPos(t.clientX, t.clientY);
        this.onPointerDown(pos.x, pos.y);
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const t = e.touches[0];
        if (!t) return;
        const pos = this.getCanvasPos(t.clientX, t.clientY);
        this.onPointerMove(pos.x, pos.y);
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      'touchend',
      (e) => {
        e.preventDefault();
        this.onPointerUp();
      },
      { passive: false },
    );
  }

  private onPointerDown(x: number, y: number): void {
    const body = this.pickBody(x, y);

    if (this.tool === 'select') {
      if (!body) { this.selectedBody = null; return; }
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') return;
      this.selectedBody = body;
      this.draggingBody = body;
      const p = body.GetPosition();
      this.dragOffset = {
        x: x - this.physics.m2px(p.x),
        y: y - this.physics.m2px(p.y),
      };
      return;
    }

    if (this.tool === 'delete') {
      if (!body) return;
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') return;
      this.pushUndo();
      this.selectedBody = null;
      this.physics.destroyBody(body);
      this.setStatus(`Deleted ${meta.role}:${meta.kind ?? meta.id}`);
      return;
    }

    if (BUG_KINDS.includes(this.tool as BugKind)) {
      this.pushUndo();
      this.factory.createBug({
        id: this.nextBugId++,
        type: this.tool as BugKind,
        x,
        y,
        radius: 22,
      });
      this.setStatus(`Placed ${this.tool}`);
      return;
    }

    if (BLOCK_KINDS.includes(this.tool as BlockKind)) {
      this.pushUndo();
      const kind = this.tool as BlockKind;
      const size = BLOCK_DEFAULT_SIZE[kind];
      this.factory.createBlock({
        id: this.nextBlockId++,
        type: kind,
        x,
        y,
        w: size.w,
        h: size.h,
      });
      this.setStatus(`Placed ${kind}`);
    }
  }

  private onPointerMove(x: number, y: number): void {
    if (!this.draggingBody) return;
    if (!this.selectedBody) return;
    const box2d = PhysicsWorld.box2d!;
    const px = x - this.dragOffset.x;
    const py = y - this.dragOffset.y;

    const zero = new box2d.b2Vec2(0, 0);
    this.draggingBody.SetLinearVelocity(zero);
    zero.__destroy__();
    this.draggingBody.SetAngularVelocity(0);

    const pos = new box2d.b2Vec2(this.physics.px2m(px), this.physics.px2m(py));
    this.draggingBody.SetTransform(pos, this.draggingBody.GetAngle());
    pos.__destroy__();
  }

  private onPointerUp(): void {
    if (this.draggingBody && this.selectedBody) {
      const p = this.draggingBody.GetPosition();
      const oldP = this.physics.m2px(p.x);
      const oldPy = this.physics.m2px(p.y);
      // compare with current position to decide if significant drag
      const curP = this.draggingBody.GetPosition();
      const moved = Math.abs(oldP - this.physics.m2px(curP.x)) > 1 ||
                    Math.abs(oldPy - this.physics.m2px(curP.y)) > 1;
      if (!moved) {
        this.draggingBody = null;
        return;
      }
    }
    if (this.draggingBody) {
      this.pushUndo();
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
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= meta.radius * meta.radius) { return body; }
      } else if (meta.shape === 'box' && meta.width !== undefined && meta.height !== undefined) {
        const rx = x - cx;
        const ry = y - cy;
        const ca = Math.cos(-body.GetAngle());
        const sa = Math.sin(-body.GetAngle());
        const rotatedX = rx * ca - ry * sa;
        const rotatedY = rx * sa + ry * ca;
        if (
          rotatedX >= -meta.width / 2 &&
          rotatedX <= meta.width / 2 &&
          rotatedY >= -meta.height / 2 &&
          rotatedY <= meta.height / 2
        ) { return body; }
      }
    }
    return null;
  }

  private loadLevel(id: number, ignoreStorage = false): void {
    const baseLevel = getLevel(id);
    if (!baseLevel) return;
    for (const body of [...this.physics.bodies]) {
      this.physics.destroyBody(body);
    }

    this.currentLevelId = id;
    const stored = !ignoreStorage ? this.loadFromStorage(id) : null;
    this.currentLevel = stored ?? this.cloneLevel(baseLevel);
    this.nextBugId = Math.max(0, ...this.currentLevel.bugs.map((b) => b.id)) + 1;
    this.nextBlockId = Math.max(100, ...this.currentLevel.blocks.map((b) => b.id)) + 1;
    this.undoStack = [];
    this.redoStack = [];
    this.draggingBody = null;
    this.selectedBody = null;

    this.physics.createGround(CANVAS_W / 2, GROUND_Y, CANVAS_W, 40, '#8B7355', 0, 'ground');
    for (const bug of this.currentLevel.bugs) this.factory.createBug(bug);
    for (const block of this.currentLevel.blocks) this.factory.createBlock(block);

    this.refreshToolHighlight();
    this.setStatus(`Loaded level ${id}`);
  }

  private saveToStorage(): void {
    const level = this.serializeLevel();
    localStorage.setItem(this.storageKey(this.currentLevelId), JSON.stringify(level));
    this.setStatus(`Saved level ${this.currentLevelId} to localStorage`);
  }

  serializeLevel(): LevelConfig {
    const bugs: BugSpec[] = [];
    const blocks: BlockSpec[] = [];
    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role === 'ground') continue;
      const p = body.GetPosition();
      const x = Math.round(this.physics.m2px(p.x));
      const y = Math.round(this.physics.m2px(p.y));
      if (meta.role === 'bug' && meta.radius !== undefined && meta.kind) {
        bugs.push({
          id: meta.id,
          type: meta.kind as BugKind,
          x,
          y,
          radius: meta.radius,
        });
      }
      if (meta.role === 'block' && meta.width !== undefined && meta.height !== undefined && meta.kind) {
        const angle = body.GetAngle();
        blocks.push({
          id: meta.id,
          type: meta.kind as BlockKind,
          x,
          y,
          w: meta.width,
          h: meta.height,
          rotation: Math.abs(angle) > 0.001 ? angle : undefined,
        });
      }
    }
    return {
      ...this.currentLevel,
      bugs,
      blocks,
      slingshot: { ...DEFAULT_SLINGSHOT },
      ground: { y: GROUND_Y },
    };
  }

  private storageKey(id: number): string {
    return `${STORAGE_PREFIX}${id}`;
  }

  private loadFromStorage(id: number): LevelConfig | null {
    const raw = localStorage.getItem(this.storageKey(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LevelConfig;
    } catch {
      return null;
    }
  }

  private cloneLevel(level: LevelConfig): LevelConfig {
    return JSON.parse(JSON.stringify(level)) as LevelConfig;
  }

  private getCanvasPos(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (this.canvas.width / rect.width),
      y: (clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}
