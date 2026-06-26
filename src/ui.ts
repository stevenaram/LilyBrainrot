import { CHARACTER_NAMES, COLLECTION_TOTAL, collectionKey, GAME_CONFIG, RARITIES, RARITY_ORDER } from "./config";
import type { AudioManager } from "./audio";
import type { EventBus } from "./events";
import type { GameController } from "./game";
import type { BrainrotType, GameState } from "./types";

export class GameUI {
  private stars: HTMLElement;
  private collectionCount: HTMLElement;
  private rosterCount: HTMLElement;
  private ringButton: HTMLButtonElement;
  private ringLabel: HTMLElement;
  private ringCost: HTMLElement;
  private soundButton: HTMLButtonElement;
  private collectionDialog: HTMLDialogElement;
  private collectionGrid: HTMLElement;
  private tutorial: HTMLElement;
  private celebration: HTMLElement;
  private currentState: GameState;
  private celebrationTimer = 0;
  private refreshTimer = 0;
  private offListeners: Array<() => void> = [];
  private abortController = new AbortController();

  constructor(
    private root: HTMLElement,
    private game: GameController,
    private bus: EventBus,
    private audio: AudioManager,
  ) {
    this.currentState = game.state;
    this.root.insertAdjacentHTML("beforeend", this.template());
    this.stars = this.require("#star-value");
    this.collectionCount = this.require("#collection-count");
    this.rosterCount = this.require("#roster-count");
    this.ringButton = this.require<HTMLButtonElement>("#ring-button");
    this.ringLabel = this.require("#ring-label");
    this.ringCost = this.require("#ring-cost");
    this.soundButton = this.require<HTMLButtonElement>("#sound-button");
    this.collectionDialog = this.require<HTMLDialogElement>("#collection-dialog");
    this.collectionGrid = this.require("#collection-grid");
    this.tutorial = this.require("#tutorial");
    this.celebration = this.require("#celebration");
    this.bind();
    this.render(this.currentState);
    this.refreshTimer = window.setInterval(() => this.refreshRing(), 250);
  }

  hideLoading(): void {
    const loading = document.querySelector<HTMLElement>("#loading");
    loading?.classList.add("loading--done");
    window.setTimeout(() => loading?.remove(), 500);
  }

  showLoadError(): void {
    const loading = document.querySelector<HTMLElement>("#loading");
    if (!loading) return;
    loading.innerHTML = `<div class="loading__logo">Oops!</div><p>The parade pictures could not load.</p><button class="small-button" onclick="location.reload()">Try again</button>`;
  }

  private bind(): void {
    const listenerOptions = { signal: this.abortController.signal };
    this.ringButton.addEventListener("click", () => {
      this.audio.unlock();
      this.game.ring();
    }, listenerOptions);
    this.soundButton.addEventListener("click", () => {
      const enabled = !this.currentState.settings.soundEnabled;
      this.game.setSound(enabled);
      this.audio.setEnabled(enabled);
    }, listenerOptions);
    this.require<HTMLButtonElement>("#collection-button").addEventListener("click", () => {
      this.renderCollection();
      this.collectionDialog.showModal();
    }, listenerOptions);
    this.require<HTMLButtonElement>("#collection-close").addEventListener("click", () => this.collectionDialog.close(), listenerOptions);
    this.collectionDialog.addEventListener("click", (event) => {
      if (event.target === this.collectionDialog) this.collectionDialog.close();
    }, listenerOptions);
    this.require<HTMLButtonElement>("#tutorial-ok").addEventListener("click", () => {
      this.game.dismissTutorial();
      this.tutorial.classList.add("tutorial--hidden");
    }, listenerOptions);

    this.offListeners.push(this.bus.on("statechange", (state) => this.render(state)));
    this.offListeners.push(this.bus.on("message", (message) => this.showCelebration(message.title, message.detail, message.tone)));
    this.offListeners.push(this.bus.on("discover", ({ instance, total }) => {
      if (total <= 1) return;
      this.showCelebration(
        `NEW ${RARITIES[instance.rarity].label.toUpperCase()}!`,
        `${CHARACTER_NAMES[instance.type]} joined the book!`,
        instance.rarity === "rainbow" ? "rainbow" : instance.rarity === "golden" ? "gold" : "pink",
      );
    }));
  }

  destroy(): void {
    this.abortController.abort();
    this.offListeners.forEach((off) => off());
    this.offListeners = [];
    window.clearInterval(this.refreshTimer);
    window.clearTimeout(this.celebrationTimer);
  }

