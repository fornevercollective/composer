'use strict';

const $ = (id) => document.getElementById(id);

function logMsg(msg, cls) {
  const wrap = $('log-bar');
  const line = document.createElement('div');
  line.className = 'ln' + (cls ? ' ' + cls : '');
  line.innerHTML = msg;
  wrap.appendChild(line);
  wrap.scrollTop = wrap.scrollHeight;
}

const DEFAULT_QASM = `OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;

// composerIBM — offline starter
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`;

let wasmAnalyze = null;
let lastAnalysis = null;
let lastPreflight = null;
let waveSamples = null;

function getQasm() {
  if (window.EditorGutter && window.EditorGutter.getExportText) {
    return window.EditorGutter.getExportText();
  }
  return $('qasm').value;
}

function setQasm(text) {
  $('qasm').value = text;
  refreshAll();
  if (window.BlochPanel && window.BlochPanel.isOpen && window.BlochPanel.isOpen()) {
    window.BlochPanel.refresh();
  }
}

function analyzeJs(qasm) {
  const gutter = window.QasmGutter.analyzeSource(qasm);
  const pf = window.QbitPreflightLite.preflight(qasm, $('backend').value, {
    shots: parseInt($('shots').value, 10) || 1024
  });
  const stats = window.QbitPreflightLite.parseStats(qasm);
  return { gutter, preflight: pf, stats, source: 'js' };
}

async function analyzeWasm(qasm) {
  if (!wasmAnalyze) return null;
  try {
    const raw = wasmAnalyze(qasm);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const gutter = window.QasmGutter.analyzeSource(qasm);
    const pf = window.QbitPreflightLite.preflight(qasm, $('backend').value, {
      shots: parseInt($('shots').value, 10) || 1024
    });
    return { gutter, preflight: pf, stats: parsed, source: 'wasm' };
  } catch (e) {
    logMsg(`<span class="err">WASM analyze failed: ${e.message}</span>`, 'err');
    return null;
  }
}

function renderLane(qasm, stats) {
  const wrap = $('lane-wrap');
  if (window.CircuitComposer) {
    window.CircuitComposer.render(wrap, qasm, stats, setQasm);
    return;
  }
  const lane = $('lane');
  const n = stats.qubitCount || 2;
  const wires = Math.min(n, 8);
  let out = '';
  for (let q = 0; q < wires; q++) {
    let row = `q${q} ─`;
    const slice = qasm.split('\n').filter((l) => new RegExp(`q\\[${q}\\]|q\\[${q},`, 'i').test(l)).slice(0, 6);
    slice.forEach(() => (row += '─●─'));
    row += '─ M';
    out += row + '\n';
  }
  if (n > wires) out += `… +${n - wires} wires\n`;
  lane.textContent = out || '(empty circuit)';
}

function renderStats(analysis) {
  const el = $('stats');
  const pf = analysis.preflight;
  const g = analysis.gutter;
  const s = analysis.stats;
  const backend = window.QPUFleet && window.QPUFleet.getByName ? window.QPUFleet.getByName($('backend').value) : { name: pf.backend, q: pf.backendQubits };
  const vc = pf.verdict === 'GO' ? 'verdict-go' : pf.verdict === 'WARN' ? 'verdict-warn' : 'verdict-abort';
  el.innerHTML = `
    <motion class="row"><span class="k">parser</span><span class="v">${analysis.source}</span></motion>
    <div class="row"><span class="k">verdict</span><span class="v ${vc}">${pf.verdict}</span></div>
    <div class="row"><span class="k">backend</span><span class="v">${pf.backend}</span></div>
    <div class="row"><span class="k">qubits</span><span class="v">${s.qubitCount || pf.qubitCount}/${pf.backendQubits}</span></motion>
    <div class="row"><span class="k">gates</span><span class="v">${s.gateCount ?? pf.gateCount}</span></div>
    <div class="row"><span class="k">2Q gates</span><span class="v">${s.two_qubit_gates ?? s.twoQubitGates ?? pf.twoQubitGates}</span></div>
    <motion class="row"><span class="k">depth</span><span class="v">${s.depth ?? s.circuitDepth ?? pf.circuitDepth}</span></motion>
    <div class="row"><span class="k">gutter cov</span><span class="v">${g.coverage}%</span></div>
    <div class="row"><span class="k">fidelity ~</span><span class="v">${pf.estimatedFidelity.toFixed(1)}%</span></div>
    <div class="row"><span class="k">cost est</span><span class="v">${pf.estimatedCost.toFixed(0)} u</span></div>
  `.replace(/<\/?motion>/g, '');
  renderLattice(analysis, backend);
  lastAnalysis = analysis;
  lastPreflight = pf;
}

