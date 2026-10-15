// Small original synthesized score; follows the existing master/BGM/SFX settings.
export class StorySoundtrack {
  constructor(audioManager) { this.manager = audioManager; this.context = null; this.timer = null; this.mode = null; this.step = 0; }
  play(mode) {
    this.stop(); this.mode = mode; this.step = 0;
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) return;
    this.context ??= new Context();
    void this.context.resume().catch(() => {});
    this.unlock = () => { void this.context?.resume().catch(() => {}); };
    globalThis.document?.addEventListener?.("pointerdown", this.unlock, { passive: true });
    globalThis.document?.addEventListener?.("keydown", this.unlock);
    const patterns = {
      battle: [220, 261.63, 220, 329.63, 196, 246.94, 293.66, 246.94],
      ending: [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 392],
      festival: [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 783.99],
    };
    const tick = () => {
      if (!this.context || !this.mode) return;
      if (this.context.state !== "running") {
        this.timer = globalThis.setTimeout(tick, 260);
        return;
      }
      const notes = patterns[this.mode] ?? patterns.ending;
      const settings = this.manager?.settings ?? {};
      const volume = settings.muted ? 0 : (settings.masterVolume ?? 1) * (settings.bgmVolume ?? .7);
      this.tone(notes[this.step % notes.length], this.mode === "festival" ? .28 : .62, volume * .035);
      if (this.step % 4 === 0) this.tone(notes[this.step % notes.length] / 2, .85, volume * .022);
      this.step++;
      this.timer = globalThis.setTimeout(tick, this.mode === "festival" ? 260 : 550);
    };
    tick();
  }
  tone(frequency, duration, volume) {
    if (!this.context || !volume) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = "triangle"; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + duration + .02);
  }
  chime() {
    const settings = this.manager?.settings ?? {};
    if (settings.muted) return;
    const volume = (settings.masterVolume ?? 1) * (settings.sfxVolume ?? .8) * .055;
    for (const frequency of [1046.5, 1567.98, 2093]) this.tone(frequency, 1.4, volume / 3);
  }
  celebrate() {
    if (!this.context) return;
    const settings = this.manager?.settings ?? {};
    if (settings.muted) return;
    const volume = (settings.masterVolume ?? 1) * (settings.sfxVolume ?? .8) * .03;
    // Quiet applause: several short filtered noise bursts behind the final line.
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 1.1), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const time = i / this.context.sampleRate;
      const pulse = Math.exp(-((time % .14) / .018));
      data[i] = (Math.random() * 2 - 1) * pulse * (1 - time / 1.1);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "bandpass"; filter.frequency.value = 1400; filter.Q.value = .7;
    gain.gain.value = volume;
    source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(this.context.destination);
    source.start();
  }
  stop() {
    globalThis.clearTimeout(this.timer); this.timer = null; this.mode = null;
    globalThis.document?.removeEventListener?.("pointerdown", this.unlock);
    globalThis.document?.removeEventListener?.("keydown", this.unlock);
  }
  destroy() { this.stop(); void this.context?.close().catch(() => {}); this.context = null; }
}
