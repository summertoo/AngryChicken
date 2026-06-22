export interface Task {
  name: string;
  intervalMs: number;
  execute: () => Promise<void> | void;
  running: boolean;
  lastRunAt: number | null;
}

export class Scheduler {
  private tasks: Task[] = [];
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private running = false;

  add(task: Task): void {
    this.tasks.push(task);
  }

  addMany(tasks: Task[]): void {
    for (const t of tasks) this.add(t);
  }

  startAll(): void {
    if (this.running) return;
    this.running = true;
    for (const task of this.tasks) {
      this.startTask(task);
    }
  }

  stopAll(): void {
    this.running = false;
    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      const task = this.tasks.find(t => t.name === name);
      if (task) task.running = false;
    }
    this.timers.clear();
  }

  private startTask(task: Task): void {
    if (task.running) return;
    task.running = true;

    const run = async () => {
      try {
        task.lastRunAt = Date.now();
        await task.execute();
      } catch (err) {
        console.error(`[Scheduler] Task "${task.name}" failed:`, err);
      }
    };

    run();
    const timer = setInterval(run, task.intervalMs);
    this.timers.set(task.name, timer);
  }

  status(): { name: string; running: boolean; lastRunAt: string | null; intervalMs: number }[] {
    return this.tasks.map(t => ({
      name: t.name,
      running: t.running,
      lastRunAt: t.lastRunAt ? new Date(t.lastRunAt).toISOString() : null,
      intervalMs: t.intervalMs,
    }));
  }
}
