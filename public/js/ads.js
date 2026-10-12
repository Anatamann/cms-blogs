/* Article ads: viewport placement for dual-surface (esp. Google) units */
(function () {
  const root = document.querySelector('[data-post-ads]');
  if (!root) return;

  const mq = window.matchMedia('(max-width: 800px)');
  const rail = root.querySelector('[data-ad-rail]');
  let adsensePushed = false;

  function anchor(slot) {
    return root.querySelector('[data-ad-anchor="' + slot + '"]');
  }

  function sortRail() {
    if (!rail) return;
    const units = Array.prototype.slice.call(rail.querySelectorAll('[data-ad-unit]'));
    units.sort(function (a, b) {
      return Number(a.getAttribute('data-sort') || 0) - Number(b.getAttribute('data-sort') || 0);
    });
    units.forEach(function (u) {
      rail.appendChild(u);
    });
  }

  function place() {
    const mobile = mq.matches;
    root.querySelectorAll('[data-ad-unit]').forEach(function (unit) {
      const showDesktop = unit.getAttribute('data-show-desktop') === '1';
      const slot = unit.getAttribute('data-mobile-slot') || '';
      const type = unit.getAttribute('data-ad-type') || 'promo';

      if (mobile) {
        if (slot) {
          const target = anchor(slot);
          if (target) {
            // Google dual-surface: move single node to mobile
            if (type === 'google' || !target.contains(unit)) {
              // Avoid duplicating promo: if a mobile copy already exists for same placement, hide rail copy
              const placementId = unit.getAttribute('data-placement-id');
              const sibling = target.querySelector(
                '[data-ad-unit][data-placement-id="' + placementId + '"]'
              );
              if (sibling && sibling !== unit) {
                unit.hidden = true;
                return;
              }
              target.appendChild(unit);
              unit.hidden = false;
              return;
            }
          }
        }
        // Desktop-only on mobile → hide
        if (showDesktop && !slot) {
          unit.hidden = true;
          return;
        }
        unit.hidden = false;
      } else {
        unit.hidden = false;
        if (showDesktop && rail) {
          const placementId = unit.getAttribute('data-placement-id');
          // Prefer keeping promo mobile copies in anchors (CSS hides them); move google back to rail
          if (type === 'google' || !unit.parentElement || unit.parentElement.getAttribute('data-ad-anchor')) {
            const existing = rail.querySelector(
              '[data-ad-unit][data-placement-id="' + placementId + '"]'
            );
            if (existing && existing !== unit) {
              unit.hidden = true;
              return;
            }
            rail.appendChild(unit);
          }
        } else if (!showDesktop) {
          // Mobile-only: leave in anchor, CSS hides inline on desktop
          unit.hidden = false;
        }
      }
    });
    sortRail();
  }

  function pushAdsense() {
    if (adsensePushed) return;
    const slots = root.querySelectorAll('ins.adsbygoogle');
    if (!slots.length) return;
    try {
      slots.forEach(function () {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      });
      adsensePushed = true;
    } catch (e) {
      // AdSense may be blocked
    }
  }

  place();
  // Place before AdSense init when possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      place();
      pushAdsense();
    });
  } else {
    pushAdsense();
  }

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', place);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(place);
  }
})();
