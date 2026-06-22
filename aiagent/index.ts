import { AgentCore } from './core/AgentCore.js';
import { Scheduler } from './core/Scheduler.js';

function printSeparator(char = '='): void {
  console.log(char.repeat(60));
}

function printHeader(text: string): void {
  printSeparator();
  console.log(`  ${text}`);
  printSeparator();
}

function printStats(): void {
  const agent = new AgentCore();
  agent.loadData();

  const levels = agent.getLevels();
  const stats = agent.getLevelStats();
  const summary = agent.getMarketSummary();
  const txs = agent.getRecentTransactions(5);

  printHeader(`AI Agent Report — ${new Date().toLocaleString()}`);

  console.log('\n  📊  Level Statistics');
  console.log(`  ─────────────────────`);
  console.log(`     Total created:  ${stats.total}`);
  console.log(`     Published:      ${stats.published}`);
  console.log(`     Drafts:         ${stats.drafts}`);

  if (levels.length > 0) {
    console.log();
    for (const l of levels) {
      const tag = l.published ? '📗' : '📕';
      const stars = '⭐'.repeat(l.difficulty);
      console.log(`     ${tag}  #${l.id} ${l.name} ${stars}`);
      if (l.published) {
        console.log(`         Price: ${l.price} SUI  |  Plays: ${l.playCount}  |  Rating: ${l.rating.toFixed(1)} (${l.ratingCount})`);
      }
    }
  }

  console.log('\n  📈  Market Data (Demo)');
  console.log(`  ─────────────────────`);
  console.log(`     Purchases:   ${summary.totalPurchases}`);
  console.log(`     Revenue:     ${summary.totalRevenue} SUI`);
  console.log(`     Forwards:    ${summary.totalForwards}`);
  console.log(`     Likes:       ${summary.totalLikes}`);
  console.log(`     Downloads:   ${summary.totalDownloads}`);

  if (txs.length > 0) {
    console.log('\n  📋  Recent Transactions');
    console.log(`  ─────────────────────`);
    const typeIcons: Record<string, string> = {
      purchase: '🛒', like: '❤️', forward: '🔄', download: '⬇️',
    };
    for (const tx of txs) {
      const icon = typeIcons[tx.type] ?? '❓';
      const amt = tx.amount ? ` (${tx.amount} SUI)` : '';
      const time = new Date(tx.timestamp).toLocaleString();
      console.log(`     ${icon}  ${tx.user} ${tx.type}d "${tx.levelName}"${amt}  [${time}]`);
    }
  }

  console.log();
  printSeparator();
  console.log(`  Demo mode — data loaded from aiagent/data/\n`);
}

function printHelp(): void {
  printHeader('AI Agent — Angry Chicken');
  console.log(`
  Usage:
    npx tsx aiagent/index.ts          Show dashboard report
    npx tsx aiagent/index.ts --report  Generate & save JSON report
    npx tsx aiagent/index.ts --help    Show this help

  Future commands:
    --watch         Run in watch mode with periodic refresh
    --task <name>   Run a specific scheduled task
    --daemon        Start as background daemon
  `);
}

async function saveReport(): Promise<void> {
  const agent = new AgentCore();
  const report = agent.generateReport();
  const path = agent.saveReport(report);
  console.log(`Report saved to: ${path}`);
}

async function demoWatchMode(): Promise<void> {
  const scheduler = new Scheduler();
  scheduler.add({
    name: 'generate-report',
    intervalMs: 30000,
    execute: async () => {
      const agent = new AgentCore();
      agent.loadData();
      const stats = agent.getLevelStats();
      const summary = agent.getMarketSummary();
      console.log(`[${new Date().toLocaleTimeString()}] Levels: ${stats.total} (${stats.published} pub, ${stats.drafts} draft) | Market: ${summary.totalPurchases} purchases, ${summary.totalRevenue} SUI`);
    },
  });
  console.log('Watch mode started (refreshing every 30s). Press Ctrl+C to stop.');
  scheduler.startAll();

  process.on('SIGINT', () => {
    console.log('\nStopping scheduler...');
    scheduler.stopAll();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--report')) {
    await saveReport();
    return;
  }

  if (args.includes('--watch')) {
    await demoWatchMode();
    return;
  }

  printStats();
}

main().catch(err => {
  console.error('Agent error:', err);
  process.exit(1);
});
