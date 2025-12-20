// sound-engine.js
// WebAudio synth sound engine module (no samples).
// Inspired by your init/env/noise/sounds layout. :contentReference[oaicite:4]{index=4} :contentReference[oaicite:5]{index=5}

export class SoundEngine {
  constructor({
    master = 0.6,
    fxSend = 0.25,
    // Optional: give your own AudioContext (e.g., shared across app)
    audioContext = null,
  } = {}) {
    this.ctx = audioContext;
    this.masterGainValue = master;
    this.fxSendValue = fxSend;

    this.master = null;
    this.fxSend = null;
    this._fx = null;

    this.params = {
      duck: { gain: 1.0, dur: 1.0 },
      balloon: { gain: 1.0, dur: 1.0 },
      fireworks: { gain: 1.0, dur: 1.0 },
      splash: { gain: 1.0, dur: 1.0 },
    };

    this.loops = new Map();
  }

  /** Call once (or lazily), ideally from a user gesture. */
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.master) return;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterGainValue;

    this.fxSend = this.ctx.createGain();
    this.fxSend.gain.value = this.fxSendValue;

    // Simple delay FX (like your version, but DOM-free). :contentReference[oaicite:6]{index=6}
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.25;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    this.fxSend.connect(delay);
    delay.connect(this.master);

    this.master.connect(this.ctx.destination);
    this._fx = { delay, fb };
  }

  /** For iOS/Safari: resume audio on first gesture. */
  async unlock() {
    this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setMaster(value01) {
    this.init();
    this.master.gain.value = Number(value01);
  }

  setFxSend(value01) {
    this.init();
    this.fxSend.gain.value = Number(value01);
  }

  setParams(soundName, { gain, dur } = {}) {
    if (!this.params[soundName]) this.params[soundName] = { gain: 1, dur: 1 };
    if (typeof gain === "number") this.params[soundName].gain = gain;
    if (typeof dur === "number") this.params[soundName].dur = dur;
  }

  play(soundName) {
    this.init();
    const fn = this._sounds()[soundName];
    if (!fn) throw new Error(`Unknown sound: ${soundName}`);
    fn();
  }

  loop(soundName, intervalMs = 600) {
    this.stopLoop(soundName);
    this.play(soundName);
    const id = setInterval(() => this.play(soundName), intervalMs);
    this.loops.set(soundName, id);
  }

  stopLoop(soundName) {
    const id = this.loops.get(soundName);
    if (id) clearInterval(id);
    this.loops.delete(soundName);
  }

  stopAllLoops() {
    for (const id of this.loops.values()) clearInterval(id);
    this.loops.clear();
  }

  // ---------- internals ----------
  _env(baseDurSec, peak, key) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;

    const p = this.params[key] || { gain: 1, dur: 1 };
    const dur = baseDurSec * (p.dur ?? 1);
    const amp = peak * (p.gain ?? 1);

    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    return { node: g, t, dur };
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _setQ(filterNode, value) {
    if (filterNode?.Q && typeof filterNode.Q.value === "number") filterNode.Q.value = value;
  }

  _route(srcNode, ampNode) {
    ampNode.connect(this.master);
    ampNode.connect(this.fxSend);
    srcNode.connect(ampNode);
  }

  _sounds() {
    // bound once
    if (this.__sounds) return this.__sounds;

    this.__sounds = {
      // 1) Comic duck quack (noise bandpass + square pitch sweep)
      duckold: () => {
        const t = this.ctx.currentTime;

        // noisy "rasp"
        const n = this.ctx.createBufferSource();
        n.buffer = this._noiseBuffer(0.25);
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 900;
        this._setQ(bp, 2.5);

        const { node: g1, dur: d1 } = this._env(0.25, 0.7, "duck");
        n.connect(bp).connect(g1);
        g1.connect(this.master);
        g1.connect(this.fxSend);

        n.start(t);
        n.stop(t + d1);

        // pitched "quack"
        const o = this.ctx.createOscillator();
        o.type = "square";
        o.frequency.setValueAtTime(420, t);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.22 * (this.params.duck?.dur ?? 1));

        const { node: g2, dur: d2 } = this._env(0.26, 0.5, "duck");
        o.connect(g2);
        g2.connect(this.master);
        g2.connect(this.fxSend);

        o.start(t);
        o.stop(t + d2);
      },

      duck: () => {
        const t0 = this.ctx.currentTime;
        const durMul = this.params.duck?.dur ?? 1;
        const gainMul = this.params.duck?.gain ?? 1;
      
        // Tighter, snappier double-quack
        const hits = [
          { t: t0 + 0.00 * durMul, amp: 1.0 },
          { t: t0 + 0.14 * durMul, amp: 0.88 },
        ];
      
        for (const h of hits) {
          const t = h.t;
      
          // --- voiced quack (more Donald: higher + slightly vibrato) ---
          const o = this.ctx.createOscillator();
          o.type = "square";
          o.frequency.setValueAtTime(720, t);
          o.frequency.exponentialRampToValueAtTime(360, t + 0.10 * durMul);
      
          // Nasal formant bandpass
          const bp = this.ctx.createBiquadFilter();
          bp.type = "bandpass";
          this._setQ(bp, 7.5);
      
          // Wah sweep (higher + quicker)
          bp.frequency.setValueAtTime(1900, t);
          bp.frequency.exponentialRampToValueAtTime(850, t + 0.11 * durMul);
      
          // Wah-wah wobble on the filter frequency
          const lfo = this.ctx.createOscillator();
          lfo.type = "sine";
          lfo.frequency.setValueAtTime(12, t); // faster wobble
          const lfoGain = this.ctx.createGain();
          lfoGain.gain.setValueAtTime(320, t); // deeper wobble (Hz)
          lfo.connect(lfoGain).connect(bp.frequency);
      
          // Tiny pitch vibrato (helps “cartoon voice”)
          const vib = this.ctx.createOscillator();
          vib.type = "sine";
          vib.frequency.setValueAtTime(18, t);
          const vibGain = this.ctx.createGain();
          vibGain.gain.setValueAtTime(14, t); // in Hz
          vib.connect(vibGain).connect(o.frequency);
      
          // Envelope: short, punchy
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(1e-4, t);
          g.gain.exponentialRampToValueAtTime(0.62 * h.amp * gainMul, t + 0.008);
          g.gain.exponentialRampToValueAtTime(1e-4, t + 0.16 * durMul);
      
          o.connect(bp).connect(g);
          g.connect(this.master);
          g.connect(this.fxSend);
      
          // --- raspy air layer (a bit brighter) ---
          const n = this.ctx.createBufferSource();
          n.buffer = this._noiseBuffer(0.11);
      
          const nbp = this.ctx.createBiquadFilter();
          nbp.type = "bandpass";
          this._setQ(nbp, 2.2);
          nbp.frequency.setValueAtTime(1500, t);
          nbp.frequency.exponentialRampToValueAtTime(950, t + 0.08 * durMul);
      
          const ng = this.ctx.createGain();
          ng.gain.setValueAtTime(1e-4, t);
          ng.gain.exponentialRampToValueAtTime(0.22 * h.amp * gainMul, t + 0.006);
          ng.gain.exponentialRampToValueAtTime(1e-4, t + 0.10 * durMul);
      
          n.connect(nbp).connect(ng);
          ng.connect(this.master);
          ng.connect(this.fxSend);
      
          // start/stop
          o.start(t);
          o.stop(t + 0.20 * durMul);
      
          lfo.start(t);  lfo.stop(t + 0.20 * durMul);
          vib.start(t);  vib.stop(t + 0.20 * durMul);
      
          n.start(t);
          n.stop(t + 0.13 * durMul);
        }
      },

      // 2) Balloon plop (highpassed noise pop)
      balloon: () => {
        const t = this.ctx.currentTime;

        const n = this.ctx.createBufferSource();
        n.buffer = this._noiseBuffer(0.15);

        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 600;

        const { node: g, dur } = this._env(0.12, 1.0, "balloon");
        n.connect(hp).connect(g);
        g.connect(this.master);
        g.connect(this.fxSend);

        n.start(t);
        n.stop(t + dur);
      },

      // 3) Fireworks explosion (boom + crackle layer)
      fireworks: () => {
        const t = this.ctx.currentTime;
        const durMul = this.params.fireworks?.dur ?? 1;

        // boom body (lowpassed noise)
        const n = this.ctx.createBufferSource();
        n.buffer = this._noiseBuffer(0.45 * durMul);

        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        this._setQ(lp, 0.7);

        const { node: g, dur } = this._env(0.7, 1.0, "fireworks");
        n.connect(lp).connect(g);
        g.connect(this.master);
        g.connect(this.fxSend);

        n.start(t);
        n.stop(t + dur);

        // sub thump
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.25 * durMul);

        const { node: og, dur: od } = this._env(0.9, 0.8, "fireworks");
        o.connect(og);
        og.connect(this.master);
        og.connect(this.fxSend);

        o.start(t);
        o.stop(t + od);

        // crackle: a handful of tiny highpassed noise ticks after the boom
        const crackles = 14;
        for (let i = 0; i < crackles; i++) {
          const tt = t + (0.06 + Math.random() * 0.45) * durMul;
          const tick = this.ctx.createBufferSource();
          tick.buffer = this._noiseBuffer(0.03);

          const hp = this.ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = 1800 + Math.random() * 2500;

          const gg = this.ctx.createGain();
          gg.gain.setValueAtTime(1e-4, tt);
          gg.gain.exponentialRampToValueAtTime(0.35 * (this.params.fireworks?.gain ?? 1), tt + 0.005);
          gg.gain.exponentialRampToValueAtTime(1e-4, tt + 0.03);

          tick.connect(hp).connect(gg);
          gg.connect(this.master);
          gg.connect(this.fxSend);

          tick.start(tt);
          tick.stop(tt + 0.04);
        }
      },

      // 4) Splash (noise whoosh + low “bloop” pitch drop)
      splash: () => {
        const t = this.ctx.currentTime;
        const durMul = this.params.splash?.dur ?? 1;

        // whooshy noise, sweeping filter down
        const n = this.ctx.createBufferSource();
        n.buffer = this._noiseBuffer(0.5 * durMul);

        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(900, t);
        bp.frequency.exponentialRampToValueAtTime(250, t + 0.22 * durMul);
        this._setQ(bp, 1.2);

        const { node: g, dur } = this._env(0.55, 0.75, "splash");
        n.connect(bp).connect(g);
        g.connect(this.master);
        g.connect(this.fxSend);

        n.start(t);
        n.stop(t + dur);

        // bloop (sine falling quickly)
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(220, t + 0.02);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.18 * durMul);

        const { node: og, dur: od } = this._env(0.35, 0.55, "splash");
        o.connect(og);
        og.connect(this.master);
        og.connect(this.fxSend);

        o.start(t + 0.02);
        o.stop(t + od);
      },
    };

    return this.__sounds;
  }
}
