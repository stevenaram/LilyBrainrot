import type { BrainrotType, RarityTier } from "./types";

export const GAME_CONFIG = {
  startingStars: 50,
  ringCost: 10,
  freeRingDelayMs: 8_000,
  autoPlaceDelayMs: 3_000,
  incomeIntervalMs: 8_000,
  maxWalkers: 4,
  saveKey: "lilys-brainrot-parade-save-v1",
} as const;

export const RARITY_ORDER: RarityTier[] = ["classic", "neon", "golden", "rainbow"];

export const RARITIES: Record<RarityTier, {
  label: string;
  income: number;
  probability: number;
  color: number;
  css: string;
}> = {
  classic: { label: "Classic", income: 1, probability: 0.85, color: 0xffffff, css: "#ff72b6" },
  neon: { label: "Neon", income: 2, probability: 0.12, color: 0x9effff, css: "#55e7ff" },
  golden: { label: "Golden", income: 5, probability: 0.025, color: 0xffd35a, css: "#ffd23f" },
  rainbow: { label: "Rainbow", income: 12, probability: 0.005, color: 0xffffff, css: "#bb7cff" },
};

export const CHARACTER_NAMES: Record<BrainrotType, string> = {
  1: "Pink Pop",
  2: "Grape Ninja",
  3: "Winky Violet",
};

export const PAD_POSITIONS = [
  { x: -4.25, y: 0.55 },
  { x: 4.25, y: 0.55 },
  { x: -4.0, y: -0.75 },
  { x: 4.0, y: -0.75 },
  { x: -3.55, y: -2.05 },
  { x: 3.55, y: -2.05 },
] as const;

export function collectionKey(type: BrainrotType, rarity: RarityTier): string {
  return `${type}:${rarity}`;
}

export function rollType(): BrainrotType {
  return (Math.floor(Math.random() * 3) + 1) as BrainrotType;
}

export function rollRarity(): RarityTier {
  const roll = Math.random();
  let cursor = 0;
  for (const rarity of RARITY_ORDER) {
    cursor += RARITIES[rarity].probability;
    if (roll <= cursor) return rarity;
  }
  return "classic";
}

export function nextRarity(rarity: RarityTier): RarityTier | null {
  const index = RARITY_ORDER.indexOf(rarity);
  return index >= 0 && index < RARITY_ORDER.length - 1 ? RARITY_ORDER[index + 1] : null;
}
