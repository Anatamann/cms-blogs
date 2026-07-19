/* Public site — nav, a11y helpers (Phase 5) */
document.documentElement.dataset.js = 'true';

(function () {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (!toggle || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', () => {
    setOpen(!nav.classList.contains('is-open'));
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Close when a nav link is activated (mobile)
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 800px)').matches) {
        setOpen(false);
      }
    });
  });

  // Close if viewport grows past mobile breakpoint
  const mq = window.matchMedia('(min-width: 801px)');
  function onMq(e) {
    if (e.matches) setOpen(false);
  }
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);
})();

/* Ensure content images from markdown have lazy loading if missing */
(function () {
  document.querySelectorAll('.prose img:not([loading])').forEach((img) => {
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });
})();
