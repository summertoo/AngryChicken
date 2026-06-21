import './style.css';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { CollisionTracker } from './physics/CollisionTracker';
import { Renderer } from './render/Renderer';
import { SpriteAtlas } from './render/SpriteAtlas';
import { BodyFactory } from './game/BodyFactory';
import { Game } from './game/Game';
import { GameState } from './game/StateMachine';
import { LevelEditor } from './editor/LevelEditor';
import { UserLevelEditor } from './editor/UserLevelEditor';
import { CANVAS_W, CANVAS_H, DEFAULT_SLINGSHOT, GROUND_Y, LevelConfig, ChickenKind } from './levels/types';
import { LEVELS, getLevel } from './levels/levels';
import { i18n } from './i18n';
import { audio } from './game/Audio';
import { WalletManager } from './web3/WalletManager';
import { SuiClient } from './web3/SuiClient';
import { SkinRenderer } from './web3/SkinRenderer';
import { WalrusClient } from './web3/WalrusClient';
import { LevelMarket, type CommunityLevel } from './web3/LevelMarket';
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, FREE_LEVELS, PACK_PASS_PRICE, SKIN_BOX_PRICE, CRAFT_SKIN_PRICE, WALRUS_PUT_URL, WALRUS_GET_URL, ADMIN_ADDRESS } from './web3/config';
import type { SkinData, UserLevelData } from './web3/SuiClient';
import { PRESET_SKINS, PRESET_STORAGE_KEY, loadOwnedPresets, saveOwnedPresets } from './web3/PresetSkins';
import type { PresetSkinConfig } from './web3/PresetSkins';

const FIXED_DT = 1 / 60;
const SETTLE_VELOCITY_THRESHOLD = 0.3;

let ownedPresetIds: Set<string> = loadOwnedPresets();
let activePresetId: string | null = null;
const presetSkinCache = new Map<string, HTMLImageElement>();

function loadPresetImage(id: string): Promise<HTMLImageElement> {
  const cached = presetSkinCache.get(id);
  if (cached) return Promise.resolve(cached);
  const preset = PRESET_SKINS.find(p => p.id === id);
  if (!preset) return Promise.reject(new Error(`Unknown preset: ${id}`));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { presetSkinCache.set(id, img); resolve(img); };
    img.onerror = () => resolve(img);
    img.src = preset.file;
  });
}

function drawChickenWithSkin(renderer: Renderer, pos: { x: number; y: number }, radius: number, color: string, kind?: string): void {
  if (activePresetId) {
    const img = presetSkinCache.get(activePresetId);
    if (img && img.complete && img.naturalWidth > 0) {
      renderer.drawPresetSkinImage(pos, radius, img);
      return;
    }
  }
  if (wallet.activeSkin) {
    renderer.drawChickenSkin(pos, radius, wallet.activeSkin);
    return;
  }
  renderer.drawChickenCircle(pos, radius, color, kind as any);
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setText(id: string, text: string): void {
  const el = $(id);
  if (el) el.textContent = text;
}

function setStatus(text: string): void {
  setText('status', text);
}

function setFps(fps: number): void {
  setText('fps', `${i18n.t('fps')}: ${fps.toFixed(0)}`);
}

function setChickens(n: number): void {
  setText('chickens', `${i18n.t('chickens')} ${n}`);
}

function updateChickenSelector(slingshot: {
  getAvailable(): { kind: string; count: number }[];
  getSelectedKind(): string;
}): void {
  const selector = $('chicken-selector');
  if (!selector) return;

  const available = slingshot.getAvailable();
  let visibleKinds = 0;

  for (const { kind, count } of available) {
    const option = selector.querySelector(`.chicken-select-option[data-kind="${kind}"]`);
    if (!option) continue;

    const countEl = option.querySelector('.chicken-select-count');
    if (countEl) countEl.textContent = String(count);

    option.classList.toggle('disabled', count <= 0);
    option.classList.toggle('active', kind === slingshot.getSelectedKind() && count > 0);

    if (count > 0) visibleKinds++;
  }

  selector.classList.toggle('hidden', visibleKinds <= 1);
}

function setLevel(level: LevelConfig): void {
  setText('level', `${i18n.t('level.prefix')} ${level.id} ${i18n.levelName(level)}`);
}

function applyI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = i18n.t(el.dataset.i18n!);
  });
  const langBtn = $('lang-btn');
  if (langBtn) langBtn.textContent = i18n.t('lang.btn');
  document.querySelectorAll<HTMLElement>('.level-btn').forEach((btn) => {
    const id = parseInt(btn.dataset.level ?? '0', 10);
    const lvl = LEVELS.find(l => l.id === id);
    if (lvl) btn.title = i18n.levelName(lvl);
  });
  const existing = $('level');
  if (existing && existing.textContent && existing.textContent !== `${i18n.t('level.prefix')} --`) {
    existing.textContent = existing.textContent.replace(/^[^\d]*(\d+)/, `${i18n.t('level.prefix')} $1`);
  }
  const fpsEl = $('fps');
  if (fpsEl) {
    const m = fpsEl.textContent?.match(/[\d.]+/);
    if (m) fpsEl.textContent = `${i18n.t('fps')}: ${m[0]}`;
  }
  const chickensEl = $('chickens');
  if (chickensEl) {
    const m = chickensEl.textContent?.match(/\d+/);
    if (m) chickensEl.textContent = `${i18n.t('chickens')} ${m[0]}`;
  }
}

let currentGame: Game | null = null;
let pendingAction: (() => void) | null = null;
let pendingLevelId = 0;

const wallet = new WalletManager();
const suiClient = new SuiClient(wallet);
const walrusClient = new WalrusClient(WALRUS_PUT_URL, WALRUS_GET_URL);
const levelMarket = new LevelMarket(wallet, walrusClient);

function updateWalletUI(): void {
  const display = $('wallet-display') as HTMLElement | null;
  if (!display) return;
  if (wallet.isConnected && wallet.currentAccount) {
    const addr = `${wallet.currentAccount.slice(0, 6)}...${wallet.currentAccount.slice(-4)}`;
    wallet.getBalance().then(b => {
      display.textContent = `${addr} | ${b.toFixed(2)} SUI`;
    }).catch(() => {
      display.textContent = addr;
    });
    display.classList.add('connected');
  } else {
    display.textContent = wallet.isAvailable() ? i18n.t('btn.wallet') : i18n.t('btn.wallet_none');
    display.classList.remove('connected');
  }
  updateHomeWalletUI();
}

function buildWalletSelection(): void {
  const container = $('wallet-list');
  if (!container) return;
  container.innerHTML = '';
  for (const w of wallet.availableWallets) {
    const btn = document.createElement('button');
    btn.className = 'wallet-option';
    if (w.icon) {
      const img = document.createElement('img');
      img.src = w.icon;
      img.className = 'wallet-icon';
      btn.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = w.name;
    btn.appendChild(label);
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.wallet-option').forEach(b => (b as HTMLButtonElement).disabled = true);
      const cancelBtn = $('wallet-cancel') as HTMLButtonElement | null;
      if (cancelBtn) cancelBtn.disabled = true;
      const heading = container.parentElement?.querySelector('h1');
      const originalName = btn.textContent || w.name;
      btn.textContent = i18n.t('status.connecting');
      try {
        setStatus(i18n.t('status.connecting'));
        await wallet.connect(w.id);
        onWalletConnected();
        hideOverlay('wallet-select-overlay');
        if (pendingAction) {
          const action = pendingAction;
          pendingAction = null;
          action();
        }
      } catch (err) {
        console.warn('[wallet] Connection failed:', err);
        setStatus(i18n.t('status.conn_fail'));
        if (heading) heading.textContent = `❌ ${i18n.t('status.conn_fail')}`;
        container.querySelectorAll('.wallet-option').forEach(b => (b as HTMLButtonElement).disabled = false);
        if (cancelBtn) cancelBtn.disabled = false;
        btn.textContent = originalName;
      }
      updateWalletUI();
    });
    container.appendChild(btn);
  }
}

async function handleWalletClick(): Promise<void> {
  if (wallet.isConnected) {
    const popup = $('wallet-action-popup');
    if (popup) popup.classList.toggle('hidden');
    return;
  }
  if (wallet.availableWallets.length === 0) {
    setStatus(i18n.t('status.no_wallet'));
    return;
  }
  if (wallet.availableWallets.length === 1) {
    try {
      setStatus(i18n.t('status.connecting'));
      await wallet.connect(wallet.availableWallets[0].id);
      onWalletConnected();
    } catch (err) {
      console.warn('[wallet] Connection failed:', err);
      setStatus(i18n.t('status.conn_fail'));
    }
    updateWalletUI();
    return;
  }
  buildWalletSelection();
  showOverlay('wallet-select-overlay');
}

function disconnectWallet(): void {
  wallet.disconnect();
  activePresetId = null;
  hideOverlay('wallet-action-popup');
  updateWalletUI();
  $('craft-btn')?.classList.add('hidden');
  $('market-btn')?.classList.add('hidden');
  updateLevelSelectorUI();
}

