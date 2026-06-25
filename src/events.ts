import type { GameEventMap } from "./types";

export class EventBus {
  private target = new EventTarget();

  on<K extends keyof GameEventMap>(type: K, listener: (detail: GameEventMap[K]) => void): () => void {
    const wrapped = (event: Event) => listener((event as CustomEvent<GameEventMap[K]>).detail);
    this.target.addEventListener(type, wrapped);
    return () => this.target.removeEventListener(type, wrapped);
  }

  emit<K extends keyof GameEventMap>(type: K, detail: GameEventMap[K]): void {
    this.target.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
