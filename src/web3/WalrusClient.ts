import type { LevelConfig } from '../levels/types';

function extractBlobId(raw: string): string {
  const m = raw.match(/0x[a-fA-F0-9]{40,}/);
  if (m) return m[0];
  if (raw.includes('://')) {
    const parts = raw.split('/');
    const last = parts[parts.length - 1];
    if (last && last.length >= 40) return last.startsWith('0x') ? last : `0x${last}`;
  }
  if (/^[a-fA-F0-9]{40,}$/.test(raw)) return `0x${raw}`;
  console.warn('[Walrus] Cannot extract blobId from:', raw);
  return raw;
}

export class WalrusClient {
  constructor(
    private publisherUrl: string,
    private aggregatorUrl: string,
  ) {}

  async uploadLevel(level: LevelConfig): Promise<string> {
    const body = JSON.stringify(level);
    const res = await fetch(this.publisherUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`Walrus upload failed: ${res.status}`);
    const data = await res.json();
    if (data.newlyCreated) {
      return data.newlyCreated.blobObject.blobId as string;
    } else if (data.alreadyCertified) {
      const raw = data.alreadyCertified.blobId as string;
      return extractBlobId(raw);
    } else {
      throw new Error('Unexpected Walrus response format');
    }
  }

  async loadLevel(blobId: string): Promise<LevelConfig> {
    return this.downloadLevel(blobId);
  }

  async downloadLevel(blobId: string): Promise<LevelConfig> {
    const clean = extractBlobId(blobId);
    const path = clean.startsWith('0x') ? `by-object-id/${clean}` : clean;
    const res = await fetch(`${this.aggregatorUrl}/${path}`);
    if (!res.ok) throw new Error(`Walrus download failed: ${res.status}`);
    return res.json();
  }
}
