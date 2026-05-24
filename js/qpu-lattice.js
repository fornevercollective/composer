/**
 * Top-down QPU lattice / coupling-map preview.
 * Uses backend metadata plus active QASM qubits to draw a lightweight heavy-hex style map.
 */
(function (root) {
  'use strict';

  function parseQasmMap(qasm) {
    const active = new Set();
    const edges = new Map();
    String(qasm || '')
      .split('\n')
      .forEach((raw) => {
        const line = raw.replace(/\/\/.*$/, '').trim();
        if (!line) return;
        const qs = [...line.matchAll(/\bq\[(\d+)\]/gi)].map((m) => +m[1]);
        qs.forEach((q) => active.add(q));
        if (qs.length > 1) {
          for (let i = 0; i < qs.length - 1; i++) {
            const a = Math.min(qs[i], qs[i + 1]);
            const b = Math.max(qs[i], qs[i + 1]);
            const key = `${a}-${b}`;
            edges.set(key, (edges.get(key) || 0) + 1);
          }
        }
      });
    return { active, edges };
  }

  function layoutFor(count, chip) {
    const q = Math.max(1, Math.min(count || 1, 180));
    const cols =
      /heron/i.test(chip || '') ? 17 : /eagle/i.test(chip || '') ? 15 : /flamingo|nighthawk/i.test(chip || '') ? 16 : Math.ceil(Math.sqrt(q * 1.35));
    const rows = Math.ceil(q / cols);
    const pts = [];
    for (let i = 0; i < q; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const gap = row % 2 ? 0.5 : 0;
      pts.push({
        id: i,
        col,
        row,
        x: col + gap,
        y: row * 0.86
      });
    }
    return { pts, cols, rows };
  }

  function generatedCouplers(pts, cols) {
    const byGrid = new Map(pts.map((p) => [`${p.row}:${p.col}`, p]));
    const links = [];
    pts.forEach((p) => {
      const right = byGrid.get(`${p.row}:${p.col + 1}`);
      if (right && p.col % 2 === p.row % 2) links.push([p.id, right.id, 'lattice']);
      const down = byGrid.get(`${p.row + 1}:${p.col}`);
      if (down && (p.col + p.row) % 3 !== 1) links.push([p.id, down.id, 'lattice']);
      const diag = byGrid.get(`${p.row + 1}:${p.col - (p.row % 2 ? 0 : 1)}`);
      if (diag && p.col % 3 === 0) links.push([p.id, diag.id, 'lattice']);
    });
    if (links.length < pts.length - 1) {
      for (let i = 0; i < pts.length - 1; i++) if (i % Math.max(2, Math.floor(cols / 5)) === 0) links.push([i, i + 1, 'lattice']);
    }
    return links;
  }

  function calibrationFor(name) {
    if (!root.QPUCalibrations || !name) return null;
    return root.QPUCalibrations.get(name);
  }

  function errorColor(err, scale) {
    if (!isFinite(err) || err <= 0) return '#9fd9b4';
    const t = Math.min(1, err / scale);
    const r = Math.round(64 + t * 191);
    const g = Math.round(196 - t * 140);
    const b = Math.round(132 - t * 80);
    return `rgb(${r},${g},${b})`;
  }

  function fmtErr(v) {
    if (!isFinite(v) || v === 0) return '0';
    if (v < 1e-4) return v.toExponential(2);
    return (v * 100).toFixed(3) + '%';
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString(undefined, { hour12: false });
  }

  function render(host, opts) {
    if (!host) return;
    const options = opts || {};
    const backend = options.backend || {};
    const qasm = options.qasm || '';
    const qCount = Math.max(1, backend.q || backend.qubits || options.qubitCount || 16);
    const map = parseQasmMap(qasm);
    const { pts } = layoutFor(qCount, backend.chip);
    const ptMap = new Map(pts.map((p) => [p.id, p]));
    const calibration = options.calibration || calibrationFor(backend.name);
    const calLinks = calibration && calibration.links ? calibration.links.map((l) => [l.a, l.b, 'cal', l]) : null;
    const couplers = calLinks && calLinks.length ? calLinks : generatedCouplers(pts, Math.ceil(Math.sqrt(qCount)));
    const activeEdges = Array.from(map.edges.keys()).map((key) => key.split('-').map(Number));
    const stats = calibration && calibration.stats ? calibration.stats : null;
    const errScale1q = stats ? Math.max(stats.worst_err_1q || 0, 0.0015) : 0.0015;
    const errScale2q = stats ? Math.max(stats.worst_err_2q || 0, 0.020) : 0.020;

    const ts = calibration ? calibration.ts : Date.now();
    const tsIso = calibration ? calibration.ts_iso : new Date(ts).toISOString();
    const statRow = stats
      ? `<span>1Q err med <strong>${fmtErr(stats.median_err_1q)}</strong></span>` +
        `<span>2Q err med <strong>${fmtErr(stats.median_err_2q)}</strong></span>` +
        `<span>readout med <strong>${fmtErr(stats.median_readout)}</strong></span>` +
        `<span>T1 med <strong>${isFinite(stats.median_t1_us) ? stats.median_t1_us + ' µs' : '∞'}</strong></span>` +
        `<span>T2 med <strong>${isFinite(stats.median_t2_us) ? stats.median_t2_us + ' µs' : '∞'}</strong></span>` +
        `<span>2Q dur med <strong>${stats.median_dur_2q_ns} ns</strong></span>` +
        `<span>paths <strong>${stats.link_count}</strong></span>`
      : '<span class="lat-cal-empty">no preloaded calibration</span>';

    host.innerHTML = `
      <div class="lat-cal" data-ts="${tsIso}">
        <div class="lat-cal-row">
          <span class="lat-cal-dot" aria-hidden="true"></span>
          <span class="lat-cal-label">CALIBRATION SNAPSHOT</span>
          <strong class="lat-cal-backend">${backend.name || 'backend'}</strong>
          <span class="lat-cal-vendor">${backend.vendor || ''}${backend.chip ? ' · ' + backend.chip : ''}</span>
          <span class="lat-cal-time" title="${tsIso}">${fmtTime(ts)}</span>
          <button type="button" class="lat-cal-refresh" data-action="refresh-cal" title="Re-roll preloaded calibration (new timestamp)">↻</button>
        </div>
        <div class="lat-cal-stats">${statRow}</div>
        <div class="lat-cal-actions">
          <button type="button" class="lat-cal-load" data-action="load-qasm" title="Load full preloaded lattice into the OpenQASM editor">Load lattice → QASM</button>
          <button type="button" class="lat-cal-load lat-cal-load-copy" data-action="copy-qasm" title="Copy lattice QASM to clipboard">Copy</button>
          <button type="button" class="lat-cal-load lat-cal-load-min" data-action="load-qasm-min" title="Load only the qubit/bit declarations + measurements">Load measure-all → QASM</button>
          <button type="button" class="lat-cal-load lat-cal-load-clear" data-action="clear-qasm" title="Restore OpenQASM editor to the default test starter">Clear</button>
        </div>
      </div>
      <div class="lat-head">
        <span>Coupling map · top view</span>
        <strong>${backend.name || 'backend'} · ${backend.chip || 'system'} · ${qCount}q</strong>
      </div>
      <canvas class="lat-canvas" width="720" height="320" aria-label="Top-down coupling map"></canvas>
      <div class="lat-legend">
        <span><i class="lat-dot online"></i>mapped QASM qubit</span>
        <span><i class="lat-dot idle"></i>device qubit</span>
        <span><i class="lat-line"></i>active QASM path</span>
        <span><i class="lat-line lat-line-err"></i>2Q err scale (green→red)</span>
        <span>${map.active.size}/${qCount} active · ${map.edges.size} QASM links</span>
      </div>
    `;

    const refreshBtn = host.querySelector('[data-action="refresh-cal"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (root.QPUCalibrations) {
          root.QPUCalibrations.refresh();
          if (backend.name) root.QPUCalibrations.publish(backend.name);
        }
        render(host, opts);
      });
    }
    const loadBtn = host.querySelector('[data-action="load-qasm"]');
    if (loadBtn) loadBtn.addEventListener('click', () => loadLatticeIntoEditor(backend, calibration, { full: true }));
    const loadMinBtn = host.querySelector('[data-action="load-qasm-min"]');
    if (loadMinBtn) loadMinBtn.addEventListener('click', () => loadLatticeIntoEditor(backend, calibration, { full: false }));
    const copyBtn = host.querySelector('[data-action="copy-qasm"]');
    if (copyBtn) copyBtn.addEventListener('click', () => copyLatticeQasm(backend, calibration));
    const clearBtn = host.querySelector('[data-action="clear-qasm"]');
    if (clearBtn) clearBtn.addEventListener('click', () => resetEditorToStarter());

    const canvas = host.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = 2;
    const w = canvas.clientWidth || 720;
    const h = canvas.clientHeight || 320;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const pad = 22;
    const sx = (w - pad * 2) / Math.max(1, maxX - minX);
    const sy = (h - pad * 2) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    const ox = (w - (maxX - minX) * s) / 2 - minX * s;
    const oy = (h - (maxY - minY) * s) / 2 - minY * s;
    const xy = (p) => ({ x: ox + p.x * s, y: oy + p.y * s });

    ctx.lineCap = 'round';
    couplers.forEach((edge) => {
      const a = edge[0];
      const b = edge[1];
      const linkMeta = edge[3];
      const pa = ptMap.get(a);
      const pb = ptMap.get(b);
      if (!pa || !pb) return;
      const A = xy(pa);
      const B = xy(pb);
      if (linkMeta && isFinite(linkMeta.err_2q)) {
        ctx.strokeStyle = errorColor(linkMeta.err_2q, errScale2q);
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = '#d7e2ef';
        ctx.lineWidth = 1;
      }
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    });

    activeEdges.forEach(([a, b]) => {
      const pa = ptMap.get(a);
      const pb = ptMap.get(b);
      if (!pa || !pb) return;
      const A = xy(pa);
      const B = xy(pb);
      ctx.strokeStyle = '#a9145c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    });

    const qubitMeta = calibration && calibration.qubits ? new Map(calibration.qubits.map((qq) => [qq.id, qq])) : null;
    pts.forEach((p) => {
      const P = xy(p);
      const isActive = map.active.has(p.id);
      const q = qubitMeta ? qubitMeta.get(p.id) : null;
      if (q && isFinite(q.err_1q)) {
        ctx.fillStyle = errorColor(q.err_1q, errScale1q);
      } else {
        ctx.fillStyle = isActive ? '#45b8e8' : '#f3f6fa';
      }
      ctx.strokeStyle = isActive ? '#0969da' : '#c8d4e3';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.beginPath();
      ctx.arc(P.x, P.y, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isActive || p.id % 16 === 0) {
        ctx.fillStyle = '#607087';
        ctx.font = '8px monospace';
        ctx.fillText(String(p.id), P.x + 6, P.y - 6);
      }
    });

    if (qubitMeta) {
      canvas.title = `${backend.name || ''}\n${qubitMeta.size} modeled qubits · ${couplers.length} paths\nsnapshot: ${tsIso}`;
    }
  }

  const MAX_QASM_QUBITS = 384;
  const MAX_QASM_CX = 768;

  function buildLatticeQasm(backend, calibration, opts) {
    const options = opts || {};
    const full = options.full !== false;
    const be = backend || {};
    const cal = calibration || (root.QPUCalibrations ? root.QPUCalibrations.get(be.name) : null);
    const declaredQ = (cal && cal.qubits_total) || be.q || be.qubits || 1;
    const capped = Math.min(declaredQ, MAX_QASM_QUBITS);
    const truncated = capped < declaredQ;

    const lines = [];
    lines.push('OPENQASM 3.0;');
    lines.push('include "stdgates.inc";');
    lines.push('');
    lines.push(`// composerIBM lattice preload · ${be.name || 'backend'} · ${be.vendor || ''}${be.chip ? ' · ' + be.chip : ''}`);
    if (cal) {
      const s = cal.stats || {};
      lines.push(`// snapshot ${cal.ts_iso} · ${cal.qubits_total}q · ${cal.links ? cal.links.length : 0} paths`);
      lines.push(`// median 1Q=${fmtErr(s.median_err_1q)} · median 2Q=${fmtErr(s.median_err_2q)} · median readout=${fmtErr(s.median_readout)}`);
      lines.push(`// median T1=${isFinite(s.median_t1_us) ? s.median_t1_us + 'us' : 'inf'} · median T2=${isFinite(s.median_t2_us) ? s.median_t2_us + 'us' : 'inf'}`);
    } else {
      lines.push('// (no preloaded calibration — falling back to fleet metadata)');
    }
    if (truncated) {
      lines.push(`// NOTE: full lattice has ${declaredQ} qubits; capped to ${capped} for editor safety`);
    }
    lines.push('');
    lines.push(`qubit[${capped}] q;`);
    lines.push(`bit[${capped}] c;`);
    lines.push('');

    if (full) {
      lines.push('// hadamard preface on q[0]');
      lines.push('h q[0];');
      lines.push('');

      let cxLinks = [];
      if (cal && cal.links && cal.links.length) {
        cxLinks = cal.links
          .filter((l) => l.a < capped && l.b < capped)
          .slice()
          .sort((x, y) => (x.err_2q || 0) - (y.err_2q || 0));
      } else {
        const { pts } = layoutFor(capped, be.chip);
        cxLinks = generatedCouplers(pts, Math.ceil(Math.sqrt(capped))).map(([a, b]) => ({ a, b }));
      }
      const cxCapped = cxLinks.slice(0, MAX_QASM_CX);
      lines.push(`// ${cxCapped.length}/${cxLinks.length} entangling ops along preloaded coupler graph (sorted by 2Q error asc)`);
      cxCapped.forEach((l) => {
        const gate = (l.gate || 'cx').toLowerCase();
        const errTag = isFinite(l.err_2q) ? `  // 2Q=${fmtErr(l.err_2q)}` : '';
        lines.push(`${gate} q[${l.a}], q[${l.b}];${errTag}`);
      });
      if (cxLinks.length > cxCapped.length) {
        lines.push(`// NOTE: ${cxLinks.length - cxCapped.length} additional 2Q ops omitted (cap ${MAX_QASM_CX})`);
      }
      lines.push('');
      lines.push('barrier q;');
      lines.push('');
    }

    lines.push(`// measure all ${capped} qubits into c[0..${capped - 1}]`);
    for (let i = 0; i < capped; i++) {
      lines.push(`c[${i}] = measure q[${i}];`);
    }
    lines.push('');
    return lines.join('\n');
  }

  function loadLatticeIntoEditor(backend, calibration, opts) {
    const qasm = buildLatticeQasm(backend, calibration, opts);
    if (root.ComposerCore && typeof root.ComposerCore.setQasm === 'function') {
      root.ComposerCore.setQasm(qasm);
      if (typeof root.ComposerCore.log === 'function') {
        const cnt = (calibration && calibration.qubits_total) || (backend && backend.q) || 0;
        root.ComposerCore.log(
          `<span class="ok">Loaded ${backend && backend.name} lattice (${cnt}q)</span> → OpenQASM editor`,
          'ok'
        );
      }
      if (root.ViewerTabs && typeof root.ViewerTabs.readSections === 'function') {
        const active = root.ViewerTabs.readSections();
        if (!active.includes('editor')) {
          active.unshift('editor');
          root.ViewerTabs.setSections(active);
        }
      }
    } else {
      const ta = document.getElementById('qasm');
      if (ta) ta.value = qasm;
    }
  }

  function resetEditorToStarter() {
    const core = root.ComposerCore;
    const starter = core && core.DEFAULT_QASM;
    if (!core || typeof core.setQasm !== 'function' || !starter) {
      const ta = document.getElementById('qasm');
      if (ta && starter) ta.value = starter;
      return;
    }
    core.setQasm(starter);
    if (typeof core.log === 'function') {
      core.log('<span class="info">Cleared OpenQASM editor → restored test starter</span>', 'info');
    }
    if (root.ViewerTabs && typeof root.ViewerTabs.readSections === 'function') {
      const active = root.ViewerTabs.readSections();
      if (!active.includes('editor')) {
        active.unshift('editor');
        root.ViewerTabs.setSections(active);
      }
    }
  }

  function copyLatticeQasm(backend, calibration) {
    const qasm = buildLatticeQasm(backend, calibration, { full: true });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(qasm).then(() => {
        if (root.ComposerCore && root.ComposerCore.log) {
          root.ComposerCore.log(`<span class="ok">Copied lattice QASM</span> · ${backend && backend.name}`, 'ok');
        }
      });
    }
  }

  root.QPULattice = {
    render,
    parseQasmMap,
    layoutFor,
    buildLatticeQasm,
    loadLatticeIntoEditor
  };
})(typeof window !== 'undefined' ? window : globalThis);
