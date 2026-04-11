/**
 * ═══════════════════════════════════════════
 *  MODULE 3 — UI (Interface Utilisateur)
 *  Contient : rendu DOM, bindings événements,
 *  mise à jour réactive de tous les éléments.
 *
 *  Expose : UIController (classe)
 * ═══════════════════════════════════════════
 */

import { tracks, state } from "./data.js";

/* ── Helpers ── */
const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  if (isNaN(s) || s === Infinity) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/* ── SVG icons ── */
const ICONS = {
  play:  `<path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/>`,
  pause: `<path d="M5.7 3a.7.7 0 00-.7.7v16.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V3.7a.7.7 0 00-.7-.7H5.7zm10 0a.7.7 0 00-.7.7v16.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V3.7a.7.7 0 00-.7-.7h-2.6z"/>`,
  volHigh: `<path d="M13 3.534v16.932a1 1 0 01-1.664.748L5.46 15.5H2a1 1 0 01-1-1v-5a1 1 0 011-1h3.46l5.876-5.714A1 1 0 0113 3.534zm5.556 2.648a1 1 0 011.414-.024 9.007 9.007 0 010 12.951 1 1 0 11-1.39-1.438 7.007 7.007 0 000-10.075 1 1 0 01-.024-1.414zm-2.985 2.951a1 1 0 011.41-.095 5.006 5.006 0 010 7.637 1 1 0 11-1.315-1.506 3.006 3.006 0 000-4.625 1 1 0 01-.095-1.41z"/>`,
  volLow:  `<path d="M13 3.534v16.932a1 1 0 01-1.664.748L5.46 15.5H2a1 1 0 01-1-1v-5a1 1 0 011-1h3.46l5.876-5.714A1 1 0 0113 3.534zm2.525 2.903a1 1 0 011.41-.12 5.5 5.5 0 010 8.49 1 1 0 01-1.29-1.53 3.5 3.5 0 000-5.43 1 1 0 01-.12-1.41z"/>`,
  volMute: `<path d="M13 3.534v16.932a1 1 0 01-1.664.748L5.46 15.5H2a1 1 0 01-1-1v-5a1 1 0 011-1h3.46l5.876-5.714A1 1 0 0113 3.534zm4.146 4.144a1 1 0 011.414 0l1.94 1.94 1.94-1.94a1 1 0 111.414 1.414l-1.94 1.94 1.94 1.94a1 1 0 11-1.414 1.414L20.5 12.386l-1.94 1.94a1 1 0 01-1.414-1.414l1.94-1.94-1.94-1.94a1 1 0 010-1.414z"/>`,
};

export class UIController {
  /**
   * @param {HTMLAudioElement} audioEl - même élément <audio> que le PlayerEngine
   * @param {Object} playerRef         - instance PlayerEngine (injectée après construction)
   */
  constructor(audioEl) {
    this.audio  = audioEl;
    this.player = null; // sera injecté via setPlayer()

    this._progressDragging = false;
    this._volDragging      = false;

    this._buildAll();
    this._bindControls();
    this._bindProgressDrag();
    this._bindVolumeDrag();
  }

  /** Injection du moteur audio après construction (évite la dépendance circulaire) */
  setPlayer(playerInstance) {
    this.player = playerInstance;
  }

  /* ══════════════════════════════════════════
     CONSTRUCTION INITIALE DU DOM
  ══════════════════════════════════════════ */
  _buildAll() {
    this._buildTrackList();
    this._buildSidebar();
    this._buildQueue();
  }

  _buildTrackList() {
    const el = $("trackList");
    el.innerHTML = tracks.map((t, i) => `
      <div class="track-row${i === state.currentIndex ? " active" : ""}" data-i="${i}">
        <div class="track-row-num">
          <span class="track-row-num-inner">${i + 1}</span>
          <div class="playing-anim${state.isPlaying ? "" : " paused"}">
            <div class="sp-bar"></div><div class="sp-bar"></div><div class="sp-bar"></div>
          </div>
        </div>
        <div class="track-row-title">
          <div class="track-row-emoji">${t.emoji}</div>
          <div class="track-row-meta">
            <div class="track-row-name">${t.title}</div>
            <div class="track-row-artist">${t.artist}</div>
          </div>
        </div>
        <div class="track-row-album">${t.artist}</div>
        <div class="track-row-dur">${t.duration}</div>
      </div>
    `).join("");

    el.querySelectorAll(".track-row").forEach((r) =>
      r.addEventListener("click", () => this.player?.load(+r.dataset.i, true))
    );
  }

