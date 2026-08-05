/**
 * Post page: cover/backdrop stills as fixed background.
 * Body images stay fully visible in the article.
 *
 * Multiple stills: equal bands over article scroll progress.
 *   N=2 → first half of article = image 0; after 50% = image 1
 *   index = min(N-1, floor(progress * N))
 */
(function () {
  const root = document.querySelector('[data-post-scroll]');
  if (!root) return;

  const content = root.querySelector('.post-scroll__content');
  const bgA = root.querySelector('[data-scroll-bg-a]');
  const bgB = root.querySelector('[data-scroll-bg-b]');
  if (!content || !bgA || !bgB) return;

  /** @type {string[]} */
  let urls = [];
  try {
    const raw = root.getAttribute('data-backdrop-images');
    if (raw) {
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (Array.isArray(parsed)) urls = parsed.map(String).filter(Boolean);
    }
  } catch {
    urls = [];
  }

  if (!urls.length) return;

  document.documentElement.classList.add('has-post-scroll');
  document.body.classList.add('has-post-scroll');

  function syncHeaderOffset() {
    const header = document.querySelector('.site-header');
    const h = header ? header.offsetHeight : 68;
    root.style.setProperty('--header-offset', `${h}px`);
  }
  syncHeaderOffset();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    root.classList.add('post-scroll--static');
    bgA.src = urls[0];
    bgA.classList.add('is-active');
    return;
  }

  let activeIndex = -1;
  let frontIsA = true;
  let ticking = false;

  function setLayer(imgEl, src, active) {
    if (src && imgEl.getAttribute('src') !== src) {
      imgEl.src = src;
    }
    imgEl.classList.toggle('is-active', !!active);
  }

  function showIndex(index) {
    if (index < 0 || index >= urls.length) return;
    if (index === activeIndex) return;
    const src = urls[index];
    if (activeIndex < 0) {
      setLayer(bgA, src, true);
      setLayer(bgB, '', false);
      frontIsA = true;
      activeIndex = index;
      bgA.fetchPriority = 'high';
      return;
    }
    const back = frontIsA ? bgB : bgA;
    const front = frontIsA ? bgA : bgB;
    setLayer(back, src, false);
    void back.offsetWidth;
    setLayer(back, src, true);
    setLayer(front, front.getAttribute('src') || '', false);
    frontIsA = !frontIsA;
    activeIndex = index;
  }

  /**
   * 0..1 how far the reader has scrolled through the article content.
   */
  function articleProgress() {
    const total = content.offsetHeight - window.innerHeight;
    if (total <= 1) return 0;
    const top = content.getBoundingClientRect().top;
    // When content top is at viewport top, scrolled ≈ 0; as we scroll up, top becomes negative
    const scrolled = Math.min(Math.max(-top, 0), total);
    return scrolled / total;
  }

  function computeIndex() {
    const n = urls.length;
    if (n <= 1) return 0;
    const p = articleProgress();
    // Equal bands: n=2 → switch at 0.5; n=3 at 1/3 and 2/3
    const idx = Math.floor(p * n);
    return Math.min(n - 1, Math.max(0, idx));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      showIndex(computeIndex());
    });
  }

  // Preload
  const preloadN = Math.min(urls.length, 4);
  for (let i = 0; i < preloadN; i++) {
    const im = new Image();
    im.decoding = 'async';
    if (i === 0) im.fetchPriority = 'high';
    im.src = urls[i];
  }

  showIndex(0);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener(
    'resize',
    () => {
      syncHeaderOffset();
      onScroll();
    },
    { passive: true }
  );
  onScroll();
})();
