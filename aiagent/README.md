# AI Agent

A standalone local agent for the Angry Chicken game that tracks custom level creation statistics and simulates marketplace transaction data. Designed to run independently outside the browser, with a scheduler infrastructure for future timed tasks.

## Quick Start

```bash
# Show agent dashboard report
npm run agent

# Save report as JSON file
npm run agent:report

# Watch mode (refreshes every 30s, demo of scheduled tasks)
npm run agent:watch
```

Or run directly:

```bash
npx tsx aiagent/index.ts
npx tsx aiagent/index.ts --help
```

## File Structure

```
aiagent/
├── index.ts              # CLI entry point
├── core/
│   ├── AgentCore.ts      # Core agent: data loading, stats, report generation
│   └── Scheduler.ts      # Task scheduler for timed/periodic execution
├── data/
│   ├── levels.json       # Demo level data
│   ├── market.json       # Demo market transactions
│   └── reports/          # Generated JSON reports (via --report)
└── README.md
```

## Features

### Level Tracking
- Reads local JSON data files (simulates tracking user-created levels)
- Reports total levels, published count, and draft count
- Lists each level with difficulty, price, play count, and rating

### Market Data (Demo)
Since no real marketplace exists on-chain yet, the agent provides simulated demo data:
- **Purchases** / **Revenue** (SUI)
- **Forwards**, **Likes**, **Downloads**
- 12 mock transactions with user addresses, level names, and timestamps

### Task Scheduler
The `Scheduler` class provides infrastructure for timed/recurring tasks:
- Add tasks with custom intervals
- Start/stop all tasks
- Built-in error handling per task
- Status reporting for each task

Future scheduled tasks could include:
- Periodic data sync from the Sui blockchain
- Report generation at fixed intervals
- Marketplace price monitoring
- Auto-backup of level data

## CLI Commands

| Command | Description |
|---------|-------------|
| `(no args)` | Show formatted dashboard report in console |
| `--help` / `-h` | Show help text |
| `--report` | Generate and save a JSON report to `data/reports/` |
| `--watch` | Start watch mode (runs a task every 30s as demo) |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  index.ts   │────▶│  AgentCore   │────▶│  data/*.json │
│  (CLI)      │     │  (logic)     │     │  (storage)   │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │  Scheduler   │
                    │  (tasks)     │
                    └──────────────┘
```

## Adding New Tasks

```typescript
import { Scheduler } from './core/Scheduler.js';

const scheduler = new Scheduler();
scheduler.add({
  name: 'my-task',
  intervalMs: 60000,          // Run every 60s
  execute: async () => {
    // Your task logic here
  },
});
scheduler.startAll();
```

## Notes

- All marketplace data is **simulated** for demo purposes
- Replace `data/levels.json` and `data/market.json` with real data sources when available
- The scheduler is ready for future on-chain integration (e.g., polling Sui for events)
