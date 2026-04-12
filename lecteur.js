// ═══════════════════════════════════════════════════════════
// SOUNDWAVE — Lecteur audio/vidéo
// ═══════════════════════════════════════════════════════════

const AUDIO_EXT = /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma|aiff|ape)$/i;
const VIDEO_EXT = /\.(mp4|webm|mkv|avi|mov|m4v|ogv|3gp|wmv|flv)$/i;

let tracks    = [];
let curIdx    = 0;
let shuffleOn = false;
let repeatOn  = false;
let playing   = false;
let muted     = false;

let audioCtx = null, analyser = null;
const srcNodes = new WeakMap(); // un seul MediaElementSource par élément

// Éléments média fixes
const AUD = new Audio();
const VID = document.getElementById('vid');

// ════════════════════════════════════════
// TOAST NOTIFICATIONS
// ════════════════════════════════════════
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3000);
}
function showHome() {
  document.getElementById('homeView').classList.remove('hidden');
}

// ════════════════════════════════════════
// OUVRIR FICHIERS
// ════════════════════════════════════════
function openFolder() {
  const inp = document.getElementById('folderInput');
  inp.value = '';
  inp.click();
}
function openFiles() {
  const inp = document.getElementById('fileInput');
  inp.value = '';
  inp.click();
}

// ════════════════════════════════════════
// CHARGER FICHIERS → PLAYER
// ════════════════════════════════════════
function handleFiles(fileList) {
  const files = Array.from(fileList);
  const valid = files.filter(f => AUDIO_EXT.test(f.name) || VIDEO_EXT.test(f.name));

  if (!valid.length) {
    toast('Aucun fichier audio ou vidéo trouvé.', 'error');
    return;
  }

  valid.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // Libérer les URLs précédentes
  tracks.forEach(t => { try { URL.revokeObjectURL(t.url); } catch(e){} });

  tracks = valid.map(f => ({
    file:  f,
    name:  f.name.replace(/\.[^.]+$/, ''),
    isVid: VIDEO_EXT.test(f.name),
    url:   URL.createObjectURL(f)
  }));

  buildPlaylist();
  loadTrack(0);
  showSidebar();
  toast(tracks.length + ' fichier' + (tracks.length > 1 ? 's' : '') + ' chargé' + (tracks.length > 1 ? 's' : ''), 'success');
}

// ════════════════════════════════════════
// PLAYLIST
// ════════════════════════════════════════
function buildPlaylist() {
  const n = tracks.length;
  const a = tracks.filter(t => !t.isVid).length;
  const v = n - a;
  document.getElementById('sbCount').textContent =
    n + ' fichier' + (n > 1 ? 's' : '') + ' · ' + a + ' audio · ' + v + ' vidéo';

  document.getElementById('playlistEl').innerHTML = tracks.map((t, i) =>
    '<div class="pl-item' + (i === curIdx ? ' active' : '') + '" id="pi' + i + '" onclick="loadTrack(' + i + ')">' +
    '<div class="pi-icon">' + (t.isVid ? '🎬' : '🎵') + '</div>' +
    '<div class="pi-meta">' +
      '<div class="pi-name">' + esc(t.name) + '</div>' +
      '<div class="pi-type">' + (t.isVid ? 'VIDÉO' : 'AUDIO') + ' · ' + fmtSz(t.file.size) + '</div>' +
    '</div>' +
    '<div class="pi-num">' + (i + 1) + '</div>' +
    '</div>'
  ).join('');
}

