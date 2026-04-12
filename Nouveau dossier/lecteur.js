const AUDIO_EXT = /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma|aiff|ape)$/i;
const VIDEO_EXT = /\.(mp4|webm|mkv|avi|mov|m4v|ogv|3gp|wmv|flv)$/i;
const UI_PREFS_KEY = 'sw_ui_prefs_v2';
const RECENTS_KEY = 'sw_recents';

const DEFAULT_PREFS = {
  volume: 0.8,
  shuffleOn: false,
  repeatOn: false,
  muted: false,
  homeTab: 'accueil',
  libSortOrder: 'az',
  libCurrentTab: 'morceaux',
  libSearchQuery: '',
  libTypeFilter: 'all'
};

const savedPrefs = { ...DEFAULT_PREFS, ...readJSON(UI_PREFS_KEY, {}) };

let tracks = [];
let curIdx = 0;
let shuffleOn = !!savedPrefs.shuffleOn;
let repeatOn = !!savedPrefs.repeatOn;
let playing = false;
let muted = !!savedPrefs.muted;
let libTracks = [];
let libSortOrder = savedPrefs.libSortOrder || 'az';
let libCurrentTab = savedPrefs.libCurrentTab || 'morceaux';
let libSearchQuery = savedPrefs.libSearchQuery || '';
let libTypeFilter = savedPrefs.libTypeFilter || 'all';
let dragDepth = 0;
let seekDragging = false;
let fsHideTimer = null;

let audioCtx = null;
let analyser = null;
const srcNodes = new WeakMap();
const libDurations = {};
let recentItems = readJSON(RECENTS_KEY, []);

const AUD = new Audio();
const VID = document.getElementById('vid');
const canvas = document.getElementById('vizCanvas');
const ctx2d = canvas.getContext('2d');

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function persistPrefs() {
  writeJSON(UI_PREFS_KEY, {
    volume: parseFloat(document.getElementById('volSlider')?.value || savedPrefs.volume),
    shuffleOn,
    repeatOn,
    muted,
    homeTab: document.getElementById('tabBibliotheque')?.classList.contains('hidden') ? 'accueil' : 'bibliotheque',
    libSortOrder,
    libCurrentTab,
    libSearchQuery,
    libTypeFilter
  });
}

