export type BrainrotType = 1 | 2 | 3;
export type RarityTier = "classic" | "bubblegum" | "neon" | "ocean" | "golden" | "rainbow" | "cosmic";

export interface BrainrotInstance {
  id: string;
  type: BrainrotType;
  rarity: RarityTier;
  status: "walking" | "dragging" | "placed";
  padId: number | null;
  createdAt: number;
}

export interface PlacementPad {
  id: number;
  occupantId: string | null;
}

export interface CollectionEntry {
  type: BrainrotType;
  rarity: RarityTier;
  discovered: boolean;
}

export interface GameSettings {
  soundEnabled: boolean;
  reducedMotion: boolean;
}

export interface GameState {
  version: 1;
  stars: number;
  instances: BrainrotInstance[];
  pads: PlacementPad[];
  unlockedPads: number;
  discovered: string[];
  settings: GameSettings;
  tutorialSeen: boolean;
  firstMergeSeen: boolean;
  lastIncomeAt: number;
}

export type GameEventMap = {
  statechange: GameState;
  spawn: BrainrotInstance;
  catch: BrainrotInstance;
  place: { instance: BrainrotInstance; padId: number };
  swap: { firstId: string; secondId: string };
  merge: { result: BrainrotInstance; padId: number };
  rosterexpand: { unlockedPads: number };
  discover: { instance: BrainrotInstance; total: number };
  income: { amount: number; padId: number };
  message: { title: string; detail?: string; tone?: "pink" | "gold" | "rainbow" };
  sound: { name: "ring" | "catch" | "place" | "merge" | "star" | "discover" | "error" };
};
