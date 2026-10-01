import { ImpactInbox, soundPlacement, type ImpactCue, type SoundKind, type SoundPoint } from "./cues.ts";

const STORAGE = "auto-rpg-sound-v1";
type Voice = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode };
/** Everything the page synthesizes: a blow's surface, what a severed part scatters, and the crypt's air, fire and drips. */
type Sound = SoundKind | "air" | "fire" | "drip" | "debris";
/** Each sound's length, s; a loop's is its period. Set by ear (`docs/reference/look.md#sound`). */
const SOUND_SECONDS: Readonly<Record<Sound, number>> = { bone: .26, body: .26, shield: .26, debris: .4, drip: .26, air: 6, fire: 6 };
/**
 * The mix, set by ear (`docs/reference/look.md#sound`). A gain is a share of full scale; a time is in seconds unless
 * it says ms.
 */
const MIX = Object.freeze({
  /** The slider before a person moves it; the master's gain at a full slider, and the time constant it is reached with. */
  volume: .5, master: .65, masterSeconds: .025,
  /** The limiter on the master: its threshold, dB, and its ratio. */
  compressor: { threshold: -12, ratio: 8 },
  /** The crypt's reverb: an impulse of noise this long, decaying at this rate, 1/s, at this level, and mixed in at `wet`. */
  reverb: { seconds: .7, decay: 9, level: .25, wet: .13 },
  /** The crypt's air; and the fire of the `fires` nearest torches, each at its placement's gain times `fire`, followed
   * with the time constant `ambienceSeconds`. */
  air: .06, fires: 3, fire: .12, ambienceSeconds: .3,
  /** A drip, and the wait before the first and between two, ms: `least` and a draw of up to `spread` more. */
  drip: { gain: .065, first: { least: 4000, spread: 5000 }, next: { least: 5000, spread: 8000 } },
  /** A blow placed quieter than this plays nothing. */
  audible: .001,
  /** A blow's gain before its placement: `floor` and `perStrength` of its strength; what a severed part scatters,
   * `debris` of the strength. */
  impact: { floor: .08, perStrength: .5, debris: .18 },
  /** A voice's playback rate, `least` and a draw of up to `spread` more: a loop's, and a one-shot's. */
  rate: { loop: { least: .94, spread: .12 }, shot: { least: .9, spread: .2 } },
  /** A voice that is stopped fades with this time constant, and stops after `stop`. */
  fade: .008, stop: .04,
});
/** The most one-shot voices at once: a numeric setting, which bounds the work and not the mix. */
const VOICES = 12;

