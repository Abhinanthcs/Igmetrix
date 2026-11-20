/**
 * Persistent Site-Wide Dark & Light Theme Switcher
 * Handles local storage persistence, system preference auto-detection,
 * cross-tab synchronization, and accessible toggle control.
 */
(function (global) {
  'use strict';

  var THEME_STORAGE_KEY = 'theme';
  var mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // Determine current system theme (default: light)
  function getSystemTheme() {
    return 'light';
  }

  // Get current active theme
  function getSavedTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || getSavedTheme() || getSystemTheme();
  }

  // Apply theme to DOM and update toggle buttons
  function applyTheme(theme, persist) {
    if (persist === undefined) persist = true;
    var targetTheme = (theme === 'dark' || theme === 'light') ? theme : getSystemTheme();

    document.documentElement.setAttribute('data-theme', targetTheme);

    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, targetTheme);
      } catch (e) {
        // Handle private browsing or quota limits gracefully
      }
    }

    updateToggleButtons(targetTheme);

    // Dispatch custom event for application modules
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: targetTheme } }));
  }

  // Update ARIA attributes on all toggle buttons across the page
  function updateToggleButtons(theme) {
    var isDark = theme === 'dark';
    var nextTheme = isDark ? 'light' : 'dark';
    var label = 'Switch to ' + nextTheme + ' theme';

    var buttons = document.querySelectorAll('.theme-toggle-btn, [data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }
  }

  // Toggle between dark and light
  function toggleTheme() {
    var current = getCurrentTheme();
    var nextTheme = current === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, true);
  }

  // Bind click handlers to all theme buttons
  function bindToggleButtons() {
    var buttons = document.querySelectorAll('.theme-toggle-btn, [data-theme-toggle]');
    buttons.forEach(function (btn) {
      // Avoid duplicate bindings
      if (btn.getAttribute('data-theme-bound')) return;
      btn.setAttribute('data-theme-bound', 'true');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleTheme();
      });
    });
  }

  // Enable transitions on body after DOM has settled to avoid initial paint transition flash
  function enableTransitions() {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.body.classList.add('theme-ready');
        });
      });
    } else {
      setTimeout(function () {
        document.body.classList.add('theme-ready');
      }, 50);
    }
  }

  // Initialize
  function init() {
    var initialTheme = getCurrentTheme();
    applyTheme(initialTheme, false);
    bindToggleButtons();
    enableTransitions();

    // Listen for OS system theme changes if user has not set an explicit override
    if (mediaQuery) {
      var mediaListener = function (e) {
        if (!getSavedTheme()) {
          applyTheme(e.matches ? 'dark' : 'light', false);
        }
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', mediaListener);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(mediaListener);
      }
    }

    // Cross-tab synchronization via storage event
    window.addEventListener('storage', function (e) {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        applyTheme(e.newValue, false);
      }
    });
  }


  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Public API
  global.ThemeManager = {
    getTheme: getCurrentTheme,
    setTheme: applyTheme,
    toggleTheme: toggleTheme,
    updateButtons: updateToggleButtons
  };

})(typeof window !== 'undefined' ? window : this);
