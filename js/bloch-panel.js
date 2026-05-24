/**
 * Embeddable Bloch section in main Composer window (toggle on/off).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'composerIBM.blochOpen';
  const MODE_KEY = 'composerIBM.blochPanelMode';
  let engine = null;
  let enabled = false;
  let panelMode = localStorage.getItem(MODE_KEY) || 'single';
  let spinId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function isOpen() {
    return localStorage.getItem(STORAGE_KEY) === '1';
  }

  function setOpen(open) {
    enabled = open;
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    const sec = $('bloch-section');
    const btn = $('btn-bloch');
    const main = $('main');
    if (main) main.classList.toggle('bloch-on', open);
    if (sec) {
      sec.classList.toggle('open', open);
      sec.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (btn) btn.classList.toggle('active', open);
    if (open) {
      ensureEngine();
      refresh();
    } else {
      stopSpin();
    }
  }

  function toggle() {
    setOpen(!enabled);
  }

  function ensureEngine() {
    if (!engine && window.BlochEngine) {
      engine = window.BlochEngine.create();
      const cv = $('cv-bloch-panel');
      if (cv) {
        cv.dataset.blochMode = panelMode;
        engine.bindDrag(cv);
      }
    }
    return engine;
  }

  function getQasm() {
    if (window.ComposerCore && typeof window.ComposerCore.getQasm === 'function') {
      return window.ComposerCore.getQasm();
    }
    const ta = $('qasm');
    return ta ? ta.value : '';
  }

  function refresh() {
    if (!enabled) return;
    const eng = ensureEngine();
    if (!eng) return;

    eng.recompute({
      qasm: getQasm(),
      mode: 'qasm',
      usePathEnd: true
    });

    const cv = $('cv-bloch-panel');
    if (cv) {
      cv.dataset.blochMode = panelMode;
      if (window.BlochRender && window.BlochRender.renderPanel) window.BlochRender.renderPanel(cv, eng.snapshot(), panelMode);
      else if (panelMode === 'dual') eng.paintDual(cv);
      else eng.paintSingle(cv);
    }

    const p = eng.state.particle;
    const el = $('bloch-panel-stats');
    if (el && p) {
      const p0 = (p.p0 != null ? p.p0 : Math.cos(p.theta / 2) ** 2) * 100;
      let tension = '';
      if (cv && panelMode !== 'single' && window.BlochRender && window.BlochRender.stressMetrics) {
        const w = cv.clientWidth || 1;
        const h = cv.clientHeight || 1;
        const r = Math.max(24, Math.min(w * 0.12, h * 0.24));
        const m = window.BlochRender.stressMetrics(eng.snapshot(), eng.state.rotX, eng.state.rotY, w * 0.34, h * 0.54, w * 0.66, h * 0.54, r);
        tension = `<span class="b-stat">T ${m.tension.toFixed(2)}</span>`;
      }
      el.innerHTML =
        `<span class="b-stat">θ ${p.theta.toFixed(3)}</span>` +
        `<span class="b-stat">φ ${p.phi.toFixed(3)}</span>` +
        `<span class="b-stat">|0⟩ ${p0.toFixed(1)}%</span>` +
        `<span class="b-stat">${panelMode}</span>` +
        tension +
        `<span class="b-stat">steps ${eng.state.pathParticle.length}</span>`;
    }

    eng.publish('composerIBM-panel');
  }

  function setMode(mode) {
    panelMode = mode || 'single';
    localStorage.setItem(MODE_KEY, panelMode);
    refresh();
  }

  function isSpinning() {
    return spinId !== null;
  }

  function stopSpin() {
    if (spinId !== null) {
      cancelAnimationFrame(spinId);
      spinId = null;
    }
  }

  function toggleSpin() {
    if (spinId !== null) {
      stopSpin();
      return;
    }
    const cv = $('cv-bloch-panel');
    const step = () => {
      const eng = ensureEngine();
      if (!eng || !enabled) {
        spinId = null;
        return;
      }
      eng.state.rotY += 0.018;
      if (cv && window.BlochRender && window.BlochRender.renderPanel) {
        window.BlochRender.renderPanel(cv, eng.snapshot(), panelMode);
      } else if (cv) {
        if (panelMode === 'dual') eng.paintDual(cv);
        else eng.paintSingle(cv);
      }
      spinId = requestAnimationFrame(step);
    };
    spinId = requestAnimationFrame(step);
  }

  function syncQasm() {
    try {
      localStorage.setItem('composerIBM.lastQasm', getQasm());
    } catch (_) {}
    refresh();
  }

  function openStandalone(target) {
    window.open(`bloch-viewer.html?qasm=1`, 'bloch-viewer');
    try {
      localStorage.setItem('composerIBM.lastQasm', getQasm());
      if (target) localStorage.setItem('composerIBM.blochViewerMode', target);
    } catch (_) {}
  }

  function closeDrawer() {
    const drawer = $('bloch-panel-drawer');
    if (drawer) {
      drawer.hidden = true;
      drawer.innerHTML = '';
    }
    refresh();
  }

  function showDrawer(kind) {
    const drawer = $('bloch-panel-drawer');
    if (!drawer) return;
    const isPop = kind === 'popout';
    drawer.hidden = false;
    drawer.innerHTML = `
      <div class="bloch-drawer-title">${isPop ? 'Pop out view' : 'Lab view'}</div>
      <button type="button" data-mode="single">Single</button>
      <button type="button" data-mode="dual">Magnetic dual</button>
      <button type="button" data-mode="quad">Entangled quad</button>
      <button type="button" data-mode="stacked">Stacked</button>
      <button type="button" data-mode="gapped">Gapped</button>
      <div class="bloch-drawer-row">
        <button type="button" data-action="spin" class="${isSpinning() ? 'active' : ''}">${isSpinning() ? 'Stop spin' : 'Spin'}</button>
        <button type="button" data-action="sync">Sync QASM</button>
      </div>
      <button type="button" data-action="${isPop ? 'open-viewer' : 'open-lab'}">${isPop ? 'Open viewer' : 'Open lab'}</button>
      <button type="button" data-action="close">Close</button>
    `;
    drawer.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === panelMode);
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
        showDrawer(kind);
      });
    });
    drawer.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'open-viewer') openStandalone(panelMode);
        else if (action === 'open-lab') {
          try {
            localStorage.setItem('composerIBM.lastQasm', getQasm());
            localStorage.setItem('composerIBM.blochLabMode', panelMode);
          } catch (_) {}
          setMode(panelMode);
        } else if (action === 'spin') {
          toggleSpin();
          showDrawer(kind);
        } else if (action === 'sync') {
          syncQasm();
        } else closeDrawer();
      });
    });
    refresh();
  }

  function init() {
    enabled = isOpen();
    const sec = $('bloch-section');
    const main = $('main');
    if (main) main.classList.toggle('bloch-on', enabled);
    if (sec) {
      sec.classList.toggle('open', enabled);
      sec.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    }

    const btn = $('btn-bloch');
    if (btn) {
      btn.classList.toggle('active', enabled);
      btn.addEventListener('click', toggle);
    }

    const pop = $('btn-bloch-popout');
    if (pop) pop.addEventListener('click', () => showDrawer('popout'));

    const lab = $('btn-bloch-lab');
    if (lab) lab.addEventListener('click', () => showDrawer('lab'));

    if (enabled) ensureEngine();

    window.BlochPanel = { refresh, toggle, setOpen, isOpen, setMode, toggleSpin, isSpinning, syncQasm };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
