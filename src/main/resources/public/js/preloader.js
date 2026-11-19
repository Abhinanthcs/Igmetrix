/**
 * Refined Full-Screen Preloader Controller
 * Ensures flicker-free minimum display time (350ms), 4000ms fallback safety,
 * and maintains background scroll lock until fade-out transition fully finishes.
 */
(function (global) {
  'use strict';

  var MIN_DISPLAY_TIME_MS = 350; // Prevents jarring flash on high-speed / cached visits
  var FALLBACK_TIMEOUT_MS = 4000; // Hard max fallback timeout
  var isDismissed = false;
  var timeoutTimer = null;
  var startTime = (typeof performance !== 'undefined' && performance.now) 
    ? performance.now() 
    : Date.now();

  // Lock scrolling on html and body
  function lockScroll() {
    if (document.documentElement && !document.documentElement.classList.contains('preloader-active')) {
      document.documentElement.classList.add('preloader-active');
    }
    if (document.body && !document.body.classList.contains('preloader-active')) {
      document.body.classList.add('preloader-active');
    }
  }

  // Restore scrolling once animation concludes
  function unlockScroll() {
    if (document.documentElement) {
      document.documentElement.classList.remove('preloader-active');
    }
    if (document.body) {
      document.body.classList.remove('preloader-active');
    }
  }

  function getOverlay() {
    return document.getElementById('preloader-overlay');
  }

  // Dismiss and smoothly fade out
  function dismissPreloader() {
    if (isDismissed) return;
    isDismissed = true;

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }

    var overlay = getOverlay();
    if (!overlay) {
      unlockScroll();
      return;
    }

    overlay.setAttribute('aria-busy', 'false');
    overlay.classList.add('is-hidden');

    var cleanedUp = false;
    var cleanup = function () {
      if (cleanedUp) return;
      cleanedUp = true;
      unlockScroll();
      overlay.style.display = 'none';
      overlay.removeEventListener('transitionend', cleanup);
    };

    // Wait until CSS fade-out finishes before unlocking scroll
    overlay.addEventListener('transitionend', cleanup, { once: true });

    // Safety fallback timer matching or slightly exceeding CSS fade duration (400ms + buffer)
    setTimeout(cleanup, 450);
  }

  // Schedule dismissal respecting the minimum display duration
  function scheduleDismissal() {
    var now = (typeof performance !== 'undefined' && performance.now) 
      ? performance.now() 
      : Date.now();
    var elapsed = now - startTime;
    var remainingTime = Math.max(0, MIN_DISPLAY_TIME_MS - elapsed);

    setTimeout(function () {
      // Use requestAnimationFrame for smooth visual handoff
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(dismissPreloader);
      } else {
        dismissPreloader();
      }
    }, remainingTime);
  }

  function initPreloader() {
    lockScroll();

    // If window has already finished loading
    if (document.readyState === 'complete') {
      scheduleDismissal();
      return;
    }

    // Normal path: wait for full load of subresources (images, fonts, stylesheets)
    window.addEventListener('load', scheduleDismissal, { once: true });

    // Fallback: guarantee user is never stuck if an asset hangs
    timeoutTimer = setTimeout(function () {
      dismissPreloader();
    }, FALLBACK_TIMEOUT_MS);
  }

  // Lock scroll immediately on execution
  lockScroll();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreloader, { once: true });
  } else {
    initPreloader();
  }

  // Public API
  global.Preloader = {
    dismiss: dismissPreloader,
    show: function () {
      isDismissed = false;
      startTime = (typeof performance !== 'undefined' && performance.now) 
        ? performance.now() 
        : Date.now();
      var overlay = getOverlay();
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.remove('is-hidden');
        overlay.setAttribute('aria-busy', 'true');
        lockScroll();
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