function renderLattice(analysis, backend) {
  if (!window.QPULattice) return;
  const host = $('qpu-lattice');
  if (!host) return;
  const pf = analysis.preflight;
  const s = analysis.stats;
  const be = backend || { name: pf.backend, q: pf.backendQubits };
  const calibration = window.QPUCalibrations ? window.QPUCalibrations.get(be.name) : null;
  window.QPULattice.render(host, {
    backend: be,
    qasm: getQasm(),
    qubitCount: s.qubitCount || pf.qubitCount,
    calibration
  });
  if (window.QPUCalibrations && be.name) {
    window.QPUCalibrations.publish(be.name);
  }
  if (window.ComposerBridge && window.ComposerBridge.publishCalibration && calibration) {
    window.ComposerBridge.publishCalibration(calibration, getQasm());
  }
}

const GUTTER_SORT_KEY = 'composerIBM.gutterSort';
let gutterSortMode = localStorage.getItem(GUTTER_SORT_KEY) || 'group';
let lastGutterAnalysis = null;

function renderGutter(analysis) {
  lastGutterAnalysis = analysis;
  const G = window.QasmGutter;
  let html;
  if (gutterSortMode === 'group' && G && G.renderGutterGroupedHtml) {
    html = G.renderGutterGroupedHtml(analysis.gutter, 12);
  } else if (G && G.renderGutterCardsHtml) {
    html = G.renderGutterCardsHtml(analysis.gutter, 24);
  } else if (G) {
    html = G.renderGutterHtml(analysis.gutter, 24);
  } else {
    html = '';
  }
  $('gutter-log').innerHTML = html;
  const cards = $('qasm-cards');
  if (cards) cards.innerHTML = html;
  renderGutterSummary(analysis);
}

const GUTTER_CATEGORY_ORDER = ['shebang', 'include', 'qubit', 'bit', 'gate', 'measure', 'barrier', 'control', 'reset', 'comment', 'misc'];

function renderGutterSummary(analysis) {
  const host = $('gutter-summary');
  if (!host) return;
  const counts = (analysis && analysis.gutter && analysis.gutter.counts) || {};
  const meta = window.QasmGutter && window.QasmGutter.prefixMeta;
  if (!meta) {
    host.innerHTML = '';
    return;
  }
  const chips = GUTTER_CATEGORY_ORDER.filter((cat) => (counts[cat] || 0) > 0).map((cat) => {
    const m = meta(cat);
    return `<span class="gutter-chip ${m.cls}" title="${cat}"><i>${m.label}</i>${counts[cat]}</span>`;
  });
  const cov = analysis && analysis.gutter ? analysis.gutter.coverage || 0 : 0;
  const total = analysis && analysis.gutter ? analysis.gutter.totalLines || 0 : 0;
  const sortBtns =
    `<div class="gutter-sort" role="group" aria-label="Sort cards">` +
      `<button type="button" class="gutter-sort-btn${gutterSortMode === 'group' ? ' active' : ''}" data-sort="group" title="Group cards by category">Grouped</button>` +
      `<button type="button" class="gutter-sort-btn${gutterSortMode === 'line' ? ' active' : ''}" data-sort="line" title="List cards in line order">Line order</button>` +
    `</div>`;
  host.innerHTML =
    `<div class="gutter-chips">${chips.join('') || '<span class="gutter-chip-empty">no classified lines</span>'}</div>` +
    `<div class="gutter-chip-meta">${total} line${total === 1 ? '' : 's'} · ${cov}% coverage</div>` +
    sortBtns;
  host.querySelectorAll('.gutter-sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.sort;
      if (!mode || mode === gutterSortMode) return;
      gutterSortMode = mode;
      try { localStorage.setItem(GUTTER_SORT_KEY, mode); } catch (_) {}
      if (lastGutterAnalysis) renderGutter(lastGutterAnalysis);
    });
  });
}