function onWalletConnected(): void {
  updateWalletUI();
  refreshSkins();
  refreshPasses();
  $('craft-btn')?.classList.remove('hidden');
  $('market-btn')?.classList.remove('hidden');
  updateLevelSelectorUI();
  refreshTreasuryUI();
}

async function refreshTreasuryUI(): Promise<void> {
  // Treasury info displayed in About popup
  if (!wallet.isConnected) {
    const statusEl = $('about-treasury-status');
    if (statusEl) statusEl.textContent = i18n.t('treasury.not_init');
    return;
  }
  const statusEl = $('about-treasury-status');
  if (statusEl) statusEl.textContent = wallet.isConnected ? 'Ready' : '--';
  const addrEl = $('about-treasury-addr');
  if (addrEl) addrEl.textContent = wallet.currentAccount ?? '--';
}

async function refreshSkins(): Promise<void> {
  try {
    wallet.ownedSkins = await suiClient.getOwnedSkins();
    buildSkinGrid();
  } catch (err) {
    console.warn('[skins] Failed to load owned skins:', err);
  }
}

function buildSkinGrid(): void {
  const grid = $('skin-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const skinBtn = $('skin-btn');
  if (skinBtn) skinBtn.classList.toggle('hidden', wallet.ownedSkins.length === 0 && ownedPresetIds.size === 0);

  for (const presetId of ownedPresetIds) {
    const preset = PRESET_SKINS.find(p => p.id === presetId);
    if (!preset) continue;
    const canvas = document.createElement('canvas');
    canvas.className = 'skin-thumb';
    canvas.width = 80;
    canvas.height = 80;
    if (activePresetId === preset.id) canvas.classList.add('active');

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(40, 40, 36, 0, Math.PI * 2);
      ctx.fill();
    }
    loadPresetImage(preset.id).then(img => {
      if (img && img.complete && img.naturalWidth > 0 && ctx) {
        ctx.clearRect(0, 0, 80, 80);
        ctx.save();
        ctx.beginPath();
        ctx.arc(40, 40, 36, 0, Math.PI * 2);
        ctx.clip();
        const s = Math.min(72 / img.naturalWidth, 72 / img.naturalHeight);
        const ox = 40 - (img.naturalWidth * s) / 2;
        const oy = 40 - (img.naturalHeight * s) / 2;
        ctx.drawImage(img, ox, oy, img.naturalWidth * s, img.naturalHeight * s);
        ctx.restore();
      }
    }).catch(() => {});

    canvas.addEventListener('click', () => {
      activePresetId = preset.id;
      wallet.activeSkin = null;
      document.querySelectorAll('.skin-thumb').forEach(el => el.classList.remove('active'));
      canvas.classList.add('active');
    });

    grid.appendChild(canvas);
  }

  if (ownedPresetIds.size > 0 && wallet.ownedSkins.length > 0) {
    const divider = document.createElement('div');
    divider.style.cssText = 'grid-column:1/-1;height:1px;background:rgba(255,255,255,0.1);margin:4px 0';
    grid.appendChild(divider);
  }

  for (let i = 0; i < wallet.ownedSkins.length; i++) {
    const skin = wallet.ownedSkins[i];
    const canvas = document.createElement('canvas');
    canvas.className = 'skin-thumb';
    canvas.width = 80;
    canvas.height = 80;
    canvas.dataset.index = String(i);

    const isActive = wallet.activeSkin?.id.id === skin.id.id && !activePresetId;
    if (isActive) canvas.classList.add('active');

    const ctx = canvas.getContext('2d');
    if (ctx) SkinRenderer.drawChickenSkin(ctx, 40, 40, 30, skin);

    canvas.addEventListener('click', () => {
      wallet.activeSkin = skin;
      activePresetId = null;
      document.querySelectorAll('.skin-thumb').forEach(el => el.classList.remove('active'));
      canvas.classList.add('active');
    });

    grid.appendChild(canvas);
  }
}

async function refreshPasses(): Promise<void> {
  await wallet.refreshPasses();
  updateLevelSelectorUI();
}

function packIdForLevel(levelId: number): number {
  // pack_id = ceil(levelId / 10):
  //    levels 1-10: pack_id=1
  //    levels 11-20: pack_id=2
  //    levels 21-30: pack_id=3
  //    ...
  return Math.ceil(levelId / 10);
}

function isLevelUnlocked(levelId: number): boolean {
  if (levelId <= FREE_LEVELS) return true;
  if (!wallet.isConnected) return false;
  return wallet.hasPackPass(packIdForLevel(levelId));
}

function tryLoadLevel(game: Game, id: number, fromCommunity = false): void {
  if (!fromCommunity && !isLevelUnlocked(id)) {
    if (wallet.isConnected) {
      pendingLevelId = id;
      const pk = packIdForLevel(id);
      const startLevel = (pk - 1) * 10 + 1;
      const endLevel = pk * 10;
      const descEl = document.querySelector('#lock-desc');
      if (descEl) descEl.textContent = `购买关卡包解锁第 ${startLevel}-${endLevel} 关`;
      const priceEl = document.querySelector('#lock-price');
      if (priceEl) priceEl.textContent = `价格: 0.1 SUI`;
      showOverlay('lock-overlay');
    } else {
      setStatus(i18n.t('status.wallet'));
    }
    return;
  }
  hideOverlay('level-select-overlay');
  game.loadLevel(id);
}

function updateLevelSelectorUI(): void {
  document.querySelectorAll<HTMLElement>('.level-grid-btn').forEach((btn) => {
    const id = parseInt(btn.dataset.level ?? '0', 10);
    btn.classList.toggle('locked', !isLevelUnlocked(id));
  });
}

async function handleBuyPack(): Promise<void> {
  if (pendingLevelId <= 0) return;
  const packId = packIdForLevel(pendingLevelId);
  try {
    setStatus(i18n.t('status.buying'));
    const digest = await suiClient.purchasePackPass(packId);
    await refreshPasses();
    hideOverlay('lock-overlay');
    setStatus(i18n.t('status.unlocked'));
  } catch (err) {
    console.error('[pack] Purchase failed:', err);
    setStatus(i18n.t('status.buy_fail'));
  }
}

function showShop(): void {
  $('shop-overlay')?.classList.remove('hidden');
  buildShopGrid();
}

async function buildShopGrid(): Promise<void> {
  const grid = $('shop-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const statusEl = $('shop-status');

  for (const preset of PRESET_SKINS) {
    const card = document.createElement('div');
    card.className = 'shop-card';
    const owned = ownedPresetIds.has(preset.id);
    if (owned) card.classList.add('owned');

    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(40, 40, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#555';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('loading...', 40, 43);
    }
    try {
      const img = await loadPresetImage(preset.id);
      if (img && img.complete && img.naturalWidth > 0) {
        const ctx2 = canvas.getContext('2d');
        if (ctx2) {
          ctx2.clearRect(0, 0, 80, 80);
          ctx2.save();
          ctx2.beginPath();
          ctx2.arc(40, 40, 36, 0, Math.PI * 2);
          ctx2.clip();
          const s = Math.min(72 / img.naturalWidth, 72 / img.naturalHeight);
          const ox = 40 - (img.naturalWidth * s) / 2;
          const oy = 40 - (img.naturalHeight * s) / 2;
          ctx2.drawImage(img, ox, oy, img.naturalWidth * s, img.naturalHeight * s);
          ctx2.restore();
        }
      }
    } catch { /* ignore */ }

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-card-name';
    nameEl.textContent = preset.name;

    const priceEl = document.createElement('div');
    priceEl.className = 'shop-card-price';
    priceEl.textContent = owned ? '' : `${(preset.price / 1e9).toFixed(2)} SUI`;
    if (owned) priceEl.style.display = 'none';

    const btn = document.createElement('button');
    btn.className = 'shop-card-btn';
    if (owned) {
      const isEquipped = activePresetId === preset.id;
      btn.className = isEquipped ? 'shop-card-btn equipped' : 'shop-card-btn owned';
      btn.textContent = isEquipped ? '✓ 已装备' : '已拥有';
      btn.addEventListener('click', () => {
        if (activePresetId === preset.id) return;
        activePresetId = preset.id;
        wallet.activeSkin = null;
        buildShopGrid();
        buildSkinGrid();
        setStatus(`已装备皮肤: ${preset.name}`);
      });
    } else {
      btn.className = 'shop-card-btn buy';
      btn.textContent = `购买 ${(preset.price / 1e9).toFixed(2)} SUI`;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '购买中...';
        if (statusEl) statusEl.textContent = '';
        try {
          const digest = await handleBuyPreset(preset);
          ownedPresetIds.add(preset.id);
          saveOwnedPresets(ownedPresetIds);
          activePresetId = preset.id;
          wallet.activeSkin = null;
          setStatus(`购买成功! 已装备: ${preset.name}`);
          if (statusEl) statusEl.textContent = `✅ 购买成功!`;
          buildShopGrid();
          buildSkinGrid();
        } catch (err: any) {
          btn.disabled = false;
          btn.textContent = `购买 ${(preset.price / 1e9).toFixed(2)} SUI`;
          if (statusEl) statusEl.textContent = `❌ ${err.message || '购买失败'}`;
        }
      });
    }

    card.appendChild(canvas);
    card.appendChild(nameEl);
    card.appendChild(priceEl);
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

async function handleBuyPreset(preset: PresetSkinConfig): Promise<string> {
  if (!wallet.isConnected) throw new Error('钱包未连接');
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(preset.price)]);
  tx.transferObjects([payment], tx.pure.address('0x73cc0ae26d786e8664ad129ecf9dd6df263fa57b198b0db5074780ce43e58bb9'));
  return wallet.signAndExecuteTransactionBlock({ transactionBlock: tx, chain: 'sui:testnet' }).then(r => r.digest);
}