/** One owner per browser page. No import from a body, mind or headless harness. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private buffers = new Map<Sound, AudioBuffer>();
  private voices = new Set<Voice>();
  private ambience: Voice[] = [];
  private inbox = new ImpactInbox();
  private active = false;
  private disposed = false;
  private failed = false;
  private muted = false;
  private volume: number = MIX.volume;
  private listener: SoundPoint = { x: 0, z: 0 };
  private toward: SoundPoint = { x: 0, z: 1 };
  private torches: SoundPoint[] = [];
  private nextDrip = 0;
  private readonly dungeon: boolean;
  private readonly abort = new AbortController();
  private readonly panel: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  // Own stream: random audio variation cannot perturb any fight's RNG.
  private randomState = 0x71a3b95;
  private random = () => { let x = this.randomState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.randomState = x; return (x >>> 0) / 4294967296; };

  constructor(dungeon = false) {
    this.dungeon = dungeon;
    try { const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
      if (typeof saved?.muted === "boolean") this.muted = saved.muted;
      if (typeof saved?.volume === "number" && Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
    } catch { /* Storage is optional. */ }
    this.panel = document.createElement("div"); this.panel.className = "game-sound";
    this.panel.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:100;display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #706654;border-radius:6px;background:#181815ed;color:#e9dfc7;font:12px system-ui;pointer-events:auto";
    this.button = document.createElement("button"); this.button.type = "button";
    this.button.style.cssText = "font:inherit;color:inherit;background:transparent;border:0;cursor:pointer";
    const label = document.createElement("label"); label.textContent = "Volume ";
    const slider = document.createElement("input"); slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.value = String(this.volume * 100);
    slider.setAttribute("aria-label", "Sound volume"); slider.style.width = "80px";
    label.append(slider); this.panel.append(this.button, label); document.body.append(this.panel);
    const signal = this.abort.signal;
    this.button.addEventListener("click", () => { this.muted = !this.muted; this.save(); void this.unlock(); this.button.blur(); }, { signal });
    slider.addEventListener("input", () => { this.volume = Number(slider.value) / 100; this.save(); void this.unlock(); }, { signal });
    slider.addEventListener("change", () => slider.blur(), { signal });
    for (const type of ["pointerdown", "pointermove", "keydown"]) this.panel.addEventListener(type, e => e.stopPropagation(), { signal });
    // Capture unlocks even when a HUD control stops the combat gesture later.
    for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, () => { void this.unlock(); }, { capture: true, signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.setActive(false); }, { signal });
    window.addEventListener("pagehide", () => this.dispose(), { once: true, signal });
    this.refreshGain();
  }
  private save(): void {
    try { localStorage.setItem(STORAGE, JSON.stringify({ volume: this.volume, muted: this.muted })); } catch { /* Optional. */ }
    if (this.muted || this.volume === 0) this.reset();
    this.refreshGain();
  }
  private refreshGain(): void {
    this.button.textContent = this.failed ? "Sound unavailable" : this.muted ? "Sound off" : "Sound on";
    this.button.setAttribute("aria-pressed", String(!this.muted && !this.failed));
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.active && !this.muted && !this.failed ? this.volume * MIX.master : 0, this.context.currentTime, MIX.masterSeconds);
  }
  private async unlock(): Promise<void> {
    if (this.disposed || this.failed || this.muted || !this.volume) return;
    try {
      if (!this.context) {
        const ctx = this.context = new AudioContext();
        this.master = ctx.createGain(); this.master.gain.value = 0;
        const compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = MIX.compressor.threshold; compressor.ratio.value = MIX.compressor.ratio;
        this.master.connect(compressor); compressor.connect(ctx.destination);
        if (this.dungeon) {
          this.reverb = ctx.createConvolver(); const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * MIX.reverb.seconds), ctx.sampleRate);
          for (let c = 0; c < 2; c++) { const data = impulse.getChannelData(c); for (let i = 0; i < data.length; i++) data[i] = (this.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate * MIX.reverb.decay) * MIX.reverb.level; }
          this.reverb.buffer = impulse; const wet = ctx.createGain(); wet.gain.value = MIX.reverb.wet; this.reverb.connect(wet); wet.connect(this.master);
        }
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.refreshGain();
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown): void {
    this.failed = true; this.reset(); this.refreshGain();
    console.warn("Game audio disabled:", error);
  }
  setActive(active: boolean): void {
    active = active && !document.hidden && !this.disposed;
    if (active === this.active) return;
    this.active = active;
    if (!active) this.reset();
    this.refreshGain();
  }
  /** Queue a cue the page read itself (`blowCue`). */
  cue(cue: ImpactCue | null): void {
    if (cue && this.ready()) this.inbox.add(cue, performance.now());
  }
  private ready(): boolean { return this.active && !this.muted && this.volume > 0 && !this.failed && this.context?.state === "running"; }
  setView(listener: SoundPoint, toward: SoundPoint, torches: readonly SoundPoint[] = []): void {
    // Babylon Vector3 stores coordinates behind prototype getters; spread drops them.
    this.listener = { x: listener.x, z: listener.z }; this.toward = { x: toward.x, z: toward.z };
    this.torches = torches.map(point => ({ x: point.x, z: point.z }));
  }
  update(): void {
    try { this.updateAudio(); } catch (error) { this.fail(error); }
  }
  private updateAudio(): void {
    if (!this.ready()) { this.inbox.clear(); return; }
    const now = performance.now();
    for (const cue of this.inbox.drain(now)) this.impact(cue);
    if (!this.dungeon) return;
    if (!this.ambience.length) {
      this.ambience.push(this.play("air", MIX.air, 0, true));
      for (let i = 0; i < MIX.fires; i++) this.ambience.push(this.play("fire", 0, 0, true));
      this.nextDrip = now + MIX.drip.first.least + this.random() * MIX.drip.first.spread;
    }
    const nearby = this.torches.map(p => soundPlacement(p, this.listener, this.toward, true)).sort((a, b) => b.gain - a.gain).slice(0, MIX.fires);
    for (let i = 0; i < MIX.fires; i++) {
      const voice = this.ambience[i + 1], place = nearby[i];
      voice.gain.gain.setTargetAtTime((place?.gain ?? 0) * MIX.fire, this.context!.currentTime, MIX.ambienceSeconds);
      voice.pan.pan.setTargetAtTime(place?.pan ?? 0, this.context!.currentTime, MIX.ambienceSeconds);
    }
    if (now >= this.nextDrip) { if (this.voices.size < VOICES) this.play("drip", MIX.drip.gain, 0); this.nextDrip = now + MIX.drip.next.least + this.random() * MIX.drip.next.spread; }
  }
  private impact(cue: ImpactCue): void {
    if (this.voices.size >= VOICES) return;
    const place = soundPlacement(cue.point, this.listener, this.toward, this.dungeon);
    if (place.gain <= MIX.audible) return;
    this.play(cue.kind, (MIX.impact.floor + cue.strength * MIX.impact.perStrength) * place.gain, place.pan);
    if (cue.severed && this.voices.size < VOICES) this.play("debris", cue.strength * MIX.impact.debris * place.gain, place.pan);
  }
  private play(kind: Sound, volume: number, pan: number, loop = false): Voice {
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
    const rate = loop ? MIX.rate.loop : MIX.rate.shot;
    source.buffer = this.buffer(kind); source.loop = loop; source.playbackRate.value = rate.least + this.random() * rate.spread;
    gain.gain.value = volume; panner.pan.value = pan;
    source.connect(gain); gain.connect(panner); panner.connect(this.master!); if (this.reverb && !loop) panner.connect(this.reverb);
    const voice = { source, gain, pan: panner };
    if (!loop) this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); panner.disconnect(); };
    source.start(0, loop ? this.random() * source.buffer.duration : 0);
    return voice;
  }
  private buffer(kind: Sound): AudioBuffer {
    const cached = this.buffers.get(kind); if (cached) return cached;
    const ctx = this.context!, loop = kind === "air" || kind === "fire";
    const duration = SOUND_SECONDS[kind];
    const buffer = ctx.createBuffer(1, Math.ceil(duration * ctx.sampleRate), ctx.sampleRate), data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate, noise = this.random() * 2 - 1;
      low += (noise - low) * (kind === "air" ? .008 : .12);
      const attack = Math.min(1, t / .002), tail = Math.min(1, (duration - t) / .02);
      let value: number;
      // Each sound is its own formula, set by ear (`docs/reference/look.md#sound`).
      switch (kind) {
        // What a clash plays (`blowCue`): held wood on held wood, damped by the grips and the
        // bodies behind them. A broad crack and a low thump, with no long, high partials.
        case "shield": value = noise * .38 * Math.exp(-t * 150) + low * 1.1 * Math.exp(-t * 32)
          + Math.sin(t * 2 * Math.PI * 145) * .3 * Math.exp(-t * 35)
          + Math.sin(t * 2 * Math.PI * 273) * .13 * Math.exp(-t * 45)
          + Math.sin(t * 2 * Math.PI * 527) * .055 * Math.exp(-t * 65); break;
        case "bone": value = noise * .55 * Math.exp(-t * 65) + Math.sin(t * 2 * Math.PI * 360) * .25 * Math.exp(-t * 32); break;
        case "body": value = low * Math.exp(-t * 35) + Math.sin(t * 2 * Math.PI * 85) * .5 * Math.exp(-t * 32); break;
        case "debris": value = noise * .3 * Math.exp(-t * 12) * (.5 + .5 * Math.sin(t * 170)); break;
        case "drip": value = Math.sin(2 * Math.PI * (650 * t + 1800 * t * t)) * .3 * Math.exp(-t * 28); break;
        case "air": value = low * 2; break;
        case "fire": value = low * .35 + (this.random() > .997 ? noise * .6 : 0); break;
        default: { const never: never = kind; throw new Error(`no sound ${String(never)}`); }
      }
      data[i] = value * (loop ? 1 : attack * tail);
    }
    // Fade the noise loop through its seam over 50 ms, avoiding a discontinuity.
    if (loop) { const n = Math.floor(ctx.sampleRate * .05); for (let i = 0; i < n; i++) { const a = i / n; data[i] *= a; data[data.length - 1 - i] *= a; } }
    this.buffers.set(kind, buffer); return buffer;
  }
  reset(): void {
    this.inbox.clear();
    const ctx = this.context;
    for (const voice of [...this.voices, ...this.ambience]) {
      if (ctx) { voice.gain.gain.cancelScheduledValues(ctx.currentTime); voice.gain.gain.setTargetAtTime(0, ctx.currentTime, MIX.fade); }
      try { voice.source.stop((ctx?.currentTime ?? 0) + MIX.stop); } catch { /* Already stopped. */ }
    }
    this.voices.clear(); this.ambience = [];
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.active = false; this.reset(); this.abort.abort(); this.panel.remove();
    void this.context?.close().catch(() => {}); this.buffers.clear();
  }
}
