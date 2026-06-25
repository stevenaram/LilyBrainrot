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

  constructor(bus: EventBus) {
    bus.on("sound", ({ name }) => this.play(name));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
  }

  private play(name: keyof typeof SOUND_NOTES): void {
    if (!this.enabled) return;
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