function refreshWaveform() {
  const mach = parseFloat($('mach').value) || 1;
  const alt = parseInt($('alt').value, 10) || 0;
  const w = window.WaveformQBT.sampleWaveform({ mach, alt, samples: 256 });
  waveSamples = w.samples;
  window.WaveformQBT.drawWaveform($('wave-canvas'), waveSamples, '#0969da');
  const m = w.metrics;
  $('wave-metrics').textContent = `Mach ${mach.toFixed(2)} · E=${m.energy.toFixed(4)} · peak=${m.peak.toFixed(3)}`;
}

async function refreshAll() {
  const qasm = getQasm();
  let analysis = await analyzeWasm(qasm);
  if (!analysis) analysis = analyzeJs(qasm);
  renderStats(analysis);
  renderGutter(analysis);
  if (window.EditorGutter) window.EditorGutter.render(qasm);
  renderLane(qasm, analysis.preflight);
  refreshWaveform();
  if (window.QuantumCharts && window.QuantumCharts.render) {
    window.QuantumCharts.render($('charts-host'), analysis, null);
  }
  if (window.ComposerBridge) window.ComposerBridge.publishState({ qasm, analysis });
  if (window.BlochPanel && window.BlochPanel.isOpen && window.BlochPanel.isOpen()) {
    window.BlochPanel.refresh();
  }
}

async function tryLoadWasm() {
  try {
    const probe = await fetch('wasm/pkg/qasm_lite.js', { method: 'GET', cache: 'no-store' });
    const ct = probe.headers.get('content-type') || '';
    if (!probe.ok || ct.includes('text/html') || !ct.includes('javascript')) return;
    const mod = await import('../wasm/pkg/qasm_lite.js');
    await mod.default();
    wasmAnalyze = mod.analyze_qasm;
    logMsg('<span class="ok">WASM qasm-lite loaded</span>', 'ok');
  } catch (_) {
    /* optional — JS analyzer is default */
  }
}

function exportPipeline() {
  const qasm = getQasm();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tool: 'composerIBM',
    qasm,
    preflight: lastPreflight,
    gutter:
      lastAnalysis && lastAnalysis.gutter
        ? { coverage: lastAnalysis.gutter.coverage, counts: lastAnalysis.gutter.counts }
        : null,
    waveform: waveSamples
      ? { mach: parseFloat($('mach').value), samples: Array.from(waveSamples).slice(0, 64) }
      : null,
    portals: ['ibm-quantum', 'local-aer', 'mu-eee-gutter'],
    mueee: {
      ugrad: 'file:///Users/qbit/dev/mueee/ugrad-r0.html',
      gutter: 'https://qbitos.github.io/mu.eee/quantum-gutter.html'
    }
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `submission-${ts}.json`;
  a.click();
  localStorage.setItem('composerIBM.lastQasm', qasm);
  if (window.BlochPanel) window.BlochPanel.refresh();
  logMsg('<span class="ok">Pipeline bundle downloaded</span>', 'ok');
}

function downloadQasm() {
  const blob = new Blob([getQasm()], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'circuit.qasm';
  a.click();
}

async function runLocalSim() {
  logMsg(
    '<span class="info">Local sim:</span> <code>python3 python/sim_local.py --qasm circuit.qasm</code>',
    'info'
  );
}

function bindUi() {
  $('btn-analyze').onclick = () => refreshAll();
  $('btn-export').onclick = exportPipeline;
  $('btn-qasm').onclick = downloadQasm;
  $('btn-sim').onclick = runLocalSim;
  $('btn-reset').onclick = () => setQasm(DEFAULT_QASM);
  $('btn-ugrad').onclick = () => window.ComposerBridge && window.ComposerBridge.pullFromUgrad();
  $('backend').onchange = () => refreshAll();
  $('shots').onchange = () => refreshAll();
  $('mach').oninput = () => refreshWaveform();
  $('alt').oninput = () => refreshWaveform();
  let debounce;
  $('qasm').oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(refreshAll, 400);
  };
}