function rgbToU32(hex: string): number {
  const val = parseInt(hex.replace('#', ''), 16);
  return val; // #RRGGBB → 0x00RRGGBB (value already doesn't have alpha bits)
}

function updateCraftPreview(): void {
  const canvas = $('craft-preview') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const primary = ($('craft-primary') as HTMLInputElement)?.value ?? '#ff4500';
  const secondary = ($('craft-secondary') as HTMLInputElement)?.value ?? '#ffd700';
  const pattern = parseInt(($('craft-pattern') as HTMLSelectElement)?.value ?? '0', 10);
  const eye = parseInt(($('craft-eye') as HTMLSelectElement)?.value ?? '0', 10);
  const accessory = parseInt(($('craft-accessory') as HTMLSelectElement)?.value ?? '0', 10);

  ctx.clearRect(0, 0, 200, 200);
  const skin: SkinData = {
    id: { id: '' },
    primary: rgbToU32(primary),
    secondary: rgbToU32(secondary),
    pattern,
    eye,
    accessory,
    rarity: 3,
    seed: '0',
    name: 'preview',
  };
  SkinRenderer.drawChickenSkin(ctx, 100, 100, 70, skin);
}

function getCraftParams(): { primary: string; secondary: string; pattern: number; eye: number; accessory: number; name: string } | null {
  const name = ($('craft-name') as HTMLInputElement)?.value.trim();
  if (!name) return null;
  return {
    primary: ($('craft-primary') as HTMLInputElement)?.value ?? '#ff4500',
    secondary: ($('craft-secondary') as HTMLInputElement)?.value ?? '#ffd700',
    pattern: parseInt(($('craft-pattern') as HTMLSelectElement)?.value ?? '0', 10),
    eye: parseInt(($('craft-eye') as HTMLSelectElement)?.value ?? '0', 10),
    accessory: parseInt(($('craft-accessory') as HTMLSelectElement)?.value ?? '0', 10),
    name,
  };
}

async function handleOpenBox(): Promise<void> {
  if (!wallet.isConnected) { setStatus(i18n.t('status.wallet')); return; }
  const statusEl = $('craft-status');
  if (statusEl) statusEl.textContent = i18n.t('box.opening');

  try {
    const boxes = await suiClient.getOwnedBoxes();
    if (boxes.length === 0) {
      if (statusEl) statusEl.textContent = i18n.t('box.none');
      return;
    }
    const boxId = boxes[0].id.id;
    const digest = await suiClient.openSkinBox(boxId, SKIN_BOX_PRICE);
        await refreshSkins();
    if (statusEl) statusEl.textContent = i18n.t('box.done');
    setStatus(i18n.t('box.done'));
  } catch (err) {
    console.error('[box] Open failed:', err);
    if (statusEl) statusEl.textContent = i18n.t('craft.fail');
  }
}

async function handleCraftSkin(): Promise<void> {
  if (!wallet.isConnected) { setStatus(i18n.t('status.wallet')); return; }
  const params = getCraftParams();
  if (!params) { setStatus(i18n.t('craft.name_required')); return; }

  const statusEl = $('craft-status');
  if (statusEl) statusEl.textContent = i18n.t('craft.minting');
  setStatus(i18n.t('craft.minting'));

  try {
    const digest = await suiClient.craftSkin(
      rgbToU32(params.primary),
      rgbToU32(params.secondary),
      params.pattern,
      params.eye,
      params.accessory,
      params.name,
    );
        await refreshSkins();
    if (statusEl) statusEl.textContent = i18n.t('craft.done');
    setStatus(i18n.t('craft.done'));
  } catch (err) {
    console.error('[craft] Mint failed:', err);
    if (statusEl) statusEl.textContent = i18n.t('craft.fail');
    setStatus(i18n.t('craft.fail'));
  }
}

let marketFilter: 'all' | 'free' | 'paid' = 'all';
const FAILED_BLOB_KEY = 'crazych.failed_blobs';
let communityLevels: CommunityLevel[] = [];
const failedBlobIds: Set<string> = new Set(loadFailedBlobs());

function loadFailedBlobs(): string[] {
  try { return JSON.parse(localStorage.getItem(FAILED_BLOB_KEY) ?? '[]'); } catch { return []; }
}

function saveFailedBlobs(): void {
  localStorage.setItem(FAILED_BLOB_KEY, JSON.stringify([...failedBlobIds]));
}

function removeExpiredLevelCard(blobId: string): void {
  failedBlobIds.add(blobId);
  saveFailedBlobs();
  buildMarketGrid();
  const statusEl = $('market-status');
  if (statusEl) statusEl.textContent = '已移除失效关卡';
}

async function refreshMarket(): Promise<void> {
  const statusEl = $('market-status');
  if (statusEl) statusEl.textContent = i18n.t('market.loading');
  try {
    communityLevels = await levelMarket.fetchAll();
    buildMarketGrid();
    } catch (err) {
      console.error('[market] Failed to load community levels:', err);
      if (statusEl) statusEl.textContent = i18n.t('market.error');
    }
}

