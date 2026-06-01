/**
 * Main viewer section toggles — QASM · Circuit · Bloch · Wave · Stats.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'composerIBM.sections';
  const SECTIONS = ['editor', 'circuit', 'bloch', 'wave', 'stats', 'lattice', 'charts', 'world'];
  const WIDE_DEFAULT_SECTIONS = ['editor', 'circuit', 'wave', 'stats'];
  const NARROW_DEFAULT_SECTIONS = ['editor', 'circuit'];

  function $(id) {
    return document.getElementById(id);
  }

  function readSections() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const isNarrow = root.matchMedia && root.matchMedia('(max-width: 900px)').matches;
        return (isNarrow ? NARROW_DEFAULT_SECTIONS : WIDE_DEFAULT_SECTIONS).slice();
      }
      const parsed = JSON.parse(raw);
      return parsed.filter((s) => SECTIONS.includes(s));
    } catch (_) {
      return NARROW_DEFAULT_SECTIONS.slice();
    }
  }

  function writeSections(active) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  }

  function setSections(active, opts) {
    const next = active.filter((s, i) => SECTIONS.includes(s) && active.indexOf(s) === i);
    const app = $('app');
    if (app) {
      SECTIONS.forEach((s) => app.classList.toggle(`show-${s}`, next.includes(s)));
    }
    document.querySelectorAll('.view-tab').forEach((btn) => {
      const on = next.includes(btn.dataset.section);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (!opts || !opts.skipStore) writeSections(next);

    if (window.BlochPanel) {
      window.BlochPanel.setOpen(next.includes('bloch'));
    }
    if (window.ComposerCore && window.ComposerCore.refreshAll) {
      window.ComposerCore.refreshAll();
    }
  }

  function toggleSection(name) {
    if (!SECTIONS.includes(name)) return;
    const active = readSections();
    const idx = active.indexOf(name);
    if (idx >= 0) active.splice(idx, 1);
    else active.push(name);
    setSections(active);
  }

  function stepSection(dir) {
    const active = readSections();
    const current = SECTIONS.find((s) => active.includes(s)) || SECTIONS[0];
    const idx = SECTIONS.indexOf(current);
    const next = SECTIONS[(idx + dir + SECTIONS.length) % SECTIONS.length];
    setSections([next]);
  }

  function init() {
    const saved = readSections();
    if (window.BlochPanel && window.BlochPanel.isOpen && window.BlochPanel.isOpen() && !saved.includes('bloch')) {
      saved.push('bloch');
    }
    setSections(saved, { skipStore: true });

    document.querySelectorAll('.view-tab').forEach((btn) => {
      btn.addEventListener('click', () => toggleSection(btn.dataset.section));
    });

    const prev = $('btn-section-prev');
    const next = $('btn-section-next');
    if (prev) prev.addEventListener('click', () => stepSection(-1));
    if (next) next.addEventListener('click', () => stepSection(1));

    const hdrBloch = $('btn-bloch');
    if (hdrBloch) {
      hdrBloch.addEventListener('click', () => {
        setTimeout(() => {
          const active = readSections();
          const isOpen = window.BlochPanel && window.BlochPanel.isOpen && window.BlochPanel.isOpen();
          const hasBloch = active.includes('bloch');
          if (isOpen && !hasBloch) active.push('bloch');
          if (!isOpen && hasBloch) active.splice(active.indexOf('bloch'), 1);
          setSections(active);
        }, 0);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ViewerTabs = { setSections, toggleSection, stepSection, readSections, SECTIONS };
})();
