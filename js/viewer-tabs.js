/**
 * Main viewer section toggles — QASM · Circuit · Bloch · Wave · Stats.
 */
(function () {
  'use strict';

  // New surface-based system (remade structure)
  const SURFACES = ['editor', 'circuit', 'charts', 'world', 'bloch', 'batch'];
  const STORAGE_KEY = 'composerIBM.activeSurface';

  function $(id) { return document.getElementById(id); }

  function setActiveSurface(name) {
    if (!SURFACES.includes(name)) name = 'editor';

    // Update app data attribute (for CSS if needed)
    const app = $('app');
    if (app) app.setAttribute('data-active-surface', name);

    // Update surface containers
    document.querySelectorAll('.surface').forEach(el => {
      el.classList.toggle('active', el.id === 'surface-' + name);
    });

    // Update toolbar buttons
    document.querySelectorAll('.surface-switcher .surface').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.surface === name);
    });

    localStorage.setItem(STORAGE_KEY, name);

    // Trigger refresh for data-driven surfaces
    if (window.ComposerCore && window.ComposerCore.refreshAll) {
      window.ComposerCore.refreshAll();
    }

    // Special handling for world surface
    if (name === 'world' && window.GlobalLattice) {
      // Could trigger more detailed view here
    }
  }

  function initSurfaceSwitcher() {
    const saved = localStorage.getItem(STORAGE_KEY) || 'editor';
    setActiveSurface(saved);

    document.querySelectorAll('.surface-switcher .surface').forEach(btn => {
      btn.addEventListener('click', () => {
        setActiveSurface(btn.dataset.surface);
      });
    });

    // Also support old data-section for backward compatibility during transition
    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.section;
        if (SURFACES.includes(s)) setActiveSurface(s);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSurfaceSwitcher);
  } else {
    initSurfaceSwitcher();
  }

  window.SurfaceSwitcher = { setActiveSurface };
})();
