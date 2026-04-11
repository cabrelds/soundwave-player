// Extensions valides (filtre par nom uniquement, pas par type MIME)
const AUDIO_EXT = /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma|aiff|ape)$/i;
const VIDEO_EXT = /\.(mp4|webm|mkv|avi|mov|m4v|ogv|3gp|wmv|flv)$/i;

let tracks = [], curIdx = 0, shuffleOn = false, repeatOn = false, playing = false;
let audioCtx = null, analyser = null;
const srcNodes = new WeakMap(); // un seul MediaElementSource par élément

// Les deux éléments média fixes
const AUD = new Audio();
const VID = document.getElementById('vid');

// ── OUVRIR ──
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

// ── CHARGER FICHIERS ──
function handleFiles(fileList) {
  const files = Array.from(fileList);

  // Filtrer par extension (plus fiable que le type MIME avec webkitdirectory)
  const valid = files.filter(f => AUDIO_EXT.test(f.name) || VIDEO_EXT.test(f.name));

  if (valid.length === 0) {
    alert('Aucun fichier audio ou vidéo trouvé dans la sélection.');
    return;
  }

  // Trier par nom (ordre naturel du dossier)
  valid.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // Libérer les URLs précédentes
  tracks.forEach(t => { try { URL.revokeObjectURL(t.url); } catch(e) {} });

  tracks = valid.map(f => ({
    file: f,
    name: f.name.replace(/\.[^.]+$/, ''),
    isVid: VIDEO_EXT.test(f.name),
    url: URL.createObjectURL(f)
  }));

  buildPlaylist();
  loadTrack(0);
  showSidebar();
}

// ── PLAYLIST ──
function buildPlaylist() {
  const n = tracks.length;
  const a = tracks.filter(t => !t.isVid).length;
  const v = tracks.filter(t => t.isVid).length;
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

// ── CHARGER UNE PISTE ──
function loadTrack(idx) {
  curIdx = idx;
  const t = tracks[idx];
  if (!t) return;

  // Stopper proprement les deux éléments
  AUD.pause();
  VID.pause();

  // Réinitialiser l'affichage
  document.getElementById('progFill').style.width = '0%';
  document.getElementById('tCur').textContent = '0:00';
  document.getElementById('tTot').textContent = '0:00';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('controls').style.display = 'block';

  if (t.isVid) {
    // Mode vidéo
    document.getElementById('audioBg').style.display = 'none';
    document.getElementById('vizCanvas').style.display = 'none';
    VID.style.display = 'block';
    VID.src = t.url;
    attachEvents(VID);
    initAudioCtx(VID);
    VID.play().catch(e => console.log('autoplay bloqué:', e));
  } else {
    // Mode audio
    VID.style.display = 'none';
    VID.src = '';
    document.getElementById('audioBg').style.display = 'flex';
    document.getElementById('vizCanvas').style.display = 'block';
    document.getElementById('audioTitle').textContent = t.name;
    document.getElementById('audioSub').textContent = 'AUDIO · ' + fmtSz(t.file.size);
    AUD.src = t.url;
    attachEvents(AUD);
    initAudioCtx(AUD);
    AUD.play().catch(e => console.log('autoplay bloqué:', e));
  }

  document.getElementById('ctrlName').textContent = t.name;
  document.getElementById('ctrlSub').textContent = (t.isVid ? 'Vidéo' : 'Audio') + ' · ' + fmtSz(t.file.size);

  setVol(document.getElementById('volSlider').value);
  updatePL();
  setTimeout(resizeViz, 50);
}

// ── CONTEXTE AUDIO ──
function initAudioCtx(el) {
  // Créer le contexte la première fois
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    analyser.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  // Créer le source node seulement si pas encore fait pour cet élément
  if (!srcNodes.has(el)) {
    const src = audioCtx.createMediaElementSource(el);
    src.connect(analyser);
    srcNodes.set(el, src);
  }
}

// ── ÉVÉNEMENTS MÉDIA ──
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
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  };
  el.onpause = function() {
    playing = false;
    updBtn();
    updatePL();
  };
  el.onended = function() {
    if (repeatOn) { el.currentTime = 0; el.play(); }
    else nextTrack();
  };
  el.onerror = function() {
    console.warn('Erreur média, passage au suivant');
    nextTrack();
  };
}