function buildMarketGrid(): void {
  const grid = $('market-grid');
  if (!grid) return;
  const statusEl = $('market-status');
  grid.innerHTML = '';

  const filtered = communityLevels.filter(l => {
    if (failedBlobIds.has(l.blobId)) return false;
    if (marketFilter === 'free') return l.price === '0';
    if (marketFilter === 'paid') return l.price !== '0';
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">${i18n.t('market.none')}</div>`;
    if (statusEl) statusEl.textContent = '';
    return;
  }

  for (const level of filtered) {
    const card = document.createElement('div');
    card.className = 'market-card';

    const price = BigInt(level.price);
    const isFree = price === 0n;
    const avgRating = level.ratingCount > 0 ? (level.ratingSum / level.ratingCount).toFixed(1) : '-';
    const creator = `${level.creator.slice(0, 6)}...${level.creator.slice(-4)}`;

    card.innerHTML = `
      <div class="market-card-info">
        <div class="market-card-name">${level.name}</div>
        <div class="market-card-meta">${creator} | ⭐ ${avgRating} | ${i18n.t('chickens')} ${level.playCount}</div>
      </div>
      <div class="market-card-actions">
        <button class="btn ${isFree ? 'btn-primary' : ''}" data-blob="${level.blobId}" data-id="${level.levelId}" data-price="${level.price}">
          ${isFree ? i18n.t('market.play') : `${i18n.t('market.buy')} ${(Number(level.price) / 1e9).toFixed(2)} SUI`}
        </button>
      </div>
    `;

    const btn = card.querySelector('button')!;
    btn.addEventListener('click', async () => {
      if (isFree) {
        try {
          setStatus(i18n.t('market.play_loading', { name: level.name }));
          const levelConfig = await levelMarket.loadLevel(level.blobId);
          const id = 1000 + Math.floor(Math.random() * 9000);
          localStorage.setItem('crazych.community.level.' + id, JSON.stringify({ ...levelConfig, id }));
          sessionStorage.setItem('crazych.community.load', String(id));
          window.location.href = `/?level=${id}`;
        } catch (err) {
          console.error('[market] Failed to load level:', err);
          removeExpiredLevelCard(level.blobId);
          setStatus(i18n.t('market.play_fail'));
        }
      } else {
        if (!wallet.isConnected) { setStatus(i18n.t('status.wallet')); return; }
        btn.disabled = true;
        btn.textContent = i18n.t('market.buying');
        try {
          const digest = await levelMarket.purchaseLevel(level.levelId, level.price);
          btn.textContent = i18n.t('market.play');
          const levelConfig = await levelMarket.loadLevel(level.blobId);
          const id = 1000 + Math.floor(Math.random() * 9000);
          localStorage.setItem('crazych.community.level.' + id, JSON.stringify({ ...levelConfig, id }));
          sessionStorage.setItem('crazych.community.load', String(id));
          window.location.href = `/?level=${id}`;
        } catch (err) {
          console.error('[market] Purchase failed:', err);
          removeExpiredLevelCard(level.blobId);
          btn.disabled = false;
          btn.textContent = level.price === '0' ? i18n.t('market.play') : `${i18n.t('market.buy')} ${(Number(level.price) / 1e9).toFixed(2)} SUI`;
          setStatus(i18n.t('market.buy_fail'));
        }
      }
    });

    grid.appendChild(card);
  }

  if (statusEl) statusEl.textContent = `${filtered.length} levels`;
}

function hideLoading(): void {
  const el = $('loading');
  if (el) el.style.display = 'none';
}

function setLoadingProgress(pct: number, text: string): void {
  const fill = $('loading-fill');
  if (fill) (fill as HTMLElement).style.width = pct + '%';
  const label = $('loading-text');
  if (label) label.textContent = text;
}

async function preloadResources(): Promise<void> {
  setLoadingProgress(10, '正在加载背景音乐...');
  await audio.preloadBgm();
  setLoadingProgress(40, '正在加载音效...');
  await audio.preloadSfx();
  setLoadingProgress(100, '准备就绪!');
  await new Promise(r => setTimeout(r, 300));
}

function hideOverlay(id: string): void {
  const el = $(id);
  if (el) el.classList.add('hidden');
}

function showOverlay(id: string): void {
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

function updateLevelSelector(activeId: number): void {
  document.querySelectorAll<HTMLElement>('.level-grid-btn, .level-btn').forEach((btn) => {
    const id = parseInt(btn.dataset.level ?? '0', 10);
    btn.classList.toggle('active', id === activeId);
  });
  updateLevelSelectorUI();
}

function enterGameFromHome(): void {
  const home = $('home-screen');
  if (home) home.classList.add('hidden');
  showOverlay('level-select-overlay');
  if (currentGame) buildOfficialLevelGrid(currentGame);
}

function updateHomeWalletUI(): void {
  const wBtn = $('home-wallet-btn');
  if (!wBtn) return;

  const isConnected = wallet.isConnected && !!wallet.currentAccount;
  const isAdmin = isConnected && wallet.currentAccount?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  const editorBtn = $('home-editor');
  if (editorBtn) {
    editorBtn.classList.toggle('hidden', !isAdmin);
  }

  const createBtn = $('home-create');
  if (createBtn) {
    createBtn.classList.toggle('hidden', !isConnected);
  }

  if (isConnected) {
    const addr = `${wallet.currentAccount!.slice(0, 6)}...${wallet.currentAccount!.slice(-4)}`;
    wBtn.textContent = `${addr}`;
    wBtn.classList.add('connected');
    wBtn.onclick = () => {
      wallet.disconnect();
      updateWalletUI();
      updateLevelSelectorUI();
    };
  } else {
    wBtn.textContent = i18n.t('btn.wallet');
    wBtn.classList.remove('connected');
    wBtn.onclick = () => showOverlay('home-wallet-prompt');
  }
}

function setupHomeScreenHandlers(): void {
  const home = $('home-screen');
  if (!home) return;

  const startBtn = $('home-start');
  if (startBtn) {
    startBtn.onclick = () => {
      if (wallet.isConnected) {
        enterGameFromHome();
      } else {
        pendingAction = () => enterGameFromHome();
        showOverlay('home-wallet-prompt');
      }
    };
  }

  const editorBtn = $('home-editor');
  if (editorBtn) {
    editorBtn.onclick = () => {
      if (wallet.isConnected && wallet.currentAccount?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) {
        const targetLevel = currentGame?.currentLevel?.id || 1;
        startEditor(targetLevel);
      } else {
        showUserLevelSelector();
      }
    };
  }

  const createBtn = $('home-create');
  if (createBtn) {
    createBtn.onclick = () => showUserLevelSelector();
  }

  const communityBtn = $('home-community');
  if (communityBtn) {
    communityBtn.onclick = () => {
      if (!wallet.isConnected) {
        pendingAction = () => {
          home.classList.add('hidden');
          $('market-panel')?.classList.remove('hidden');
          refreshMarket();
        };
        showOverlay('home-wallet-prompt');
        return;
      }
      home.classList.add('hidden');
      $('market-panel')?.classList.remove('hidden');
      refreshMarket();
    };
  }

  const skinsBtn = $('home-skins');
  if (skinsBtn) {
    skinsBtn.onclick = () => {
      if (!wallet.isConnected) {
        pendingAction = () => {
          home.classList.add('hidden');
          refreshSkins();
          $('skin-panel')?.classList.remove('hidden');
        };
        showOverlay('home-wallet-prompt');
        return;
      }
      home.classList.add('hidden');
      refreshSkins();
      $('skin-panel')?.classList.remove('hidden');
    };
  }

  const shopBtn = $('home-shop');
  if (shopBtn) {
    shopBtn.onclick = () => {
      if (!wallet.isConnected) {
        pendingAction = () => {
          home.classList.add('hidden');
          showShop();
        };
        showOverlay('home-wallet-prompt');
        return;
      }
      home.classList.add('hidden');
      showShop();
    };
  }

  updateHomeWalletUI();

  const homeLangBtn = $('home-lang-btn');
  if (homeLangBtn) {
    homeLangBtn.textContent = i18n.t('btn.lang');
    homeLangBtn.onclick = () => {
      i18n.toggle();
      applyI18n();
      const lBtn = $('home-lang-btn');
      if (lBtn) lBtn.textContent = i18n.t('btn.lang');
      updateHomeWalletUI();
      const pTitle = $('home-prompt-title');
      if (pTitle) pTitle.textContent = i18n.t('home.wallet_prompt.title');
      const pDesc = $('home-prompt-desc');
      if (pDesc) pDesc.textContent = i18n.t('home.wallet_prompt.desc');
      const pConnect = $('home-prompt-connect');
      if (pConnect) pConnect.textContent = i18n.t('home.wallet_prompt.connect');
      const pSkip = $('home-prompt-skip');
      if (pSkip) pSkip.textContent = i18n.t('home.wallet_prompt.skip');
      const pMsg = $('home-prompt-msg');
      if (pMsg) pMsg.textContent = '';
    };
  }

  const promptConnect = $('home-prompt-connect') as HTMLButtonElement | null;
  const promptMsg = $('home-prompt-msg');
  if (promptConnect) {
    promptConnect.onclick = async () => {
      if (!wallet.isAvailable()) {
        if (promptMsg) promptMsg.textContent = i18n.t('status.no_wallet');
        return;
      }
      const skipBtn = $('home-prompt-skip') as HTMLButtonElement | null;
      promptConnect.disabled = true;
      if (skipBtn) skipBtn.disabled = true;
      const origText = promptConnect.textContent;
      promptConnect.textContent = i18n.t('status.connecting');

      if (wallet.availableWallets.length === 1) {
        try {
          await wallet.connect(wallet.availableWallets[0].id);
          onWalletConnected();
          updateHomeWalletUI();
          hideOverlay('home-wallet-prompt');
          const action = pendingAction;
          pendingAction = null;
          if (action) action();
        } catch {
          setStatus(i18n.t('status.conn_fail'));
          if (promptMsg) promptMsg.textContent = `❌ ${i18n.t('status.conn_fail')}`;
          promptConnect.disabled = false;
          promptConnect.textContent = origText;
          if (skipBtn) skipBtn.disabled = false;
        }
      } else {
        if (promptMsg) promptMsg.textContent = '';
        hideOverlay('home-wallet-prompt');
        buildWalletSelection();
        showOverlay('wallet-select-overlay');
        promptConnect.disabled = false;
        promptConnect.textContent = origText;
      }
    };
  }
  if (promptMsg) promptMsg.textContent = '';

  const promptSkip = $('home-prompt-skip');
  if (promptSkip) {
    promptSkip.onclick = () => {
      hideOverlay('home-wallet-prompt');
      const action = pendingAction;
      pendingAction = null;
      if (action) action();
    };
  }
}

function showHomeScreen(): void {
  hideLoading();
  const home = $('home-screen');
  if (!home) return;
  home.classList.remove('hidden');
  setupHomeScreenHandlers();
}

function getCanvasPos(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function anyBodyMoving(physics: PhysicsWorld): boolean {
  for (const body of physics.bodies) {
    const meta = physics.metas.get(body);
    if (!meta || meta.role === 'ground') continue;
    const v = body.GetLinearVelocity();
    const moving = Math.abs(v.x) > SETTLE_VELOCITY_THRESHOLD || Math.abs(v.y) > SETTLE_VELOCITY_THRESHOLD;
    if (moving) return true;
  }
  return false;
}

function onEnterState(
  state: GameState,
  slingshot: {
    remaining(): number;
    loadChicken(): void;
    hasChickens(): boolean;
    isLoaded: boolean;
  },
): void {
  switch (state) {
    case 'SETUP':
      setStatus(i18n.t('status.setup'));
      break;
    case 'AIM':
      if (slingshot.hasChickens() && !slingshot.isLoaded) {
        slingshot.loadChicken();
        setChickens(slingshot.remaining());
      }
      setStatus(i18n.t('status.aim'));
      break;
    case 'FLYING':
      setStatus(i18n.t('status.flying'));
      break;
    case 'SETTLE':
      setStatus(i18n.t('status.settle'));
      break;
    case 'WIN':
      setStatus(i18n.t('status.win'));
      break;
    case 'LOSE':
      setStatus(i18n.t('status.lose'));
      break;
  }
}

async function loadAtlas(renderer: Renderer): Promise<SpriteAtlas | null> {
  const atlas = new SpriteAtlas();
  try {
    await atlas.ready();
    renderer.setSpriteAtlas(atlas);
    return atlas;
  } catch (err) {
    console.warn('[crazych] Sprites unavailable, using vector fallback.', err);
    renderer.setSpriteAtlas(null);
    return null;
  }
}

function calcStars(totalChickens: number, remainingChickens: number): number {
  const used = totalChickens - remainingChickens;
  if (used <= 1) return 3;
  if (used <= 2) return 2;
  return 1;
}

function saveLevelProgress(levelId: number, stars: number): void {
  try {
    const raw = localStorage.getItem('crazych.progress');
    const data = raw ? JSON.parse(raw) : {};
    const key = String(levelId);
    const current = data[key]?.stars ?? 0;
    if (stars > current) {
      data[key] = { stars };
      localStorage.setItem('crazych.progress', JSON.stringify(data));
    }
  } catch { /* ignore */ }
}

function getLevelStars(id: number): number {
  try {
    const raw = localStorage.getItem('crazych.progress');
    if (!raw) return 0;
    const data = JSON.parse(raw) as Record<string, { stars: number }>;
    return data[String(id)]?.stars ?? 0;
  } catch { return 0; }
}

function buildOfficialLevelGrid(game: Game): void {
  const grid = $('level-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const lvl of LEVELS) {
    const btn = document.createElement('button');
    btn.className = 'level-grid-btn';
    btn.dataset.level = String(lvl.id);
    const isLocked = lvl.id > FREE_LEVELS && !isLevelUnlocked(lvl.id);
    if (isLocked) btn.classList.add('locked');
    const stars = getLevelStars(lvl.id);
    btn.innerHTML = stars > 0
      ? `${lvl.id}<span class="stars">${'★'.repeat(stars)}</span>`
      : isLocked ? '\u{1F512}' : String(lvl.id);
    btn.title = isLocked ? i18n.t('lock.title') : i18n.levelName(lvl);
    btn.addEventListener('click', () => {
      if (!isLocked) tryLoadLevel(game, lvl.id);
    });
    grid.appendChild(btn);
  }
  updateLevelSelectorUI();
}

async function loadCommunityLevels(game: Game): Promise<void> {
  const list = $('community-level-list');
  if (!list) return;
  if (!wallet.isConnected) {
    list.innerHTML = `<div class="community-level-empty">${i18n.t('status.wallet')}</div>`;
    return;
  }
  list.innerHTML = `<div class="community-level-empty">${i18n.t('market.loading')}</div>`;
  try {
    const levels = await levelMarket.fetchAll();
    list.innerHTML = '';
    if (levels.length === 0) {
      list.innerHTML = `<div class="community-level-empty">${i18n.t('market.none')}</div>`;
      return;
    }
    for (const level of levels) {
      const isFree = BigInt(level.price) === 0n;
      const avgRating = level.ratingCount > 0 ? (level.ratingSum / level.ratingCount).toFixed(1) : '-';
      const creator = `${level.creator.slice(0, 6)}...${level.creator.slice(-4)}`;
      const item = document.createElement('div');
      item.className = 'community-level-item';
      item.innerHTML = `
        <div class="info">
          <div class="name">${level.name}</div>
          <div class="meta">${creator} | ⭐ ${avgRating} | 🎮 ${level.playCount}</div>
        </div>
        <div class="actions">
          <button class="btn ${isFree ? 'btn-primary' : ''}">${isFree ? i18n.t('market.play') : `${i18n.t('market.buy')} ${(Number(level.price) / 1e9).toFixed(2)} SUI`}</button>
        </div>
      `;
      const btn = item.querySelector('button')!;
      btn.addEventListener('click', async () => {
        if (isFree) {
          try {
            const levelConfig = await levelMarket.loadLevel(level.blobId);
            const id = 1000 + Math.floor(Math.random() * 9000);
            localStorage.setItem('crazych.community.level.' + id, JSON.stringify({ ...levelConfig, id }));
            tryLoadLevel(game, id, true);
          } catch (err) {
            console.error('[community] Failed to load level:', err);
            setStatus(i18n.t('market.play_fail'));
          }
        } else {
          if (!wallet.isConnected) { setStatus(i18n.t('status.wallet')); return; }
          btn.disabled = true;
          btn.textContent = i18n.t('market.buying');
          try {
            const digest = await levelMarket.purchaseLevel(level.levelId, level.price);
            const levelConfig = await levelMarket.loadLevel(level.blobId);
            const id = 1000 + Math.floor(Math.random() * 9000);
            localStorage.setItem('crazych.community.level.' + id, JSON.stringify({ ...levelConfig, id }));
            tryLoadLevel(game, id, true);
          } catch (err) {
            console.error('[community] Purchase failed:', err);
            btn.disabled = false;
            btn.textContent = `${i18n.t('market.buy')} ${(Number(level.price) / 1e9).toFixed(2)} SUI`;
            setStatus(i18n.t('market.buy_fail'));
          }
        }
      });
      list.appendChild(item);
    }
  } catch (err) {
    console.error('[community] Failed to load:', err);
    list.innerHTML = `<div class="community-level-empty">${i18n.t('market.error')}</div>`;
  }
}

function setupLevelSelect(game: Game): void {
  const menuBtn = $('select-level-btn');
  const dropdown = $('hud-dropdown');

  function closeDropdown(): void {
    dropdown?.classList.add('hidden');
  }

  if (menuBtn && dropdown) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target as Node) && e.target !== menuBtn) {
        closeDropdown();
      }
    });
    dropdown.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.hud-dropdown-item') as HTMLElement | null;
      if (!item) return;
      closeDropdown();
      const action = item.dataset.action;
      if (action === 'level-select') {
        showOverlay('level-select-overlay');
        buildOfficialLevelGrid(game);
      } else if (action === 'about') {
        refreshTreasuryUI();
        showOverlay('about-overlay');
      }
    });
  }

  $('level-select-close')?.addEventListener('click', () => hideOverlay('level-select-overlay'));
  $('level-select-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideOverlay('level-select-overlay');
  });

  document.querySelectorAll<HTMLElement>('.level-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.level-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      $('level-grid')?.classList.toggle('hidden', which !== 'official');
      $('community-level-list')?.classList.toggle('hidden', which !== 'community');
      if (which === 'official') buildOfficialLevelGrid(game);
      if (which === 'community') await loadCommunityLevels(game);
    });
  });
}

