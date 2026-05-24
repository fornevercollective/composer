/**
 * Editor quantum gutter — UI overlay only; never appended to #qasm value on export/sim.
 */
(function () {
  'use strict';

  const LINE_HEIGHT = 1.45;

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

  function $(id) {
    return document.getElementById(id);
  }

  function qg() {
    return typeof window !== 'undefined' ? window.QasmGutter : null;
  }

  function prefixMeta(category) {
    const Q = qg();
    if (Q && typeof Q.prefixMeta === 'function') return Q.prefixMeta(category);
    return PREFIX_META[category] || PREFIX_META.other;
  }

  function analyzeSource(text) {
    const Q = qg();
    if (Q && typeof Q.analyzeSource === 'function') return Q.analyzeSource(text);
    const lines = String(text || '').split('\n');
    return {
      lines: lines.map((ln, i) => {
        const c = Q && typeof Q.classifyLine === 'function' ? Q.classifyLine(ln) : null;
        if (c) return { lineNo: i + 1, ...c };
        const cat = ln.trim() ? 'misc' : 'blank';
        return { lineNo: i + 1, category: cat, sym: ' ', line: ln };
      }),
      coverage: 0,
      totalLines: lines.length
    };
  }

  function coverageSummary(analysis) {
    const Q = qg();
    if (Q && typeof Q.coverageSummary === 'function') return Q.coverageSummary(analysis);
    const classified = analysis.lines.filter((c) => c.category !== 'blank').length;
    return {
      text: `${classified}/${analysis.totalLines} classified · ${analysis.coverage || 0}% coverage`
    };
  }

  function buildRow(lineNo, classified) {
    const meta = prefixMeta(classified.category);
    const row = document.createElement('div');
    row.className = 'qg-row';
    row.dataset.line = String(lineNo);
    row.innerHTML =
      `<span class="qg-n">${String(lineNo).padStart(3, ' ')}</span>` +
      `<span class="qg-p ${meta.cls}">${meta.label}</span>`;
    return row;
  }

  function render(text) {
    const gutter = $('qg-gutter');
    const cov = $('qg-coverage');
    if (!gutter) return null;

    const analysis = analyzeSource(text);
    const frag = document.createDocumentFragment();
    analysis.lines.forEach((c) => {
      frag.appendChild(buildRow(c.lineNo, c));
    });
    gutter.innerHTML = '';
    gutter.appendChild(frag);

    if (cov) {
      const s = coverageSummary(analysis);
      cov.textContent = s.text;
      cov.classList.toggle('qg-cov-ok', (analysis.coverage || 0) >= 70);
    }

    return analysis;
  }

  function syncScroll() {
    const ta = $('qasm');
    const gutter = $('qg-gutter');
    if (!ta || !gutter) return;
    gutter.scrollTop = ta.scrollTop;
  }

  function lineOffset(lines, n) {
    let pos = 0;
    for (let i = 0; i < n && i < lines.length; i++) pos += lines[i].length + 1;
    return pos;
  }

  function sectionRange(analysis, lineNo) {
    const arr = analysis && analysis.lines ? analysis.lines : [];
    const idx = arr.findIndex((c) => c.lineNo === lineNo);
    if (idx < 0) return { start: lineNo, end: lineNo };
    const cat = arr[idx].category;
    let s = idx;
    let e = idx;
    while (s > 0 && arr[s - 1].category === cat) s--;
    while (e < arr.length - 1 && arr[e + 1].category === cat) e++;
    return { start: arr[s].lineNo, end: arr[e].lineNo };
  }

  function scrollToLine(lineNo) {
    const ta = $('qasm');
    if (!ta) return;
    const lines = ta.value.split('\n');
    const analysis = analyzeSource(ta.value);
    const range = sectionRange(analysis, lineNo);
    const startPos = lineOffset(lines, range.start - 1);
    const endPos = lineOffset(lines, range.end - 1) + (lines[range.end - 1] || '').length;
    ta.focus();
    ta.setSelectionRange(startPos, endPos);
    const style = getComputedStyle(ta);
    const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * LINE_HEIGHT;
    ta.scrollTop = Math.max(0, (range.start - 1) * lh - ta.clientHeight / 3);
    syncScroll();
    const gutter = $('qg-gutter');
    if (gutter) {
      gutter.querySelectorAll('.qg-row.is-active').forEach((r) => r.classList.remove('is-active'));
      for (let n = range.start; n <= range.end; n++) {
        const row = gutter.querySelector(`.qg-row[data-line="${n}"]`);
        if (row) row.classList.add('is-active');
      }
    }
  }

  function bind() {
    const ta = $('qasm');
    const gutter = $('qg-gutter');
    if (!ta || !gutter) return;

    ta.addEventListener('scroll', syncScroll, { passive: true });
    ta.addEventListener('input', () => render(ta.value));

    gutter.addEventListener('click', (e) => {
      const row = e.target.closest('.qg-row');
      if (!row) return;
      scrollToLine(parseInt(row.dataset.line, 10));
    });

    render(ta.value);
  }

  function getExportText() {
    const ta = $('qasm');
    return ta ? ta.value : '';
  }

  window.EditorGutter = { render, bind, syncScroll, scrollToLine, getExportText };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
