import type { BrainrotType, RarityTier } from "./types";

export const GAME_CONFIG = {
  startingStars: 50,
  ringCost: 10,
  freeRingDelayMs: 8_000,
  autoPlaceDelayMs: 3_000,
  incomeIntervalMs: 8_000,
  maxWalkers: 4,
  startingPads: 6,
  maxPads: 12,
  padUnlockStep: 2,
  saveKey: "lilys-brainrot-parade-save-v1",
} as const;

export const RARITY_ORDER: RarityTier[] = ["classic", "bubblegum", "neon", "ocean", "golden", "rainbow", "cosmic"];
export const COLLECTION_TOTAL = RARITY_ORDER.length * 3;

export const RARITIES: Record<RarityTier, {
  label: string;
  income: number;
  probability: number;
  color: number;
  css: string;
  emoji: string;
}> = {
  classic: { label: "Classic", income: 1, probability: 0.72, color: 0xffffff, css: "#ff72b6", emoji: "" },
  bubblegum: { label: "Bubblegum", income: 2, probability: 0.16, color: 0xffa4d8, css: "#ff76c7", emoji: "🫧" },
  neon: { label: "Neon", income: 4, probability: 0.08, color: 0x71ffff, css: "#42ecff", emoji: "⚡" },
  ocean: { label: "Ocean", income: 7, probability: 0.03, color: 0x67a8ff, css: "#438cff", emoji: "💧" },
  golden: { label: "Golden", income: 12, probability: 0.009, color: 0xffd35a, css: "#ffd23f", emoji: "⭐" },
  rainbow: { label: "Rainbow", income: 20, probability: 0.0009, color: 0xffffff, css: "#b66cff", emoji: "🌈" },
  cosmic: { label: "Cosmic", income: 35, probability: 0.0001, color: 0xb57aff, css: "#6538d8", emoji: "🪐" },
};

export const CHARACTER_NAMES: Record<BrainrotType, string> = {
  1: "Pink Pop",
  2: "Grape Ninja",
  3: "Winky Violet",
};

export const PAD_POSITIONS = [
  { x: -4.6, y: 0.7 },
  { x: 4.6, y: 0.7 },
  { x: -4.45, y: -0.5 },
  { x: 4.45, y: -0.5 },
  { x: -4.05, y: -1.7 },
  { x: 4.05, y: -1.7 },
  { x: -3.25, y: 0.64 },
  { x: 3.25, y: 0.64 },
  { x: -3.15, y: -0.52 },
  { x: 3.15, y: -0.52 },
  { x: -2.95, y: -1.66 },
  { x: 2.95, y: -1.66 },
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

export function mergeRarity(first: RarityTier, second: RarityTier): RarityTier | null {
  const highest = Math.max(RARITY_ORDER.indexOf(first), RARITY_ORDER.indexOf(second));
  return highest >= 0 && highest < RARITY_ORDER.length - 1 ? RARITY_ORDER[highest + 1] : null;
}
