/**
 * Bridge μgrad R0, quantum-loopback, and external mueee pages.
 */
(function () {
  'use strict';

  const MUEEE = {
    ugrad: 'file:///Users/qbit/dev/mueee/ugrad-r0.html',
    gutter: 'https://qbitos.github.io/mu.eee/quantum-gutter.html'
  };

  let loopback = null;

  function init() {
    if (typeof BroadcastChannel !== 'undefined') {
      loopback = new BroadcastChannel('quantum-loopback');
      loopback.onmessage = onLoopback;
    }
    window.addEventListener('message', onWindowMessage);
    window.addEventListener('storage', onStorage);
    if (window.ComposerCore) {
      window.ComposerCore.log('<span class="ok">Bridge ready</span> — quantum-loopback + μgrad', 'ok');
    }
  }

  function onLoopback(ev) {
    const d = ev.data;
    if (!d || !d.type) return;
    if (d.type === 'ai-growth-signal' && d.source === 'ugrad-r0') {
      if (window.ComposerCore) {
        window.ComposerCore.log(
          `<span class="info">μgrad G${d.generation}</span> fidelity ${(d.avgFidelity * 100 || 0).toFixed(0)}% · ${d.qubits || '?'} qubits`,
          'info'
        );
      }
    }
    if (d.type === 'qbt-result' || d.type === 'qbt-sweep') {
      syncMachFromQbt(d);
    }
    if (d.type === 'qpu-calibration-request') {
      const name = d.backend || (window.QPUFleet && window.QPUFleet._selected);
      if (name && window.QPUCalibrations) {
        const snap = window.QPUCalibrations.get(name);
        if (snap) publishCalibration(snap, null);
      }
    }
    if (d.type === 'qpu-calibration-all-request' && window.QPUCalibrations && loopback) {
      const blob = window.QPUCalibrations.toJSON();
      try {
        loopback.postMessage({
          type: 'qpu-calibration-all',
          source: 'composerIBM',
          ts: Date.now(),
          blob
        });
      } catch (_) {}
    }
  }

  function onWindowMessage(ev) {
    const d = ev.data;
    if (!d) return;
    if (d.type === 'composerIBM-set-qasm' && d.qasm && window.ComposerCore) {
      window.ComposerCore.setQasm(d.qasm);
      window.ComposerCore.log('<span class="ok">QASM from parent window</span>', 'ok');
    }
    if (d.source === 'ugrad-r0' && d.lastQASM && window.ComposerCore) {
      window.ComposerCore.setQasm(d.lastQASM);
    }
  }

  function onStorage(ev) {
    if (ev.key === 'ugrad.lastQASM' && ev.newValue && window.ComposerCore) {
      window.ComposerCore.setQasm(ev.newValue);
      window.ComposerCore.log('<span class="ok">QASM from localStorage (μgrad)</span>', 'ok');
    }
  }

  function syncMachFromQbt(d) {
    const mach = d.mach ?? d.qbt?.mach;
    if (mach == null) return;
    const el = document.getElementById('mach');
    if (el) {
      el.value = String(mach);
      if (window.ComposerCore) window.ComposerCore.refreshAll();
    }
  }

  function publishState(payload) {
    if (!loopback) return;
    loopback.postMessage({
      type: 'composer-state',
      source: 'composerIBM',
      ts: Date.now(),
      qasm: payload.qasm,
      verdict: payload.analysis && payload.analysis.preflight ? payload.analysis.preflight.verdict : null
    });
  }

  function publishCalibration(snapshot, qasm) {
    if (!snapshot) return;
    const payload = {
      type: 'qpu-calibration',
      source: 'composerIBM',
      ts: Date.now(),
      backend: snapshot.backend,
      vendor: snapshot.vendor,
      chip: snapshot.chip,
      snapshot,
      qasm: qasm || null
    };
    if (loopback) {
      try { loopback.postMessage(payload); } catch (_) {}
    }
    try {
      if (window.opener && !window.opener.closed) window.opener.postMessage(payload, '*');
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('composerIBM-calibration', { detail: payload }));
    } catch (_) {}
  }

  function pullFromUgrad() {
    let qasm = null;
    try {
      if (window.opener && typeof window.opener.ugradGetState === 'function') {
        const st = window.opener.ugradGetState();
        qasm = st.lastQASM;
      }
    } catch (_) {}
    if (!qasm) {
      qasm = localStorage.getItem('ugrad.lastQASM') || localStorage.getItem('composerIBM.ugradQasm');
    }
    if (qasm && window.ComposerCore) {
      window.ComposerCore.setQasm(qasm);
      window.ComposerCore.log('<span class="ok">Imported μgrad QASM</span>', 'ok');
      return true;
    }
    window.open(MUEEE.ugrad + '?noauto', 'ugrad-r0');
    if (window.ComposerCore) {
      window.ComposerCore.log(
        '<span class="info">Open μgrad → train → quantum export, then Import again</span>',
        'info'
      );
    }
    return false;
  }

  function openGutter() {
    window.open(MUEEE.gutter, 'quantum-gutter');
  }

  window.ComposerBridge = {
    init,
    publishState,
    publishCalibration,
    pullFromUgrad,
    openGutter,
    MUEEE
  };
})();
