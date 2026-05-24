/**
 * OpenQASM line gutter — 11-symbol prefix lane (aligned with quantum-prefixes / μgrad).
 */
(function (root) {
  'use strict';

  const SYM = {
    shebang: 'n',
    comment: '+1',
    include: '-n',
    qubit: '+0',
    bit: '0',
    gate: '+2',
    measure: '+3',
    barrier: '1',
    control: '-1',
    reset: '-0',
    misc: '1',
    other: ' ',
    blank: ' '
  };

  const PREFIX_META = {
    shebang: { label: 'n:', cls: 'qg-shebang' },
    comment: { label: '+1:', cls: 'qg-comment' },
    include: { label: '-n:', cls: 'qg-include' },
    qubit: { label: '+0:', cls: 'qg-qubit' },
    bit: { label: '0:', cls: 'qg-bit' },
    gate: { label: '+2:', cls: 'qg-gate' },
    measure: { label: '+3:', cls: 'qg-measure' },
    barrier: { label: '1:', cls: 'qg-barrier' },
    control: { label: '-1:', cls: 'qg-control' },
    reset: { label: '-0:', cls: 'qg-reset' },
    misc: { label: '1:', cls: 'qg-misc' },
    blank: { label: '·', cls: 'qg-blank' }
  };

  const PREFIX_CARD = {
    shebang: { title: 'Instruction Cache', metric: 'entry', color: '#f97066' },
    comment: { title: 'Comment Phase', metric: 'context', color: '#3fb950' },
    include: { title: 'Load / Store', metric: 'import', color: '#8b5cf6' },
    qubit: { title: 'Quantum Register', metric: 'qbit', color: '#14b8a6' },
    bit: { title: 'Classical Register', metric: 'bit', color: '#0969da' },
    gate: { title: 'Processing Core', metric: 'gate', color: '#58a6ff' },
    measure: { title: 'L2 / Output', metric: 'readout', color: '#d4a72c' },
    barrier: { title: 'Register Fence', metric: 'sync', color: '#6b7280' },
    control: { title: 'Warp Scheduler', metric: 'branch', color: '#f97316' },
    reset: { title: 'L1 / Reset', metric: 'clear', color: '#ec4899' },
    misc: { title: 'Unclassified', metric: 'misc', color: '#94a3b8' },
    blank: { title: 'Blank', metric: 'space', color: '#cbd5e1' }
  };

  const GATE_NAMES =
    'cx|cz|ch|ccx|cp|crx|cry|crz|cu|cu1|cu2|cu3|swap|iswap|dcx|ecr|rxx|ryy|rzz|rccx|rzx|' +
    'h|x|y|z|s|sdg|t|tdg|sx|rx|ry|rz|u|u1|u2|u3|p|id';

  const GATE_RX = new RegExp('\\b(' + GATE_NAMES + ')\\b', 'i');
  const GATE_LINE_RX = new RegExp('^(' + GATE_NAMES + ')\\s*(\\([^)]*\\))?\\s+q\\[', 'i');
  const GATE_ANY_RX = new RegExp('\\b(' + GATE_NAMES + ')\\s*(\\([^)]*\\))?\\s+q\\[', 'i');

  function prefixMeta(category) {
    return PREFIX_META[category] || PREFIX_META.misc;
  }

  function prefixCard(category) {
    return PREFIX_CARD[category] || PREFIX_CARD.misc;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function splitCodeComment(line) {
    let inStr = false;
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inStr) {
        if (c === q && line[i - 1] !== '\\') inStr = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = true;
        q = c;
        continue;
      }
      if (c === '/' && line[i + 1] === '/') {
        return { code: line.slice(0, i).trim(), comment: line.slice(i).trim() };
      }
    }
    return { code: line.trim(), comment: '' };
  }

  function classifyLine(line) {
    const raw = line.trim();
    if (!raw) return { sym: SYM.blank, category: 'blank', line };

    if (/^\s*\/\//.test(raw)) {
      return { sym: SYM.comment, category: 'comment', line };
    }

    const { code, comment } = splitCodeComment(raw);
    if (!code && comment) {
      return { sym: SYM.comment, category: 'comment', line };
    }
    if (!code) return { sym: SYM.blank, category: 'blank', line };

    const t = code;

    if (/^OPENQASM\b/i.test(t)) return { sym: SYM.shebang, category: 'shebang', line };
    if (/^include\b/i.test(t)) return { sym: SYM.include, category: 'include', line };
    if (/^(def|input|output)\b/i.test(t)) return { sym: SYM.include, category: 'include', line };

    if (/=\s*measure\b/i.test(t) || /^measure\s+/i.test(t) || /\bmeasure\s+q\[/i.test(t)) {
      return { sym: SYM.measure, category: 'measure', line };
    }

    if (/^reset\b/i.test(t) || /\breset\s+q\[/i.test(t)) {
      return { sym: SYM.reset, category: 'reset', line };
    }
    if (/^barrier\b/i.test(t) || /\bbarrier\s+/i.test(t)) {
      return { sym: SYM.barrier, category: 'barrier', line };
    }

    if (/^if\s*\(/i.test(t) || /^else\b/i.test(t) || /\bfor\s*\(/i.test(t)) {
      return { sym: SYM.control, category: 'control', line };
    }

    if (/^(qubit|qreg)\b/i.test(t)) return { sym: SYM.qubit, category: 'qubit', line };
    if (/^(bit|creg)\b/i.test(t)) return { sym: SYM.bit, category: 'bit', line };

    if (/^(gate|opaque)\b/i.test(t)) return { sym: SYM.gate, category: 'gate', line };
    if (GATE_LINE_RX.test(t) || GATE_ANY_RX.test(t)) {
      return { sym: SYM.gate, category: 'gate', line };
    }

    if (/^[a-z_][\w]*\s*\([^)]*\)\s+q\[/i.test(t)) {
      return { sym: SYM.gate, category: 'gate', line };
    }

    if (/^[a-z_][\w]*\s*\[/.test(t) && /=/.test(t) && !/measure/.test(t)) {
      return { sym: SYM.bit, category: 'bit', line };
    }

    if (/^(box|delay|stretch|pulse|cal)\b/i.test(t)) {
      return { sym: SYM.gate, category: 'gate', line };
    }

    if (GATE_RX.test(t) && /\bq\[/.test(t)) {
      return { sym: SYM.gate, category: 'gate', line };
    }

    if (/^\/\//.test(comment) || comment) {
      return { sym: SYM.comment, category: 'comment', line };
    }

    if (/^[{}]\s*;?\s*$/.test(t)) return { sym: SYM.control, category: 'control', line };

    return { sym: SYM.misc, category: 'misc', line };
  }

  function analyzeSource(text) {
    const lines = String(text || '').split('\n');
    const counts = {};
    const classified = lines.map((ln, i) => {
      const c = classifyLine(ln);
      counts[c.category] = (counts[c.category] || 0) + 1;
      return { lineNo: i + 1, ...c };
    });
    const meaningful = classified.filter((c) => c.category !== 'blank' && c.category !== 'misc');
    const coverage = lines.length ? Math.round((meaningful.length / lines.length) * 100) : 0;
    return { lines: classified, counts, coverage, totalLines: lines.length };
  }

  function renderGutterHtml(analysis, maxLines) {
    const slice = analysis.lines.slice(0, maxLines || 80);
    return slice
      .map((c) => {
        const pad = String(c.lineNo).padStart(3, ' ');
        const meta = prefixMeta(c.category);
        return (
          `<span class="g-line"><span class="g-n">${pad}</span> ` +
          `<span class="g-p ${meta.cls}">${meta.label}</span></span>`
        );
      })
      .join('\n');
  }

  const GROUP_ORDER = ['shebang', 'include', 'qubit', 'bit', 'gate', 'measure', 'barrier', 'control', 'reset', 'comment', 'misc'];

  function cardButtonHtml(c) {
    const meta = prefixMeta(c.category);
    const card = prefixCard(c.category);
    const code = escapeHtml(c.line.trim()).slice(0, 160);
    return (
      `<button type="button" class="qasm-card" data-line="${c.lineNo}" data-category="${c.category}" style="--qg-card:${card.color}">` +
      `<span class="qasm-card-prefix ${meta.cls}">${meta.label}</span>` +
      `<span class="qasm-card-main">` +
      `<strong>${card.title}</strong>` +
      `<code>${code || '&nbsp;'}</code>` +
      `</span>` +
      `<span class="qasm-card-meta">L${c.lineNo}<br>${card.metric}</span>` +
      `</button>`
    );
  }

  function renderGutterLaneHtml(analysis, maxLines) {
    const cap = maxLines || 32;
    const rows = analysis.lines.slice(0, cap);
    if (!rows.length) return '';
    const body = rows
      .map((c) => {
        const meta = prefixMeta(c.category);
        const pad = String(c.lineNo).padStart(3, ' ');
        const dim = c.category === 'blank' ? ' qasm-lane-blank' : '';
        return (
          `<div class="qasm-lane-row${dim}" data-line="${c.lineNo}" data-category="${c.category}">` +
          `<span class="qg-n">${pad}</span>` +
          `<span class="qg-p ${meta.cls}">${meta.label}</span>` +
          `</div>`
        );
      })
      .join('');
    const more = analysis.totalLines > cap
      ? `<div class="qasm-lane-more">+ ${analysis.totalLines - cap} more lines…</div>`
      : '';
    return (
      `<div class="qasm-gutter-lane" aria-label="Gutter lane (matches OpenQASM editor)">` +
      `<div class="qasm-lane-hd"><span>Gutter lane</span><span class="qasm-lane-hd-meta">${analysis.totalLines} lines</span></div>` +
      `<div class="qasm-lane-rows">${body}${more}</div>` +
      `</div>`
    );
  }

  function renderGutterCardsHtml(analysis, maxLines) {
    const slice = analysis.lines
      .filter((c) => c.category !== 'blank')
      .slice(0, maxLines || 24);
    if (!slice.length) return '<div class="qasm-card-empty">No classified QASM lines yet.</div>';
    return renderGutterLaneHtml(analysis, 32) + slice.map(cardButtonHtml).join('');
  }

  function renderGutterGroupedHtml(analysis, maxPerGroup) {
    const capPer = maxPerGroup || 12;
    const meaningful = analysis.lines.filter((c) => c.category !== 'blank');
    if (!meaningful.length) return '<div class="qasm-card-empty">No classified QASM lines yet.</div>';
    const buckets = new Map();
    meaningful.forEach((c) => {
      if (!buckets.has(c.category)) buckets.set(c.category, []);
      buckets.get(c.category).push(c);
    });
    const presentCats = GROUP_ORDER.filter((cat) => buckets.has(cat));
    Array.from(buckets.keys()).forEach((cat) => {
      if (!presentCats.includes(cat)) presentCats.push(cat);
    });
    const sections = presentCats.map((cat) => {
      const items = buckets.get(cat) || [];
      const meta = prefixMeta(cat);
      const card = prefixCard(cat);
      const shown = items.slice(0, capPer);
      const overflow = items.length > shown.length ? items.length - shown.length : 0;
      const linesAttr = items.map((c) => c.lineNo).join(',');
      const cards = shown.map(cardButtonHtml).join('');
      return (
        `<details class="qasm-card-group" data-category="${cat}" data-lines="${linesAttr}" style="--qg-card:${card.color}" open>` +
        `<summary class="qasm-card-group-hd">` +
        `<span class="qasm-card-group-prefix ${meta.cls}">${meta.label}</span>` +
        `<strong>${card.title}</strong>` +
        `<span class="qasm-card-group-meta">${items.length} line${items.length === 1 ? '' : 's'}</span>` +
        `</summary>` +
        `<div class="qasm-card-group-body">${cards}` +
        (overflow ? `<div class="qasm-card-group-more">+ ${overflow} more…</div>` : '') +
        `</div>` +
        `</details>`
      );
    }).join('');
    return renderGutterLaneHtml(analysis, 32) + sections;
  }

  function coverageSummary(analysis) {
    const meaningful = analysis.lines.filter((c) => c.category !== 'blank' && c.category !== 'misc');
    return {
      classified: meaningful.length,
      total: analysis.totalLines,
      coverage: analysis.coverage,
      text: `${meaningful.length}/${analysis.totalLines} classified · ${analysis.coverage}% coverage`
    };
  }

  const api = {
    classifyLine,
    analyzeSource,
    renderGutterHtml,
    renderGutterCardsHtml,
    renderGutterGroupedHtml,
    renderGutterLaneHtml,
    prefixMeta,
    prefixCard,
    coverageSummary,
    SYM,
    PREFIX_META
  };

  if (typeof window !== 'undefined') window.QasmGutter = api;
  if (typeof globalThis !== 'undefined') globalThis.QasmGutter = api;
  root.QasmGutter = api;
})(typeof window !== 'undefined' ? window : globalThis);
