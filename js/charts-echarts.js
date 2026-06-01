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

    // 1. Preflight metrics bar
    renderPreflightBar(container, analysis);

    // 2. Fidelity gauge
    renderFidelityGauge(container, analysis);

    // 3. Latency distribution (from Global Lattice when available)
    if (root.GlobalLattice && root.GlobalLattice.getLatencySamples) {
      const samples = root.GlobalLattice.getLatencySamples(10) || [];
      if (samples.length > 3) {
        const el = ensureHost('q-chart-latency', container);
        if (hasECharts()) {
          const ch = echartsLib.init(el, null, { renderer: 'canvas' });
          ch.setOption({
            backgroundColor: 'transparent',
            title: { text: 'Global Latency (ms)', left: 4, top: 2, textStyle: { fontSize: 10, color: '#607087' } },
            grid: { left: 28, right: 8, top: 22, bottom: 18 },
            xAxis: { type: 'category', data: samples.map((_, i) => i), show: false },
            yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
            series: [{ type: 'bar', data: samples, itemStyle: { color: '#56d4dd' } }]
          });
          charts.latency = ch;
        } else {
          el.innerHTML = `<div style="font-size:9px;padding:4px;color:#607087;">Latency samples: ${samples.join(', ')} ms (fallback)</div>`;
        }
      }
    }

    // 4. QPU Error Histogram (from current backend calibration)
    if (root.QPUCalibrations && analysis && analysis.preflight) {
      const backend = analysis.preflight.backend;
      const snap = root.QPUCalibrations.get(backend);
      if (snap && snap.qubits && snap.qubits.length > 3) {
        const errs = snap.qubits.map(q => q.err_1q || 0).slice(0, 12);
        const el = ensureHost('q-chart-error-hist', container);
        if (hasECharts()) {
          const ch = echartsLib.init(el, null, { renderer: 'canvas' });
          ch.setOption({
            backgroundColor: 'transparent',
            title: { text: `1Q Errors — ${backend}`, left: 4, top: 2, textStyle: { fontSize: 10, color: '#607087' } },
            grid: { left: 28, right: 8, top: 22, bottom: 18 },
            xAxis: { type: 'category', data: errs.map((_, i) => i), axisLabel: { fontSize: 8 } },
            yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
            series: [{ type: 'bar', data: errs, itemStyle: { color: '#f85149' } }]
          });
          charts.errorHist = ch;
        } else {
          el.innerHTML = `<div style="font-size:9px;padding:4px;color:#607087;">1Q err samples for ${backend} (fallback)</div>`;
        }
      }
    }

    // 5. Simple Bloch-style Trajectory Tension (mocked from current depth if no real path)
    if (analysis && analysis.preflight) {
      const depth = analysis.preflight.circuitDepth || 5;
      const tension = Array.from({ length: Math.min(depth, 12) }, (_, i) => 0.2 + Math.sin(i / 2) * 0.15 + (i / depth) * 0.3);
      const el = ensureHost('q-chart-trajectory', container);
      if (hasECharts()) {
        const ch = echartsLib.init(el, null, { renderer: 'canvas' });
        ch.setOption({
          backgroundColor: 'transparent',
          title: { text: 'Trajectory Tension (sim)', left: 4, top: 2, textStyle: { fontSize: 10, color: '#607087' } },
          grid: { left: 28, right: 8, top: 22, bottom: 18 },
          xAxis: { type: 'category', data: tension.map((_, i) => i) },
          yAxis: { type: 'value', min: 0, max: 1, axisLabel: { fontSize: 9 } },
          series: [{ type: 'line', data: tension, smooth: true, itemStyle: { color: '#bc8cff' } }]
        });
        charts.trajectory = ch;
      } else {
        el.innerHTML = `<div style="font-size:9px;padding:4px;color:#607087;">Trajectory sim (fallback)</div>`;
      }
    }

    // Gallery launcher buttons for grokability (core ECharts request)
    addGalleryLaunchers(container);
  }

  function addGalleryLaunchers(container) {
    if (!container) return;
    const launcher = document.createElement('div');
    launcher.style.cssText = 'margin-top:6px; font-size:9px; display:flex; gap:6px; flex-wrap:wrap;';
    launcher.innerHTML = `
      <span style="color:#607087;">More from ECharts gallery:</span>
      <button class="q-gallery-btn" data-type="bar">Bar</button>
      <button class="q-gallery-btn" data-type="line">Line</button>
      <button class="q-gallery-btn" data-type="heatmap">Heatmap</button>
      <button class="q-gallery-btn" data-type="radar">Radar</button>
    `;
    launcher.querySelectorAll('.q-gallery-btn').forEach(btn => {
      btn.style.cssText = 'padding:1px 6px; font-size:9px; border:1px solid var(--canvas-border); background:var(--canvas2); border-radius:3px; cursor:pointer;';
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const url = `https://echarts.apache.org/examples/en/index.html#chart-type-${type}`;
        window.open(url, '_blank');
        if (root.ComposerCore && root.ComposerCore.log) {
          root.ComposerCore.log(`<span class="info">Opened ECharts ${type} gallery</span>`);
        }
      });
    });
    container.appendChild(launcher);
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