/* Social Feed: independent column lanes with random relative speeds.
 * Page stays vertically scrollable; each column drifts on its own.
 * Pause on post-card hover (0.1s delay, 0.2s ease-out).
 */
(function () {
  const grid = document.querySelector('[data-social-grid]');
  if (!grid) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAUSE_DELAY_MS = 100;
  const DECEL_MS = 200;
  const BASE_PX_PER_SEC = 30;

  function columnCount() {
    const w = window.innerWidth || 1024;
    if (w <= 600) return 1;
    if (w <= 900) return 2;
    return 3;
  }

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  /** Per-lane relative speed ~0.5×–1.5× (random each build). */
  function relativeSpeed() {
    return 0.5 + Math.random();
  }

  /** @type {Array<{
   *   el: HTMLElement,
   *   track: HTMLElement,
   *   offset: number,
   *   loopAt: number,
   *   speedMul: number,
   *   speedFactor: number,
   *   targetFactor: number,
   *   decelFrom: number,
   *   decelStart: number,
   *   hovering: boolean,
   *   pauseTimer: number,
   *   measure: Function
   * }>} */
  let lanes = [];
  let rafId = 0;
  let lastTs = 0;
  let builtFor = 0;

  function clearLanes() {
    lanes.forEach(function (lane) {
      window.clearTimeout(lane.pauseTimer);
    });
    lanes = [];
  }

  function gatherOriginalCards() {
    if (lanes.length) {
      const out = [];
      lanes.forEach(function (lane) {
        const kids = Array.prototype.slice.call(lane.track.children);
        const half = Math.floor(kids.length / 2) || kids.length;
        for (let i = 0; i < half; i += 1) out.push(kids[i]);
      });
      return out;
    }
    return Array.prototype.slice.call(grid.querySelectorAll('[data-social-card]'));
  }

  function build() {
    const originals = gatherOriginalCards();
    if (!originals.length) return;

    const n = columnCount();
    clearLanes();
    grid.innerHTML = '';
    grid.classList.remove('social-grid--plain');
    grid.classList.add('social-grid--lanes');

    /** @type {HTMLElement[][]} */
    const buckets = [];
    for (let i = 0; i < n; i += 1) buckets.push([]);
    originals.forEach(function (card, i) {
      buckets[i % n].push(card);
    });

    buckets.forEach(function (bucket) {
      if (!bucket.length) return;

      const col = document.createElement('div');
      col.className = 'social-col';
      col.setAttribute('data-social-col', '');

      const fadeTop = document.createElement('div');
      fadeTop.className = 'social-col__fade social-col__fade--top';
      fadeTop.setAttribute('aria-hidden', 'true');
      const fadeBot = document.createElement('div');
      fadeBot.className = 'social-col__fade social-col__fade--bottom';
      fadeBot.setAttribute('aria-hidden', 'true');

      const track = document.createElement('div');
      track.className = 'social-col__track';
      track.setAttribute('data-social-col-track', '');

      bucket.forEach(function (card) {
        track.appendChild(card);
      });
      bucket.forEach(function (card) {
        track.appendChild(card.cloneNode(true));
      });

      col.appendChild(fadeTop);
      col.appendChild(track);
      col.appendChild(fadeBot);
      grid.appendChild(col);

      const lane = {
        el: col,
        track: track,
        offset: 0,
        loopAt: 0,
        speedMul: relativeSpeed(),
        speedFactor: reduceMotion ? 0 : 1,
        targetFactor: reduceMotion ? 0 : 1,
        decelFrom: 1,
        decelStart: 0,
        hovering: false,
        pauseTimer: 0,
        measure: function () {},
      };

      function measure() {
        const styles = window.getComputedStyle(track);
        const gap = parseFloat(styles.rowGap || styles.gap) || 20;
        const half = Math.floor(track.children.length / 2);
        let h = 0;
        for (let i = 0; i < half; i += 1) {
          h += track.children[i].offsetHeight + (i < half - 1 ? gap : 0);
        }
        lane.loopAt = Math.max(1, h);
        lane.offset = lane.offset % lane.loopAt;
        track.style.transform = 'translate3d(0,' + (-lane.offset) + 'px,0)';
      }

      function beginDecel() {
        lane.targetFactor = 0;
        lane.decelFrom = lane.speedFactor;
        lane.decelStart = performance.now();
      }

      function beginAccel() {
        if (reduceMotion) return;
        lane.targetFactor = 1;
        lane.decelFrom = lane.speedFactor;
        lane.decelStart = performance.now();
      }

      function schedulePause() {
        window.clearTimeout(lane.pauseTimer);
        lane.pauseTimer = window.setTimeout(function () {
          if (!lane.hovering) return;
          beginDecel();
        }, PAUSE_DELAY_MS);
      }

      track.addEventListener('mouseover', function (e) {
        const card = e.target && e.target.closest && e.target.closest('[data-social-card]');
        if (!card || !track.contains(card)) return;
        if (lane.hovering) return;
        lane.hovering = true;
        schedulePause();
      });
      track.addEventListener('mouseout', function (e) {
        const card = e.target && e.target.closest && e.target.closest('[data-social-card]');
        if (!card || !track.contains(card)) return;
        const next = e.relatedTarget;
        if (next && card.contains(next)) return;
        if (
          next &&
          next.closest &&
          next.closest('[data-social-card]') &&
          track.contains(next.closest('[data-social-card]'))
        ) {
          return;
        }
        lane.hovering = false;
        window.clearTimeout(lane.pauseTimer);
        beginAccel();
      });

      col.addEventListener(
        'touchstart',
        function (e) {
          if (e.target && e.target.closest && e.target.closest('[data-social-card]')) {
            lane.hovering = true;
            window.clearTimeout(lane.pauseTimer);
            lane.pauseTimer = window.setTimeout(beginDecel, PAUSE_DELAY_MS);
          }
        },
        { passive: true }
      );
      col.addEventListener(
        'touchend',
        function () {
          lane.hovering = false;
          window.clearTimeout(lane.pauseTimer);
          window.setTimeout(beginAccel, 100);
        },
        { passive: true }
      );

      lane.measure = measure;
      lanes.push(lane);
      window.requestAnimationFrame(measure);
    });

    builtFor = n;
  }

  function tick(ts) {
    rafId = window.requestAnimationFrame(tick);
    if (document.hidden) {
      lastTs = 0;
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.064, (ts - lastTs) / 1000);
    lastTs = ts;

    lanes.forEach(function (lane) {
      if (lane.speedFactor !== lane.targetFactor) {
        const elapsed = ts - (lane.decelStart || ts);
        const t = Math.min(1, elapsed / DECEL_MS);
        const e = easeOutQuad(t);
        lane.speedFactor = lane.decelFrom + (lane.targetFactor - lane.decelFrom) * e;
        if (t >= 1) lane.speedFactor = lane.targetFactor;
      }

      if (reduceMotion || lane.speedFactor <= 0.001 || !lane.loopAt) return;

      lane.offset += BASE_PX_PER_SEC * lane.speedMul * lane.speedFactor * dt;
      if (lane.offset >= lane.loopAt) lane.offset -= lane.loopAt;
      lane.track.style.transform = 'translate3d(0,' + (-lane.offset).toFixed(2) + 'px,0)';
    });
  }

  function start() {
    if (rafId) return;
    lastTs = 0;
    rafId = window.requestAnimationFrame(tick);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (columnCount() !== builtFor) build();
      else lanes.forEach(function (l) { l.measure(); });
    }, 150);
  });

  grid.classList.add('social-grid--plain');
  build();
  start();
})();
