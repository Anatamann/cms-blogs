/* Home social carousel: arrows, fades, slow auto-scroll
 * — pauses only when hovering a post card
 * — eases speed to 0 over 200ms (no hard stop / snap jerk)
 */
(function () {
  const track = document.querySelector('[data-social-carousel]');
  if (!track) return;

  const shell = track.closest('[data-carousel-shell]') || track.parentElement;
  if (!shell) return;

  const prevBtn = shell.querySelector('[data-carousel-prev]');
  const nextBtn = shell.querySelector('[data-carousel-next]');

  const AUTO_PX_PER_SEC = 40;
  const PAUSE_DELAY_MS = 100;
  const DECEL_MS = 200;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** 1 = full auto speed, 0 = stopped */
  let speedFactor = reduceMotion ? 0 : 1;
  let targetFactor = reduceMotion ? 0 : 1;
  let decelFrom = 1;
  let decelStart = 0;
  let hoveringCard = false;
  let pauseTimer = 0;
  let rafId = 0;
  let lastTs = 0;
  let accum = 0;

  function maxScroll() {
    return Math.max(0, track.scrollWidth - track.clientWidth);
  }

  function stepSize() {
    const item = track.querySelector('.social-carousel__item');
    if (!item) return Math.max(240, Math.floor(track.clientWidth * 0.85));
    const styles = window.getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap) || 16;
    return Math.max(160, item.getBoundingClientRect().width + gap);
  }

  /** Keep snap off during crawl — snap causes right-edge jerk. */
  function setSnap(on) {
    track.style.scrollSnapType = on ? 'x mandatory' : 'none';
  }

  function syncButtons() {
    const max = maxScroll();
    const left = track.scrollLeft;
    const atStart = left <= 2;
    const atEnd = left >= max - 2;
    const noOverflow = max <= 2;

    if (prevBtn) {
      prevBtn.disabled = atStart || noOverflow;
      prevBtn.hidden = noOverflow;
    }
    if (nextBtn) {
      nextBtn.disabled = atEnd || noOverflow;
      nextBtn.hidden = noOverflow;
    }

    shell.classList.toggle('is-at-start', atStart || noOverflow);
    shell.classList.toggle('is-at-end', atEnd || noOverflow);
  }

  function scrollByDir(dir) {
    setSnap(false);
    track.scrollBy({ left: dir * stepSize(), behavior: 'smooth' });
  }

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function beginDecel() {
    targetFactor = 0;
    decelFrom = speedFactor;
    decelStart = performance.now();
  }

  function beginAccel() {
    if (reduceMotion) return;
    targetFactor = 1;
    decelFrom = speedFactor;
    decelStart = performance.now();
    setSnap(false);
  }

  function schedulePause() {
    window.clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(function () {
      if (!hoveringCard) return;
      beginDecel();
    }, PAUSE_DELAY_MS);
  }

  function onCardEnter() {
    hoveringCard = true;
    schedulePause();
  }

  function onCardLeave(e) {
    const next = e.relatedTarget;
    // Still inside another post card — stay paused / keep decel target
    if (next && next.closest && next.closest('.social-carousel__item')) {
      return;
    }
    hoveringCard = false;
    window.clearTimeout(pauseTimer);
    pauseTimer = 0;
    beginAccel();
  }

  function tick(ts) {
    rafId = window.requestAnimationFrame(tick);

    if (document.hidden) {
      lastTs = 0;
      accum = 0;
      return;
    }

    // Ease speedFactor toward target over DECEL_MS
    if (speedFactor !== targetFactor) {
      const elapsed = ts - (decelStart || ts);
      const t = Math.min(1, elapsed / DECEL_MS);
      const e = easeOutQuad(t);
      speedFactor = decelFrom + (targetFactor - decelFrom) * e;
      if (t >= 1) {
        speedFactor = targetFactor;
        if (speedFactor === 0) setSnap(false);
      }
    }

    if (speedFactor <= 0.001 || reduceMotion) {
      lastTs = 0;
      accum = 0;
      return;
    }

    const max = maxScroll();
    if (max <= 2) {
      lastTs = 0;
      return;
    }

    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.064, (ts - lastTs) / 1000);
    lastTs = ts;

    setSnap(false);
    accum += AUTO_PX_PER_SEC * speedFactor * dt;

    if (accum >= 1) {
      const px = Math.floor(accum);
      accum -= px;
      let next = track.scrollLeft + px;
      if (next >= max - 0.5) {
        // Seamless loop without snap jerk
        next = 0;
        accum = 0;
      }
      track.scrollLeft = next;
      syncButtons();
    }
  }

  function startAuto() {
    if (rafId) return;
    lastTs = 0;
    accum = 0;
    rafId = window.requestAnimationFrame(tick);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function (e) {
      e.preventDefault();
      scrollByDir(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function (e) {
      e.preventDefault();
      scrollByDir(1);
    });
  }

  // Pause only when the pointer is on a post card — not the empty track / fades
  track.querySelectorAll('.social-carousel__item').forEach(function (item) {
    item.addEventListener('mouseenter', onCardEnter);
    item.addEventListener('mouseleave', onCardLeave);
  });

  // Keyboard focus on a card link
  track.addEventListener('focusin', function (e) {
    if (e.target && e.target.closest && e.target.closest('.social-carousel__item')) {
      hoveringCard = true;
      schedulePause();
    }
  });
  track.addEventListener('focusout', function (e) {
    const next = e.relatedTarget;
    if (next && track.contains(next) && next.closest('.social-carousel__item')) return;
    hoveringCard = false;
    window.clearTimeout(pauseTimer);
    beginAccel();
  });

  let touchResumeTimer = 0;
  track.addEventListener(
    'touchstart',
    function (e) {
      if (e.target && e.target.closest && e.target.closest('.social-carousel__item')) {
        hoveringCard = true;
        window.clearTimeout(pauseTimer);
        pauseTimer = window.setTimeout(function () {
          beginDecel();
        }, PAUSE_DELAY_MS);
      }
      window.clearTimeout(touchResumeTimer);
    },
    { passive: true }
  );
  track.addEventListener(
    'touchend',
    function () {
      hoveringCard = false;
      window.clearTimeout(touchResumeTimer);
      touchResumeTimer = window.setTimeout(beginAccel, 100);
    },
    { passive: true }
  );

  track.addEventListener('scroll', syncButtons, { passive: true });
  window.addEventListener('resize', syncButtons);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      lastTs = 0;
      accum = 0;
    }
  });

  setSnap(false);
  syncButtons();
  window.requestAnimationFrame(function () {
    syncButtons();
    startAuto();
  });
})();