async function startEditor(levelId: number): Promise<void> {
  $('home-screen')?.classList.add('hidden');
  setStatus(i18n.t('editor.init'));
  const oldCanvas = $('game') as HTMLCanvasElement;
  if (oldCanvas) {
    const fresh = oldCanvas.cloneNode(true) as HTMLCanvasElement;
    oldCanvas.replaceWith(fresh);
  }
  const canvas = $('game') as HTMLCanvasElement;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.cursor = 'default';

  const physics = await PhysicsWorld.create();
  const renderer = new Renderer(canvas);
  const factory = new BodyFactory(physics);
  const atlas = await loadAtlas(renderer);

  hideOverlay('win-overlay');
  hideOverlay('lose-overlay');
  const selector = $('level-selector');
  if (selector) selector.remove();
  setText('fps', 'EDITOR');
  setText('chickens', '--');
  setText('status', i18n.t('editor.status'));
  setText('level', `${i18n.t('level.prefix')} ${levelId} Editor`);

  const editor = new LevelEditor(canvas, physics, renderer, factory, atlas, levelId, {
    onPublish: async (levelData) => {
      setStatus(i18n.t('editor.publish_walrus'));

      const json = JSON.stringify(levelData);
      const encoded = encodeURIComponent(btoa(json));
      const dataUrl = `${window.location.origin}${window.location.pathname}?leveldata=${encoded}`;

      let blobId: string | null = null;
      let blobUrl = '';
      try {
        blobId = await walrusClient.uploadLevel(levelData);
        blobUrl = `${window.location.origin}${window.location.pathname}?blob=${blobId}`;
        setStatus(i18n.t('editor.publish_chain'));
      } catch (e) {
        console.warn('[Editor] Walrus upload failed:', e);
      }

      let txDigest: string | null = null;
      if (blobId) {
        try {
          const price = 0;
          txDigest = await suiClient.publishLevel(
            `${levelData.id} ${levelData.name}`,
            levelData.description || 'User-created level',
            blobId,
            price,
          );
          setStatus(i18n.t('editor.publish_ok'));
        } catch (e) {
          console.warn('[Editor] Sui publish failed:', e);
        }
      }

      const pubEl = $('share-publisher');
      if (pubEl) pubEl.textContent = wallet.currentAccount || '--';
      const nameEl = $('share-level-name');
      if (nameEl) nameEl.textContent = levelData.name || '--';
      const statusEl = $('share-status-text');
      if (statusEl) {
        if (txDigest) statusEl.textContent = i18n.t('share.status_published');
        else if (blobId) statusEl.textContent = i18n.t('share.status_walrus_only');
        else statusEl.textContent = i18n.t('share.status_local_only');
      }
      const blobIdEl = $('share-blob-id');
      if (blobIdEl) blobIdEl.textContent = blobId || '--';
      const digestEl = $('share-tx-digest');
      if (digestEl) digestEl.textContent = txDigest || '--';

      const linkEl = $('share-explorer-link') as HTMLAnchorElement | null;
      if (linkEl && blobId) {
        linkEl.href = `https://suiexplorer.com/object/${blobId}?network=testnet`;
        const parent = linkEl.parentElement;
        if (parent) parent.classList.remove('hidden');
      } else if (linkEl) {
        const parent = linkEl.parentElement;
        if (parent) parent.classList.add('hidden');
      }

      const dataInput = $('share-link-data') as HTMLInputElement | null;
      if (dataInput) dataInput.value = dataUrl;
      const blobInput = $('share-link-blob') as HTMLInputElement | null;
      if (blobInput) blobInput.value = blobUrl;
      const statusSmallEl = $('share-link-status');
      if (statusSmallEl) statusSmallEl.textContent = '';
      showOverlay('share-overlay');
    },
  });
  function setupCopyBtn(btnId: string, inputId: string): void {
    const btn = $(btnId);
    const input = $(inputId) as HTMLInputElement | null;
    if (!btn || !input) return;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        const statusEl = $('share-link-status');
        if (statusEl) statusEl.textContent = i18n.t('share.copied') || 'Copied!';
      } catch {
        input.select();
        const statusEl = $('share-link-status');
        if (statusEl) statusEl.textContent = i18n.t('share.select_manual') || 'Please copy manually';
      }
    });
  }
  setupCopyBtn('share-copy-data', 'share-link-data');
  setupCopyBtn('share-copy-blob', 'share-link-blob');
  $('share-close')?.addEventListener('click', () => hideOverlay('share-overlay'));
  setupCommonHUD(null);
  setupWalletHandlers();
  hideLoading();
  editor.start();
}

