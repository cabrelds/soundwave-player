// ==================== VARIABLES GLOBALES ====================
let audio = new Audio();
let video = document.getElementById('vid');
let currentFiles = [];
let playlist = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0; // 0=off, 1=one, 2=all

let audioContext, analyser, source, dataArray;

const canvas = document.getElementById('vizCanvas');
const ctx = canvas.getContext('2d');

// DOM
const playIcon = document.getElementById('playIcon');
const audioTitle = document.getElementById('audioTitle');
const ctrlName = document.getElementById('ctrlName');
const ctrlSub = document.getElementById('ctrlSub');
const tCur = document.getElementById('tCur');
const tTot = document.getElementById('tTot');
const progFill = document.getElementById('progFill');
const volSlider = document.getElementById('volSlider');
const sidebar = document.getElementById('sidebar');
const playlistEl = document.getElementById('playlistEl');
const splash = document.getElementById('splashScreen');
const coverArt = document.createElement('img'); // pochette
coverArt.id = 'coverArt';

// ==================== INIT ====================
window.onload = () => {
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => splash.style.display = 'none', 800);
    }, 1500);

    audio.volume = 0.8;
    volSlider.value = 0.8;

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', () => nextTrack());
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('ended', () => nextTrack());

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Drag & Drop sur tout le body
    setupDragAndDrop();
};

// Drag & Drop
function setupDragAndDrop() {
    const main = document.getElementById('main');
    main.addEventListener('dragover', e => {
        e.preventDefault();
        main.classList.add('dragover');
    });
    main.addEventListener('dragleave', () => main.classList.remove('dragover'));
    main.addEventListener('drop', e => {
        e.preventDefault();
        main.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
}

// ==================== FILES ====================
function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => 
        file.type.startsWith('audio/') || file.type.startsWith('video/')
    );

    if (validFiles.length === 0) return;

    currentFiles = validFiles;
    playlist = [...validFiles];
    currentIndex = 0;
    
    renderPlaylist();
    loadTrack(0);
    toggleSidebar();
}

function openFiles() { document.getElementById('fileInput').click(); }
function openFolder() { document.getElementById('folderInput').click(); }

// ==================== METADATA ====================
function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const file = playlist[index];
    const url = URL.createObjectURL(file);

    const isVideo = file.type.startsWith('video/');

    document.getElementById('audioBg').style.display = isVideo ? 'none' : 'flex';
    video.style.display = isVideo ? 'block' : 'none';

    if (isVideo) {
        video.src = url;
        video.play();
        audio.pause();
    } else {
        audio.src = url;
        audio.play();
        video.pause();
        extractMetadata(file);
    }

    isPlaying = true;
    updatePlayButton();
    updateNowPlayingBasic(file);
    updatePlaylistActive();
}

function extractMetadata(file) {
    jsmediatags.read(file, {
        onSuccess: function(tag) {
            const title = tag.tags.title || file.name.replace(/\.[^/.]+$/, "");
            const artist = tag.tags.artist || "Artiste inconnu";
            const album = tag.tags.album || "";

            audioTitle.textContent = title;
            ctrlName.textContent = title;
            ctrlSub.textContent = artist;

            // Pochette
            if (tag.tags.picture) {
                const picture = tag.tags.picture;
                const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format });
                coverArt.src = URL.createObjectURL(blob);
                
                const audioBg = document.getElementById('audioBg');
                audioBg.innerHTML = '';
                audioBg.appendChild(coverArt);
                const info = document.createElement('div');
                info.innerHTML = `<div class="audio-title">${title}</div><div class="audio-sub">${artist}</div>`;
                audioBg.appendChild(info);
            }
        },
        onError: function() {
            updateNowPlayingBasic(file);
        }
    });
}

function updateNowPlayingBasic(file) {
    const name = file.name.replace(/\.[^/.]+$/, "");
    audioTitle.textContent = name;
    ctrlName.textContent = name;
    ctrlSub.textContent = "AUDIO";
}

// ==================== PLAYBACK CONTROLS ====================
function togglePlay() {
    if (!playlist.length) return;
    const currentMedia = video.style.display === 'block' ? video : audio;
    
    if (currentMedia.paused) {
        currentMedia.play();
        isPlaying = true;
    } else {
        currentMedia.pause();
        isPlaying = false;
    }
    updatePlayButton();
}

function updatePlayButton() {
    playIcon.innerHTML = isPlaying 
        ? `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>` 
        : `<path d="M8 5v14l11-7z"/>`;
}

function nextTrack() {
    let next = currentIndex + 1;
    if (next >= playlist.length) next = 0;
    loadTrack(next);
}

function prevTrack() {
    let prev = currentIndex - 1;
    if (prev < 0) prev = playlist.length - 1;
    loadTrack(prev);
}

// ==================== PROGRESS ====================
function updateProgress() {
    const current = video.style.display === 'block' ? video : audio;
    if (!current.duration) return;

    const percent = (current.currentTime / current.duration) * 100;
    progFill.style.width = percent + '%';

    tCur.textContent = formatTime(current.currentTime);
    tTot.textContent = formatTime(current.duration);
}

function seekTo(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const current = video.style.display === 'block' ? video : audio;
    current.currentTime = pos * current.duration;
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function setVol(val) {
    audio.volume = val;
    video.volume = val;
}

// ==================== PLAYLIST & SEARCH ====================
function renderPlaylist(filteredPlaylist = playlist) {
    playlistEl.innerHTML = '';
    filteredPlaylist.forEach((file, i) => {
        const originalIndex = playlist.indexOf(file);
        const div = document.createElement('div');
        div.className = `playlist-item ${originalIndex === currentIndex ? 'active' : ''}`;
        div.innerHTML = `<div>${file.name}</div>`;
        div.onclick = () => loadTrack(originalIndex);
        playlistEl.appendChild(div);
    });
}

function updatePlaylistActive() {
    renderPlaylist(); // simple refresh
}

function searchPlaylist() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filtered = playlist.filter(file => 
        file.name.toLowerCase().includes(term)
    );
    renderPlaylist(filtered);
}

// ==================== VISUALIZER ====================
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = 160;
}

function initVisualizer() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.fftSize = 128;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    drawVisualizer();
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!analyser) return;
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const height = (dataArray[i] / 255) * canvas.height * 0.75;
        ctx.fillStyle = `hsl(${200 + i}, 100%, 60%)`;
        ctx.fillRect(x, canvas.height - height, barWidth, height);
        x += barWidth + 3;
    }
}

audio.addEventListener('play', () => {
    if (!audioContext) initVisualizer();
});

// ==================== UTILS ====================
function toggleSidebar() {
    sidebar.classList.toggle('hidden');
}

function hideSidebar() {
    sidebar.classList.add('hidden');
}

// Keyboard
document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') nextTrack();
    if (e.code === 'ArrowLeft') prevTrack();
});

// Pour les boutons de la home view
function libAddFolder() { openFolder(); }
function homeHandleFiles(files) { handleFiles(files); }