// ── CONTRÔLES ──
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
function seekTo(e) {
  if (!tracks.length) return;
  const bar = document.getElementById('progBar');
  const p = (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth;
  const el = tracks[curIdx].isVid ? VID : AUD;
  if (el.duration) el.currentTime = Math.max(0, Math.min(1, p)) * el.duration;
}
function setVol(v) { AUD.volume = +v; VID.volume = +v; }
function prevTrack() {
  if (!tracks.length) return;
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
function toggleShuffle() { shuffleOn = !shuffleOn; document.getElementById('shuffleBtn').classList.toggle('on', shuffleOn); }
function toggleRepeat() { repeatOn = !repeatOn; document.getElementById('repeatBtn').classList.toggle('on', repeatOn); }

// ── SIDEBAR ──
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

// ── VISUALISEUR ──
const canvas = document.getElementById('vizCanvas');
const ctx2d = canvas.getContext('2d');

function resizeViz() {
  canvas.width = canvas.offsetWidth * (devicePixelRatio || 1);
  canvas.height = canvas.offsetHeight * (devicePixelRatio || 1);
}
resizeViz();
window.addEventListener('resize', resizeViz);

function drawViz() {
  requestAnimationFrame(drawViz);
  if (canvas.style.display === 'none') return;

  const W = canvas.width, H = canvas.height, dpr = devicePixelRatio || 1;
  ctx2d.clearRect(0, 0, W, H);

  // Barres couvrant exactement toute la largeur
  const n = 80;
  const gap = Math.floor(W / (n * 6));
  const barW = (W - gap * (n - 1)) / n;
  const startX = 0;

  const maxH = H * 0.92;
  const segH = 4.5 * dpr;
  const segG = 2 * dpr;
  const totSeg = Math.floor(maxH / (segH + segG));
  const t = Date.now() / 1000;

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
    const x = startX + i * (barW + gap);
    const numSegs = Math.floor(barHeight / (segH + segG));

    for (let s = 0; s < numSegs; s++) {
      const sy = H - (s + 1) * (segH + segG);
      const ratio = s / totSeg;
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

// ── DRAG & DROP ──
window.ondragover = e => e.preventDefault();
window.ondrop = e => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

// ── UTILS ──
function fmtT(s) {
  if (!isFinite(s)) return '0:00';
  return Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0');
}
function fmtSz(b) {
  return b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════════════════════════
// SPLASH
// ═══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    const splash = document.getElementById('splashScreen');
    splash.classList.add('fade-out');
    setTimeout(function() { splash.style.display = 'none'; }, 800);
  }, 7000);
});

// ═══════════════════════════════════════════
// HOME STATE
// ═══════════════════════════════════════════
let libTracks = []; // tracks dans la bibliothèque
let recentItems = JSON.parse(localStorage.getItem('sw_recents') || '[]');

// ── Onglets accueil / bibliothèque ──
function showHomeTab(tab) {
  document.getElementById('tabAccueil').classList.toggle('hidden', tab !== 'accueil');
  document.getElementById('tabBibliotheque').classList.toggle('hidden', tab !== 'bibliotheque');
  document.getElementById('navAccueil').classList.toggle('active', tab === 'accueil');
  document.getElementById('navBiblio').classList.toggle('active', tab === 'bibliotheque');
}

// ── Ouvrir depuis accueil ──
function homeOpenFiles() {
  document.getElementById('homeFileInput').value = '';
  document.getElementById('homeFileInput').click();
}
function libAddFolder() {
  document.getElementById('homeFolderInput').value = '';
  document.getElementById('homeFolderInput').click();
}

const AUDIO_EXT2 = /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma|aiff|ape)$/i;
const VIDEO_EXT2 = /\.(mp4|webm|mkv|avi|mov|m4v|ogv|3gp|wmv|flv)$/i;

function homeHandleFiles(fileList) {
  const files = Array.from(fileList).filter(f => AUDIO_EXT2.test(f.name) || VIDEO_EXT2.test(f.name));
  if (!files.length) { alert('Aucun fichier audio ou vidéo trouvé.'); return; }
  files.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true, sensitivity:'base'}));

  // Passer au lecteur principal
  document.getElementById('homeView').classList.add('hidden');
  handleFiles(fileList); // fonction du lecteur principal
}

// ── Lecteur lib: clic sur un son de la bibliothèque ──
function libPlayTrack(idx) {
  if (!libTracks.length) return;
  // Charger tous les tracks de la lib dans le lecteur principal
  document.getElementById('homeView').classList.add('hidden');

  // Libérer URLs précédentes du lecteur principal
  tracks.forEach(t => { try { URL.revokeObjectURL(t.url); } catch(e) {} });

  tracks = libTracks.map(f => ({
    file: f,
    name: f.name.replace(/\.[^.]+$/, ''),
    isVid: VIDEO_EXT2.test(f.name),
    url: URL.createObjectURL(f)
  }));

  buildPlaylist();
  loadTrack(idx);
  showSidebar();
}

// ── Bibliothèque : ajouter dossier ──
function homeHandleFolder(fileList) {
  const files = Array.from(fileList).filter(f => AUDIO_EXT2.test(f.name) || VIDEO_EXT2.test(f.name));
  if (!files.length) { alert('Aucun fichier audio ou vidéo trouvé.'); return; }
  files.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true, sensitivity:'base'}));
  // Ajouter à la lib (dédoublonner par nom)
  const existing = new Set(libTracks.map(f => f.name));
  files.forEach(f => { if (!existing.has(f.name)) libTracks.push(f); });
  libTracks.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true, sensitivity:'base'}));
  renderLibrary();
}

