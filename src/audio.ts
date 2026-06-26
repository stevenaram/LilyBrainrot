import type { EventBus } from "./events";

const SOUND_NOTES = {
  ring: [523, 784],
  catch: [659, 988],
  place: [392, 523],
  merge: [523, 659, 784, 1047],
  star: [880, 1175],
  discover: [523, 659, 784, 988, 1319],
  error: [220, 196],
} as const;

export class AudioManager {
  private context: AudioContext | null = null;
  private enabled = true;
  private offSound: () => void;
  private lastPlayedAt = new Map<keyof typeof SOUND_NOTES, number>();

  constructor(bus: EventBus) {
    this.offSound = bus.on("sound", ({ name }) => this.play(name));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
  }

  destroy(): void {
    this.offSound();
    if (this.context) void this.context.close();
    this.context = null;
  }

  private play(name: keyof typeof SOUND_NOTES): void {
    if (!this.enabled) return;
    const nowMs = performance.now();
    const cooldown = name === "star" ? 1_200 : name === "error" ? 250 : 70;
    if (nowMs - (this.lastPlayedAt.get(name) ?? 0) < cooldown) return;
    this.lastPlayedAt.set(name, nowMs);

    this.unlock();
    if (!this.context) return;

    const now = this.context.currentTime;
    SOUND_NOTES[name].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = name === "error" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.08);
      gain.gain.setValueAtTime(0.0001, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.08 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.18);
      oscillator.connect(gain).connect(this.context!.destination);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + index * 0.08 + 0.2);
    });
  }
}