function updatePL() {
  tracks.forEach((_, i) => {
    const el = document.getElementById('pi' + i);
    if (el) el.className = 'pl-item' + (i === curIdx ? ' active' : '');
  });
  const act = document.getElementById('pi' + curIdx);
  if (act) act.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ════════════════════════════════════════
// CHARGER UNE PISTE
// ════════════════════════════════════════
function loadTrack(idx) {
  curIdx = idx;
  const t = tracks[idx];
  if (!t) return;

  // Stopper les deux éléments
  AUD.pause();
  VID.pause();

  // Réinitialiser la barre de progression
  document.getElementById('progFill').style.width = '0%';
  document.getElementById('tCur').textContent = '0:00';
  document.getElementById('tTot').textContent = '0:00';

  // Afficher les contrôles
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('controls').style.display = 'flex';

  if (t.isVid) {
    // ─ Mode vidéo ─
    document.getElementById('audioBg').style.display = 'none';
    document.getElementById('vizCanvas').style.display = 'none';
    document.getElementById('audioArt').classList.remove('playing');
    VID.style.display = 'block';
    VID.src = t.url;
    attachEvents(VID);
    initAudioCtx(VID);
    VID.play().catch(() => {});
  } else {
    // ─ Mode audio ─
    VID.style.display = 'none';
    VID.src = '';
    document.getElementById('audioBg').style.display = 'flex';
    document.getElementById('vizCanvas').style.display = 'block';
    document.getElementById('audioTitle').textContent = t.name;
    document.getElementById('audioSub').textContent = 'AUDIO · ' + fmtSz(t.file.size);
    AUD.src = t.url;
    attachEvents(AUD);
    initAudioCtx(AUD);
    AUD.play().catch(() => {});
  }

  // Mettre à jour infos dans la barre de contrôle
  document.getElementById('ctrlName').textContent = t.name;
  document.getElementById('ctrlSub').textContent = (t.isVid ? 'Vidéo' : 'Audio') + ' · ' + fmtSz(t.file.size);

  // Volume
  setVol(document.getElementById('volSlider').value);

  updatePL();
  setTimeout(resizeViz, 50);

  // Titre de l'onglet
  document.title = t.name + ' · SoundWave';

  // Sauvegarder dans l'historique
  saveRecent(t);
}

// ════════════════════════════════════════
// CONTEXTE AUDIO (Web Audio API)
// ════════════════════════════════════════
function initAudioCtx(el) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    analyser.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!srcNodes.has(el)) {
    const src = audioCtx.createMediaElementSource(el);
    src.connect(analyser);
    srcNodes.set(el, src);
  }
}

// ════════════════════════════════════════
// ÉVÉNEMENTS MÉDIA
// ════════════════════════════════════════
function attachEvents(el) {
  el.ontimeupdate = function() {
    if (!el.duration) return;
    const p = (el.currentTime / el.duration) * 100;
    document.getElementById('progFill').style.width = p + '%';
    document.getElementById('tCur').textContent = fmtT(el.currentTime);
    document.getElementById('tTot').textContent = fmtT(el.duration);
  };

  el.onplay = function() {
    playing = true;
    updBtn();
    updatePL();
    document.getElementById('audioArt').classList.add('playing');
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  };

  el.onpause = function() {
    playing = false;
    updBtn();
    updatePL();
    document.getElementById('audioArt').classList.remove('playing');
  };

  el.onended = function() {
    if (repeatOn) { el.currentTime = 0; el.play(); }
    else nextTrack();
  };

  el.onerror = function() {
    toast('Erreur de lecture — passage au suivant', 'error');
    nextTrack();
  };
}

// ════════════════════════════════════════
// CONTRÔLES PLAYER
// ════════════════════════════════════════
function togglePlay() {
  if (!tracks.length) return;
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  const el = tracks[curIdx].isVid ? VID : AUD;
  el.paused ? el.play() : el.pause();
}

