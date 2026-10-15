/* Subtle parallax on social page cards */
(function () {
  const page = document.querySelector('[data-social-page]');
  if (!page) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cards = Array.prototype.slice.call(page.querySelectorAll('[data-social-card]'));
  if (!cards.length) return;

  let ticking = false;

  function update() {
    ticking = false;
    const vh = window.innerHeight || 1;
    cards.forEach(function (card) {
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const offset = ((mid - vh / 2) / vh) * -12;
      card.style.transform = 'translate3d(0,' + offset.toFixed(2) + 'px,0)';
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();