async function startUserEditor(existingLevel?: LevelConfig): Promise<void> {
  $('home-screen')?.classList.add('hidden');
  hideOverlay('user-levels-overlay');
  setStatus(i18n.t('ueditor.init'));
  const oldCanvas = $('game') as HTMLCanvasElement;
  if (oldCanvas) {
    const fresh = oldCanvas.cloneNode(true) as HTMLCanvasElement;
    oldCanvas.replaceWith(fresh);
  }
  const canvas = $('game') as HTMLCanvasElement;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.cursor = 'default';

  const physics = await PhysicsWorld.create();
  const renderer = new Renderer(canvas);
  const factory = new BodyFactory(physics);
  const atlas = await loadAtlas(renderer);

  hideOverlay('win-overlay');
  hideOverlay('lose-overlay');
  setText('fps', 'CREATE');
  setText('chickens', '--');
  setText('status', i18n.t('ueditor.status'));
  setText('level', i18n.t('ueditor.title'));

  const editor = new UserLevelEditor(canvas, physics, renderer, factory, atlas, {
    onPublish: async (name, desc, bugs, blocks): Promise<string | null> => {
      setStatus(i18n.t('ueditor.publish_walrus'));
      const levelData = {
        id: 9000, name, description: desc,
        difficulty: 3 as const, chickens: 3,
        slingshot: { ...DEFAULT_SLINGSHOT },
        ground: { y: GROUND_Y },
        bugs, blocks,
      };

      let blobId: string | null = null;
      try {
        blobId = await walrusClient.uploadLevel(levelData);
        setStatus(i18n.t('ueditor.publish_chain'));
      } catch (e) {
        console.warn('[UserEditor] Walrus upload failed:', e);
        return null;
      }

      try {
        const price = 0;
        await suiClient.publishLevel(name, desc, blobId, price);
        setStatus(i18n.t('ueditor.publish_ok'));
      } catch (e) {
        console.warn('[UserEditor] Sui publish failed:', e);
      }

      return blobId;
    },
    onShare: async (name, desc, bugs, blocks, blobId) => {
      const levelData = {
        id: 9000, name, description: desc,
        difficulty: 3 as const, chickens: 3,
        slingshot: { ...DEFAULT_SLINGSHOT },
        ground: { y: GROUND_Y },
        bugs, blocks,
      };

      const json = JSON.stringify(levelData);
      const encoded = encodeURIComponent(btoa(json));
      const dataUrl = `${window.location.origin}${window.location.pathname}?leveldata=${encoded}`;
      const blobUrl = blobId ? `${window.location.origin}${window.location.pathname}?blob=${blobId}` : '';

      const pubEl = $('share-publisher');
      if (pubEl) pubEl.textContent = wallet.currentAccount || '--';
      const nameEl = $('share-level-name');
      if (nameEl) nameEl.textContent = name || '--';
      const statusEl = $('share-status-text');
      if (statusEl) {
        if (blobId) statusEl.textContent = i18n.t('share.status_published');
        else statusEl.textContent = i18n.t('share.status_local_only');
      }
      const blobIdEl = $('share-blob-id');
      if (blobIdEl) blobIdEl.textContent = blobId || '--';
      const digestEl = $('share-tx-digest');
      if (digestEl) digestEl.textContent = '--';

      const linkEl = $('share-explorer-link') as HTMLAnchorElement | null;
      if (linkEl && blobId) {
        linkEl.href = `https://suiexplorer.com/object/${blobId}?network=testnet`;
        const parent = linkEl.parentElement;
        if (parent) parent.classList.remove('hidden');
      } else if (linkEl) {
        const parent = linkEl.parentElement;
        if (parent) parent.classList.add('hidden');
      }

      const dataInput = $('share-link-data') as HTMLInputElement | null;
      if (dataInput) dataInput.value = dataUrl;
      const blobInput = $('share-link-blob') as HTMLInputElement | null;
      if (blobInput) blobInput.value = blobUrl;

      const statusSmallEl = $('share-link-status');
      if (statusSmallEl) statusSmallEl.textContent = '';
      showOverlay('share-overlay');
    },
  });
  function setupCopyBtn2(btnId: string, inputId: string): void {
    const btn = $(btnId);
    const input = $(inputId) as HTMLInputElement | null;
    if (!btn || !input) return;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        const statusEl = $('share-link-status');
        if (statusEl) statusEl.textContent = i18n.t('share.copied') || 'Copied!';
      } catch {
        input.select();
        const statusEl = $('share-link-status');
        if (statusEl) statusEl.textContent = i18n.t('share.select_manual') || 'Please copy manually';
      }
    });
  }
  setupCopyBtn2('share-copy-data', 'share-link-data');
  setupCopyBtn2('share-copy-blob', 'share-link-blob');
  $('share-close')?.addEventListener('click', () => hideOverlay('share-overlay'));
  setupCommonHUD(null);
  setupWalletHandlers();
  hideLoading();
  editor.start(existingLevel);
}

async function showUserLevelSelector(): Promise<void> {
  const home = $('home-screen');
  if (home) home.classList.add('hidden');

  const grid = $('user-levels-grid');
  const statusEl = $('user-levels-status');
  if (!grid) return;

  grid.innerHTML = `<div class="user-levels-loading">${i18n.t('ueditor.loading_levels')}</div>`;
  if (statusEl) statusEl.textContent = '';

  let userLevels: UserLevelData[] = [];
  try {
    userLevels = await suiClient.getUserLevels();
  } catch (e) {
    console.warn('[UserLevels] Failed to fetch:', e);
  }

  grid.innerHTML = '';

  if (userLevels.length === 0) {
    grid.innerHTML = `<div class="user-levels-empty">${i18n.t('ueditor.no_levels')}</div>`;
  } else {
    for (const ul of userLevels) {
      const card = document.createElement('div');
      card.className = 'user-level-card';
      card.innerHTML = `
        <div>
          <div class="user-level-card-name">${ul.name || 'Unnamed'}</div>
          <div class="user-level-card-desc">${ul.description || ''}</div>
        </div>
        <span class="user-level-card-arrow">→</span>
      `;
      card.addEventListener('click', async () => {
        grid.innerHTML = `<div class="user-levels-loading">${i18n.t('status.loading')}</div>`;
        try {
          const levelData = await walrusClient.downloadLevel(ul.blob_id);
          hideOverlay('user-levels-overlay');
          startUserEditor(levelData);
        } catch (e) {
          console.warn('[UserLevels] Download failed:', e);
          if (statusEl) statusEl.textContent = `${i18n.t('ueditor.load_level_fail')}: ${e}`;
          showUserLevelSelector();
        }
      });
      grid.appendChild(card);
    }
  }

  showOverlay('user-levels-overlay');

  const closeBtn = $('user-levels-close');
  if (closeBtn) {
    const handler = () => {
      hideOverlay('user-levels-overlay');
      const home = $('home-screen');
      if (home) home.classList.remove('hidden');
    };
    closeBtn.onclick = handler;
  }

  const newBtn = $('user-levels-new-btn');
  if (newBtn) {
    newBtn.onclick = () => {
      hideOverlay('user-levels-overlay');
      startUserEditor();
    };
  }
}