window.ComposerCore = {
  getQasm,
  setQasm,
  refreshAll,
  exportPipeline,
  log: logMsg,
  DEFAULT_QASM
};

function initThemeToggle() {
  const btn = $('btn-theme-toggle');
  if (!btn) return;
  const root = document.documentElement;
  const key = 'composerIBM.theme';
  const saved = localStorage.getItem(key);
  if (saved) root.setAttribute('data-theme', saved);
  const apply = (t) => {
    root.setAttribute('data-theme', t);
    localStorage.setItem(key, t);
    btn.textContent = t === 'dark' ? '☼' : '◐';
  };
  btn.addEventListener('click', () => {
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply(cur === 'dark' ? 'light' : 'dark');
  });
  // initial icon
  const initial = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  btn.textContent = initial === 'dark' ? '☼' : '◐';
}

function initHeaderMenu() {
  const menuCb = $('hdr-menu-open');
  const menuLbl = document.querySelector('.hdr-menu-btn');
  const actions = $('hdr-actions');
  const targetToggle = $('btn-hdr-target-toggle');
  const header = $('hdr');
  const collapsedKey = 'composerIBM.headerTargetCollapsed';

  function setTargetCollapsed(collapsed) {
    if (!header || !targetToggle) return;
    header.classList.toggle('hdr-target-collapsed', collapsed);
    targetToggle.textContent = collapsed ? 'Show' : 'QPU';
    targetToggle.title = collapsed ? 'Show QPU controls' : 'Collapse QPU controls';
    targetToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    localStorage.setItem(collapsedKey, collapsed ? '1' : '0');
  }

  if (targetToggle) {
    setTargetCollapsed(localStorage.getItem(collapsedKey) === '1');
    targetToggle.addEventListener('click', () => {
      setTargetCollapsed(!(header && header.classList.contains('hdr-target-collapsed')));
    });
  }

  if (menuCb && menuLbl) {
    menuCb.addEventListener('change', () => {
      menuLbl.textContent = menuCb.checked ? 'Close' : 'Menu';
    });
  }
  if (menuCb && actions) {
    actions.addEventListener('click', (e) => {
      if (e.target.closest('button, label')) menuCb.checked = false;
      if (menuLbl) menuLbl.textContent = 'Menu';
    });
  }
  const gutterBtn = $('btn-gutter');
  if (gutterBtn) {
    gutterBtn.addEventListener('click', () => {
      if (window.ComposerBridge) window.ComposerBridge.openGutter();
    });
  }
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.qasm-card,.qasm-lane-row');
    if (!card || !window.EditorGutter) return;
    const line = parseInt(card.dataset.line, 10);
    const app = $('app');
    const wantEditorOpen = !app || !app.classList.contains('show-editor');
    if (wantEditorOpen && window.ViewerTabs) {
      const active = window.ViewerTabs.readSections();
      if (!active.includes('editor')) {
        active.unshift('editor');
        window.ViewerTabs.setSections(active);
      }
    }
    const run = () => window.EditorGutter.scrollToLine(line);
    if (wantEditorOpen) requestAnimationFrame(run);
    else run();
  });
}

