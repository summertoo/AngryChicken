export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'circle' | 'rect';
  rotation: number;
  rotSpeed: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += 250 * dt;
      p.vx *= 0.98;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotSpeed * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = t * 0.9;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      const s = p.size * (0.3 + 0.7 * t);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-s / 2, -s / 2, s, s * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  spawnBugDeath(x: number, y: number, color: string, count = 14): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 50 + Math.random() * 120;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.3 + Math.random() * 0.5,
        maxLife: 0.8,
        size: 2 + Math.random() * 5,
        color,
        shape: 'circle',
        rotation: 0,
        rotSpeed: 0,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 60,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        size: 5 + Math.random() * 4,
        color: '#FFF',
        shape: 'circle',
        rotation: 0,
        rotSpeed: 0,
      });
    }
  }

  spawnSplinter(x: number, y: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = 60 + Math.random() * 140;
      const colors = ['#8B5A2B', '#A0522D', '#6B4226', '#CD853F'];
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.3 + Math.random() * 0.5,
        maxLife: 0.8,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: 'rect',
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }

  spawnDust(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
      const speed = 20 + Math.random() * 50;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 2 + Math.random() * 3,
        color: '#A0896A',
        shape: 'circle',
        rotation: 0,
        rotSpeed: 0,
      });
    }
  }

  clear(): void {
    this.particles = [];
  }

  get count(): number {
    return this.particles.length;
  }
}
