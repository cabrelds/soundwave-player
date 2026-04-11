/**
 * ═══════════════════════════════════════════
 *  MODULE 2 — PLAYER (Moteur Audio)
 *  Contient : Web Audio API, lecture/pause,
 *  navigation, visualiseur canvas, EQ.
 *
 *  Expose : PlayerEngine (classe)
 * ═══════════════════════════════════════════
 */

import { tracks, state } from "./data.js";

export class PlayerEngine {
  /**
   * @param {HTMLAudioElement} audioEl  - élément <audio>
   * @param {HTMLCanvasElement} canvas  - canvas du visualiseur
   * @param {Function} onStateChange    - callback appelé à chaque changement d'état
   */
  constructor(audioEl, canvas, onStateChange) {
    this.audio    = audioEl;
    this.canvas   = canvas;
    this.ctx2d    = canvas.getContext("2d");
    this.onState  = onStateChange;

    this._audioCtx  = null;
    this._analyser  = null;
    this._source    = null;
    this._animId    = null;
    this._dragging  = false;

    this._bindAudioEvents();
    this._bindKeyboard();
  }

  /* ─────────────────────────────────────────
     INITIALISATION WEB AUDIO
  ───────────────────────────────────────── */
  _initAudioCtx() {
    if (this._audioCtx) {
      if (this._audioCtx.state === "suspended") this._audioCtx.resume();
      return;
    }
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 512;
    this._analyser.smoothingTimeConstant = 0.85;

    this._source = this._audioCtx.createMediaElementSource(this.audio);
    this._source.connect(this._analyser);
    this._analyser.connect(this._audioCtx.destination);
  }

  /* ─────────────────────────────────────────
     CHARGEMENT DE PISTE
  ───────────────────────────────────────── */
  load(index, autoPlay = false) {
    state.currentIndex = index;
    const t = state.currentTrack;

    this.audio.src = t.url;
    this.audio.load();
    this.audio.volume = state.volume / 100;
    this.audio.muted  = state.isMuted;
    this.audio.loop   = state.isRepeat;

    this._initAudioCtx();
    this.onState("load");

    if (autoPlay) {
      this.audio.play()
        .then(()  => this._setPlaying(true))
        .catch(() => this._setPlaying(false));
    } else {
      this._setPlaying(false);
    }
  }

  /* ─────────────────────────────────────────
     LECTURE / PAUSE
  ───────────────────────────────────────── */
  togglePlay() {
    if (!this.audio.src || this.audio.src === window.location.href) {
      this.load(0, true);
      return;
    }
    if (this._audioCtx?.state === "suspended") this._audioCtx.resume();

    if (state.isPlaying) {
      this.audio.pause();
      this._setPlaying(false);
    } else {
      this.audio.play()
        .then(()  => this._setPlaying(true))
        .catch(() => {});
    }
  }

  _setPlaying(val) {
    state.isPlaying = val;
    cancelAnimationFrame(this._animId);
    val ? this._drawViz() : this._drawIdle();
    this.onState("playing");
  }

  /* ─────────────────────────────────────────
     NAVIGATION
  ───────────────────────────────────────── */
  next() { this.load(state.nextIndex, state.isPlaying); }

  prev() {
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    this.load(state.prevIndex, state.isPlaying);
  }

  /* ─────────────────────────────────────────
     SHUFFLE / REPEAT / VOLUME / MUTE
  ───────────────────────────────────────── */
  toggleShuffle() { state.toggleShuffle(); this.onState("shuffle"); }

  toggleRepeat()  {
    state.toggleRepeat();
    this.audio.loop = state.isRepeat;
    this.onState("repeat");
  }

  toggleMute()    {
    state.toggleMute();
    this.audio.muted = state.isMuted;
    if (state.isMuted) {
      this._prevVol = state.volume;
      state.setVolume(0);
    } else {
      state.setVolume(this._prevVol || 80);
    }
    this.audio.volume = state.volume / 100;
    this.onState("volume");
  }

  setVolume(v) {
    state.setVolume(v);
    this.audio.volume = state.volume / 100;
    this.audio.muted  = state.isMuted;
    this.onState("volume");
  }

  toggleFavorite() { state.toggleFavorite(); this.onState("favorite"); }

  /* ─────────────────────────────────────────
     SEEK (progress bar)
  ───────────────────────────────────────── */
  seekTo(ratio) {
    if (this.audio.duration) this.audio.currentTime = ratio * this.audio.duration;
  }

  /* ─────────────────────────────────────────
     VISUALISEUR
  ───────────────────────────────────────── */
  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = this.canvas.offsetWidth  * dpr;
    this.canvas.height = this.canvas.offsetHeight * dpr;
  }

  _drawViz() {
    this.resizeCanvas();
    const { ctx2d: c, canvas: cv, _analyser: an } = this;
    const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);

    if (!an) { this._animId = requestAnimationFrame(() => this._drawViz()); return; }

    const buf  = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(buf);

    const bars = 50, step = Math.floor(buf.length / bars), bw = W / bars;
    for (let i = 0; i < bars; i++) {
      let s = 0;
      for (let j = 0; j < step; j++) s += buf[i * step + j];
      const amp = (s / step / 255) * H * 0.9;
      c.fillStyle = `rgba(29,185,84,${0.4 + amp / H * 0.6})`;
      c.beginPath();
      c.roundRect(i * bw + bw * 0.12, H - amp, bw * 0.75, Math.max(2, amp), 2);
      c.fill();
    }
    if (state.isPlaying) this._animId = requestAnimationFrame(() => this._drawViz());
  }

  _drawIdle() {
    this.resizeCanvas();
    const { ctx2d: c, canvas: cv } = this;
    const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);

    for (let i = 0; i < 50; i++) {
      const amp = (Math.sin(i * 0.5 + Date.now() * 0.0008) * 0.3 + 0.35) * H * 0.4;
      const bw  = W / 50;
      c.fillStyle = "rgba(29,185,84,0.15)";
      c.beginPath();
      c.roundRect(i * bw + bw * 0.12, H / 2 - amp / 2, bw * 0.75, amp, 2);
      c.fill();
    }
    if (!state.isPlaying) this._animId = requestAnimationFrame(() => this._drawIdle());
  }

  /* ─────────────────────────────────────────
     EVENTS AUDIO NATIFS
  ───────────────────────────────────────── */
  _bindAudioEvents() {
    this.audio.addEventListener("timeupdate",      () => this.onState("timeupdate"));
    this.audio.addEventListener("loadedmetadata",  () => this.onState("metadata"));
    this.audio.addEventListener("ended", () => {
      if (!state.isRepeat) this.next();
    });
  }

  /* ─────────────────────────────────────────
     RACCOURCIS CLAVIER
  ───────────────────────────────────────── */
  _bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      switch (e.code) {
        case "Space":       e.preventDefault(); this.togglePlay(); break;
        case "ArrowRight":  this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + 5); break;
        case "ArrowLeft":   this.audio.currentTime = Math.max(0, this.audio.currentTime - 5); break;
        case "ArrowUp":     this.setVolume(state.volume + 5); break;
        case "ArrowDown":   this.setVolume(state.volume - 5); break;
        case "KeyN":        this.next(); break;
        case "KeyP":        this.prev(); break;
        case "KeyS":        this.toggleShuffle(); break;
        case "KeyR":        this.toggleRepeat();  break;
      }
    });
  }
}