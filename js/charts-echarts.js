/**
 * Optional ECharts + canvas fallback charting surface for composer.
 * Hybrid (CDN for speed/examples + vendored/airgap support).
 * All usage guarded. Live via refreshAll hook.
 * Presets use existing data: preflight (core.js + preflight-lite), Bloch paths (bloch-trajectory + engine),
 * calibration errors (qpu-calibrations + lattice), waveform.
 */
(function (root) {
  'use strict';

  let charts = {};
  let echartsLib = null;

  function hasECharts() {
    if (echartsLib) return true;
    if (typeof root.echarts !== 'undefined') {
      echartsLib = root.echarts;
      return true;
    }
    return false;
  }

  function ensureHost(id, parent) {
    let el = root.document.getElementById(id);
    if (!el) {
      el = root.document.createElement('div');
      el.id = id;
      el.className = 'q-chart-host';
      el.style.cssText = 'width:100%;height:160px;margin:6px 0;border-radius:4px;background:var(--canvas2);';
      parent.appendChild(el);
    }
    return el;
  }

  function destroyAll() {
    Object.keys(charts).forEach((k) => {
      if (charts[k] && charts[k].dispose) charts[k].dispose();
    });
    charts = {};
  }

  function renderPreflightBar(host, analysis) {
    const pf = analysis && analysis.preflight;
    if (!pf) return;
    if (hasECharts()) {
      const el = ensureHost('q-chart-preflight', host);
      const ch = echartsLib.init(el, null, { renderer: 'canvas' });
      ch.setOption({
        backgroundColor: 'transparent',
        grid: { left: 30, right: 10, top: 20, bottom: 20 },
        xAxis: { type: 'category', data: ['Gates', '2Q', 'Depth', 'Qubits'], axisLabel: { color: '#607087', fontSize: 9 } },
        yAxis: { type: 'value', axisLabel: { color: '#607087', fontSize: 9 } },
        series: [{
          type: 'bar',
          data: [pf.gateCount || 0, pf.twoQubitGates || 0, pf.circuitDepth || 0, pf.qubitCount || 0],
          itemStyle: { color: '#0969da' },
          label: { show: true, position: 'top', fontSize: 9, color: '#1f2937' }
        }]
      });
      charts.preflight = ch;
    } else {
      // Fallback tiny table
      const el = ensureHost('q-chart-preflight-fb', host);
      el.innerHTML = `<div style="font-size:9px;padding:4px 6px;color:#607087;">G:${pf.gateCount||0} · 2Q:${pf.twoQubitGates||0} · D:${pf.circuitDepth||0} · Q:${pf.qubitCount||0} (canvas fallback)</div>`;
    }
  }

  function renderFidelityGauge(host, analysis) {
    const pf = analysis && analysis.preflight;
    if (!pf) return;
    const fid = Math.max(0, Math.min(100, pf.estimatedFidelity || 0));
    if (hasECharts()) {
      const el = ensureHost('q-chart-fidelity', host);
      const ch = echartsLib.init(el, null, { renderer: 'canvas' });
      ch.setOption({
        backgroundColor: 'transparent',
        series: [{
          type: 'gauge',
          center: ['50%', '55%'],
          radius: '80%',
          min: 0, max: 100,
          data: [{ value: fid, name: 'Fidelity %' }],
          axisLine: { lineStyle: { color: [[0.6, '#f85149'], [0.85, '#d4a72c'], [1, '#3fb950']], width: 8 } },
          pointer: { width: 3 },
          detail: { formatter: '{value}%', fontSize: 11 }
        }]
      });
      charts.fidelity = ch;
    } else {
      const el = ensureHost('q-chart-fidelity-fb', host);
      el.innerHTML = `<div style="font-size:10px;padding:4px;color:#1f2937;">Fidelity ~ <strong>${fid.toFixed(1)}%</strong> (fallback)</div>`;
    }
  }

  // Public API — called from composer-core refreshAll after renderStats
  function render(container, analysis, calibration) {
    if (!container) return;
    destroyAll();
    // Attach two quick high-value charts (expand in later passes)
    renderPreflightBar(container, analysis);
    renderFidelityGauge(container, analysis);
    // Future: error heatmap (calibration), Bloch trajectory line (bloch-trajectory data), etc.
    // Example hook for more: if (hasECharts()) { ... add from ECharts gallery (heatmap, line, radar) }
  }

  function init() {
    // Optional: pre-detect
    if (hasECharts()) {
      // nothing — lazy init on first render
    }
  }

  root.QuantumCharts = { init, render, destroyAll, hasECharts };
  init();
})(typeof window !== 'undefined' ? window : globalThis);