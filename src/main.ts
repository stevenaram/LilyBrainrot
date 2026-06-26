import "./style.css";
import { AudioManager } from "./audio";
import { EventBus } from "./events";
import { GameController } from "./game";
import { loadState } from "./persistence";
import { ParadeScene } from "./scene";
import { GameUI } from "./ui";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <div class="game-viewport">
    <canvas id="game-canvas" aria-label="Lily's Brainrot Parade game stage"></canvas>
    <div id="game-ui"></div>
  </div>
  <div class="portrait-message">
    <div>📱↻</div>
    <strong>Turn sideways to play!</strong>
  </div>
  <div id="loading" class="loading">
    <div class="loading__logo"><span>Lily's</span> Brainrot Parade</div>
    <div class="loading__bar"><i></i></div>
    <p>Calling the parade...</p>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const viewport = document.querySelector<HTMLElement>(".game-viewport")!;
const uiRoot = document.querySelector<HTMLElement>("#game-ui")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bus = new EventBus();
const game = new GameController(loadState(reducedMotion), bus);
const audio = new AudioManager(bus);
const ui = new GameUI(uiRoot, game, bus, audio);
const parade = new ParadeScene(canvas, viewport, game, bus);

void parade.load()
  .then(() => ui.hideLoading())
  .catch((error: unknown) => {
    console.error(error);
    ui.showLoadError();
  });

let disposed = false;
const cleanup = () => {
  if (disposed) return;
  disposed = true;
  ui.destroy();
  audio.destroy();
  parade.destroy();
};

window.addEventListener("beforeunload", cleanup);

const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(() => {
  window.removeEventListener("beforeunload", cleanup);
  cleanup();
});
