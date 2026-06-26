import { COLLECTION_TOTAL, collectionKey, GAME_CONFIG, mergeRarity, RARITIES, rollRarity, rollType } from "./config";
import type { EventBus } from "./events";
import { saveState } from "./persistence";
import type { BrainrotInstance, GameState } from "./types";

export class GameController {
  private noMoneySince: number | null = null;

  constructor(public state: GameState, private bus: EventBus) {
    this.reconcile();
    this.emitState();
  }

  canRing(now = performance.now()): { allowed: boolean; free: boolean } {
    const walkers = this.state.instances.filter((item) => item.status === "walking").length;
    if (walkers >= GAME_CONFIG.maxWalkers) return { allowed: false, free: false };
    if (this.state.stars >= GAME_CONFIG.ringCost) {
      this.noMoneySince = null;
      return { allowed: true, free: false };
    }
    if (this.noMoneySince === null) this.noMoneySince = now;
    const free = now - this.noMoneySince >= GAME_CONFIG.freeRingDelayMs;
    return { allowed: free, free };
  }

  ring(): BrainrotInstance | null {
    const availability = this.canRing();
    if (!availability.allowed) {
      this.bus.emit("sound", { name: "error" });
      return null;
    }
    if (!availability.free) this.state.stars = Math.max(0, this.state.stars - GAME_CONFIG.ringCost);
    this.noMoneySince = null;

    const instance: BrainrotInstance = {
      id: crypto.randomUUID(),
      type: rollType(),
      rarity: rollRarity(),
      status: "walking",
      padId: null,
      createdAt: Date.now(),
    };
    this.state.instances.push(instance);
    this.discover(instance);
    this.bus.emit("spawn", instance);
    this.bus.emit("sound", { name: "ring" });
    this.emitState();
    return instance;
  }

  catchInstance(id: string): BrainrotInstance | null {
    const instance = this.getInstance(id);
    if (!instance) return null;
    instance.status = "dragging";
    this.bus.emit("catch", instance);
    this.bus.emit("sound", { name: "catch" });
    this.emitState();
    return instance;
  }

  place(id: string, padId: number): boolean {
    const instance = this.getInstance(id);
    const targetPad = this.state.pads[padId];
    if (!instance || !targetPad || padId >= this.state.unlockedPads) return false;

    const originPad = instance.padId === null ? null : this.state.pads[instance.padId];
    const target = targetPad.occupantId ? this.getInstance(targetPad.occupantId) : null;

    if (!target || target.id === instance.id) {
      if (originPad && originPad.id !== padId) originPad.occupantId = null;
      targetPad.occupantId = instance.id;
      instance.padId = padId;
      instance.status = "placed";
      this.bus.emit("place", { instance, padId });
      this.bus.emit("sound", { name: "place" });
      this.expandRosterIfFull();
      this.emitState();
      return true;
    }

    if (target.type === instance.type) {
      return this.merge(instance, target, targetPad.id, originPad?.id ?? null);
    }

    const targetOrigin = target.padId;
    target.padId = originPad?.id ?? null;
    target.status = target.padId === null ? "walking" : "placed";
    if (originPad) originPad.occupantId = target.id;
    targetPad.occupantId = instance.id;
    instance.padId = targetPad.id;
    instance.status = "placed";
    this.bus.emit("swap", { firstId: instance.id, secondId: target.id });
    this.bus.emit("sound", { name: "place" });
    if (targetOrigin === null) target.status = "walking";
    this.emitState();
    return true;
  }

  autoPlace(id: string): void {
    const instance = this.getInstance(id);
    if (!instance || instance.status !== "dragging") return;
    const empty = this.state.pads.slice(0, this.state.unlockedPads).find((pad) => pad.occupantId === null);
    if (empty) {
      this.place(id, empty.id);
      return;
    }
    const match = this.state.pads.slice(0, this.state.unlockedPads).find((pad) => {
      const occupant = pad.occupantId ? this.getInstance(pad.occupantId) : null;
      return occupant?.type === instance.type;
    });
    if (match) {
      this.place(id, match.id);
      return;
    }
    instance.status = "walking";
    this.emitState();
  }