function initFleetUi() {
  if (!window.QPUFleet) return;
  const sel = $('backend');
  const detail = $('backend-detail');
  const filter = $('backend-filter');
  const sort = $('backend-sort');
  const suggestions = $('backend-filter-options');
  const saved = localStorage.getItem('composerIBM.backend') || 'ibm_torino';
  const savedSort = localStorage.getItem('composerIBM.backendSort') || 'q-desc';

  if (sort) sort.value = savedSort;
  if (suggestions && window.QPUFleet.searchSuggestions) {
    suggestions.innerHTML = '';
    window.QPUFleet.searchSuggestions().forEach((term) => {
      const opt = document.createElement('option');
      opt.value = term;
      suggestions.appendChild(opt);
    });
  }

  const populateBackendSelect = (selectedName) => {
    window.QPUFleet.populateSelect(sel, selectedName || sel.value || saved, {
      query: filter ? filter.value : '',
      sort: sort ? sort.value : 'q-desc'
    });
  };

  populateBackendSelect(saved);

  const syncBackend = () => {
    if (!sel.value) {
      if (detail) detail.textContent = 'No backend matches this filter';
      return;
    }
    if (detail) detail.textContent = window.QPUFleet.formatBackendDetail(sel.value);
    localStorage.setItem('composerIBM.backend', sel.value);
  };

  sel.addEventListener('change', () => {
    syncBackend();
    refreshAll();
  });

  if (filter) {
    let filterTimer;
    filter.addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        const prev = sel.value;
        populateBackendSelect(prev);
        syncBackend();
        if (sel.value && sel.value !== prev) refreshAll();
      }, 80);
    });
  }

  if (sort) {
    sort.addEventListener('change', () => {
      localStorage.setItem('composerIBM.backendSort', sort.value);
      const prev = sel.value;
      populateBackendSelect(prev);
      syncBackend();
    });
  }

  syncBackend();

  const btn = $('btn-fleet-list');
  if (btn) {
    btn.addEventListener('click', () => {
      window.QPUFleet.locationSummary().forEach((r) => {
        logMsg(
          `<span class="info">${r.tz} · ${r.hubCity}</span> <span class="info">${r.codex}</span> <span class="ok">${r.totalQ}q</span> <span class="info">(${r.count})</span>`,
          'info'
        );
      });
      logMsg('<span class="ok">Fleet</span> <span class="info">locations · UTC bands · north→south</span>', 'info');
    });
  }

  const codexBtn = $('btn-codex-map');
  if (codexBtn) {
    codexBtn.addEventListener('click', () => {
      const name = sel.value;
      const q = window.QPUFleet.getByName(name);
      const url = window.QPUFleet.codexMapUrl(name, 'globe');
      window.open(url, '_blank', 'noopener');
      if (q) {
        logMsg(
          `<span class="ok">Codex</span> <span class="info">${window.QPUFleet.codexSlotLabel(q)} · ${q.region}</span>`,
          'info'
        );
      } else {
        logMsg('<span class="ok">Codex</span> <span class="info">Quantum Geographic Codex · uvqbit</span>', 'info');
      }
    });
  }

  // Global World Lattice (new slice — entire quantum fleet + hops + latency)
  const worldBtn = $('btn-world-lattice');
  if (worldBtn) {
    worldBtn.addEventListener('click', () => {
      let panel = $('global-lattice-panel');
      if (!panel) {
        panel = root.document.createElement('div');
        panel.id = 'global-lattice-panel';
        panel.style.cssText = 'position:fixed;inset:40px 20px 60px;z-index:1200;background:#fff;border:1px solid #c8d4e3;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;';
        panel.innerHTML = `
          <div style="padding:8px 12px;border-bottom:1px solid #c8d4e3;display:flex;align-items:center;gap:8px;background:#f8fbff;font-size:11px;">
            <strong>Global Quantum Lattice</strong>
            <span style="color:#607087;">— all available systems, geographic hops & estimated latency (synthetic model from fleet geo + timezones)</span>
            <button id="close-global-lattice" style="margin-left:auto;padding:2px 8px;font-size:11px;">Close</button>
          </div>
          <div id="global-lattice-host" style="flex:1;padding:8px;background:#f8fbff;"></div>
          <div style="padding:6px 12px;font-size:9px;color:#607087;border-top:1px solid #c8d4e3;">
            Click nodes for details. Lines = same-vendor or major hub hops. Latency estimates are illustrative (great-circle + routing).
          </div>
        `;
        root.document.body.appendChild(panel);
        root.document.getElementById('close-global-lattice').onclick = () => panel.remove();

        // Initialize the beautiful global view
        if (root.GlobalLattice) {
          root.GlobalLattice.init('global-lattice-host');
        }
      } else {
        panel.remove();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  initHeaderMenu();
  initThemeToggle();
  initFleetUi();
  const saved = localStorage.getItem('composerIBM.lastQasm');
  $('qasm').value = saved || DEFAULT_QASM;
  await tryLoadWasm();
  await refreshAll();
  if (window.ComposerBridge) window.ComposerBridge.init();
  if (window.BlochPanel && window.BlochPanel.isOpen && window.BlochPanel.isOpen()) {
    window.BlochPanel.refresh();
  }
});