function setupCommonHUD(game: Game | null): void {
  applyI18n();
  updateWalletUI();
  $('back-home-btn')?.addEventListener('click', () => {
    const home = $('home-screen');
    if (home) home.classList.remove('hidden');
  });
  $('wallet-disconnect-btn')?.addEventListener('click', disconnectWallet);
  document.addEventListener('click', (e) => {
    const popup = $('wallet-action-popup');
    const display = $('wallet-display');
    if (!popup || popup.classList.contains('hidden')) return;
    if (popup.contains(e.target as Node)) return;
    if (display && display.contains(e.target as Node)) return;
    popup.classList.add('hidden');
  });
  $('skin-btn')?.addEventListener('click', () => {
    if (wallet.isConnected) refreshSkins();
    $('skin-panel')?.classList.remove('hidden');
  });
  $('skin-close')?.addEventListener('click', () => {
    $('skin-panel')?.classList.add('hidden');
    const home = $('home-screen');
    if (home && !currentGame) home.classList.remove('hidden');
  });
  $('skin-none')?.addEventListener('click', () => {
    wallet.activeSkin = null;
    activePresetId = null;
    document.querySelectorAll('.skin-thumb').forEach(el => el.classList.remove('active'));
    $('skin-panel')?.classList.add('hidden');
  });
  $('lock-buy')?.addEventListener('click', handleBuyPack);
  $('lock-cancel')?.addEventListener('click', () => hideOverlay('lock-overlay'));
  $('wallet-cancel')?.addEventListener('click', () => {
    hideOverlay('wallet-select-overlay');
    pendingAction = null;
  });
  $('about-close')?.addEventListener('click', () => hideOverlay('about-overlay'));
  $('about-close-btn')?.addEventListener('click', () => hideOverlay('about-overlay'));
  $('about-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideOverlay('about-overlay');
  });
  $('craft-btn')?.addEventListener('click', () => {
    if (!wallet.isConnected) { setStatus(i18n.t('status.wallet')); return; }
    updateCraftPreview();
    $('craft-panel')?.classList.remove('hidden');
  });
  $('craft-close')?.addEventListener('click', () => $('craft-panel')?.classList.add('hidden'));
  $('craft-mint')?.addEventListener('click', handleCraftSkin);
  $('open-box-btn')?.addEventListener('click', handleOpenBox);
  for (const id of ['craft-primary', 'craft-secondary', 'craft-pattern', 'craft-eye', 'craft-accessory']) {
    $(id)?.addEventListener('change', updateCraftPreview);
    $(id)?.addEventListener('input', updateCraftPreview);
  }
  $('market-btn')?.addEventListener('click', async () => {
    if (!wallet.isConnected) { setStatus(i18n.t('status.wallet')); return; }
    $('market-panel')?.classList.remove('hidden');
    await refreshMarket();
  });
  $('market-close')?.addEventListener('click', () => {
    $('market-panel')?.classList.add('hidden');
    const home = $('home-screen');
    if (home && !currentGame) home.classList.remove('hidden');
  });
  $('market-refresh')?.addEventListener('click', refreshMarket);
  $('shop-close')?.addEventListener('click', () => {
    $('shop-overlay')?.classList.add('hidden');
    const home = $('home-screen');
    if (home && !currentGame) home.classList.remove('hidden');
  });
  $('shop-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      $('shop-overlay')?.classList.add('hidden');
      const home = $('home-screen');
      if (home && !currentGame) home.classList.remove('hidden');
    }
  });
  document.querySelectorAll('.market-filter').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.market-filter').forEach(b => b.classList.remove('active'));
      el.classList.add('active');
      marketFilter = (el as HTMLElement).dataset.filter as 'all' | 'free' | 'paid';
      buildMarketGrid();
    });
  });
  function updateSoundToggleUI(): void {
    const musicToggle = $('sound-music-toggle') as HTMLInputElement | null;
    const sfxToggle = $('sound-sfx-toggle') as HTMLInputElement | null;
    if (musicToggle) musicToggle.checked = !audio.musicMuted;
    if (sfxToggle) sfxToggle.checked = !audio.sfxMuted;
  }

  $('mute-btn')?.addEventListener('click', () => {
    showOverlay('sound-overlay');
    updateSoundToggleUI();
  });
  $('sound-close')?.addEventListener('click', () => {
    hideOverlay('sound-overlay');
  });
  $('sound-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideOverlay('sound-overlay');
  });
  $('sound-music-toggle')?.addEventListener('change', (e) => {
    audio.toggleMusic();
  });
  $('sound-sfx-toggle')?.addEventListener('change', (e) => {
    audio.toggleSfx();
  });
}

function setupWalletHandlers(): void {
  $('wallet-display')?.addEventListener('click', handleWalletClick);
}

function setupLangHandler(game: Game): void {
  $('lang-btn')?.addEventListener('click', () => {
    i18n.toggle();
    applyI18n();
    updateWalletUI();
    const s = game.state.getState();
    onEnterState(s, game.slingshot);
    if (game.currentLevel) setLevel(game.currentLevel);
    if (s === 'WIN') {
      const remaining = game.slingshot.remaining();
      const total = game.currentLevel.chickens;
      const stars = calcStars(total, remaining);
      const starsEl = $('win-stars');
      if (starsEl) starsEl.textContent = i18n.t('win.stars', { n: stars });
      const txt = $('win-stats');
      if (txt) txt.textContent = i18n.t('win.stats', { name: `${game.currentLevel.id} ${i18n.levelName(game.currentLevel)}`, n: remaining });
    } else if (s === 'LOSE') {
      const txt = $('lose-stats');
      if (txt) txt.textContent = i18n.t('lose.stats', { name: `${game.currentLevel.id} ${i18n.levelName(game.currentLevel)}`, n: game.aliveBugIds.size });
    }
  });
}

