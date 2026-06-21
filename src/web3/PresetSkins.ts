export interface PresetSkinConfig {
  id: string;
  name: string;
  file: string;
  price: number;
}

const BASE = import.meta.env.BASE_URL;

export const PRESET_SKINS: PresetSkinConfig[] = [
  { id: 'preset_3', name: '暗影刺客', file: `${BASE}shop/shopck3.png`, price: 1_000_000_000 },
  { id: 'preset_4', name: '翡翠战士', file: `${BASE}shop/shopck4.png`, price: 1_000_000_000 },
  { id: 'preset_5', name: '银河护卫', file: `${BASE}shop/shopck5.png`, price: 1_500_000_000 },
  { id: 'preset_6', name: '粉红甜心', file: `${BASE}shop/shopck6.png`, price: 1_500_000_000 },
  { id: 'preset_7', name: '雷霆战鸡', file: `${BASE}shop/shopck7.png`, price: 2_000_000_000 },
  { id: 'preset_8', name: '极冰凤凰', file: `${BASE}shop/shopck8.png`, price: 2_000_000_000 },
  { id: 'preset_9', name: '太阳神鸟', file: `${BASE}shop/shopck9.png`, price: 2_000_000_000 },
];

export const PRESET_STORAGE_KEY = 'crazych.presets.owned';

export function loadOwnedPresets(): Set<string> {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function saveOwnedPresets(ids: Set<string>): void {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify([...ids]));
}
