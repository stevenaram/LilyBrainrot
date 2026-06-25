import { GAME_CONFIG } from "./config";
import type { GameState, PlacementPad } from "./types";

function defaultPads(): PlacementPad[] {
  return Array.from({ length: 6 }, (_, id) => ({ id, occupantId: null }));
}

export function createDefaultState(reducedMotion: boolean): GameState {
  return {
    version: 1,
    stars: GAME_CONFIG.startingStars,
    instances: [],
    pads: defaultPads(),
    discovered: [],
    settings: { soundEnabled: true, reducedMotion },
    tutorialSeen: false,
    firstMergeSeen: false,
    lastIncomeAt: Date.now(),
  };
}

export function loadState(reducedMotion: boolean): GameState {
  try {
    const raw = localStorage.getItem(GAME_CONFIG.saveKey);
    if (!raw) return createDefaultState(reducedMotion);
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.instances) || !Array.isArray(parsed.pads)) {
      return createDefaultState(reducedMotion);
    }

    const validInstances = parsed.instances.filter((item) =>
      item &&
      [1, 2, 3].includes(item.type) &&
      ["classic", "neon", "golden", "rainbow"].includes(item.rarity) &&
      typeof item.id === "string"
    );
    const validIds = new Set(validInstances.map((item) => item.id));
    const pads = defaultPads().map((pad) => ({
      ...pad,
      occupantId: parsed.pads?.[pad.id]?.occupantId && validIds.has(parsed.pads[pad.id].occupantId!)
        ? parsed.pads[pad.id].occupantId
        : null,
    }));

    return {
      ...createDefaultState(reducedMotion),
      ...parsed,
      version: 1,
      stars: Math.max(0, Number(parsed.stars) || 0),
      instances: validInstances.map((item) => ({
        ...item,
        status: item.padId === null ? "walking" : "placed",
      })),
      pads,
      discovered: Array.isArray(parsed.discovered) ? [...new Set(parsed.discovered.filter((key) => typeof key === "string"))] : [],
      settings: {
        soundEnabled: parsed.settings?.soundEnabled !== false,
        reducedMotion: reducedMotion || parsed.settings?.reducedMotion === true,
      },
    };
  } catch {
    return createDefaultState(reducedMotion);
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(GAME_CONFIG.saveKey, JSON.stringify(state));
  } catch {
    // The game remains fully playable if storage is unavailable.
  }
}