async function startGame(levelId: number): Promise<void> {
  setStatus(i18n.t('status.init'));
  const oldCanvas = $('game') as HTMLCanvasElement;
  if (oldCanvas) {
    const fresh = oldCanvas.cloneNode(true) as HTMLCanvasElement;
    oldCanvas.replaceWith(fresh);
  }
  const canvas = $('game') as HTMLCanvasElement;
  $('home-screen')?.classList.add('hidden');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.cursor = 'wait';

  const physics = await PhysicsWorld.create();
  setStatus(i18n.t('status.ready'));

  const collisions = new CollisionTracker(physics.world, PhysicsWorld.box2d!, physics.metas);
  collisions.install();

  const renderer = new Renderer(canvas);
  const atlas = await loadAtlas(renderer);
  const factory = new BodyFactory(physics);

  const game = new Game(physics, collisions, factory, {
    onLevelLoaded: (level) => {
      setLevel(level);
      renderer.setEnvironment(game.environment);
      setChickens(game.slingshot.remaining());
      updateChickenSelector(game.slingshot);
      updateLevelSelector(level.id);
      hideOverlay('win-overlay');
      hideOverlay('lose-overlay');
      hideOverlay('lock-overlay');
      onEnterState(game.state.getState(), game.slingshot);
      applyI18n();
    },
    onStateChange: (state) => {
      onEnterState(state, game.slingshot);
      if (state === 'AIM') {
        updateChickenSelector(game.slingshot);
      } else if (state === 'WIN') {
        audio.win();
        showOverlay('win-overlay');
        const remaining = game.slingshot.remaining();
        const total = game.currentLevel.chickens;
        const stars = calcStars(total, remaining);
        saveLevelProgress(game.currentLevel.id, stars);
        const starsEl = $('win-stars');
        if (starsEl) starsEl.textContent = i18n.t('win.stars', { n: stars });
        const txt = $('win-stats');
        if (txt) txt.textContent = i18n.t('win.stats', { name: `${game.currentLevel.id} ${i18n.levelName(game.currentLevel)}`, n: remaining });
        const next = $('win-next') as HTMLButtonElement | null;
        const nextId = game.currentLevel.id + 1;
        if (next) next.disabled = !getLevel(nextId) || !isLevelUnlocked(nextId);
      } else if (state === 'LOSE') {
        audio.lose();
        showOverlay('lose-overlay');
        const txt = $('lose-stats');
        if (txt) txt.textContent = i18n.t('lose.stats', { name: `${game.currentLevel.id} ${i18n.levelName(game.currentLevel)}`, n: game.aliveBugIds.size });
      } else {
        hideOverlay('win-overlay');
        hideOverlay('lose-overlay');
      }
    },
  });

  currentGame = game;
  setupLevelSelect(game);
  game.loadLevel(levelId);

  function tryLaunch(): void {
    if (!game.state.isAiming()) return;
    if (!game.slingshot.isDragging) return;
    const launchedBody = game.slingshot.onPointerUp();
    if (launchedBody) {
      audio.launch();
      game.makeInteractive();
      game.state.onLaunch();
      setChickens(game.slingshot.remaining());
      updateChickenSelector(game.slingshot);
    }
    canvas.style.cursor = game.state.isTerminal() ? 'default' : game.state.isAiming() ? 'grab' : 'wait';
  }

  function handleTap(): void {
    if (game.state.isFlying() && game.slingshot.canDropBomb()) {
      const result = game.slingshot.dropBomb();
      if (result) {
        game.particles.spawnBugDeath(result.x, result.y, '#FF4500', 12);
        audio.launch();
      }
    }
  }

  canvas.addEventListener('mousedown', (e) => {
    audio.init();
    if (game.state.isAiming()) {
      const pos = getCanvasPos(canvas, e.clientX, e.clientY);
      if (game.slingshot.onPointerDown(pos.x, pos.y)) {
        canvas.style.cursor = 'grabbing';
        audio.startDrag();
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!game.state.isAiming()) return;
    const pos = getCanvasPos(canvas, e.clientX, e.clientY);
    game.slingshot.onPointerMove(pos.x, pos.y);
  });

  canvas.addEventListener('mouseup', () => {
    if (game.state.isAiming()) tryLaunch();
    else handleTap();
  });
  canvas.addEventListener('mouseleave', () => {
    if (game.slingshot.isDragging) tryLaunch();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    audio.init();
    if (game.state.isAiming()) {
      const t = e.touches[0];
      if (!t) return;
      const pos = getCanvasPos(canvas, t.clientX, t.clientY);
      if (game.slingshot.onPointerDown(pos.x, pos.y)) {
        audio.startDrag();
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!game.state.isAiming()) return;
    const t = e.touches[0];
    if (!t) return;
    const pos = getCanvasPos(canvas, t.clientX, t.clientY);
    game.slingshot.onPointerMove(pos.x, pos.y);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (game.state.isAiming()) tryLaunch();
    else handleTap();
  }, { passive: false });

  $('win-restart')?.addEventListener('click', () => {
    hideOverlay('win-overlay');
    game.restart();
  });
  $('win-next')?.addEventListener('click', () => {
    hideOverlay('win-overlay');
    const nextId = game.currentLevel.id + 1;
    if (nextId <= LEVELS.length) {
      tryLoadLevel(game, nextId);
    }
  });
  $('win-select')?.addEventListener('click', () => {
    hideOverlay('win-overlay');
    showOverlay('level-select-overlay');
    buildOfficialLevelGrid(game);
  });
  $('lose-restart')?.addEventListener('click', () => {
    hideOverlay('lose-overlay');
    game.restart();
  });
  $('lose-select')?.addEventListener('click', () => {
    hideOverlay('lose-overlay');
    showOverlay('level-select-overlay');
    buildOfficialLevelGrid(game);
  });

  const chickenSelector = $('chicken-selector');
  if (chickenSelector) {
    chickenSelector.addEventListener('click', (e) => {
      const option = (e.target as HTMLElement).closest('.chicken-select-option') as HTMLElement | null;
      if (!option || option.classList.contains('disabled')) return;
      const kind = option.dataset.kind as ChickenKind;
      if (!kind) return;
      game.slingshot.selectKind(kind);
      updateChickenSelector(game.slingshot);
    });
  }

  setupCommonHUD(game);
  setupWalletHandlers();
  setupLangHandler(game);

  hideLoading();

  let lastTime = performance.now();
  let accumulator = 0;
  let frameCount = 0;
  let fpsTimer = 0;

  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    accumulator += dt;
    fpsTimer += dt;

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      physics.step(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }

    game.slingshot.updateChickenDamping(physics.metas);
    const kills = game.processCollisions();
    for (const k of kills) {
      let color = '#8B4513';
      if (k.kind === 'wormGreen') color = '#228B22';
      else if (k.kind === 'wormPink') color = '#FF69B4';
      else if (k.kind === 'wormBrown') color = '#8B4513';
      game.particles.spawnBugDeath(k.x, k.y, color);
      if (k.killer === 'ground') {
        game.particles.spawnDust(k.x, k.y, 6);
      }
    }
    game.cleanupOutOfBoundsBugs();

    game.state.tick({
      chickensRemaining: game.slingshot.remaining(),
      bugsAlive: game.aliveBugIds.size,
      anyInMotion: anyBodyMoving(physics),
    });

    if (game.state.isAiming() && !game.setupPrepared) {
      game.finalizeSetup();
    }

    game.notifyStateChange();

    if (game.state.isTerminal()) {
      canvas.style.cursor = 'default';
    } else if (!game.slingshot.isDragging) {
      canvas.style.cursor = game.state.isAiming() ? 'grab' : 'wait';
    }

    renderer.clear();
    renderer.updateWeather(FIXED_DT * steps || FIXED_DT);
    renderer.drawFarmBackground(game.environment, GROUND_Y);
    for (const body of physics.bodies) {
      const meta = physics.metas.get(body);
      if (!meta || meta.role === 'ground' || meta.shape !== 'box') continue;
      renderer.drawBox(physics, body);
    }
    for (const body of physics.bodies) {
      const meta = physics.metas.get(body);
      if (!meta || meta.role === 'ground' || meta.shape !== 'circle') continue;
      const p2 = body.GetPosition();
      const radius = meta.radius ?? 22;
      const pos = { x: physics.m2px(p2.x), y: physics.m2px(p2.y) };
      if (meta.role === 'bug') {
        renderer.drawBugCircle(pos, radius, meta.color, meta.kind);
      } else {
        drawChickenWithSkin(renderer, pos, radius, meta.color, meta.kind);
      }
    }

    const frameGeom = game.slingshot.getFrameGeometry();
    renderer.drawSlingshotFrame(frameGeom);

    if (game.slingshot.isDragging) {
      renderer.drawRubberBand(frameGeom.leftTip, frameGeom.rightTip, game.slingshot.getChickenRenderPos());
      renderer.drawTrajectory(game.slingshot.computeTrajectory());
    }

    if (game.slingshot.isLoaded) {
      const skinPos = game.slingshot.getChickenRenderPos();
      const skinR = game.slingshot.getLoadedRadius();
      drawChickenWithSkin(renderer, skinPos, skinR, game.slingshot.getLoadedColor(), game.slingshot.getLoadedKind());
    }

    game.particles.update(FIXED_DT * steps || FIXED_DT);
    game.particles.render(renderer.ctx);
    renderer.drawWeather();

    frameCount++;
    if (fpsTimer >= 0.5) {
      setFps(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

async function main(): Promise<void> {
  // 重置本地关卡进度
  try { localStorage.removeItem('crazych.progress'); } catch { /* ignore */ }
  await preloadResources();
  const params = new URLSearchParams(window.location.search);
  const leveldataParam = params.get('leveldata');
  if (leveldataParam) {
    try {
      const json = atob(decodeURIComponent(leveldataParam));
      const levelConfig = JSON.parse(json) as LevelConfig;
      const id = 3000 + Math.floor(Math.random() * 9000);
      localStorage.setItem('crazych.community.level.' + id, JSON.stringify({ ...levelConfig, id }));
      sessionStorage.setItem('crazych.community.load', String(id));
      await startGame(id);
      setupHomeScreenHandlers();
    } catch (err) {
      console.error('[leveldata] Failed to load embedded level:', err);
      setStatus('Failed to load shared level');
      await startGame(1);
      setupHomeScreenHandlers();
    }
    return;
  }
  const blobId = params.get('blob');
  if (blobId) {
    try {
      const levelConfig = await walrusClient.loadLevel(blobId);
      const id = 2000 + Math.floor(Math.random() * 9000);
      localStorage.setItem('crazych.community.level.' + id, JSON.stringify({ ...levelConfig, id }));
      sessionStorage.setItem('crazych.community.load', String(id));
      await startGame(id);
      setupHomeScreenHandlers();
    } catch (err) {
      console.error('[blob] Failed to load shared level:', err);
      setStatus('Failed to load shared level');
      await startGame(1);
      setupHomeScreenHandlers();
    }
    return;
  }
  const levelId = Math.max(1, parseInt(params.get('level') ?? '1', 10) || 1);
  if (params.get('editor') === '1') {
    await startGame(levelId);
    showHomeScreen();
    return;
  }
  const hasLevelParam = params.has('level');
  await startGame(levelId);
  setupHomeScreenHandlers();
  if (!hasLevelParam) {
    showHomeScreen();
  }
}

main().catch((err) => {
  console.error('[crazych] Fatal:', err);
  setStatus(`${i18n.t('status.error')}: ${err.message}`);
});
