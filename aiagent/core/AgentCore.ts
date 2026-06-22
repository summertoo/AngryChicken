import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const LEVELS_FILE = join(DATA_DIR, 'levels.json');
const MARKET_FILE = join(DATA_DIR, 'market.json');

export interface LevelData {
  id: number;
  name: string;
  description: string;
  difficulty: number;
  chickens: number;
  createdAt: string;
  published: boolean;
  publishDate: string | null;
  blobId: string | null;
  price: number;
  playCount: number;
  rating: number;
  ratingCount: number;
}

export interface MarketTransaction {
  id: number;
  type: 'purchase' | 'like' | 'forward' | 'download';
  user: string;
  levelName: string;
  levelId: number;
  amount?: number;
  timestamp: string;
}

export interface MarketSummary {
  totalPurchases: number;
  totalRevenue: number;
  totalForwards: number;
  totalLikes: number;
  totalDownloads: number;
}

export interface AgentReport {
  timestamp: string;
  levels: {
    total: number;
    published: number;
    drafts: number;
    list: LevelData[];
  };
  market: {
    summary: MarketSummary;
    recentTransactions: MarketTransaction[];
  };
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class AgentCore {
  private levels: LevelData[] = [];
  private marketData: { summary: MarketSummary; transactions: MarketTransaction[] } | null = null;

  constructor() {
    ensureDataDir();
  }

  loadData(): void {
    this.levels = loadJSON<LevelData[]>(LEVELS_FILE, []);
    this.marketData = loadJSON<{ summary: MarketSummary; transactions: MarketTransaction[] }>(MARKET_FILE, null);
  }

  reloadData(): void {
    this.loadData();
  }

  getLevels(): LevelData[] {
    return [...this.levels];
  }

  getPublishedLevels(): LevelData[] {
    return this.levels.filter(l => l.published);
  }

  getDraftLevels(): LevelData[] {
    return this.levels.filter(l => !l.published);
  }

  getLevelStats(): { total: number; published: number; drafts: number } {
    return {
      total: this.levels.length,
      published: this.levels.filter(l => l.published).length,
      drafts: this.levels.filter(l => !l.published).length,
    };
  }

  getMarketSummary(): MarketSummary {
    if (!this.marketData) {
      return { totalPurchases: 0, totalRevenue: 0, totalForwards: 0, totalLikes: 0, totalDownloads: 0 };
    }
    return { ...this.marketData.summary };
  }

  getRecentTransactions(limit = 10): MarketTransaction[] {
    if (!this.marketData) return [];
    return this.marketData.transactions.slice(-limit).reverse();
  }

  generateReport(): AgentReport {
    this.loadData();
    return {
      timestamp: new Date().toISOString(),
      levels: {
        total: this.levels.length,
        published: this.levels.filter(l => l.published).length,
        drafts: this.levels.filter(l => !l.published).length,
        list: [...this.levels],
      },
      market: {
        summary: this.getMarketSummary(),
        recentTransactions: this.getRecentTransactions(10),
      },
    };
  }

  saveReport(report?: AgentReport): string {
    const dir = join(DATA_DIR, 'reports');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const data = report ?? this.generateReport();
    const filename = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = join(dir, filename);
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    return filepath;
  }

  addLevel(level: LevelData): void {
    this.levels.push(level);
    this.saveLevels();
  }

  private saveLevels(): void {
    writeFileSync(LEVELS_FILE, JSON.stringify(this.levels, null, 2), 'utf-8');
  }
}