// Remplacer le homeHandleFiles pour distinguer dossier vs fichiers
document.getElementById('homeFolderInput').onchange = function() { homeHandleFolder(this.files); };
document.getElementById('homeFileInput').onchange = function() { homeHandleFiles(this.files); };

// ── AFFICHER MÉDIAS RÉCENTS ──
function saveRecent(track) {
  const item = { name: track.name, isVid: track.isVid, ts: Date.now(), thumb: null };
  recentItems = recentItems.filter(r => r.name !== item.name);
  recentItems.unshift(item);
  recentItems = recentItems.slice(0, 12);

  if (track.isVid && track.url) {
    const video = document.createElement('video');
    video.src = track.url;
    video.addEventListener('seeked', function() {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      canvas.getContext('2d').drawImage(video, 0, 0, 320, 180);
      item.thumb = canvas.toDataURL('image/jpeg', 0.6);
      localStorage.setItem('sw_recents', JSON.stringify(recentItems));
      renderRecents();
    }, { once: true });
    video.addEventListener('loadedmetadata', function() {
      video.currentTime = 1;
    }, { once: true });
    video.load();
  } else {
    localStorage.setItem('sw_recents', JSON.stringify(recentItems));
    renderRecents();
  }
}

function renderRecents() {
  const grid = document.getElementById('recentsGrid');
  if (!recentItems.length) {
    grid.innerHTML = '<div class="no-recents"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>Aucun média récent</div>';
    return;
  }
  grid.innerHTML = recentItems.map((item, i) => {
   const thumb = item.isVid
  ? (item.thumb
      ? '<img src="' + item.thumb + '" style="width:100%;height:100%;object-fit:cover">'
      : '<div class="vid-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></div>')
  : '<div class="audio-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>';
    return '<div class="recent-card" title="' + item.name + '">' +
      '<div class="recent-thumb">' + thumb + '</div>' +
      '<div class="recent-card-info">' +
      '<div class="recent-card-name">' + item.name + '</div>' +
      '<div class="recent-card-type">' + (item.isVid ? 'Vidéo' : 'Audio') + '</div>' +
      '</div></div>';
  }).join('');
}
renderRecents();

// ── BIBLIOTHÈQUE ──
let libSortOrder = 'az';
let libCurrentTab = 'morceaux';

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
  if (!libTracks.length) { alert('Ajoutez d\'abord un dossier.'); return; }
  document.getElementById('homeView').classList.add('hidden');
  tracks.forEach(t => { try { URL.revokeObjectURL(t.url); } catch(e) {} });
  tracks = [...libTracks].map(f => ({
    file: f, name: f.name.replace(/\.[^.]+$/, ''),
    isVid: VIDEO_EXT2.test(f.name), url: URL.createObjectURL(f)
  }));
  // Mélanger
  for (let i = tracks.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  buildPlaylist();
  loadTrack(0);
  showSidebar();
}

function renderLibrary() {
  const list = document.getElementById('libList');
  if (!libTracks.length) {
    list.innerHTML = '<div class="lib-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>Ajoutez un dossier pour commencer</div>';
    return;
  }
  let sorted = [...libTracks];
  if (libSortOrder === 'za') sorted.reverse();
  // Grouper par lettre
  const groups = {};
  sorted.forEach((f, i) => {
    const letter = f.name[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push({f, origIdx: libTracks.indexOf(f)});
  });
  const letters = Object.keys(groups).sort(libSortOrder === 'za' ? (a,b)=>b.localeCompare(a) : undefined);
  list.innerHTML = letters.map(letter =>
    '<div class="lib-alpha-group">' +
    '<div class="lib-alpha-letter">' + letter + '</div>' +
    groups[letter].map(({f, origIdx}) =>
      '<div class="lib-track" onclick="libPlayTrack(' + origIdx + ')">' +
      '<div class="lib-track-name">' + f.name.replace(/\.[^.]+$/, '') + '</div>' +
      '<div class="lib-track-artist">Artiste inconnu</div>' +
      '<div class="lib-track-album">Album inconnu</div>' +
      '<div class="lib-track-genre">Genre inconnu</div>' +
      '<div class="lib-track-dur">00:00</div>' +
      '</div>'
    ).join('') +
    '</div>'
  ).join('');
}

// ── Sauvegarder dans récents à chaque loadTrack ──
const _origLoadTrack = loadTrack;
window.loadTrack = function(idx) {
  _origLoadTrack(idx);
  if (tracks[idx]) saveRecent(tracks[idx]);
};
