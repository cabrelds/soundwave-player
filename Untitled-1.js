/**
 * ═══════════════════════════════════════════
 *  MODULE 1 — DATA & STATE
 *  Contient : données des pistes + état global
 *  partagé entre les modules Player et UI.
 * ═══════════════════════════════════════════
 */

export const tracks = [
  {
    title: "Gymnopedie No. 1",
    artist: "Erik Satie",
    emoji: "🎹",
    bg: "#1a2e4a",
    heroColor: "#0d2035",
    url: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Gymnopedie_No._1.ogg",
    duration: "3:04",
  },
  {
    title: "Clair de Lune",
    artist: "Claude Debussy",
    emoji: "🌙",
    bg: "#1e1040",
    heroColor: "#110830",
    url: "https://upload.wikimedia.org/wikipedia/commons/1/17/Clair_de_lune.ogg",
    duration: "4:53",
  },
  {
    title: "Für Elise",
    artist: "L. van Beethoven",
    emoji: "🌸",
    bg: "#3a1040",
    heroColor: "#230828",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/04/F%C3%BCr_Elise.ogg",
    duration: "2:55",
  },
  {
    title: "Moonlight Sonata",
    artist: "L. van Beethoven",
    emoji: "🌊",
    bg: "#102840",
    heroColor: "#071525",
    url: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Moonlight_Sonata.ogg",
    duration: "5:38",
  },
  {
    title: "Prelude in C Major",
    artist: "Johann S. Bach",
    emoji: "✨",
    bg: "#2a2210",
    heroColor: "#181205",
    url: "https://upload.wikimedia.org/wikipedia/commons/5/56/Prelude_and_Fugue_in_C_major%2C_BWV_846_-_Prelude.ogg",
    duration: "2:20",
  },
  {
    title: "Hungarian Dance No. 5",
    artist: "Johannes Brahms",
    emoji: "🔥",
    bg: "#3a1408",
    heroColor: "#200900",
    url: "https://upload.wikimedia.org/wikipedia/commons/d/d8/Brahms_Hungarian_Dance_5.ogg",
    duration: "3:01",
  },
];

/**
 * État global de l'application.
 * Toujours modifier via les setters pour
 * garantir la cohérence entre modules.
 */
export const state = {
  currentIndex: 0,
  isPlaying:    false,
  isShuffle:    false,
  isRepeat:     false,
  isMuted:      false,
  volume:       80,
  favorites:    new Set(),

  /* Getters */
  get currentTrack() { return tracks[this.currentIndex]; },
  get nextIndex()    {
    return this.isShuffle
      ? Math.floor(Math.random() * tracks.length)
      : (this.currentIndex + 1) % tracks.length;
  },
  get prevIndex()    {
    return this.isShuffle
      ? Math.floor(Math.random() * tracks.length)
      : (this.currentIndex - 1 + tracks.length) % tracks.length;
  },

  /* Setters */
  toggleShuffle()  { this.isShuffle = !this.isShuffle; },
  toggleRepeat()   { this.isRepeat  = !this.isRepeat;  },
  toggleMute()     { this.isMuted   = !this.isMuted;   },
  toggleFavorite() {
    this.favorites.has(this.currentIndex)
      ? this.favorites.delete(this.currentIndex)
      : this.favorites.add(this.currentIndex);
  },
  isFavorite(i = this.currentIndex) { return this.favorites.has(i); },

  setVolume(v) {
    this.volume  = Math.max(0, Math.min(100, v));
    this.isMuted = this.volume === 0;
  },
};