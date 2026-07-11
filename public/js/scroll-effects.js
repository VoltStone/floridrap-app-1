(function () {
  'use strict';

  // Presence of this class is what lets the CSS hide .reveal elements
  // before animating them in. Without JavaScript, that class is never
  // added, so .reveal elements simply stay at their default (fully
  // visible) state — nothing on the page depends on this script running.
  document.documentElement.classList.add('js');

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var header = document.querySelector('.site-header');
  var backToTop = document.querySelector('.back-to-top');

  function onScroll() {
    if (header) {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    }
    if (backToTop) {
      backToTop.classList.toggle('is-visible', window.scrollY > 480);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (backToTop) {
    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }

  var revealEls = document.querySelectorAll('.reveal');

  // Shop sort dropdown: auto-submits on change once JS is confirmed
  // working. The visible "Trier" button in the markup is the real,
  // always-functional control — this only hides it and adds a shortcut,
  // it never replaces the button as the way sorting actually works.
  var sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    var sortForm = sortSelect.closest('form');
    if (sortForm) {
      sortSelect.addEventListener('change', function () {
        sortForm.submit();
      });
      var sortButton = sortForm.querySelector('.sort-submit');
      if (sortButton) {
        sortButton.style.display = 'none';
      }
    }
  }

  // No motion, or no IntersectionObserver support: show everything
  // immediately rather than attempting any animation.
  if (prefersReducedMotion || !('IntersectionObserver' in window) || revealEls.length === 0) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach(function (el, i) {
    // Small staggered delay within each visual group (grid of cards,
    // list of tiles) so items cascade in rather than popping together.
    // Capped so a long product grid doesn't leave the last row waiting.
    el.style.transitionDelay = (Math.min(i % 8, 8) * 60) + 'ms';
    observer.observe(el);
  });
})();
