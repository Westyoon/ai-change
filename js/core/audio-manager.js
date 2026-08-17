function clampVolume(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError("Audio volume must be a finite number.");
  }
  return Math.min(1, Math.max(0, value));
}

export class AudioManager {
  #tracks = new Map();

  constructor({ masterVolume = 1, bgmVolume = 0.7, sfxVolume = 0.8, muted = false } = {}) {
    this.settings = {
      masterVolume: clampVolume(masterVolume),
      bgmVolume: clampVolume(bgmVolume),
      sfxVolume: clampVolume(sfxVolume),
      muted: Boolean(muted),
    };
  }

  register(id, src, { kind = "sfx", loop = false, volume = 1 } = {}) {
    if (typeof id !== "string" || id.length === 0 || typeof src !== "string" || src.length === 0) {
      throw new TypeError("Audio track requires a non-empty id and source.");
    }
    if (kind !== "bgm" && kind !== "sfx") {
      throw new TypeError('Audio kind must be "bgm" or "sfx".');
    }
    this.unregister(id);
    const audio = typeof Audio === "function" ? new Audio(src) : null;
    if (audio) {
      audio.loop = Boolean(loop);
      audio.preload = "auto";
    }
    this.#tracks.set(id, {
      id,
      src,
      kind,
      loop: Boolean(loop),
      localVolume: clampVolume(volume),
      audio,
    });
    this.#applyTrackVolume(this.#tracks.get(id));
    return audio;
  }

  unregister(id) {
    const track = this.#tracks.get(id);
    if (!track) {
      return false;
    }
    track.audio?.pause();
    if (track.audio) {
      track.audio.src = "";
    }
    this.#tracks.delete(id);
    return true;
  }

  async play(id, { restart = true } = {}) {
    const track = this.#tracks.get(id);
    if (!track) {
      throw new Error(`Unknown audio track: ${String(id)}`);
    }
    if (!track.audio) {
      return false;
    }
    if (restart) {
      track.audio.currentTime = 0;
    }
    this.#applyTrackVolume(track);
    try {
      await track.audio.play();
      return true;
    } catch {
      // Browser autoplay policy is expected before the first user gesture.
      return false;
    }
  }

  pause(id) {
    const track = this.#tracks.get(id);
    track?.audio?.pause();
    return Boolean(track);
  }

  stop(id) {
    const track = this.#tracks.get(id);
    if (!track) {
      return false;
    }
    track.audio?.pause();
    if (track.audio) {
      track.audio.currentTime = 0;
    }
    return true;
  }

  stopAll() {
    for (const id of this.#tracks.keys()) {
      this.stop(id);
    }
  }

  setMuted(muted) {
    this.settings.muted = Boolean(muted);
    this.#applyAllVolumes();
    return this.settings.muted;
  }

  setVolume(kind, value) {
    if (typeof kind !== "string") {
      throw new TypeError("Audio volume channel must be a string.");
    }
    const key = kind.endsWith("Volume") ? kind : `${kind}Volume`;
    if (!Object.hasOwn(this.settings, key) || key === "muted") {
      throw new TypeError(`Unknown audio volume channel: ${String(kind)}`);
    }
    this.settings[key] = clampVolume(value);
    this.#applyAllVolumes();
    return this.settings[key];
  }

  applySettings(settings = {}) {
    for (const key of ["masterVolume", "bgmVolume", "sfxVolume"]) {
      if (Object.hasOwn(settings, key)) {
        this.settings[key] = clampVolume(settings[key]);
      }
    }
    if (Object.hasOwn(settings, "muted")) {
      this.settings.muted = Boolean(settings.muted);
    }
    this.#applyAllVolumes();
    return { ...this.settings };
  }

  destroy() {
    for (const id of [...this.#tracks.keys()]) {
      this.unregister(id);
    }
  }

  #applyAllVolumes() {
    for (const track of this.#tracks.values()) {
      this.#applyTrackVolume(track);
    }
  }

  #applyTrackVolume(track) {
    if (!track?.audio) {
      return;
    }
    const channelVolume = track.kind === "bgm" ? this.settings.bgmVolume : this.settings.sfxVolume;
    track.audio.muted = this.settings.muted;
    track.audio.volume = clampVolume(
      this.settings.masterVolume * channelVolume * track.localVolume,
    );
  }
}

export default AudioManager;