function persistRecents() {
  writeJSON(RECENTS_KEY, recentItems);
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

function fmtT(seconds) {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

function fmtSz(bytes) {
  return bytes < 1048576
    ? (bytes / 1024).toFixed(0) + ' KB'
    : (bytes / 1048576).toFixed(1) + ' MB';
}

function esc(value) {
  const d = document.createElement('div');
  d.textContent = value;
  return d.innerHTML;
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

function normalizeText(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function pluralize(word, count) {
  return count > 1 ? word + 's' : word;
}

function fileKey(file) {
  return file.name + '::' + file.size;
}

function getCurrentTrack() {
  return tracks[curIdx] || null;
}

function getCurrentMediaElement() {
  const current = getCurrentTrack();
  if (!current) return null;
  return current.isVid ? VID : AUD;
}

function releaseTrackUrls() {
  tracks.forEach(track => {
    try { URL.revokeObjectURL(track.url); } catch (e) {}
  });
}

function buildTrackObjects(files) {
  return files.map(file => ({
    file,
    name: stripExt(file.name),
    isVid: VIDEO_EXT.test(file.name),
    url: URL.createObjectURL(file)
  }));
}

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

function showPlayerView() {
  document.getElementById('homeView').classList.add('hidden');
  closeHvSidebar();
  updateNowPlayingCard();
}

function resumeCurrentTrack() {
  if (!tracks.length) {
    toast('Aucun média à reprendre pour le moment.', 'info');
    return;
  }
  showPlayerView();
  const media = getCurrentMediaElement();
  if (media && media.paused) {
    media.play().catch(() => {});
  }
}

function handleFiles(fileList) {
  const valid = Array.from(fileList)
    .filter(file => AUDIO_EXT.test(file.name) || VIDEO_EXT.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  if (!valid.length) {
    toast('Aucun fichier audio ou vidéo trouvé.', 'error');
    return;
  }

  releaseTrackUrls();
  tracks = buildTrackObjects(valid);
  curIdx = 0;

  showPlayerView();
  buildPlaylist();
  loadTrack(0);
  showSidebar();
  renderHomeStats();

  toast(valid.length + ' fichier' + (valid.length > 1 ? 's' : '') + ' chargé' + (valid.length > 1 ? 's' : ''), 'success');
}

function buildPlaylist() {
  const total = tracks.length;
  const audioCount = tracks.filter(track => !track.isVid).length;
  const videoCount = total - audioCount;

  document.getElementById('sbCount').textContent =
    total + ' fichier' + (total > 1 ? 's' : '') + ' · ' + audioCount + ' audio · ' + videoCount + ' vidéo';

  document.getElementById('playlistEl').innerHTML = tracks.map((track, index) => (
    '<div class="pl-item' + (index === curIdx ? ' active' : '') + '" id="pi' + index + '" onclick="loadTrack(' + index + ')">' +
      '<div class="pi-icon">' + (track.isVid ? '🎬' : '🎵') + '</div>' +
      '<div class="pi-meta">' +
        '<div class="pi-name">' + esc(track.name) + '</div>' +
        '<div class="pi-type">' + (track.isVid ? 'VIDÉO' : 'AUDIO') + ' · ' + fmtSz(track.file.size) + '</div>' +
      '</div>' +
      '<div class="pi-num">' + (index + 1) + '</div>' +
    '</div>'
  )).join('');

  updatePL();
}

function updatePL() {
  tracks.forEach((track, index) => {
    const el = document.getElementById('pi' + index);
    if (!el) return;
    const isCurrent = index === curIdx;
    el.className = 'pl-item' + (isCurrent ? ' active' : '') + (isCurrent && playing ? ' playing' : '');
  });

  const current = document.getElementById('pi' + curIdx);
  if (current) current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function initAudioCtx(el) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
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

function syncControlState() {
  document.getElementById('playIcon').innerHTML = playing
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';

  const shuffleBtn = document.getElementById('shuffleBtn');
  const repeatBtn = document.getElementById('repeatBtn');
  const volSlider = document.getElementById('volSlider');

  shuffleBtn.classList.toggle('on', shuffleOn);
  repeatBtn.classList.toggle('on', repeatOn);
  shuffleBtn.setAttribute('aria-pressed', String(shuffleOn));
  repeatBtn.setAttribute('aria-pressed', String(repeatOn));
  volSlider.style.opacity = muted ? '0.45' : '1';
  updateVolIcon(muted ? 0 : parseFloat(volSlider.value));
}

function resetProgressUI() {
  document.getElementById('progFill').style.width = '0%';
  document.getElementById('tCur').textContent = '0:00';
  document.getElementById('tTot').textContent = '0:00';
}

function updateNowPlayingCard() {
  const current = getCurrentTrack();
  const empty = document.getElementById('heroNowEmpty');
  const body = document.getElementById('heroNowBody');

  if (!current) {
    empty.classList.remove('hidden');
    body.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  body.classList.remove('hidden');
  document.getElementById('heroNowTitle').textContent = current.name;
  document.getElementById('heroNowSub').textContent =
    (current.isVid ? 'Vidéo' : 'Audio') + ' · ' + fmtSz(current.file.size) + (playing ? ' · Lecture en cours' : ' · En pause');
}

function updateTrackMeta(track) {
  document.getElementById('ctrlName').textContent = track.name;
  document.getElementById('ctrlSub').textContent = (track.isVid ? 'Vidéo' : 'Audio') + ' · ' + fmtSz(track.file.size);
  document.getElementById('audioTitle').textContent = track.name;
  document.getElementById('audioSub').textContent = (track.isVid ? 'VIDÉO' : 'AUDIO') + ' · ' + fmtSz(track.file.size);
  document.title = track.name + ' · SoundWave';
}

function attachEvents(el) {
  el.ontimeupdate = function () {
    if (!el.duration) return;
    const progress = (el.currentTime / el.duration) * 100;
    document.getElementById('progFill').style.width = progress + '%';
    document.getElementById('tCur').textContent = fmtT(el.currentTime);
    document.getElementById('tTot').textContent = fmtT(el.duration);
  };

  el.onplay = function () {
    playing = true;
    document.getElementById('audioArt').classList.add('playing');
    syncControlState();
    updatePL();
    updateNowPlayingCard();
    renderRecents();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  };

  el.onpause = function () {
    playing = false;
    document.getElementById('audioArt').classList.remove('playing');
    syncControlState();
    updatePL();
    updateNowPlayingCard();
    renderRecents();
  };

  el.onended = function () {
    if (repeatOn) {
      el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }
    nextTrack();
  };

  el.onerror = function () {
    toast('Erreur de lecture, passage au média suivant.', 'error');
    nextTrack();
  };
}

function loadTrack(idx) {
  const track = tracks[idx];
  if (!track) return;

  curIdx = idx;
  AUD.pause();
  VID.pause();
  resetProgressUI();

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('controls').style.display = 'flex';

  if (track.isVid) {
    AUD.pause();
    AUD.removeAttribute('src');
    AUD.load();
    document.getElementById('audioBg').style.display = 'none';
    document.getElementById('vizCanvas').style.display = 'none';
    document.getElementById('audioArt').classList.remove('playing');
    VID.style.display = 'block';
    VID.src = track.url;
    attachEvents(VID);
    initAudioCtx(VID);
  } else {
    VID.pause();
    VID.removeAttribute('src');
    VID.load();
    VID.style.display = 'none';
    document.getElementById('audioBg').style.display = 'flex';
    document.getElementById('vizCanvas').style.display = 'block';
    AUD.src = track.url;
    attachEvents(AUD);
    initAudioCtx(AUD);
  }

  updateTrackMeta(track);
  setVol(document.getElementById('volSlider').value, false);
  syncControlState();
  updatePL();
  updateNowPlayingCard();
  renderHomeStats();
  saveRecent(track);
  setTimeout(resizeViz, 60);

  const media = getCurrentMediaElement();
  if (media) media.play().catch(() => {});
}

function togglePlay() {
  if (!tracks.length) return;
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  const media = getCurrentMediaElement();
  if (!media) return;
  media.paused ? media.play().catch(() => {}) : media.pause();
}

function prevTrack() {
  if (!tracks.length) return;
  const media = getCurrentMediaElement();
  if (media && media.currentTime > 3) {
    media.currentTime = 0;
    return;
  }
  loadTrack((curIdx - 1 + tracks.length) % tracks.length);
}

function nextTrack() {
  if (!tracks.length) return;

  if (shuffleOn) {
    let next = curIdx;
    while (tracks.length > 1 && next === curIdx) {
      next = Math.floor(Math.random() * tracks.length);
    }
    loadTrack(next);
    return;
  }

  if (curIdx < tracks.length - 1) {
    loadTrack(curIdx + 1);
    return;
  }

  if (repeatOn) loadTrack(0);
}

function toggleShuffle() {
  shuffleOn = !shuffleOn;
  syncControlState();
  persistPrefs();
  toast(shuffleOn ? 'Lecture aléatoire activée.' : 'Lecture aléatoire désactivée.');
}

function toggleRepeat() {
  repeatOn = !repeatOn;
  syncControlState();
  persistPrefs();
  toast(repeatOn ? 'Répétition activée.' : 'Répétition désactivée.');
}

function setVol(value, shouldPersist = true) {
  const vol = Math.max(0, Math.min(1, parseFloat(value)));
  const slider = document.getElementById('volSlider');
  slider.value = String(vol);

  if (vol > 0 && muted) {
    muted = false;
    AUD.muted = false;
    VID.muted = false;
  }

  AUD.volume = vol;
  VID.volume = vol;
  updateVolIcon(muted ? 0 : vol);
  syncControlState();
  if (shouldPersist) persistPrefs();
}

function toggleMute() {
  muted = !muted;
  AUD.muted = muted;
  VID.muted = muted;
  syncControlState();
  persistPrefs();
}

function updateVolIcon(volume) {
  const icon = document.getElementById('volIcon');
  if (!icon) return;

  if (volume === 0) {
    icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  } else if (volume < 0.4) {
    icon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
  } else if (volume < 0.75) {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
  } else {
    icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
}

function initSeekBar() {
  const wrap = document.getElementById('progWrap');
  if (!wrap) return;

  const doSeek = clientX => {
    if (!tracks.length) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const media = getCurrentMediaElement();
    if (!media || !media.duration) return;
    media.currentTime = ratio * media.duration;
    document.getElementById('progFill').style.width = ratio * 100 + '%';
  };

  wrap.addEventListener('mousedown', event => {
    seekDragging = true;
    doSeek(event.clientX);
  });
  document.addEventListener('mousemove', event => {
    if (seekDragging) doSeek(event.clientX);
  });
  document.addEventListener('mouseup', () => {
    seekDragging = false;
  });

  wrap.addEventListener('touchstart', event => {
    seekDragging = true;
    doSeek(event.touches[0].clientX);
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (seekDragging) doSeek(event.touches[0].clientX);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    seekDragging = false;
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('app').requestFullscreen().catch(() => {
      toast('Le plein écran n’est pas disponible sur ce navigateur.', 'error');
    });
    return;
  }
  document.exitFullscreen();
}

function startFsAutoHide() {
  clearTimeout(fsHideTimer);
  fsHideTimer = setTimeout(() => {
    if (document.fullscreenElement) {
      document.getElementById('topBar').classList.add('hidden');
    }
  }, 2500);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.contains('hidden') ? showSidebar() : hideSidebar();
}

function showSidebar() {
  document.getElementById('sidebar').classList.remove('hidden');
  if (window.innerWidth <= 760) document.getElementById('sideOverlay').classList.add('show');
  setTimeout(resizeViz, 360);
}

function hideSidebar() {
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('sideOverlay').classList.remove('show');
  setTimeout(resizeViz, 360);
}

function backToHome() {
  AUD.pause();
  VID.pause();
  document.getElementById('homeView').classList.remove('hidden');
  document.title = 'SoundWave';
  updateNowPlayingCard();
  renderRecents();
  renderHomeStats();
}

document.addEventListener('fullscreenchange', () => {
  const isFS = !!document.fullscreenElement;
  const fsIcon = document.getElementById('fsIcon');
  fsIcon.innerHTML = isFS
    ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
    : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';

  const topBar = document.getElementById('topBar');
  if (isFS) {
    topBar.classList.add('hidden');
    startFsAutoHide();
  } else {
    topBar.classList.remove('hidden');
    clearTimeout(fsHideTimer);
  }
});

document.addEventListener('mousemove', () => {
  if (!document.fullscreenElement) return;
  document.getElementById('topBar').classList.remove('hidden');
  startFsAutoHide();
});

document.addEventListener('keydown', event => {
  const tag = event.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (!document.getElementById('homeView').classList.contains('hidden')) return;

  switch (event.code) {
    case 'Space':
      event.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      if (event.shiftKey) prevTrack();
      else if (getCurrentMediaElement()) getCurrentMediaElement().currentTime = Math.max(0, getCurrentMediaElement().currentTime - 10);
      break;
    case 'ArrowRight':
      event.preventDefault();
      if (event.shiftKey) nextTrack();
      else if (getCurrentMediaElement() && getCurrentMediaElement().duration) {
        const media = getCurrentMediaElement();
        media.currentTime = Math.min(media.duration, media.currentTime + 10);
      }
      break;
    case 'ArrowUp': {
      event.preventDefault();
      const slider = document.getElementById('volSlider');
      slider.value = String(Math.min(1, parseFloat(slider.value) + 0.05));
      setVol(slider.value);
      break;
    }
    case 'ArrowDown': {
      event.preventDefault();
      const slider = document.getElementById('volSlider');
      slider.value = String(Math.max(0, parseFloat(slider.value) - 0.05));
      setVol(slider.value);
      break;
    }
    case 'KeyF': toggleFullscreen(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyL': toggleSidebar(); break;
    case 'KeyS': toggleShuffle(); break;
    case 'KeyR': toggleRepeat(); break;
    case 'Home':
      event.preventDefault();
      if (tracks.length) loadTrack(0);
      break;
    case 'End':
      event.preventDefault();
      if (tracks.length) loadTrack(tracks.length - 1);
      break;
  }
});

function resizeViz() {
  canvas.width = canvas.offsetWidth * (devicePixelRatio || 1);
  canvas.height = canvas.offsetHeight * (devicePixelRatio || 1);
}

function drawViz() {
  requestAnimationFrame(drawViz);
  if (canvas.style.display === 'none') return;

  const width = canvas.width;
  const height = canvas.height;
  const dpr = devicePixelRatio || 1;
  ctx2d.clearRect(0, 0, width, height);

  const barCount = 80;
  const gap = Math.max(2, Math.floor(width / (barCount * 6)));
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const maxHeight = height * 0.92;
  const segH = 4.5 * dpr;
  const segG = 2 * dpr;
  const totalSegs = Math.floor(maxHeight / (segH + segG));
  const time = Date.now() / 1000;

  let freqData = null;
  if (analyser && playing) {
    freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
  }

  for (let i = 0; i < barCount; i++) {
    let val;
    if (freqData) {
      val = freqData[Math.floor(i * freqData.length / barCount)] / 255;
    } else {
      val = 0.03 + 0.03 * Math.sin(time * 1.1 + i * 0.42) + 0.015 * Math.cos(time * 0.75 + i * 0.9);
    }

    const heightValue = Math.max(segH + segG, val * maxHeight);
    const x = i * (barWidth + gap);
    const segs = Math.floor(heightValue / (segH + segG));

    for (let s = 0; s < segs; s++) {
      const y = height - (s + 1) * (segH + segG);
      const ratio = s / totalSegs;
      const color = ratio > 0.84 ? '#ff2200'
        : ratio > 0.7 ? '#ff6600'
        : ratio > 0.55 ? '#ffaa00'
        : ratio > 0.38 ? '#ccee00'
        : '#00ff88';

      ctx2d.fillStyle = color;
      ctx2d.beginPath();
      ctx2d.roundRect(x, y, barWidth, segH, 1.5);
      ctx2d.fill();
    }
  }
}

function showHomeTab(tab) {
  document.getElementById('tabAccueil').classList.toggle('hidden', tab !== 'accueil');
  document.getElementById('tabBibliotheque').classList.toggle('hidden', tab !== 'bibliotheque');
  document.getElementById('navAccueil').classList.toggle('active', tab === 'accueil');
  document.getElementById('navBiblio').classList.toggle('active', tab === 'bibliotheque');
  closeHvSidebar();
  persistPrefs();
}

function toggleHvSidebar() {
  document.getElementById('hvSidebar').classList.toggle('open');
  document.getElementById('hvOverlay').classList.toggle('show');
}

function closeHvSidebar() {
  document.getElementById('hvSidebar').classList.remove('open');
  document.getElementById('hvOverlay').classList.remove('show');
}

function homeOpenFiles() {
  const input = document.getElementById('homeFileInput');
  input.value = '';
  input.click();
}

function libAddFolder() {
  const input = document.getElementById('homeFolderInput');
  input.value = '';
  input.click();
}

function homeHandleFiles(fileList) {
  const files = Array.from(fileList).filter(file => AUDIO_EXT.test(file.name) || VIDEO_EXT.test(file.name));
  if (!files.length) {
    toast('Aucun fichier audio ou vidéo trouvé.', 'error');
    return;
  }
  showPlayerView();
  handleFiles(files);
}

function loadLibDurations(files) {
  files.forEach(file => {
    if (libDurations[fileKey(file)] !== undefined || VIDEO_EXT.test(file.name)) return;
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      libDurations[fileKey(file)] = audio.duration;
      URL.revokeObjectURL(url);
      audio.src = '';
      renderLibrary();
    }, { once: true });
    audio.load();
  });
}

function homeHandleFolder(fileList) {
  const files = Array.from(fileList)
    .filter(file => AUDIO_EXT.test(file.name) || VIDEO_EXT.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  if (!files.length) {
    toast('Aucun fichier audio ou vidéo trouvé.', 'error');
    return;
  }

  const existing = new Set(libTracks.map(fileKey));
  let added = 0;

  files.forEach(file => {
    const key = fileKey(file);
    if (!existing.has(key)) {
      libTracks.push(file);
      existing.add(key);
      added++;
    }
  });

  libTracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  loadLibDurations(files);
  renderLibrary();
  renderHomeStats();

  if (added > 0) toast(added + ' fichier' + (added > 1 ? 's' : '') + ' ajouté' + (added > 1 ? 's' : '') + ' à la bibliothèque.', 'success');
  else toast('Tous les fichiers sont déjà présents dans la bibliothèque.', 'info');
}

function setLibTab(tab, el) {
  libCurrentTab = tab;
  document.querySelectorAll('.lib-tab').forEach(node => node.classList.remove('active'));
  if (el) el.classList.add('active');
  persistPrefs();
  renderLibrary();
}

function libSort(value) {
  libSortOrder = value;
  persistPrefs();
  renderLibrary();
}

function setLibSearch(value) {
  libSearchQuery = value;
  persistPrefs();
  renderLibrary();
}

function setLibTypeFilter(value, btn) {
  libTypeFilter = value;
  document.querySelectorAll('.lib-chip').forEach(node => node.classList.remove('active'));
  if (btn) btn.classList.add('active');
  persistPrefs();
  renderLibrary();
}

function getLibraryEntries() {
  return libTracks.map((file, origIdx) => ({
    file,
    origIdx,
    name: stripExt(file.name),
    isVid: VIDEO_EXT.test(file.name)
  }));
}

function getFilteredLibraryEntries() {
  const query = normalizeText(libSearchQuery);
  const filtered = getLibraryEntries().filter(entry => {
    const matchQuery = !query || normalizeText(entry.name).includes(query);
    const matchType = libTypeFilter === 'all'
      || (libTypeFilter === 'audio' && !entry.isVid)
      || (libTypeFilter === 'video' && entry.isVid);
    return matchQuery && matchType;
  });

  filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  if (libSortOrder === 'za') filtered.reverse();
  return filtered;
}

function playLibraryFiles(files, startIndex = 0) {
  if (!files.length) return;
  releaseTrackUrls();
  tracks = buildTrackObjects(files);
  curIdx = startIndex;
  showPlayerView();
  buildPlaylist();
  loadTrack(startIndex);
  showSidebar();
  renderHomeStats();
}

function libShuffle() {
  if (!libTracks.length) {
    toast('Ajoute d’abord un dossier à la bibliothèque.', 'error');
    return;
  }

  const entries = getFilteredLibraryEntries();
  if (!entries.length) {
    toast('Aucun média ne correspond à ton filtre actuel.', 'error');
    return;
  }

  const files = entries.map(entry => entry.file);
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }

  playLibraryFiles(files, 0);
}

function libPlayTrack(idx) {
  if (!libTracks.length) return;
  playLibraryFiles(libTracks, idx);
}

function updateLibrarySummary(filteredEntries) {
  const total = libTracks.length;
  const filtered = filteredEntries.length;
  const audioCount = filteredEntries.filter(entry => !entry.isVid).length;
  const videoCount = filteredEntries.length - audioCount;
  const summary = document.getElementById('libSummary');

  if (!total) {
    summary.textContent = '';
    return;
  }

  let text = filtered + ' résultat' + (filtered > 1 ? 's' : '') + ' affiché' + (filtered > 1 ? 's' : '');
  if (filtered !== total) text += ' sur ' + total;
  text += ' · ' + audioCount + ' audio · ' + videoCount + ' vidéo';
  summary.textContent = text;
}

function renderLibrary() {
  const list = document.getElementById('libList');
  const filteredEntries = getFilteredLibraryEntries();
  updateLibrarySummary(filteredEntries);

  if (!libTracks.length) {
    list.innerHTML = '<div class="lib-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>Ajoute un dossier pour commencer</div>';
    return;
  }

  if (!filteredEntries.length) {
    list.innerHTML = '<div class="lib-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20l-6-6zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>Aucun média ne correspond à cette recherche</div>';
    return;
  }

  if (libCurrentTab === 'morceaux') renderLibTracks(list, filteredEntries);
  else if (libCurrentTab === 'albums') renderLibAlbums(list, filteredEntries);
  else renderLibArtists(list, filteredEntries);
}

function renderLibTracks(list, entries) {
  const groups = {};
  entries.forEach(entry => {
    const letter = (entry.name[0] || '#').toUpperCase().replace(/[^A-Z0-9]/, '#');
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(entry);
  });

  list.innerHTML = Object.keys(groups).map(letter =>
    '<div class="lib-alpha-group">' +
      '<div class="lib-alpha-letter">' + letter + '</div>' +
      groups[letter].map(entry => {
        const key = fileKey(entry.file);
        const duration = libDurations[key] != null ? fmtT(libDurations[key]) : '—';
        const current = getCurrentTrack()?.file === entry.file ? ' current' : '';
        return '<div class="lib-track' + current + '" onclick="libPlayTrack(' + entry.origIdx + ')">' +
          '<div class="lib-track-icon">' + (entry.isVid ? '🎬' : '🎵') + '</div>' +
          '<div class="lib-track-name">' + esc(entry.name) + '</div>' +
          '<div class="lib-track-meta">' + (entry.isVid ? 'Vidéo' : 'Audio') + '</div>' +
          '<div class="lib-track-size">' + fmtSz(entry.file.size) + '</div>' +
          '<div class="lib-track-dur">' + duration + '</div>' +
        '</div>';
      }).join('') +
    '</div>'
  ).join('');
}

function renderLibAlbums(list, entries) {
  list.innerHTML =
    '<div class="lib-group-info">' + entries.length + ' ' + pluralize('média', entries.length) + '</div>' +
    '<div class="lib-album-grid">' +
      entries.map(entry =>
        '<div class="lib-album-card" onclick="libPlayTrack(' + entry.origIdx + ')">' +
          '<div class="lib-album-art">' + (entry.isVid ? '🎬' : '🎵') + '</div>' +
          '<div class="lib-album-name">' + esc(entry.name) + '</div>' +
        '</div>'
      ).join('') +
    '</div>';
}

function renderLibArtists(list, entries) {
  const audioCount = entries.filter(entry => !entry.isVid).length;
  const videoCount = entries.length - audioCount;

  list.innerHTML =
    '<div class="lib-group-info">' + entries.length + ' piste' + (entries.length > 1 ? 's' : '') + '</div>' +
    '<div class="lib-artist-row" onclick="libShuffle()">' +
      '<div class="lib-artist-avatar"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>' +
      '<div class="lib-artist-info">' +
        '<div class="lib-artist-name">Collection active</div>' +
        '<div class="lib-artist-count">' + audioCount + ' audio · ' + videoCount + ' vidéo</div>' +
      '</div>' +
      '<button class="lib-artist-play" onclick="event.stopPropagation();libShuffle()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>' +
    '</div>';
}

function renderHomeStats() {
  const stats = document.getElementById('homeStats');
  const current = getCurrentTrack();
  const audioCount = libTracks.filter(file => AUDIO_EXT.test(file.name)).length;
  const videoCount = libTracks.filter(file => VIDEO_EXT.test(file.name)).length;

  stats.innerHTML = [
    { label: 'Bibliothèque', value: libTracks.length, sub: audioCount + ' audio · ' + videoCount + ' vidéo' },
    { label: 'Playlist active', value: tracks.length, sub: current ? current.name : 'Aucun média en file' },
    { label: 'Récents', value: recentItems.length, sub: recentItems.length ? 'Historique prêt à relancer' : 'Encore vide' }
  ].map(item =>
    '<div class="stat-card">' +
      '<div class="stat-label">' + item.label + '</div>' +
      '<div class="stat-value">' + item.value + '</div>' +
      '<div class="stat-sub">' + esc(item.sub) + '</div>' +
    '</div>'
  ).join('');
}

function saveRecent(track) {
  const item = { name: track.name, isVid: track.isVid, ts: Date.now(), thumb: null };
  recentItems = recentItems.filter(entry => entry.name !== item.name);
  recentItems.unshift(item);
  recentItems = recentItems.slice(0, 12);

  if (track.isVid && track.url) {
    const video = document.createElement('video');
    video.src = track.url;
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 1;
    }, { once: true });
    video.addEventListener('seeked', () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      c.getContext('2d').drawImage(video, 0, 0, 320, 180);
      item.thumb = c.toDataURL('image/jpeg', 0.6);
      persistRecents();
      renderRecents();
      renderHomeStats();
    }, { once: true });
    video.load();
  } else {
    persistRecents();
    renderRecents();
    renderHomeStats();
  }
}

function clearRecents() {
  recentItems = [];
  persistRecents();
  renderRecents();
  renderHomeStats();
}

function renderRecents() {
  const grid = document.getElementById('recentsGrid');
  const clearBtn = document.getElementById('clearRecentsBtn');
  const currentName = getCurrentTrack()?.name;

  clearBtn.classList.toggle('hidden', !recentItems.length);

  if (!recentItems.length) {
    grid.innerHTML = '<div class="no-recents"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>Aucun média récent</div>';
    return;
  }

  grid.innerHTML = recentItems.map(item => {
    const thumb = item.isVid
      ? (item.thumb
        ? '<img src="' + item.thumb + '" alt="">'
        : '<div class="vid-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></div>')
      : '<div class="audio-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>';

    const safeName = JSON.stringify(item.name);
    const activeAttr = item.name === currentName ? ' data-active="true"' : '';

    return '<div class="recent-card"' + activeAttr + ' onclick="recentPlay(' + safeName + ')" title="' + esc(item.name) + '">' +
      '<div class="recent-thumb">' + thumb + '</div>' +
      '<div class="recent-card-info">' +
        '<div class="recent-card-name">' + esc(item.name) + '</div>' +
        '<div class="recent-card-type">' + (item.isVid ? 'Vidéo' : 'Audio') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function recentPlay(name) {
  const libIdx = libTracks.findIndex(file => stripExt(file.name) === name);
  if (libIdx >= 0) {
    libPlayTrack(libIdx);
    return;
  }

  const trackIdx = tracks.findIndex(track => track.name === name);
  if (trackIdx >= 0) {
    showPlayerView();
    loadTrack(trackIdx);
    return;
  }

  toast('Rouvre ce fichier pour pouvoir le relancer.', 'info');
}

function hasFilesTransfer(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function clearDragState() {
  dragDepth = 0;
  document.body.classList.remove('dragging');
}

document.addEventListener('dragenter', event => {
  if (!hasFilesTransfer(event)) return;
  event.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
});

document.addEventListener('dragover', event => {
  if (!hasFilesTransfer(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('dragging');
});

document.addEventListener('dragleave', event => {
  if (!hasFilesTransfer(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('dragging');
});

document.addEventListener('drop', event => {
  if (!hasFilesTransfer(event)) return;
  event.preventDefault();
  clearDragState();
  handleFiles(event.dataTransfer.files);
});

window.addEventListener('resize', resizeViz);

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('homeFolderInput').onchange = function () { homeHandleFolder(this.files); };
  document.getElementById('homeFileInput').onchange = function () { homeHandleFiles(this.files); };

  document.getElementById('volSlider').value = String(savedPrefs.volume);
  document.getElementById('libSortSel').value = libSortOrder;
  document.getElementById('libSearchInput').value = libSearchQuery;

  if (libTypeFilter === 'audio') setLibTypeFilter('audio', document.getElementById('libChipAudio'));
  else if (libTypeFilter === 'video') setLibTypeFilter('video', document.getElementById('libChipVideo'));
  else setLibTypeFilter('all', document.getElementById('libChipAll'));

  document.querySelectorAll('.lib-tab').forEach(tab => tab.classList.remove('active'));
  const activeTab = Array.from(document.querySelectorAll('.lib-tab')).find(tab => normalizeText(tab.textContent) === normalizeText(libCurrentTab));
  if (activeTab) activeTab.classList.add('active');

  AUD.volume = savedPrefs.volume;
  VID.volume = savedPrefs.volume;
  AUD.muted = muted;
  VID.muted = muted;
  syncControlState();
  initSeekBar();
  resizeViz();
  drawViz();

  showHomeTab(savedPrefs.homeTab || 'accueil');
  renderLibrary();
  renderRecents();
  renderHomeStats();
  updateNowPlayingCard();

  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 800);
  }, 2500);
});