function updBtn() {
  document.getElementById('playIcon').innerHTML = playing
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

function prevTrack() {
  if (!tracks.length) return;
  const el = tracks[curIdx].isVid ? VID : AUD;
  // Si on est à plus de 3 secondes, restart la piste actuelle
  if (el.currentTime > 3) {
    el.currentTime = 0;
    return;
  }
  loadTrack((curIdx - 1 + tracks.length) % tracks.length);
}

function nextTrack() {
  if (!tracks.length) return;
  if (shuffleOn) {
    let n;
    do { n = Math.floor(Math.random() * tracks.length); } while (tracks.length > 1 && n === curIdx);
    loadTrack(n);
  } else if (curIdx < tracks.length - 1) {
    loadTrack(curIdx + 1);
  } else if (repeatOn) {
    loadTrack(0);
  }
}

function toggleShuffle() {
  shuffleOn = !shuffleOn;
  document.getElementById('shuffleBtn').classList.toggle('on', shuffleOn);
  toast(shuffleOn ? 'Lecture aléatoire activée' : 'Lecture aléatoire désactivée');
}

function toggleRepeat() {
  repeatOn = !repeatOn;
  document.getElementById('repeatBtn').classList.toggle('on', repeatOn);
  toast(repeatOn ? 'Répétition activée' : 'Répétition désactivée');
}

function setVol(v) {
  const vol = parseFloat(v);
  AUD.volume = vol;
  VID.volume = vol;
  if (!muted) updateVolIcon(vol);
}

function toggleMute() {
  muted = !muted;
  AUD.muted = muted;
  VID.muted = muted;
  const vol = parseFloat(document.getElementById('volSlider').value);
  updateVolIcon(muted ? 0 : vol);
  document.getElementById('volSlider').style.opacity = muted ? '0.4' : '1';
}

function updateVolIcon(v) {
  const icon = document.getElementById('volIcon');
  if (!icon) return;
  if (v === 0) {
    icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  } else if (v < 0.4) {
    icon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
  } else if (v < 0.75) {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
  } else {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
}

// ════════════════════════════════════════
// BARRE DE PROGRESSION (drag + touch)
// ════════════════════════════════════════
let seekDragging = false;

function initSeekBar() {
  const wrap = document.getElementById('progWrap');
  if (!wrap) return;

  const doSeek = (clientX) => {
    if (!tracks.length) return;
    const rect  = wrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const el    = tracks[curIdx].isVid ? VID : AUD;
    if (el.duration) {
      el.currentTime = ratio * el.duration;
      document.getElementById('progFill').style.width = (ratio * 100) + '%';
    }
  };

  wrap.addEventListener('mousedown',  e => { seekDragging = true;  doSeek(e.clientX); });
  document.addEventListener('mousemove', e => { if (seekDragging) doSeek(e.clientX); });
  document.addEventListener('mouseup',   () => { seekDragging = false; });

  wrap.addEventListener('touchstart', e => { seekDragging = true;  doSeek(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchmove', e => { if (seekDragging) doSeek(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchend',  () => { seekDragging = false; });
}

// ════════════════════════════════════════
// PLEIN ÉCRAN
// ════════════════════════════════════════
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('app').requestFullscreen()
      .catch(() => toast('Plein écran non disponible', 'error'));
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const isFS = !!document.fullscreenElement;
  const fsIcon = document.getElementById('fsIcon');
  if (fsIcon) {
    fsIcon.innerHTML = isFS
      ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
      : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
  }
  // Masquer/afficher topBar en plein écran
  const topBar = document.getElementById('topBar');
  if (isFS) {
    topBar.classList.add('hidden');
    startFsAutoHide();
  } else {
    topBar.classList.remove('hidden');
    clearTimeout(fsHideTimer);
  }
});

let fsHideTimer = null;
function startFsAutoHide() {
  clearTimeout(fsHideTimer);
  fsHideTimer = setTimeout(() => {
    if (document.fullscreenElement) {
      document.getElementById('topBar').classList.add('hidden');
    }
  }, 2500);
}

document.addEventListener('mousemove', () => {
  if (!document.fullscreenElement) return;
  const topBar = document.getElementById('topBar');
  topBar.classList.remove('hidden');
  startFsAutoHide();
});

// ════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.contains('hidden') ? showSidebar() : hideSidebar();
}
function showSidebar() {
  document.getElementById('sidebar').classList.remove('hidden');
  if (window.innerWidth <= 700) document.getElementById('sideOverlay').classList.add('show');
  setTimeout(resizeViz, 360);
}
function hideSidebar() {
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('sideOverlay').classList.remove('show');
  setTimeout(resizeViz, 360);
}

// ════════════════════════════════════════
// NAVIGATION HOME ↔ PLAYER
// ════════════════════════════════════════
function backToHome() {
  AUD.pause();
  VID.pause();
  document.getElementById('homeView').classList.remove('hidden');
  document.title = 'SoundWave';
  renderRecents();
}

// ════════════════════════════════════════
// RACCOURCIS CLAVIER
// ════════════════════════════════════════
document.addEventListener('keydown', e => {
  // Ignorer si on tape dans un champ texte
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  // Ignorer si la homeView est active
  if (!document.getElementById('homeView').classList.contains('hidden')) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;

    case 'ArrowLeft':
      e.preventDefault();
      if (e.shiftKey) {
        prevTrack();
      } else {
        const el1 = tracks[curIdx]?.isVid ? VID : AUD;
        if (el1) el1.currentTime = Math.max(0, el1.currentTime - 10);
      }
      break;

    case 'ArrowRight':
      e.preventDefault();
      if (e.shiftKey) {
        nextTrack();
      } else {
        const el2 = tracks[curIdx]?.isVid ? VID : AUD;
        if (el2 && el2.duration) el2.currentTime = Math.min(el2.duration, el2.currentTime + 10);
      }
      break;

    case 'ArrowUp':
      e.preventDefault();
      { const s = document.getElementById('volSlider'); s.value = Math.min(1, parseFloat(s.value) + 0.05); setVol(s.value); }
      break;

    case 'ArrowDown':
      e.preventDefault();
      { const s = document.getElementById('volSlider'); s.value = Math.max(0, parseFloat(s.value) - 0.05); setVol(s.value); }
      break;

    case 'KeyF': toggleFullscreen(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyL': toggleSidebar(); break;
    case 'KeyS': toggleShuffle(); break;
    case 'KeyR': toggleRepeat(); break;

    case 'Home':
      e.preventDefault();
      if (tracks.length) loadTrack(0);
      break;

    case 'End':
      e.preventDefault();
      if (tracks.length) loadTrack(tracks.length - 1);
      break;
  }
});

// ════════════════════════════════════════
// VISUALISEUR
// ════════════════════════════════════════
const canvas = document.getElementById('vizCanvas');
const ctx2d  = canvas.getContext('2d');

function resizeViz() {
  canvas.width  = canvas.offsetWidth  * (devicePixelRatio || 1);
  canvas.height = canvas.offsetHeight * (devicePixelRatio || 1);
}
resizeViz();
window.addEventListener('resize', resizeViz);

function drawViz() {
  requestAnimationFrame(drawViz);
  if (canvas.style.display === 'none') return;

  const W = canvas.width, H = canvas.height, dpr = devicePixelRatio || 1;
  ctx2d.clearRect(0, 0, W, H);

  const n    = 80;
  const gap  = Math.floor(W / (n * 6));
  const barW = (W - gap * (n - 1)) / n;
  const maxH = H * 0.92;
  const segH = 4.5 * dpr;
  const segG = 2 * dpr;
  const totS = Math.floor(maxH / (segH + segG));
  const t    = Date.now() / 1000;

  let freqData = null;
  if (analyser && playing) {
    freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
  }

  for (let i = 0; i < n; i++) {
    let val;
    if (freqData) {
      val = freqData[Math.floor(i * freqData.length / n)] / 255;
    } else {
      // Animation veille
      val = 0.03 + 0.03 * Math.sin(t * 1.1 + i * 0.42) + 0.015 * Math.cos(t * 0.75 + i * 0.9);
    }

    const barHeight = Math.max(segH + segG, val * maxH);
    const x = i * (barW + gap);
    const numSegs = Math.floor(barHeight / (segH + segG));

    for (let s = 0; s < numSegs; s++) {
      const sy    = H - (s + 1) * (segH + segG);
      const ratio = s / totS;
      const color = ratio > 0.84 ? '#ff2200'
                  : ratio > 0.70 ? '#ff6600'
                  : ratio > 0.55 ? '#ffaa00'
                  : ratio > 0.38 ? '#ccee00'
                  : '#00ff88';
      ctx2d.fillStyle = color;
      ctx2d.beginPath();
      ctx2d.roundRect(x, sy, barW, segH, 1.5);
      ctx2d.fill();
    }

    // Reflet
    const refSegs = Math.floor(numSegs * 0.35);
    for (let s = 0; s < refSegs; s++) {
      ctx2d.fillStyle = 'rgba(0,255,136,' + (0.08 * (1 - s / refSegs)) + ')';
      ctx2d.beginPath();
      ctx2d.roundRect(x, H + (s + 1) * (segH + segG) * 0.6, barW, segH, 1.5);
      ctx2d.fill();
    }
  }
}
drawViz();

// ════════════════════════════════════════
// DRAG & DROP (zone principale)
// ════════════════════════════════════════
const dropZone = document.getElementById('app');
dropZone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
dropZone.addEventListener('drop',     e => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

// ════════════════════════════════════════
// UTILITAIRES
// ════════════════════════════════════════
function fmtT(s) {
  if (!isFinite(s)) return '0:00';
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return m + ':' + sec;
}

function fmtSz(b) {
  return b < 1048576
    ? (b / 1024).toFixed(0) + ' KB'
    : (b / 1048576).toFixed(1) + ' MB';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ════════════════════════════════════════
// INIT (DOMContentLoaded)
// ════════════════════════════════════════
window.addEventListener('DOMContentLoaded', function () {
  // Barre de progression drag
  initSeekBar();

  // Icône de volume initiale
  updateVolIcon(0.8);

  // Récents
  renderRecents();

  // Splash: disparaît après 2.5s
  setTimeout(function () {
    const splash = document.getElementById('splashScreen');
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 800);
  }, 2500);
});

// ════════════════════════════════════════
// HOME — ONGLETS
// ════════════════════════════════════════
function showHomeTab(tab) {
  document.getElementById('tabAccueil').classList.toggle('hidden', tab !== 'accueil');
  document.getElementById('tabBibliotheque').classList.toggle('hidden', tab !== 'bibliotheque');
  document.getElementById('navAccueil').classList.toggle('active', tab === 'accueil');
  document.getElementById('navBiblio').classList.toggle('active', tab === 'bibliotheque');
}

// ════════════════════════════════════════
// HOME — SIDEBAR MOBILE
// ════════════════════════════════════════
function toggleHvSidebar() {
  document.getElementById('hvSidebar').classList.toggle('open');
  document.getElementById('hvOverlay').classList.toggle('show');
}
function closeHvSidebar() {
  document.getElementById('hvSidebar').classList.remove('open');
  document.getElementById('hvOverlay').classList.remove('show');
}

// ════════════════════════════════════════
// HOME — OUVRIR FICHIERS
// ════════════════════════════════════════
function homeOpenFiles() {
  document.getElementById('homeFileInput').value = '';
  document.getElementById('homeFileInput').click();
}
function libAddFolder() {
  document.getElementById('homeFolderInput').value = '';
  document.getElementById('homeFolderInput').click();
}

function homeHandleFiles(fileList) {
  const files = Array.from(fileList).filter(f => AUDIO_EXT.test(f.name) || VIDEO_EXT.test(f.name));
  if (!files.length) { toast('Aucun fichier audio ou vidéo trouvé.', 'error'); return; }
  document.getElementById('homeView').classList.add('hidden');
  handleFiles(fileList);
}

function homeHandleFolder(fileList) {
  const files = Array.from(fileList).filter(f => AUDIO_EXT.test(f.name) || VIDEO_EXT.test(f.name));
  if (!files.length) { toast('Aucun fichier audio ou vidéo trouvé.', 'error'); return; }
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const existing = new Set(libTracks.map(f => f.name));
  let added = 0;
  files.forEach(f => { if (!existing.has(f.name)) { libTracks.push(f); added++; } });
  libTracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  loadLibDurations(files);
  renderLibrary();

  if (added > 0) toast(added + ' fichier' + (added > 1 ? 's' : '') + ' ajouté' + (added > 1 ? 's' : '') + ' à la bibliothèque', 'success');
  else toast('Tous les fichiers sont déjà dans la bibliothèque.', 'info');
}

// Enregistrer les handlers des inputs hidden
document.getElementById('homeFolderInput').onchange = function () { homeHandleFolder(this.files); };
document.getElementById('homeFileInput').onchange   = function () { homeHandleFiles(this.files); };

// ════════════════════════════════════════
// HOME — BIBLIOTHÈQUE
// ════════════════════════════════════════
let libTracks     = [];
let libSortOrder  = 'az';
let libCurrentTab = 'morceaux';
const libDurations = {}; // nom de fichier → durée en secondes

function loadLibDurations(files) {
  files.forEach(f => {
    if (libDurations[f.name] !== undefined) return;
    if (VIDEO_EXT.test(f.name)) return; // skip vidéos
    const a   = new Audio();
    const url = URL.createObjectURL(f);
    a.src     = url;
    a.addEventListener('loadedmetadata', function () {
      libDurations[f.name] = a.duration;
      URL.revokeObjectURL(url);
      a.src = '';
      renderLibrary();
    }, { once: true });
    a.load();
  });
}

function setLibTab(tab, el) {
  libCurrentTab = tab;
  document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderLibrary();
}

function libSort(val) {
  libSortOrder = val;
  renderLibrary();
}

function libShuffle() {
  if (!libTracks.length) { toast('Ajoutez d\'abord un dossier.', 'error'); return; }
  document.getElementById('homeView').classList.add('hidden');
  tracks.forEach(t => { try { URL.revokeObjectURL(t.url); } catch(e){} });
  tracks = [...libTracks].map(f => ({
    file: f, name: f.name.replace(/\.[^.]+$/, ''),
    isVid: VIDEO_EXT.test(f.name), url: URL.createObjectURL(f)
  }));
  // Fisher-Yates shuffle
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  buildPlaylist();
  loadTrack(0);
  showSidebar();
}

function libPlayTrack(idx) {
  if (!libTracks.length) return;
  document.getElementById('homeView').classList.add('hidden');
  tracks.forEach(t => { try { URL.revokeObjectURL(t.url); } catch(e){} });
  tracks = libTracks.map(f => ({
    file: f, name: f.name.replace(/\.[^.]+$/, ''),
    isVid: VIDEO_EXT.test(f.name), url: URL.createObjectURL(f)
  }));
  buildPlaylist();
  loadTrack(idx);
  showSidebar();
}

function renderLibrary() {
  const list = document.getElementById('libList');
  if (!libTracks.length) {
    list.innerHTML = '<div class="lib-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>Ajoutez un dossier pour commencer</div>';
    return;
  }
  if      (libCurrentTab === 'morceaux')  renderLibTracks(list);
  else if (libCurrentTab === 'albums')    renderLibAlbums(list);
  else                                    renderLibArtists(list);
}

// ── Vue Morceaux ──
function renderLibTracks(list) {
  let sorted = [...libTracks];
  if (libSortOrder === 'za') sorted.reverse();

  const groups = {};
  sorted.forEach(f => {
    const letter = (f.name[0] || '#').toUpperCase().replace(/[^A-Z]/, '#');
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push({ f, origIdx: libTracks.indexOf(f) });
  });

  const letters = Object.keys(groups).sort(
    libSortOrder === 'za' ? (a, b) => b.localeCompare(a) : (a, b) => a.localeCompare(b)
  );

  list.innerHTML = letters.map(letter =>
    '<div class="lib-alpha-group">' +
    '<div class="lib-alpha-letter">' + letter + '</div>' +
    groups[letter].map(({ f, origIdx }) => {
      const name = f.name.replace(/\.[^.]+$/, '');
      const dur  = libDurations[f.name] != null ? fmtT(libDurations[f.name]) : '—';
      const icon = VIDEO_EXT.test(f.name) ? '🎬' : '🎵';
      return '<div class="lib-track" onclick="libPlayTrack(' + origIdx + ')">' +
        '<div class="lib-track-icon">' + icon + '</div>' +
        '<div class="lib-track-name">' + esc(name) + '</div>' +
        '<div class="lib-track-meta">' + (VIDEO_EXT.test(f.name) ? 'Vidéo' : 'Audio') + '</div>' +
        '<div class="lib-track-size">' + fmtSz(f.size) + '</div>' +
        '<div class="lib-track-dur">' + dur + '</div>' +
        '</div>';
    }).join('') +
    '</div>'
  ).join('');
}

// ── Vue Albums (grille de cartes) ──
function renderLibAlbums(list) {
  list.innerHTML =
    '<div class="lib-group-info">Toutes les pistes · ' + libTracks.length + ' fichier' + (libTracks.length > 1 ? 's' : '') + '</div>' +
    '<div class="lib-album-grid">' +
    libTracks.map((f, i) => {
      const name = f.name.replace(/\.[^.]+$/, '');
      const icon = VIDEO_EXT.test(f.name) ? '🎬' : '🎵';
      return '<div class="lib-album-card" onclick="libPlayTrack(' + i + ')">' +
        '<div class="lib-album-art">' + icon + '</div>' +
        '<div class="lib-album-name">' + esc(name) + '</div>' +
        '</div>';
    }).join('') +
    '</div>';
}

// ── Vue Artistes ──
function renderLibArtists(list) {
  const audioCount = libTracks.filter(f => AUDIO_EXT.test(f.name)).length;
  const videoCount = libTracks.filter(f => VIDEO_EXT.test(f.name)).length;
  list.innerHTML =
    '<div class="lib-group-info">' + libTracks.length + ' piste' + (libTracks.length > 1 ? 's' : '') + '</div>' +
    '<div class="lib-artist-row" onclick="libShuffle()">' +
      '<div class="lib-artist-avatar">' +
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' +
        '</svg>' +
      '</div>' +
      '<div class="lib-artist-info">' +
        '<div class="lib-artist-name">Artiste inconnu</div>' +
        '<div class="lib-artist-count">' + audioCount + ' audio · ' + videoCount + ' vidéo</div>' +
      '</div>' +
      '<button class="lib-artist-play" onclick="event.stopPropagation();libShuffle()">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M8 5v14l11-7z"/>' +
        '</svg>' +
      '</button>' +
    '</div>';
}

// ════════════════════════════════════════
// HOME — MÉDIAS RÉCENTS
// ════════════════════════════════════════
let recentItems = [];
try {
  recentItems = JSON.parse(localStorage.getItem('sw_recents') || '[]');
} catch(e) { recentItems = []; }

function saveRecent(track) {
  const item = { name: track.name, isVid: track.isVid, ts: Date.now(), thumb: null };
  recentItems = recentItems.filter(r => r.name !== item.name);
  recentItems.unshift(item);
  recentItems = recentItems.slice(0, 12);

  if (track.isVid && track.url) {
    const video = document.createElement('video');
    video.src   = track.url;
    video.addEventListener('seeked', function () {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      c.getContext('2d').drawImage(video, 0, 0, 320, 180);
      item.thumb = c.toDataURL('image/jpeg', 0.6);
      try { localStorage.setItem('sw_recents', JSON.stringify(recentItems)); } catch(e){}
      renderRecents();
    }, { once: true });
    video.addEventListener('loadedmetadata', function () { video.currentTime = 1; }, { once: true });
    video.load();
  } else {
    try { localStorage.setItem('sw_recents', JSON.stringify(recentItems)); } catch(e){}
    renderRecents();
  }
}

function renderRecents() {
  const grid = document.getElementById('recentsGrid');
  if (!grid) return;

  if (!recentItems.length) {
    grid.innerHTML = '<div class="no-recents"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>Aucun média récent</div>';
    return;
  }

  grid.innerHTML = recentItems.map(item => {
    const thumb = item.isVid
      ? (item.thumb
          ? '<img src="' + item.thumb + '" style="width:100%;height:100%;object-fit:cover" alt="">'
          : '<div class="vid-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></div>')
      : '<div class="audio-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>';

    const safeName = item.name.replace(/'/g, "\\'");
    return '<div class="recent-card" onclick="recentPlay(\'' + safeName + '\')" title="' + esc(item.name) + '">' +
      '<div class="recent-thumb">' + thumb + '</div>' +
      '<div class="recent-card-info">' +
        '<div class="recent-card-name">' + esc(item.name) + '</div>' +
        '<div class="recent-card-type">' + (item.isVid ? 'Vidéo' : 'Audio') + '</div>' +
      '</div></div>';
  }).join('');
}

function recentPlay(name) {
  // 1) Chercher dans la bibliothèque
  const libIdx = libTracks.findIndex(f => f.name.replace(/\.[^.]+$/, '') === name);
  if (libIdx >= 0) { libPlayTrack(libIdx); return; }

  // 2) Chercher dans les pistes du player (déjà chargées)
  const pIdx = tracks.findIndex(t => t.name === name);
  if (pIdx >= 0) {
    document.getElementById('homeView').classList.add('hidden');
    loadTrack(pIdx);
    return;
  }

  // 3) Fichier non disponible — inviter l'utilisateur à le rouvrir
  toast('Ouvrez à nouveau ce fichier pour le lire.', 'info');
}

// Rendre renderRecents disponible dès que le DOM est prêt
document.addEventListener('DOMContentLoaded', renderRecents);