  _buildSidebar() {
    $("sidebarList").innerHTML = tracks.map((t, i) => `
      <div class="pl-item${i === state.currentIndex ? " active" : ""}" data-i="${i}">
        <div class="pl-item-img" style="background:${t.bg}">${t.emoji}</div>
        <div class="pl-item-meta">
          <div class="pl-item-name${i === state.currentIndex ? " active-text" : ""}">${t.title}</div>
          <div class="pl-item-sub">${t.artist}</div>
        </div>
      </div>
    `).join("");

    document.querySelectorAll(".pl-item").forEach((r) =>
      r.addEventListener("click", () => this.player?.load(+r.dataset.i, true))
    );
  }

  _buildQueue() {
    const t    = state.currentTrack;
    $("npCover").textContent  = t.emoji;
    $("npTitle").textContent  = t.title;
    $("npArtist").textContent = t.artist;

    const nextIdx = (state.currentIndex + 1) % tracks.length;
    $("queueList").innerHTML = tracks
      .slice(nextIdx).concat(tracks.slice(0, nextIdx))
      .slice(0, 5)
      .map((tr, i) => `
        <div class="q-item" data-i="${(nextIdx + i) % tracks.length}">
          <div class="q-cover">${tr.emoji}</div>
          <div class="q-meta">
            <div class="q-title">${tr.title}</div>
            <div class="q-artist">${tr.artist}</div>
          </div>
          <div class="q-dur">${tr.duration}</div>
        </div>
      `).join("");

    $("queueList").querySelectorAll(".q-item").forEach((r) =>
      r.addEventListener("click", () => this.player?.load(+r.dataset.i, true))
    );
  }

  /* ══════════════════════════════════════════
     MISE À JOUR RÉACTIVE
     Appelée par le PlayerEngine via onState()
  ══════════════════════════════════════════ */
  update(event) {
    switch (event) {
      case "load":
      case "playing":
        this._updateHero();
        this._updatePlayBtn();
        this._updateAnimBars();
        this._buildAll();
        break;
      case "timeupdate":
        this._updateProgress();
        break;
      case "metadata":
        $("durTime").textContent = fmt(this.audio.duration);
        break;
      case "shuffle":
        $("shuffleBtn").classList.toggle("on", state.isShuffle);
        break;
      case "repeat":
        $("repeatBtn").classList.toggle("on", state.isRepeat);
        break;
      case "volume":
        this._updateVolume();
        break;
      case "favorite":
        this._updateFavorites();
        break;
    }
  }

  /* ── Sous-updaters ── */
  _updateHero() {
    const t = state.currentTrack;
    $("heroCover").textContent  = t.emoji;
    $("barCover").textContent   = t.emoji;
    $("barCover").style.background = t.bg;
    $("barTitle").textContent   = t.title;
    $("barArtist").textContent  = t.artist;
    $("npCover").textContent    = t.emoji;
    $("npTitle").textContent    = t.title;
    $("npArtist").textContent   = t.artist;
    $("durTime").textContent    = t.duration;
    $("curTime").textContent    = "0:00";
    $("progressFill").style.width = "0%";
    document.getElementById("albumHero").style.setProperty("--hero-color", t.heroColor);
    this._updateFavorites();
  }

  _updatePlayBtn() {
    const icon = state.isPlaying ? ICONS.pause : ICONS.play;
    $("playIcon").innerHTML     = icon;
    $("heroPlayIcon").innerHTML = icon;
  }

  _updateAnimBars() {
    document.querySelectorAll(".playing-anim").forEach((el) =>
      el.classList.toggle("paused", !state.isPlaying)
    );
  }

