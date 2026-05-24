'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  let engine = null;
  let dual = false;
  let spinId = null;

  function getQasm() {
    try {
      return localStorage.getItem('composerIBM.lastQasm') || '';
    } catch (_) {
      return '';
    }
  }

  function ensure() {
    if (!engine) {
      engine = window.BlochEngine.create();
      const cv = $('cv-viewer');
      engine.bindDrag(cv);
      cv.addEventListener('bloch-rotate', updateStats);
      window.addEventListener('resize', paint);
    }
    return engine;
  }

  function recompute() {
    const eng = ensure();
    eng.recompute({ qasm: getQasm(), mode: 'qasm' });
    paint();
    eng.publish('composerIBM-viewer');
    updateStats();
  }

  function paint() {
    const cv = $('cv-viewer');
    if (!engine || !cv) return;
    cv.dataset.blochMode = dual ? 'dual' : 'single';
    if (dual) engine.paintDual(cv);
    else engine.paintSingle(cv);
  }

  function setLabDrawer(open) {
    const main = $('viewer-main');
    const drawer = $('lab-drawer');
    const frame = $('lab-frame');
    const btn = $('btn-lab-drawer');
    if (!main || !drawer || !frame || !btn) return;
    drawer.hidden = !open;
    main.classList.toggle('drawer-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Hide lab' : 'Full lab';
    if (open) {
      try {
        localStorage.setItem('composerIBM.lastQasm', getQasm());
      } catch (_) {}
      if (!frame.getAttribute('src')) frame.setAttribute('src', 'bloch-lab.html?embed=1');
    }
    requestAnimationFrame(paint);
  }

  function updateStats() {
    const el = $('viewer-stats');
    const p = engine && engine.state.particle;
    if (!el || !p) return;
    const n = engine.state.pathParticle.length;
    const cv = $('cv-viewer');
    let metricText = '';
    if (dual && cv && window.BlochRender && window.BlochRender.stressMetrics) {
      const w = cv.clientWidth || 1;
      const h = cv.clientHeight || 1;
      const r = Math.min(w, h) * 0.22;
      const m = window.BlochRender.stressMetrics(engine.snapshot(), engine.state.rotX, engine.state.rotY, w * 0.28, h * 0.52, w * 0.72, h * 0.52, r);
      metricText = ` · tension=${m.tension.toFixed(3)} depth=${m.depth.toFixed(3)} compression=${m.compression.toFixed(3)} exchange=${m.exchange.toFixed(3)}`;
    }
    el.textContent = `θ=${p.theta.toFixed(4)} φ=${p.phi.toFixed(4)} · |0⟩=${((p.p0 || 0) * 100).toFixed(1)}% · trajectory ${n} steps · ${dual ? 'dual' : 'single'}${metricText}`;
  }

  function toggleDual() {
    dual = !dual;
    $('btn-mode').textContent = dual ? 'Single' : 'Dual';
    paint();
    updateStats();
  }

  function toggleSpin() {
    if (spinId) {
      cancelAnimationFrame(spinId);
      spinId = null;
      return;
    }
    const step = () => {
      if (!engine) return;
      engine.state.rotY += 0.018;
      paint();
      updateStats();
      spinId = requestAnimationFrame(step);
    };
    spinId = requestAnimationFrame(step);
  }

  function init() {
    $('btn-mode').onclick = toggleDual;
    $('btn-spin').onclick = toggleSpin;
    $('btn-sync').onclick = recompute;
    $('btn-lab-drawer').onclick = () => setLabDrawer(!$('lab-drawer').hidden);
    $('btn-lab-close').onclick = () => setLabDrawer(false);

    if (typeof BroadcastChannel !== 'undefined') {
      new BroadcastChannel('bloch-state').onmessage = (e) => {
        const d = e.data;
        if (d && d.type === 'bloch-state' && d.qubits && d.qubits[0]) {
          recompute();
        }
      };
    }

    recompute();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
