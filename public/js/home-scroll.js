/**
 * Homepage scroll scrub via WebP frame sequence + parallax layers.
 *
 * Why frames: MP4 currentTime seeks are choppy. Each WebP is a full frame —
 * scroll progress → frame index is exact and smooth (like Apple product pages).
 *
 * Parallax principle: rAF loop damps scroll → drives transforms + frame index.
 *
 * Frames: /videos/hero-frames/frame-0001.webp … (see manifest.json)
 * Fallback: poster image if frames fail to load
 */
(function () {
  const root = document.querySelector('[data-scroll-hero]');
  if (!root) return;

  const canvas = root.querySelector('[data-scroll-canvas]');
  const poster = root.querySelector('[data-scroll-poster]');
  const progressEl = root.querySelector('[data-scroll-progress]');
  const hint = root.querySelector('[data-scroll-hint]');
  const content = root.querySelector('[data-scroll-content]');
  const intro = root.querySelector('.home-scroll__intro');
  const main = root.querySelector('.home-scroll__main');
  const outro = root.querySelector('.home-scroll__outro');
  const stage = root.querySelector('.home-scroll__stage');

  document.documentElement.classList.add('has-home-scroll');
  document.body.classList.add('has-home-scroll');

  function syncHeaderOffset() {
    const header = document.querySelector('.site-header');
    const h = header ? header.offsetHeight : 68;
    root.style.setProperty('--header-offset', `${h}px`);
  }
  syncHeaderOffset();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    root.classList.add('home-scroll--static');
    if (poster) poster.classList.add('is-visible');
    if (canvas) canvas.classList.add('is-hidden');
    return;
  }

  // —— Config from DOM (overridable by data attributes) ——
  const frameCount = Math.max(1, parseInt(root.dataset.frameCount || '55', 10));
  const pad = Math.max(1, parseInt(root.dataset.framePad || '4', 10));
  const pattern =
    root.dataset.framePattern || '/videos/hero-frames/frame-{i}.webp';

  /** Damping: lower = silkier lag (parallax feel) */
  const PROGRESS_DAMP = 0.12;
  /** Frame index eases slightly so swaps never hard-snap */
  const FRAME_DAMP = 0.22;

  let rawProgress = 0;
  let smoothProgress = 0;
  let smoothFrame = 0;
  let drawnFrame = -1;

  /** @type {(HTMLImageElement|null)[]} */
  const frames = new Array(frameCount).fill(null);
  let loadedCount = 0;
  let ready = false;
  let ctx = null;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function frameUrl(index1) {
    // index1 is 1-based for file names
    const n = String(index1).padStart(pad, '0');
    return pattern.replace('{i}', n);
  }

  function readRawProgress() {
    const doc = document.documentElement;
    const total = doc.scrollHeight - window.innerHeight;
    if (total <= 1) return 0;
    return clamp(window.scrollY / total, 0, 1);
  }

  function setupCanvas() {
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });
    // Match device pixel ratio for sharpness without huge bitmaps
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function drawCover(img) {
    if (!ctx || !canvas || !img || !img.complete) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawFrameIndex(idx) {
    const i = clamp(Math.round(idx), 0, frameCount - 1);
    const img = frames[i];
    if (img && img.complete && img.naturalWidth) {
      drawCover(img);
      drawnFrame = i;
      if (poster) poster.classList.remove('is-visible');
      if (canvas) canvas.classList.add('is-ready');
      return true;
    }
    // nearest loaded frame
    for (let d = 1; d < frameCount; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= frameCount) continue;
        const alt = frames[j];
        if (alt && alt.complete && alt.naturalWidth) {
          drawCover(alt);
          drawnFrame = j;
          if (poster) poster.classList.remove('is-visible');
          if (canvas) canvas.classList.add('is-ready');
          return true;
        }
      }
    }
    return false;
  }

  function applyParallax(p) {
    const e = easeInOutCubic(p);
    root.style.setProperty('--scroll-p', p.toFixed(4));

    if (intro) {
      intro.style.transform = `translate3d(0, ${(e * -22).toFixed(2)}px, 0)`;
      intro.style.opacity = String(clamp(1 - e * 1.05, 0.2, 1));
    }
    if (main) {
      main.style.transform = `translate3d(0, ${(e * -10).toFixed(2)}px, 0)`;
    }
    if (outro) {
      outro.style.transform = `translate3d(0, ${(e * 8).toFixed(2)}px, 0)`;
    }
    if (stage) {
      stage.style.setProperty('--stage-shift', `${(e * 4).toFixed(2)}%`);
    }
    if (progressEl) {
      progressEl.style.transform = `scaleX(${p})`;
    }
    if (hint) {
      hint.classList.toggle('is-faded', p > 0.04);
    }
    root.classList.toggle('is-scrolled', p > 0.01);
    root.classList.toggle('is-complete', p > 0.97);
  }

  function tick() {
    rawProgress = readRawProgress();
    smoothProgress += (rawProgress - smoothProgress) * PROGRESS_DAMP;
    if (Math.abs(rawProgress - smoothProgress) < 0.00012) {
      smoothProgress = rawProgress;
    }

    applyParallax(smoothProgress);

    // Map full page scroll 0→1 across all frames (no gain hold — sequence is short)
    const targetFrame = smoothProgress * (frameCount - 1);
    smoothFrame += (targetFrame - smoothFrame) * FRAME_DAMP;
    if (Math.abs(targetFrame - smoothFrame) < 0.02) {
      smoothFrame = targetFrame;
    }

    const idx = clamp(Math.round(smoothFrame), 0, frameCount - 1);
    if (idx !== drawnFrame || !ready) {
      drawFrameIndex(idx);
    }

    requestAnimationFrame(tick);
  }

  function loadFrames() {
    // Priority: load first, middle, last quickly for usable scrub ASAP
    const order = [];
    const seen = new Set();
    function push(i) {
      if (i < 0 || i >= frameCount || seen.has(i)) return;
      seen.add(i);
      order.push(i);
    }
    push(0);
    push(Math.floor((frameCount - 1) / 2));
    push(frameCount - 1);
    for (let i = 0; i < frameCount; i++) push(i);

    let concurrent = 0;
    const MAX_CONCURRENT = 6;
    let cursor = 0;

    function pump() {
      while (concurrent < MAX_CONCURRENT && cursor < order.length) {
        const i = order[cursor++];
        concurrent += 1;
        const img = new Image();
        img.decoding = 'async';
        // Help browser: first frames eager
        if (i < 8 || i === Math.floor((frameCount - 1) / 2)) {
          img.fetchPriority = 'high';
        }
        img.onload = () => {
          frames[i] = img;
          loadedCount += 1;
          concurrent -= 1;
          if (loadedCount === 1) {
            ready = true;
            drawFrameIndex(0);
          }
          // decode into GPU where supported
          if (img.decode) {
            img.decode().catch(() => {});
          }
          pump();
        };
        img.onerror = () => {
          concurrent -= 1;
          pump();
        };
        img.src = frameUrl(i + 1);
      }
    }
    pump();
  }

  function onResize() {
    syncHeaderOffset();
    setupCanvas();
    if (drawnFrame >= 0) {
      drawFrameIndex(drawnFrame);
    }
  }

  setupCanvas();
  loadFrames();

  window.addEventListener('resize', onResize, { passive: true });

  // Start continuous parallax + frame loop
  requestAnimationFrame(tick);
})();