  tickIncome(now = Date.now()): void {
    if (now - this.state.lastIncomeAt < GAME_CONFIG.incomeIntervalMs) return;
    const cycles = Math.min(3, Math.floor((now - this.state.lastIncomeAt) / GAME_CONFIG.incomeIntervalMs));
    this.state.lastIncomeAt += cycles * GAME_CONFIG.incomeIntervalMs;
    let totalAwarded = 0;
    for (const pad of this.state.pads) {
      const instance = pad.occupantId ? this.getInstance(pad.occupantId) : null;
      if (!instance) continue;
      const amount = RARITIES[instance.rarity].income * cycles;
      this.state.stars += amount;
      totalAwarded += amount;
      this.bus.emit("income", { amount, padId: pad.id });
    }
    if (totalAwarded > 0) this.bus.emit("sound", { name: "star" });
    this.emitState();
  }

  setSound(enabled: boolean): void {
    this.state.settings.soundEnabled = enabled;
    this.emitState();
  }

  dismissTutorial(): void {
    this.state.tutorialSeen = true;
    this.emitState();
  }

  private merge(first: BrainrotInstance, second: BrainrotInstance, padId: number, originPadId: number | null): boolean {
    const upgraded = mergeRarity(first.rarity, second.rarity);
    if (!upgraded) {
      this.bus.emit("message", { title: "MAX COSMIC!", detail: "This brain rot is already the rarest!", tone: "rainbow" });
      this.bus.emit("sound", { name: "error" });
      first.status = first.padId === null ? "walking" : "placed";
      this.emitState();
      return false;
    }

    this.state.instances = this.state.instances.filter((item) => item.id !== first.id && item.id !== second.id);
    if (originPadId !== null) this.state.pads[originPadId].occupantId = null;

    const result: BrainrotInstance = {
      id: crypto.randomUUID(),
      type: first.type,
      rarity: upgraded,
      status: "placed",
      padId,
      createdAt: Date.now(),
    };
    this.state.instances.push(result);
    this.state.pads[padId].occupantId = result.id;
    this.discover(result);
    this.state.firstMergeSeen = true;
    this.bus.emit("merge", { result, padId });
    this.bus.emit("sound", { name: "merge" });
    this.bus.emit("message", {
      title: `${RARITIES[upgraded].label.toUpperCase()}!`,
      detail: "Matching characters always upgrade the better one!",
      tone: upgraded === "golden" ? "gold" : upgraded === "rainbow" ? "rainbow" : "pink",
    });
    this.expandRosterIfFull();
    this.emitState();
    return true;
  }

  private discover(instance: BrainrotInstance): void {
    const key = collectionKey(instance.type, instance.rarity);
    if (this.state.discovered.includes(key)) return;
    this.state.discovered.push(key);
    this.bus.emit("discover", { instance, total: this.state.discovered.length });
    this.bus.emit("sound", { name: "discover" });
    if (this.state.discovered.length === COLLECTION_TOTAL) {
      this.bus.emit("message", { title: `ALL ${COLLECTION_TOTAL} FOUND!`, detail: "The whole parade is here!", tone: "rainbow" });
    }
  }

  private expandRosterIfFull(): void {
    if (this.state.unlockedPads >= GAME_CONFIG.maxPads) return;
    const activePads = this.state.pads.slice(0, this.state.unlockedPads);
    if (!activePads.every((pad) => pad.occupantId !== null)) return;
    this.state.unlockedPads = Math.min(
      GAME_CONFIG.maxPads,
      this.state.unlockedPads + GAME_CONFIG.padUnlockStep,
    );
    this.bus.emit("rosterexpand", { unlockedPads: this.state.unlockedPads });
    this.bus.emit("message", {
      title: "+2 NEW SPOTS!",
      detail: `Your parade can now hold ${this.state.unlockedPads} friends!`,
      tone: "rainbow",
    });
  }

  private getInstance(id: string): BrainrotInstance | undefined {
    return this.state.instances.find((item) => item.id === id);
  }

  private reconcile(): void {
    const validIds = new Set(this.state.instances.map((item) => item.id));
    for (const pad of this.state.pads) {
      if (pad.occupantId && !validIds.has(pad.occupantId)) pad.occupantId = null;
    }
    while (
      this.state.unlockedPads < GAME_CONFIG.maxPads &&
      this.state.pads.slice(0, this.state.unlockedPads).every((pad) => pad.occupantId !== null)
    ) {
      this.state.unlockedPads += GAME_CONFIG.padUnlockStep;
    }
  }

  private emitState(): void {
    saveState(this.state);
    this.bus.emit("statechange", structuredClone(this.state));
  }
}
