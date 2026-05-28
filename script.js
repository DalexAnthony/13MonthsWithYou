document.addEventListener('DOMContentLoaded', () => {

  // ══════════════════════════════════════════
  //  SONG LIBRARY
  // ══════════════════════════════════════════
  const SONGS = [
    { title: 'Seven',      artist: 'Taylor Swift', src: 'audio/Seven.mp3',      color: '#a855f7',  glow: 'rgba(168,85,247,0.5)' },
    { title: '3D',         artist: 'Jung Kook',    src: 'audio/3d.mp3',          color: '#3b82f6',  glow: 'rgba(59,130,246,0.5)' },
    { title: 'Dancing',    artist: 'Unknown',      src: 'audio/dancing.mp3',     color: '#ec4899',  glow: 'rgba(236,72,153,0.5)' },
    { title: 'Body to Body', artist: 'Unknown',    src: 'audio/BodytoBody.mp3',  color: '#f97316',  glow: 'rgba(249,115,22,0.5)' },
    { title: 'Hooligan',   artist: 'Unknown',      src: 'audio/hooligan.mp3',    color: '#10b981',  glow: 'rgba(16,185,129,0.5)' },
  ];

  let currentSongIdx = 0;
  let isPlaying      = false;
  let isFading       = false;

  // ══════════════════════════════════════════
  //  GAME STATE
  // ══════════════════════════════════════════
  let sequence    = [];
  let playerSeq   = [];
  let level       = 1;
  let highScore   = parseInt(localStorage.getItem('simon8_hs')) || 0;
  let playing     = false;
  let playingBack = false;
  let infinite    = false;
  let vol         = 0.5;
  let muted       = false;
  let particles   = [];

  const FREQS = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];

  const GLOW_COLORS = [
    [244, 63, 94], [168, 85, 247], [59, 130, 246], [6, 182, 212],
    [16, 185, 129], [234, 179, 8], [249, 115, 22], [236, 72, 153]
  ];

  // ══════════════════════════════════════════
  //  WEB AUDIO — BEAT DETECTION
  // ══════════════════════════════════════════
  let audioCtx      = null;
  let analyser      = null;
  let sourceNode    = null;
  let freqData      = null;

  // Smoothed frequency band values (0–1)
  let sBass   = 0;
  let sMid    = 0;
  let sTreble = 0;

  // Track last beat-hit to throttle
  let lastBeatHitTime = 0;

  function initAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function connectAnalyser() {
    if (!audioCtx) return;

    // Recreate AnalyserNode fresh each time
    if (analyser) {
      try { analyser.disconnect(); } catch(e) {}
    }

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    freqData = new Uint8Array(analyser.frequencyBinCount); // 128 bins

    // createMediaElementSource can only be called ONCE per HTMLMediaElement.
    // First time: create it. After that: just disconnect & reconnect.
    if (!sourceNode) {
      sourceNode = audioCtx.createMediaElementSource(bgMusic);
    } else {
      try { sourceNode.disconnect(); } catch(e) {}
    }

    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function readFrequencies() {
    if (!analyser || bgMusic.paused) {
      // Smooth back to zero
      sBass   = sBass   * 0.92;
      sMid    = sMid    * 0.92;
      sTreble = sTreble * 0.92;
      return;
    }

    analyser.getByteFrequencyData(freqData);

    // Bass: bins 0–10
    let rawBass = 0;
    for (let i = 0; i <= 10; i++) rawBass += freqData[i];
    rawBass /= (11 * 255);

    // Mid: bins 10–100
    let rawMid = 0;
    for (let i = 10; i <= 100; i++) rawMid += freqData[i];
    rawMid /= (91 * 255);

    // Treble: bins 100–127 (up to fftSize/2 - 1)
    let rawTreble = 0;
    const tEnd = Math.min(127, freqData.length - 1);
    for (let i = 100; i <= tEnd; i++) rawTreble += freqData[i];
    rawTreble /= ((tEnd - 99) * 255);

    // Lerp / smoothing — lower = more reactive to beats
    sBass   = sBass   * 0.55 + rawBass   * 0.45;
    sMid    = sMid    * 0.60 + rawMid    * 0.40;
    sTreble = sTreble * 0.60 + rawTreble * 0.40;
  }

  // ══════════════════════════════════════════
  //  DOM REFS
  // ══════════════════════════════════════════
  const canvas       = document.getElementById('bg-canvas');
  const ctx          = canvas.getContext('2d');

  const introScreen  = document.getElementById('intro-screen');
  const gameScreen   = document.getElementById('game-screen');
  const btnStart     = document.getElementById('btn-start');
  const levelDisplay = document.getElementById('level-display');
  const levelMax     = document.getElementById('level-max');
  const hsDisplay    = document.getElementById('highscore-display');
  const statusText   = document.getElementById('status-text');
  const simonGrid    = document.getElementById('simon-grid');
  const btns         = document.querySelectorAll('.simon-btn');
  const muteBtn      = document.getElementById('mute-btn');
  const iconSound    = document.getElementById('icon-sound');
  const iconMute     = document.getElementById('icon-mute');
  const volSlider    = document.getElementById('volume-slider');

  const modalGameover  = document.getElementById('modal-gameover');
  const gameoverLevel  = document.getElementById('gameover-level');
  const btnRetry       = document.getElementById('btn-retry');

  const modalVictory   = document.getElementById('modal-victory');
  const btnYes         = document.getElementById('btn-yes-infinite');
  const btnNo          = document.getElementById('btn-no-infinite');

  const modalLetter    = document.getElementById('modal-letter');
  const letterText     = document.getElementById('letter-text');
  const btnLetterClose  = document.getElementById('btn-letter-close');
  const letterBody     = document.querySelector('.letter-body');

  const toast          = document.getElementById('toast');
  const toastMsg       = document.getElementById('toast-msg');

  // ── Music player DOM ──
  const bgMusic         = document.getElementById('bg-music');
  const playerTitle     = document.getElementById('player-title');
  const playerArtist    = document.getElementById('player-artist');
  const playerCurrent   = document.getElementById('player-current');
  const playerDuration  = document.getElementById('player-duration');
  const progressFill    = document.getElementById('player-progress-fill');
  const progressThumb   = document.getElementById('player-progress-thumb');
  const progressBar     = document.getElementById('player-progress-bar');
  const btnPrev         = document.getElementById('btn-prev');
  const btnPlayPause    = document.getElementById('btn-play-pause');
  const btnNext         = document.getElementById('btn-next');
  const iconPlay        = document.getElementById('icon-play');
  const iconPause       = document.getElementById('icon-pause');

  // ══════════════════════════════════════════
  //  CANVAS / RESIZE
  // ══════════════════════════════════════════
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  hsDisplay.textContent = highScore;

  // ══════════════════════════════════════════
  //  MUSIC PLAYER LOGIC
  // ══════════════════════════════════════════

  /** Update the CSS custom properties that theme the player */
  function applyPlayerColor(song) {
    const root = document.documentElement;
    root.style.setProperty('--player-color',      song.color);
    root.style.setProperty('--player-color-glow', song.glow);
  }

  /** Format seconds → m:ss */
  function fmtTime(s) {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  /** Set the title element and start scroll animation if text overflows */
  function setTitleScroll(song) {
    if (!playerTitle || !playerArtist) return;
    playerTitle.classList.remove('scrolling');
    playerTitle.style.removeProperty('--scroll-dist');
    playerTitle.textContent  = song.title;
    playerArtist.textContent = song.artist;

    requestAnimationFrame(() => {
      const wrap = playerTitle.parentElement;
      const overflow = playerTitle.scrollWidth - wrap.clientWidth;
      if (overflow > 4) {
        playerTitle.style.setProperty('--scroll-dist', `-${overflow + 16}px`);
        playerTitle.classList.add('scrolling');
      }
    });
  }

  /** Load the song at index idx, reconnect analyser, and optionally play */
  function loadSong(idx, autoPlay) {
    const song = SONGS[idx];
    currentSongIdx = idx;

    // Init AudioContext on first load
    initAudioCtx();

    // Update UI
    setTitleScroll(song);
    applyPlayerColor(song);

    // Swap source
    bgMusic.src = song.src;
    bgMusic.volume = muted ? 0 : vol;
    bgMusic.load();

    // Reconnect analyser AFTER source changes
    // We do it in the 'canplay' event to ensure a clean connection
    bgMusic.addEventListener('canplay', onCanPlay, { once: true });

    function onCanPlay() {
      connectAnalyser();
      if (autoPlay && !muted) {
        bgMusic.play().catch(e => console.log('Playback failed', e));
        isPlaying = true;
      } else {
        isPlaying = false;
      }
      updatePlayIcon();
      if (playerDuration) playerDuration.textContent = fmtTime(bgMusic.duration);
    }
  }

  function updatePlayIcon() {
    iconPlay.classList.toggle('hidden',  isPlaying);
    iconPause.classList.toggle('hidden', !isPlaying);
  }

  /** Fade volume in/out, resolve when done */
  function fadeVolume(from, to, durationMs) {
    return new Promise(resolve => {
      if (isFading) {
        bgMusic.volume = to === 0 ? 0 : (muted ? 0 : vol);
        return resolve();
      }
      isFading = true;
      const steps  = 15;
      const step   = (to - from) / steps;
      const delay  = durationMs / steps;
      let current  = from;
      let i = 0;
      const t = setInterval(() => {
        current += step;
        bgMusic.volume = Math.max(0, Math.min(1, current));
        i++;
        if (i >= steps) {
          clearInterval(t);
          bgMusic.volume = to;
          isFading = false;
          resolve();
        }
      }, delay);
    });
  }

  async function switchSong(newIdx, autoPlay = true) {
    if (SONGS.length <= 1) return; // nothing to switch to

    newIdx = ((newIdx % SONGS.length) + SONGS.length) % SONGS.length;

    // Fade out current audio
    const curVol = bgMusic.volume;
    if (!bgMusic.paused && curVol > 0) {
      await fadeVolume(curVol, 0, 300);
      bgMusic.pause();
    }

    loadSong(newIdx, autoPlay || isPlaying);
  }

  /** Play / Pause toggle */
  async function togglePlayPause() {
    initAudioCtx();

    if (bgMusic.paused) {
      // If analyser not connected yet, connect now
      if (!analyser) connectAnalyser();
      bgMusic.volume = muted ? 0 : vol;
      await bgMusic.play().catch(e => console.log(e));
      if (!bgMusic.paused) {
        isPlaying = true;
        // Fade in
        if (!muted) {
          bgMusic.volume = 0;
          fadeVolume(0, vol, 300);
        }
      }
    } else {
      await fadeVolume(bgMusic.volume, 0, 300);
      bgMusic.pause();
      isPlaying = false;
    }
    updatePlayIcon();
  }

  // Progress bar updates
  bgMusic.addEventListener('timeupdate', () => {
    if (!bgMusic.duration) return;
    const pct = bgMusic.currentTime / bgMusic.duration;
    if (progressFill) progressFill.style.width = `${pct * 100}%`;
    if (progressThumb) progressThumb.style.left = `${pct * 100}%`;
    if (playerCurrent) playerCurrent.textContent = fmtTime(bgMusic.currentTime);
  });

  bgMusic.addEventListener('loadedmetadata', () => {
    if (playerDuration) playerDuration.textContent = fmtTime(bgMusic.duration);
  });

  bgMusic.addEventListener('ended', () => {
    if (SONGS.length > 1) {
      switchSong(currentSongIdx + 1, true);
    } else {
      bgMusic.currentTime = 0;
      bgMusic.play().catch(() => {});
    }
  });

  // Clickable progress bar
  if (progressBar) {
    progressBar.addEventListener('click', (e) => {
      if (!bgMusic.duration) return;
      const rect = progressBar.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      bgMusic.currentTime = pct * bgMusic.duration;
    });
  }

  // Player control buttons
  btnPlayPause.addEventListener('click', togglePlayPause);
  btnPrev.addEventListener('click', () => switchSong(currentSongIdx - 1));
  btnNext.addEventListener('click', () => switchSong(currentSongIdx + 1));

  // Volume / Mute
  if (volSlider) {
    volSlider.addEventListener('input', e => {
      vol   = parseFloat(e.target.value);
      muted = vol === 0;
      bgMusic.volume = vol;
      iconSound.classList.toggle('hidden', muted);
      iconMute.classList.toggle('hidden', !muted);
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      muted = !muted;
      iconSound.classList.toggle('hidden', muted);
      iconMute.classList.toggle('hidden', !muted);
      bgMusic.muted = muted;
      bgMusic.volume = muted ? 0 : vol;
      if (muted) volSlider.value = 0;
      else { volSlider.value = vol > 0 ? vol : 0.5; if (vol === 0) vol = 0.5; }
    });
  }

  // Load initial song (no autoplay — user triggers it with startGame or play button)
  loadSong(0, false);

  // ══════════════════════════════════════════
  //  TONE SYNTHESIS (game sounds)
  // ══════════════════════════════════════════

  function initAudio() {
    initAudioCtx();
  }

  function playTone(freq, dur, type) {
    if (muted || vol === 0) return;
    initAudioCtx();
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type  = type || 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(0, audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.55, audioCtx.currentTime + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.35));
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (dur || 0.35));
  }

  function playChime() {
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.45, 'sine'), i * 130)
    );
  }

  function playFail() {
    if (muted || vol === 0) return;
    initAudioCtx();
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type  = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, audioCtx.currentTime + 0.55);
    g.gain.setValueAtTime(0, audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.6, audioCtx.currentTime + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.65);
  }

  // ══════════════════════════════════════════
  //  PARTICLES
  // ══════════════════════════════════════════

  function drawHeart(cx, cy, size) {
    ctx.beginPath();
    const topY = cy - size * 0.4;
    ctx.moveTo(cx, cy + size * 0.6);
    ctx.bezierCurveTo(cx - size*0.8, cy + size*0.1, cx - size*0.8, topY - size*0.2, cx - size*0.35, topY - size*0.2);
    ctx.bezierCurveTo(cx - size*0.1, topY - size*0.2, cx, topY, cx, topY + size*0.15);
    ctx.bezierCurveTo(cx, topY, cx + size*0.1, topY - size*0.2, cx + size*0.35, topY - size*0.2);
    ctx.bezierCurveTo(cx + size*0.8, topY - size*0.2, cx + size*0.8, cy + size*0.1, cx, cy + size*0.6);
    ctx.closePath();
  }

  class Particle {
    constructor(x, y, type, color) {
      this.x    = x;
      this.y    = y;
      this.type = type;
      this.r    = color[0];
      this.g    = color[1];
      this.b    = color[2];
      this.life = 1;

      if (type === 'heart') {
        this.vx       = (Math.random() - 0.5) * 0.4;
        this.vy       = -Math.random() * 0.6 - 0.3;
        this.size     = Math.random() * 26 + 14;
        this.decay    = 0;
        this.rot      = (Math.random() - 0.5) * 0.4;
        this.rotSpd   = (Math.random() - 0.5) * 0.008;
        this.baseAlpha= Math.random() * 0.22 + 0.18;
        this.wobble   = Math.random() * Math.PI * 2;
        this.wobbleSpd= Math.random() * 0.015 + 0.006;
      } else if (type === 'burst-heart') {
        this.vx     = (Math.random() - 0.5) * 4;
        this.vy     = (Math.random() - 0.5) * 4 - 2;
        this.size   = Math.random() * 12 + 8;
        this.decay  = Math.random() * 0.02 + 0.015;
        this.rot    = Math.random() * Math.PI * 2;
        this.rotSpd = (Math.random() - 0.5) * 0.1;
        this.gravity= 0.04;
      } else if (type === 'spark') {
        this.vx     = (Math.random() - 0.5) * 5;
        this.vy     = (Math.random() - 0.5) * 5 - 1.5;
        this.size   = Math.random() * 3 + 1.5;
        this.decay  = 0.025;
        this.gravity= 0.06;
      } else if (type === 'confetti') {
        this.vx      = (Math.random() - 0.5) * 3;
        this.vy      = Math.random() * 3 + 1.5;
        this.size    = Math.random() * 5 + 3;
        this.w       = this.size;
        this.h       = this.size * (Math.random() * 0.5 + 0.5);
        this.rot     = Math.random() * Math.PI * 2;
        this.rotSpd  = (Math.random() - 0.5) * 0.08;
        this.wobble  = Math.random() * 15;
        this.wobbleSpd = Math.random() * 0.04 + 0.02;
        this.decay   = 0.004;
      }
    }

    update(beatScale = 1.0) {
      if (this.type === 'heart') {
        const beatFactor = 0.3 + beatScale * 0.9;
        this.wobble += this.wobbleSpd * beatFactor;
        this.x += (this.vx + Math.sin(this.wobble) * 0.5) * beatFactor;
        this.y += this.vy * beatFactor + (beatScale - 1.0) * 1.2;
        this.rot += this.rotSpd * beatFactor;
        if (this.y < -this.size * 2) {
          this.y = canvas.height + this.size * 2;
          this.x = Math.random() * canvas.width;
        }
      } else if (this.type === 'burst-heart') {
        this.x   += this.vx;
        this.y   += this.vy;
        this.vy  += this.gravity;
        this.rot += this.rotSpd;
        this.life -= this.decay;
      } else if (this.type === 'spark') {
        this.x   += this.vx;
        this.y   += this.vy;
        this.vy  += this.gravity;
        this.life -= this.decay;
      } else if (this.type === 'confetti') {
        this.x      += this.vx + Math.sin(this.wobble) * 0.3;
        this.y      += this.vy;
        this.wobble += this.wobbleSpd;
        this.rot    += this.rotSpd;
        if (this.y > canvas.height + 20) {
          this.y = -10;
          this.x = Math.random() * canvas.width;
        }
        this.life -= this.decay;
      }
    }

    draw(beatScale = 1.0) {
      ctx.save();
      if (this.type === 'heart') {
        const beatBoost = 1.0 + (beatScale - 1.0) * 3.5;
        const sz   = this.size * beatBoost;
        const al   = Math.min(0.7, this.baseAlpha * (1.0 + (beatScale - 1.0) * 5.0));
        ctx.globalAlpha = al;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = `rgb(${this.r},${this.g},${this.b})`;
        drawHeart(0, 0, sz);
        ctx.fill();
      } else if (this.type === 'burst-heart') {
        ctx.globalAlpha = Math.max(0, this.life) * 0.9;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = `rgb(${this.r},${this.g},${this.b})`;
        drawHeart(0, 0, this.size);
        ctx.fill();
      } else if (this.type === 'spark') {
        ctx.globalAlpha = Math.max(0, this.life) * 0.8;
        ctx.fillStyle   = `rgb(${this.r},${this.g},${this.b})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'confetti') {
        ctx.globalAlpha = Math.max(0, this.life) * 0.8;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = `rgb(${this.r},${this.g},${this.b})`;
        ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
      }
      ctx.restore();
    }
  }

  function spawnHearts(count) {
    const hc = [[128,0,32],[178,34,34],[220,20,60],[239,68,68],[147,51,234],[88,28,135],[192,38,211],[120,30,100]];
    for (let i = 0; i < count; i++) {
      const c = hc[Math.floor(Math.random() * hc.length)];
      particles.push(new Particle(Math.random()*canvas.width, Math.random()*canvas.height, 'heart', c));
    }
  }

  function spawnSparks(x, y, count) {
    for (let i = 0; i < count; i++) {
      const c = GLOW_COLORS[Math.floor(Math.random()*GLOW_COLORS.length)];
      particles.push(new Particle(x, y, 'spark', c));
    }
    const hc = [[178,34,34],[220,20,60],[147,51,234],[88,28,135],[192,38,211]];
    for (let i = 0; i < Math.floor(count*0.6); i++) {
      const c = hc[Math.floor(Math.random()*hc.length)];
      particles.push(new Particle(x, y, 'burst-heart', c));
    }
  }

  function spawnConfetti(count) {
    for (let i = 0; i < count; i++) {
      const c = GLOW_COLORS[Math.floor(Math.random()*GLOW_COLORS.length)];
      particles.push(new Particle(Math.random()*canvas.width, Math.random()*-canvas.height, 'confetti', c));
    }
  }

  function clearConfetti() {
    particles = particles.filter(p => p.type !== 'confetti');
  }

  // ══════════════════════════════════════════
  //  RENDER LOOP (beat detection + button animation)
  // ══════════════════════════════════════════

  const BTN_COLORS = [
    [244,63,94], [168,85,247], [59,130,246], [6,182,212],
    [16,185,129], [234,179,8], [249,115,22], [236,72,153]
  ];

  let lastBass   = -1;
  let lastTreble = -1;
  let lastPulse  = -1;

  function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    readFrequencies();

    const root = document.documentElement;
    const bassStr   = sBass.toFixed(3);
    const trebleStr = sTreble.toFixed(3);

    if (bassStr !== lastBass || trebleStr !== lastTreble) {
      root.style.setProperty('--beat-bass',   bassStr);
      root.style.setProperty('--beat-treble', trebleStr);
      lastBass   = bassStr;
      lastTreble = trebleStr;
    }

    // ── Strong button movement (no glow) ──
    const bassScale = 1.0 + sBass * 0.55;
    const rotDeg    = sTreble * 6;
    const tiltY     = sBass * -8;
    const paused    = bgMusic.paused;

    btns.forEach((btn) => {
      if (!btn.classList.contains('active')) {
        const s = paused ? 1.0 : bassScale;
        btn.style.transform = `scale(${s}) translateY(${tiltY}px) rotate(${rotDeg}deg)`;
      }
    });

    const beatPulse = 1.0 + sBass * 1.0;
    const pulseStr  = beatPulse.toFixed(3);
    if (pulseStr !== lastPulse) {
      root.style.setProperty('--beat-scale', pulseStr);
      lastPulse = pulseStr;
    }

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(beatPulse); p.draw(beatPulse); });

    requestAnimationFrame(renderLoop);
  }

  spawnHearts(150);
  renderLoop();

  // ══════════════════════════════════════════
  //  MUSIC START / STOP
  // ══════════════════════════════════════════

  function startMusicContinuous() {
    if (muted || vol === 0) return;
    initAudioCtx();
    if (!analyser) connectAnalyser();
    bgMusic.volume = vol;
    bgMusic.muted  = false;
    if (bgMusic.paused) {
      bgMusic.play().catch(e => console.log('Playback failed', e));
    }
    isPlaying = true;
    updatePlayIcon();
  }

  function forceStopMusic() {
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
    isPlaying = false;
    updatePlayIcon();
  }

  // ══════════════════════════════════════════
  //  GAME LOGIC (unchanged)
  // ══════════════════════════════════════════

  function setStatus(text)   { statusText.textContent = text; }
  function showModal(el)     { el.classList.add('active'); }
  function hideModal(el)     { el.classList.remove('active'); }

  function showToast(text) {
    toastMsg.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function saveHS() {
    if (level > highScore) {
      highScore = level;
      hsDisplay.textContent = highScore;
      localStorage.setItem('simon8_hs', highScore);
    }
  }

  function dimAll()   { btns.forEach(b => b.classList.add('dim')); }
  function undimAll() { btns.forEach(b => b.classList.remove('dim')); }

  function flashBtn(index, duration) {
    const btn = document.getElementById('btn-' + index);
    btn.classList.remove('dim');
    btn.classList.add('active');
    // Reset beat-driven inline style during flash
    btn.style.transform = '';
    btn.style.boxShadow = '';
    playTone(FREQS[index], 0.35, 'sine');
    const rect = btn.getBoundingClientRect();
    spawnSparks(rect.left + rect.width/2, rect.top + rect.height/2, 6);
    return new Promise(resolve => {
      setTimeout(() => {
        btn.classList.remove('active');
        btn.classList.add('dim');
        resolve();
      }, duration);
    });
  }

  async function playSequence() {
    playingBack = true;
    simonGrid.classList.add('locked');
    setStatus('MEMORIZA');
    dimAll();
    await wait(350);
    const speed = Math.max(250, 600 - level * 28);
    for (let i = 0; i < sequence.length; i++) {
      await flashBtn(sequence[i], speed * 0.6);
      await wait(speed * 0.3);
    }
    undimAll();
    playingBack = false;
    simonGrid.classList.remove('locked');
    setStatus('TU TURNO');
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function startGame() {
    initAudio();
    startMusicContinuous();
    playing     = true;
    infinite    = false;
    sequence    = [];
    playerSeq   = [];
    level       = 1;
    levelDisplay.textContent = level;
    levelMax.textContent     = '10';
    nextLevel();
  }

  function nextLevel() {
    playerSeq = [];
    levelDisplay.textContent = level;
    if (infinite && level > 10) {
      levelMax.textContent = '∞';
    }
    sequence.push(Math.floor(Math.random() * 8));
    setTimeout(() => playSequence(), 600);
  }

  function handleInput(index, clientX, clientY) {
    if (!playing || playingBack) return;
    const btn = document.getElementById('btn-' + index);
    btn.classList.add('active');
    btn.style.transform = '';
    btn.style.boxShadow = '';
    playTone(FREQS[index], 0.3, 'sine');
    spawnSparks(clientX, clientY, 10);
    setTimeout(() => btn.classList.remove('active'), 180);

    if (index === sequence[playerSeq.length]) {
      playerSeq.push(index);
      if (playerSeq.length === sequence.length) {
        simonGrid.classList.add('locked');
        setStatus('—');

        if (level === 10 && !infinite) {
          saveHS();
          playChime();
          spawnConfetti(80);
          setTimeout(() => triggerLetter(), 700);
          return;
        }

        level++;
        saveHS();
        setStatus('CORRECTO');
        setTimeout(() => nextLevel(), 900);
      }
    } else {
      playing = false;
      saveHS();
      playFail();
      forceStopMusic();
      gameoverLevel.textContent = level;
      setTimeout(() => showModal(modalGameover), 500);
    }
  }

  // ── DOM Event Listeners ──
  btnStart.addEventListener('click', () => {
    initAudio();
    introScreen.classList.remove('active');
    gameScreen.classList.add('active');
    startGame();
  });

  btns.forEach(btn => {
    const idx = parseInt(btn.dataset.index);
    btn.addEventListener('mousedown', e  => handleInput(idx, e.clientX, e.clientY));
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      handleInput(idx, t.clientX, t.clientY);
    });
  });

  btnRetry.addEventListener('click', () => {
    hideModal(modalGameover);
    forceStopMusic();
    startGame();
  });

  btnYes.addEventListener('click', () => {
    hideModal(modalVictory);
    clearConfetti();
    infinite = true;
    playing  = true;
    level    = 11;
    setStatus('—');
    showToast('Modo infinito activado');
    if (bgMusic.paused) startMusicContinuous();
    setTimeout(() => nextLevel(), 800);
  });

  btnNo.addEventListener('click', () => {
    hideModal(modalVictory);
    clearConfetti();
    gameScreen.classList.remove('active');
    introScreen.classList.add('active');
    playing = false;
    setStatus('—');
    forceStopMusic();
  });

  // ── Romantic Letter ──
  const ROMANTIC_LETTER_TEXT = `Dalexa:

Desde que te conocí, hay algo en mí que ya no sabe estar tranquilo. Todo me lleva a pensarte: las tardes, el viento, los caminos solos. Es como si tu nombre hubiera quedado sonando dentro de mi corazón.
A veces quisiera que un "te amo" pudiera explicar todo lo que siento por ti, pero se queda corto. Porque lo mío contigo va más allá de las palabras; incluso en la distancia, sigues siendo el lugar donde mi corazón descansa.
Me gusta imaginar el día en que ya no tengamos kilómetros entre nosotros y pueda quedarme solamente mirándote, sin despedidas ni pantallas de por medio. Tal vez ahí entienda por qué, entre tantas personas y tantos caminos, terminé encontrándote a ti aun desde lejos.
Y si alguna vez dudas de lo que siento, recuerda esto: no hay un solo día en que mi corazón no termine buscándote, aunque sea en silencio.

— Anthony.`;

  let typingInterval = null;

  function triggerLetter() {
    showModal(modalLetter);
    letterText.textContent = '';
    let index = 0;
    if (typingInterval) clearInterval(typingInterval);
    typingInterval = setInterval(() => {
      if (index < ROMANTIC_LETTER_TEXT.length) {
        letterText.textContent += ROMANTIC_LETTER_TEXT[index];
        index++;
      } else {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    }, 45);
  }

  btnLetterClose.addEventListener('click', () => {
    hideModal(modalLetter);
    showModal(modalVictory);
  });

});
