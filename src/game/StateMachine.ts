export type GameState = 'SETUP' | 'AIM' | 'FLYING' | 'SETTLE' | 'WIN' | 'LOSE';

export interface StateContext {
  chickensRemaining: number;
  bugsAlive: number;
  anyInMotion: boolean;
}

const SETTLE_FRAMES = 45;
const MAX_FLYING_FRAMES = 300;
const SETUP_STABLE_FRAMES = 30;
const SETUP_TIMEOUT_FRAMES = 180;

export class StateMachine {
  private state: GameState = 'SETUP';
  private settleCounter = 0;
  private flyingCounter = 0;
  private setupCounter = 0;

  getState(): GameState {
    return this.state;
  }

  isAiming(): boolean {
    return this.state === 'AIM';
  }

  isSetup(): boolean {
    return this.state === 'SETUP';
  }

  isFlying(): boolean {
    return this.state === 'FLYING';
  }

  isSettled(): boolean {
    return this.state === 'SETTLE';
  }

  isWin(): boolean {
    return this.state === 'WIN';
  }

  isLose(): boolean {
    return this.state === 'LOSE';
  }

  isTerminal(): boolean {
    return this.state === 'WIN' || this.state === 'LOSE';
  }

  onLaunch(): void {
    if (this.state === 'AIM') {
      this.state = 'FLYING';
      this.settleCounter = 0;
      this.flyingCounter = 0;
    }
  }

  tick(ctx: StateContext): void {
    switch (this.state) {
      case 'SETUP':
        this.setupCounter++;
        if (!ctx.anyInMotion && this.setupCounter >= SETUP_STABLE_FRAMES) {
          this.state = 'AIM';
          this.setupCounter = 0;
        } else if (this.setupCounter >= SETUP_TIMEOUT_FRAMES) {
          this.state = 'AIM';
          this.setupCounter = 0;
        }
        break;
      case 'AIM':
        if (ctx.chickensRemaining === 0 && ctx.bugsAlive > 0) {
          this.state = 'LOSE';
        }
        break;
      case 'FLYING':
        this.flyingCounter++;
        if (!ctx.anyInMotion || this.flyingCounter >= MAX_FLYING_FRAMES) {
          this.state = 'SETTLE';
          this.settleCounter = 0;
          this.flyingCounter = 0;
        }
        break;
      case 'SETTLE':
        this.settleCounter++;
        if (this.settleCounter >= SETTLE_FRAMES) {
          if (ctx.bugsAlive === 0) {
            this.state = 'WIN';
          } else if (ctx.chickensRemaining === 0) {
            this.state = 'LOSE';
          } else {
            this.state = 'AIM';
            this.flyingCounter = 0;
          }
        }
        break;
    }
  }

  reset(): void {
    this.state = 'SETUP';
    this.settleCounter = 0;
    this.flyingCounter = 0;
    this.setupCounter = 0;
  }
}
