import type { SkinData } from './SuiClient';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hexColor(c: number): string {
  return `#${(c >>> 0).toString(16).padStart(6, '0')}`;
}

export class SkinRenderer {
  static drawChickenSkin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, skin: SkinData): void {
    ctx.save();
    const primary = hexColor(Number(skin.primary));
    const secondary = hexColor(Number(skin.secondary));

    this.drawRarityEffect(ctx, x, y, r, Number(skin.rarity));
    this.drawBody(ctx, x, y, r, primary, secondary, Number(skin.pattern), Number(skin.seed));
    this.drawEye(ctx, x, y, r, Number(skin.eye));
    this.drawAccessory(ctx, x, y, r, Number(skin.accessory));
    ctx.restore();
  }

  static drawBody(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, r: number,
    primary: string, secondary: string, pattern: number, seed: number,
  ): void {
    ctx.save();
    const rand = seededRandom(seed);

    switch (pattern) {
      case 0: // solid + belly patch (shows secondary)
        ctx.fillStyle = primary;
        this.circle(ctx, x, y, r);
        ctx.fill();
        ctx.fillStyle = secondary;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.2, r * 0.45, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 1: { // stripes
        ctx.fillStyle = primary;
        this.circle(ctx, x, y, r);
        ctx.fill();
        ctx.fillStyle = secondary;
        for (let i = 0; i < 3; i++) {
          const angle = rand() * Math.PI * 2;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.fillRect(-r * 0.05, -r * 0.6, r * 0.1, r * 1.2);
          ctx.restore();
        }
        break;
      }

      case 2: { // dots
        ctx.fillStyle = primary;
        this.circle(ctx, x, y, r);
        ctx.fill();
        ctx.fillStyle = secondary;
        const n = 5 + Math.floor(rand() * 4);
        for (let i = 0; i < n; i++) {
          const angle = rand() * Math.PI * 2;
          const dist = rand() * r * 0.6;
          const dotR = 2 + rand() * r * 0.12;
          this.circle(ctx, x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, dotR);
          ctx.fill();
        }
        break;
      }

      case 3: { // flame
        ctx.fillStyle = primary;
        this.circle(ctx, x, y, r);
        ctx.fill();
        ctx.fillStyle = secondary;
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 5; i++) {
          const baseAngle = (i / 5) * Math.PI * 2 + rand() * 0.3;
          ctx.beginPath();
          for (let t = 0; t <= Math.PI * 2; t += 0.05) {
            const wave = Math.sin(t * 4 + seed) * r * 0.08;
            const px = x + Math.cos(baseAngle + t * 0.5) * (r * 0.5 + wave);
            const py = y + Math.sin(baseAngle + t * 0.5) * (r * 0.5 + wave);
            t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      case 4: { // camo
        ctx.fillStyle = primary;
        this.circle(ctx, x, y, r);
        ctx.fill();
        ctx.fillStyle = secondary;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 6; i++) {
          const cx = x + (rand() - 0.5) * r * 1.2;
          const cy = y + (rand() - 0.5) * r * 1.2;
          ctx.beginPath();
          const verts = 4 + Math.floor(rand() * 4);
          for (let j = 0; j < verts; j++) {
            const a = (j / verts) * Math.PI * 2;
            const d = r * 0.2 + rand() * r * 0.25;
            const px = cx + Math.cos(a) * d;
            const py = cy + Math.sin(a) * d;
            j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  static drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, eyeType: number): void {
    ctx.save();
    const eyeY = y - r * 0.15;
    const eyeOffset = r * 0.25;
    const eyeR = r * 0.15;

    switch (eyeType) {
      case 0: { // normal - black dot + white highlight
        for (const side of [-1, 1]) {
          const ex = x + side * eyeOffset;
          ctx.fillStyle = '#000';
          this.circle(ctx, ex, eyeY, eyeR);
          ctx.fill();
          ctx.fillStyle = '#fff';
          this.circle(ctx, ex - eyeR * 0.25, eyeY - eyeR * 0.25, eyeR * 0.4);
          ctx.fill();
        }
        break;
      }

      case 1: { // angry - V brow + red eye
        for (const side of [-1, 1]) {
          const ex = x + side * eyeOffset;
          ctx.fillStyle = '#ff0000';
          this.circle(ctx, ex, eyeY, eyeR);
          ctx.fill();
          ctx.fillStyle = '#000';
          this.circle(ctx, ex, eyeY, eyeR * 0.5);
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ex - eyeR * 1.2, eyeY - eyeR * 1.5);
          ctx.lineTo(ex + side * eyeR * 0.2, eyeY - eyeR * 0.8);
          ctx.stroke();
        }
        break;
      }

      case 2: { // glow - white + blue glow
        for (const side of [-1, 1]) {
          const ex = x + side * eyeOffset;
          ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
          this.circle(ctx, ex, eyeY, eyeR * 1.8);
          ctx.fill();
          ctx.fillStyle = '#fff';
          this.circle(ctx, ex, eyeY, eyeR * 0.7);
          ctx.fill();
          ctx.fillStyle = '#aaddff';
          this.circle(ctx, ex - eyeR * 0.2, eyeY - eyeR * 0.2, eyeR * 0.25);
          ctx.fill();
        }
        break;
      }

      case 3: { // star
        for (const side of [-1, 1]) {
          const ex = x + side * eyeOffset;
          ctx.fillStyle = '#ffd700';
          this.drawStar(ctx, ex, eyeY, eyeR * 0.8, 5);
          ctx.fill();
          ctx.fillStyle = '#fff8dc';
          this.drawStar(ctx, ex, eyeY, eyeR * 0.4, 5);
          ctx.fill();
        }
        break;
      }

      case 4: { // heart
        for (const side of [-1, 1]) {
          const ex = x + side * eyeOffset;
          ctx.fillStyle = '#ff69b4';
          this.drawHeart(ctx, ex, eyeY, eyeR);
          ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  static drawAccessory(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, accessoryType: number): void {
    ctx.save();

    switch (accessoryType) {
      case 0: break; // none

      case 1: { // hat - semicircle + brim
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.7, r * 0.6, r * 0.25, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - r * 0.5, y - r * 0.95, r * 1.0, r * 0.15);
        break;
      }

      case 2: { // glasses - two circles + bridge
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        const gY = y - r * 0.15;
        const gOffset = r * 0.28;
        for (const side of [-1, 1]) {
          this.circle(ctx, x + side * gOffset, gY, r * 0.18);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x - gOffset + r * 0.18, gY);
        ctx.lineTo(x + gOffset - r * 0.18, gY);
        ctx.stroke();
        break;
      }

      case 3: { // cape - bezier curves below body
        ctx.fillStyle = '#8B0000';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.6, y);
        ctx.quadraticCurveTo(x - r * 0.8, y + r * 1.2, x, y + r * 1.0);
        ctx.quadraticCurveTo(x + r * 0.8, y + r * 1.2, x + r * 0.6, y);
        ctx.fill();
        break;
      }

      case 4: { // crown - zigzag
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 2;
        const cy = y - r * 0.8;
        const cw = r * 0.8;
        ctx.beginPath();
        ctx.moveTo(x - cw * 0.5, cy + r * 0.15);
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          const tip = i % 2 === 0;
          ctx.lineTo(x - cw * 0.5 + t * cw, tip ? cy - r * 0.3 : cy + r * 0.15);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // jewels
        ctx.fillStyle = '#ff0000';
        for (let i = 0; i < 3; i++) {
          this.circle(ctx, x - cw * 0.25 + i * cw * 0.25, cy - r * 0.15, 2);
          ctx.fill();
        }
        break;
      }

      case 5: { // scarf - around neck
        ctx.fillStyle = '#2E8B57';
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.15, r * 0.55, r * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - r * 0.05, y + r * 0.15, r * 0.1, r * 0.4);
        break;
      }
    }
    ctx.restore();
  }

  static drawRarityEffect(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rarity: number): void {
    ctx.save();
    if (rarity === 0) { ctx.restore(); return; }

    const colors = ['', '#FFD700', '#FF00FF', '#00FFFF'];
    const color = colors[rarity] || '#FFD700';

    ctx.shadowColor = color;
    ctx.shadowBlur = r * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * rarity;
    this.circle(ctx, x, y, r + 3 * rarity);
    ctx.stroke();
    ctx.restore();
  }

  // ─── Helpers ───

  private static circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 0.5), 0, Math.PI * 2);
  }

  private static drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number): void {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private static drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.3);
    ctx.bezierCurveTo(x + r * 0.8, y - r * 0.3, x + r * 1.2, y + r * 0.5, x, y + r * 0.8);
    ctx.bezierCurveTo(x - r * 1.2, y + r * 0.5, x - r * 0.8, y - r * 0.3, x, y + r * 0.3);
  }
}