  _updateProgress() {
    if (!this.audio.duration) return;
    const pct = (this.audio.currentTime / this.audio.duration) * 100;
    $("progressFill").style.width = pct + "%";
    $("curTime").textContent = fmt(this.audio.currentTime);
  }

  _updateVolume() {
    const v   = state.volume;
    $("volFill").style.width = v + "%";
    const iconPath = v === 0 || state.isMuted ? ICONS.volMute : v < 50 ? ICONS.volLow : ICONS.volHigh;
    $("volIcon").innerHTML = iconPath;
  }

  _updateFavorites() {
    const f = state.isFavorite();
    [$("barFav"), $("npHeart")].forEach((b) => {
      if (!b) return;
      b.textContent = f ? "♥" : "♡";
      b.classList.toggle("fav", f);
    });
  }

  /* ══════════════════════════════════════════
     BINDING DES CONTRÔLES PRINCIPAUX
  ══════════════════════════════════════════ */
  _bindControls() {
    /* Play / Pause */
    $("playBtn").addEventListener("click",     () => this.player?.togglePlay());
    $("heroPlayBtn").addEventListener("click", () => this.player?.togglePlay());

    /* Navigation */
    $("prevBtn").addEventListener("click", () => this.player?.prev());
    $("nextBtn").addEventListener("click", () => this.player?.next());

    /* Shuffle & Repeat */
    $("shuffleBtn").addEventListener("click", () => this.player?.toggleShuffle());
    $("repeatBtn").addEventListener("click",  () => this.player?.toggleRepeat());

    /* Mute */
    $("muteBtn").addEventListener("click", () => this.player?.toggleMute());

    /* Favoris */
    $("barFav").addEventListener("click",  () => this.player?.toggleFavorite());
    $("npHeart").addEventListener("click", () => this.player?.toggleFavorite());

    /* Onglets queue */
    $("tabNP").addEventListener("click", () => {
      $("tabNP").classList.add("active");
      $("tabQ").classList.remove("active");
    });
    $("tabQ").addEventListener("click", () => {
      $("tabQ").classList.add("active");
      $("tabNP").classList.remove("active");
    });
  }

  /* ══════════════════════════════════════════
     DRAG — BARRE DE PROGRESSION
  ══════════════════════════════════════════ */
  _bindProgressDrag() {
    const wrap = $("progressWrap");
    const seek = (e) => {
      const r   = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      $("progressFill").style.width = pct * 100 + "%";
      this.player?.seekTo(pct);
    };
    wrap.addEventListener("mousedown",    (e) => { this._progressDragging = true; seek(e); });
    wrap.addEventListener("touchstart",   (e) => { this._progressDragging = true; seek(e.touches[0]); }, { passive: true });
    document.addEventListener("mousemove",(e) => { if (this._progressDragging) seek(e); });
    document.addEventListener("touchmove",(e) => { if (this._progressDragging) seek(e.touches[0]); }, { passive: true });
    document.addEventListener("mouseup",  ()  => { this._progressDragging = false; });
    document.addEventListener("touchend", ()  => { this._progressDragging = false; });
  }

  /* ══════════════════════════════════════════
     DRAG — BARRE DE VOLUME
  ══════════════════════════════════════════ */
  _bindVolumeDrag() {
    const wrap = $("volWrap");
    const setV = (e) => {
      const r = wrap.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)));
      this.player?.setVolume(v);
    };
    wrap.addEventListener("mousedown",    (e) => { this._volDragging = true; setV(e); });
    wrap.addEventListener("touchstart",   (e) => { this._volDragging = true; setV(e.touches[0]); }, { passive: true });
    document.addEventListener("mousemove",(e) => { if (this._volDragging) setV(e); });
    document.addEventListener("touchmove",(e) => { if (this._volDragging) setV(e.touches[0]); }, { passive: true });
    document.addEventListener("mouseup",  ()  => { this._volDragging = false; });
    document.addEventListener("touchend", ()  => { this._volDragging = false; });
  }
}