  private render(state: GameState): void {
    this.currentState = state;
    this.stars.textContent = state.stars.toLocaleString();
    this.collectionCount.textContent = `${state.discovered.length} / ${COLLECTION_TOTAL}`;
    this.rosterCount.textContent = `${state.unlockedPads} SPOTS`;
    this.soundButton.textContent = state.settings.soundEnabled ? "🔊" : "🔇";
    this.soundButton.setAttribute("aria-label", state.settings.soundEnabled ? "Turn sound off" : "Turn sound on");
    this.audio.setEnabled(state.settings.soundEnabled);
    this.tutorial.classList.toggle("tutorial--hidden", state.tutorialSeen);
    this.refreshRing();
  }

  private refreshRing(): void {
    const status = this.game.canRing();
    const walkerCount = this.currentState.instances.filter((item) => item.status === "walking").length;
    this.ringButton.disabled = !status.allowed;
    if (status.free) {
      this.ringLabel.textContent = "FREE!";
      this.ringCost.textContent = "✨";
    } else if (walkerCount >= GAME_CONFIG.maxWalkers) {
      this.ringLabel.textContent = "CATCH!";
      this.ringCost.textContent = "👆";
    } else {
      this.ringLabel.textContent = "RING!";
      this.ringCost.textContent = `⭐ ${GAME_CONFIG.ringCost}`;
    }
  }

  private renderCollection(): void {
    const cards: string[] = [];
    ([1, 2, 3] as BrainrotType[]).forEach((type) => {
      RARITY_ORDER.forEach((rarity) => {
        const found = this.currentState.discovered.includes(collectionKey(type, rarity));
        cards.push(`
          <div class="collection-card ${found ? "collection-card--found" : ""}" data-rarity="${rarity}" style="--rarity:${RARITIES[rarity].css}">
            <div class="collection-card__image">
              ${found ? `<img src="${new URL(`../assets/brainrot${type}.png`, import.meta.url).href}" alt="">` : `<span>?</span>`}
            </div>
            <strong>${found ? CHARACTER_NAMES[type] : "Mystery"}</strong>
            <small>${RARITIES[rarity].label}</small>
          </div>
        `);
      });
    });
    this.collectionGrid.innerHTML = cards.join("");
  }

  private showCelebration(title: string, detail = "", tone: "pink" | "gold" | "rainbow" = "pink"): void {
    window.clearTimeout(this.celebrationTimer);
    this.celebration.className = `celebration celebration--${tone} celebration--show`;
    this.celebration.innerHTML = `<strong>${title}</strong>${detail ? `<span>${detail}</span>` : ""}`;
    this.celebrationTimer = window.setTimeout(() => {
      this.celebration.classList.remove("celebration--show");
    }, 2_000);
  }

  private template(): string {
    return `
      <section class="hud" aria-label="Game controls">
        <div class="star-counter" aria-live="polite">
          <span class="star-icon">★</span>
          <strong id="star-value">50</strong>
        </div>
        <div id="roster-count" class="roster-count">6 SPOTS</div>

        <h1 class="game-title" aria-label="Lily's Brainrot Parade">
          <span>Lily's</span>
          <b>Brainrot</b>
          <em>Parade</em>
        </h1>

        <div class="top-actions">
          <button id="sound-button" class="icon-button" aria-label="Turn sound off">🔊</button>
          <button id="collection-button" class="collection-button" aria-label="Open collection book">
            <span aria-hidden="true">📖</span>
            <strong id="collection-count">0 / ${COLLECTION_TOTAL}</strong>
          </button>
        </div>

        <button id="ring-button" class="ring-button" aria-label="Ring the bell to call a brain rot">
          <span class="ring-button__bell" aria-hidden="true">🔔</span>
          <strong id="ring-label">RING!</strong>
          <small id="ring-cost">⭐ 10</small>
        </button>
      </section>

      <section id="tutorial" class="tutorial" aria-label="How to play">
        <div class="tutorial__gesture">👆 <span>→</span> ✨</div>
        <strong>Tap a friend. Drag to a circle!</strong>
        <span>Match any two of the same character to upgrade!</span>
        <button id="tutorial-ok" class="small-button">LET'S PLAY!</button>
      </section>

      <div id="celebration" class="celebration" role="status" aria-live="polite"></div>

      <dialog id="collection-dialog" class="collection-dialog">
        <header>
          <div>
            <h2>Brainrot Book</h2>
            <p>Find all ${COLLECTION_TOTAL} colorful friends!</p>
          </div>
          <button id="collection-close" class="dialog-close" aria-label="Close collection book">×</button>
        </header>
        <div id="collection-grid" class="collection-grid"></div>
      </dialog>
    `;
  }

  private require<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }
}
