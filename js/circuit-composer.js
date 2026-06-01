/**
 * Lightweight visual circuit composer for the lane panel.
 * It keeps QASM as the source of truth and appends visual edits before measures.
 */
(function (root) {
  'use strict';

  const GATES = [
    { id: 'h', label: 'H', kind: 'hot', group: 'hadamard', name: 'Hadamard superposition' },
    { id: 'x', label: 'X', kind: 'blue', group: 'phase', name: 'Pauli X' },
    { id: 'y', label: 'Y', kind: 'magenta', group: 'phase', name: 'Pauli Y' },
    { id: 'z', label: 'Z', kind: 'blue', group: 'phase', name: 'Pauli Z phase flip' },
    { id: 'sx', label: '√X', kind: 'magenta', group: 'phase', name: 'Square-root X' },
    { id: 'rx', label: 'RX', kind: 'magenta', group: 'phase', name: 'Rotate X' },
    { id: 'ry', label: 'RY', kind: 'magenta', group: 'phase', name: 'Rotate Y' },
    { id: 'rz', label: 'RZ', kind: 'blue', group: 'phase', name: 'Rotate Z phase' },
    { id: 'p', label: 'P', kind: 'blue', group: 'phase', name: 'Phase gate' },
    { id: 'cx', label: '⊕', kind: 'blue', group: 'modifier', name: 'Controlled X modifier' },
    { id: 'rxx', label: 'XX', kind: 'magenta', group: 'modifier', name: 'RXX entangler' },
    { id: 'rzz', label: 'ZZ', kind: 'magenta', group: 'modifier', name: 'RZZ phase entangler' },
    { id: 'rccx', label: 'CCX', kind: 'magenta', group: 'modifier', name: 'RCCX modifier' },
    { id: 'rc3x', label: 'C3X', kind: 'magenta', group: 'modifier', name: 'RC3X modifier' },
    { id: 'barrier', label: '│', kind: 'gray', group: 'classical', name: 'Barrier / fence' },
    { id: 'reset', label: 'R', kind: 'gray', group: 'nonunitary', name: 'Reset non-unitary' },
    { id: 'measure', label: 'M', kind: 'gray', group: 'nonunitary', name: 'Measure to classical bit' }
  ];
  let activeGate = 'h';

  function stripComment(line) {
    return String(line || '').replace(/\/\/.*$/, '').trim();
  }

  function qubitCount(qasm, fallback) {
    const q3 = qasm.match(/\bqubit\s*\[(\d+)\]\s+q\s*;/i);
    if (q3) return +q3[1];
    const q2 = qasm.match(/\bqreg\s+q\s*\[(\d+)\]\s*;/i);
    if (q2) return +q2[1];
    return Math.max(1, fallback || 2);
  }

  function parseOps(qasm) {
    const ops = [];
    qasm.split('\n').forEach((raw, lineIndex) => {
      const line = stripComment(raw);
      if (!line) return;
      line.split(';').map((s) => s.trim()).filter(Boolean).forEach((stmt) => {
        let m = stmt.match(/^c\[(\d+)\]\s*=\s*measure\s+q\[(\d+)\]\s*$/i) || stmt.match(/^measure\s+q\[(\d+)\]\s*->\s*c\[(\d+)\]\s*$/i);
        if (m) {
          const q = stmt.includes('=') ? +m[2] : +m[1];
          ops.push({ gate: 'measure', q: [q], lineIndex });
          return;
        }
        m = stmt.match(/^([a-z][\w]*)\s*(\([^)]*\))?\s+(.+)$/i);
        if (m) {
          const qs = [...m[3].matchAll(/\bq\[(\d+)\]/gi)].map((hit) => +hit[1]);
          if (qs.length) ops.push({ gate: m[1].toLowerCase(), param: m[2] || '', q: qs, lineIndex });
        }
      });
    });
    return ops;
  }

  function setRegisterSize(qasm, n) {
    let out = qasm;
    if (/\bqubit\s*\[\d+\]\s+q\s*;/i.test(out)) out = out.replace(/\bqubit\s*\[\d+\]\s+q\s*;/i, `qubit[${n}] q;`);
    else if (/\bqreg\s+q\s*\[\d+\]\s*;/i.test(out)) out = out.replace(/\bqreg\s+q\s*\[\d+\]\s*;/i, `qreg q[${n}];`);
    else out = `qubit[${n}] q;\n` + out;

    if (/\bbit\s*\[\d+\]\s+c\s*;/i.test(out)) out = out.replace(/\bbit\s*\[\d+\]\s+c\s*;/i, `bit[${n}] c;`);
    else if (/\bcreg\s+c\s*\[\d+\]\s*;/i.test(out)) out = out.replace(/\bcreg\s+c\s*\[\d+\]\s*;/i, `creg c[${n}];`);
    else out = out.replace(/(qubit\s*\[\d+\]\s+q\s*;|qreg\s+q\s*\[\d+\]\s*;)/i, `$1\nbit[${n}] c;`);
    return out;
  }

  function insertBeforeMeasures(qasm, stmt) {
    const lines = qasm.split('\n');
    const idx = lines.findIndex((line) => /\bmeasure\b/i.test(stripComment(line)));
    const insertAt = idx >= 0 ? idx : Math.max(0, lines.length - 1);
    lines.splice(insertAt, 0, stmt);
    return lines.join('\n');
  }

  function statementFor(gate, q, n) {
    if (gate === 'measure') return `c[${q}] = measure q[${q}];`;
    if (gate === 'reset') return `reset q[${q}];`;
    if (gate === 'barrier') return `barrier q[${q}];`;
    if (gate === 'rz') return `rz(1.5708) q[${q}];`;
    if (gate === 'rx' || gate === 'ry' || gate === 'p') return `${gate}(1.5708) q[${q}];`;
    if (gate === 'rxx' || gate === 'rzz' || gate === 'cx' || gate === 'cz') {
      const target = q + 1 < n ? q + 1 : Math.max(0, q - 1);
      if (target === q) return `h q[${q}];`;
      if (gate === 'rxx' || gate === 'rzz') return `${gate}(1.5708) q[${q}], q[${target}];`;
      return `${gate} q[${q}], q[${target}];`;
    }
    if (gate === 'rccx' || gate === 'rc3x') {
      const qs = [q, q + 1, q + 2].map((x) => (x < n ? x : x - n)).filter((x, i, a) => a.indexOf(x) === i);
      if (qs.length < 3) return `h q[${q}];`;
      return `${gate} ${qs.map((x) => `q[${x}]`).join(', ')};`;
    }
    return `${gate} q[${q}];`;
  }

  function editQasm(qasm, action) {
    const n = qubitCount(qasm, 2);
    if (action.type === 'add-qubit') return setRegisterSize(qasm, n + 1);
    if (action.type === 'insert') return insertBeforeMeasures(qasm, statementFor(action.gate, action.q, n));
    if (action.type === 'delete') {
      const lines = qasm.split('\n');
      const idx = lines.findIndex((l, i) => i === action.lineIndex);
      if (idx >= 0) lines.splice(idx, 1);
      return lines.join('\n');
    }
    if (action.type === 'update-param' && action.lineIndex != null) {
      const lines = qasm.split('\n');
      let line = lines[action.lineIndex] || '';
      line = line.replace(/(\w+)\s*\([^)]*\)/, `$1(${action.param})`);
      lines[action.lineIndex] = line;
      return lines.join('\n');
    }
    if (action.type === 'reorder' && Array.isArray(action.newOps)) {
      // Rebuild QASM from new ordered ops (keeps comments and non-op lines where possible)
      const lines = qasm.split('\n');
      const nonOpLines = lines.filter(l => !/^\s*(h|x|y|z|rx|ry|rz|p|sx|cx|rxx|rzz|barrier|reset|measure)/i.test(l.replace(/\/\/.*$/,'').trim()));
      const newQasmLines = [...nonOpLines];
      action.newOps.forEach(op => {
        newQasmLines.push(statementFor(op.gate, op.q[0], n)); // simplified
      });
      return newQasmLines.join('\n');
    }
    return qasm;
  }

  function cellClass(op, qi) {
    if (!op) return 'cc-cell';
    if (op.gate === 'measure' && op.q[0] === qi) return 'cc-cell measure';
    if (op.q.length > 1) {
      const min = Math.min(...op.q);
      const max = Math.max(...op.q);
      if (op.q[0] === qi && (op.gate === 'cx' || op.gate === 'cz')) return 'cc-cell control multi';
      if (op.q.includes(qi)) return `cc-cell gate multi g-${op.gate}`;
      if (qi > min && qi < max) return 'cc-cell wire bridge';
    }
    if (op.q.includes(qi)) return `cc-cell gate g-${op.gate}`;
    return 'cc-cell wire';
  }

  function cellText(op, qi) {
    if (!op) return '+';
    if (op.gate === 'measure' && op.q[0] === qi) return 'M';
    if ((op.gate === 'cx' || op.gate === 'cz') && op.q[0] === qi) return '●';
    if (op.q.length > 1 && op.q.includes(qi)) {
      const mid = op.q[Math.floor(op.q.length / 2)];
      if (qi === mid) return op.gate.toUpperCase();
      return String.fromCharCode(97 + Math.max(0, op.q.indexOf(qi)));
    }
    if (op.q[0] === qi) return op.gate.toUpperCase();
    return '─';
  }

  function gateDef(id) {
    return GATES.find((g) => g.id === id) || GATES[0];
  }

  function renderGateGroups() {
    const groups = [
      ['hadamard', 'H'],
      ['phase', 'Phase'],
      ['modifier', 'Mod'],
      ['classical', 'Classical'],
      ['nonunitary', 'Read']
    ];
    return groups
      .map(([group, label]) => {
        const gates = GATES.filter((g) => g.group === group);
        if (!gates.length) return '';
        return (
          `<div class="cc-op-group cc-op-group-${group}" aria-label="${label} operations">` +
          `<span class="cc-op-group-label">${label}</span>` +
          `<div class="cc-op-group-row">` +
          gates
            .map((g) => `<button type="button" class="cc-op cc-op-${g.kind} cc-group-${g.group}${g.id === activeGate ? ' active' : ''}" data-gate="${g.id}" title="${g.name}">${g.label}</button>`)
            .join('') +
          `</div>` +
          `</div>`
        );
      })
      .join('');
  }

  function render(host, qasm, stats, onChange) {
    if (!host) return;
    const n = qubitCount(qasm, stats && stats.qubitCount);
    const wires = Math.min(n, 12);
    const ops = parseOps(qasm).slice(0, 32);
    const cols = Math.max(ops.length + 2, 8);
    host.innerHTML = '';
    host.classList.add('circuit-composer');

    const shell = document.createElement('div');
    shell.className = 'cc-shell';
    host.appendChild(shell);

    const palette = document.createElement('aside');
    palette.className = 'cc-palette';
    palette.innerHTML = `
      <button type="button" class="cc-scroll cc-scroll-left" aria-label="Scroll gates left">‹</button>
      <button type="button" class="cc-add-q cc-add-q-palette" title="Add qubit">+</button>
      <div class="cc-gates">
        ${renderGateGroups()}
      </div>
      <span class="cc-hint">selected: ${gateDef(activeGate).label}</span>
      <button type="button" class="cc-scroll cc-scroll-right" aria-label="Scroll gates right">›</button>
    `;
    shell.appendChild(palette);
    const gates = palette.querySelector('.cc-gates');
    palette.querySelector('.cc-scroll-left').addEventListener('click', () => gates.scrollBy({ left: -180, behavior: 'smooth' }));
    palette.querySelector('.cc-scroll-right').addEventListener('click', () => gates.scrollBy({ left: 180, behavior: 'smooth' }));
    palette.querySelector('.cc-add-q').addEventListener('click', () => onChange(editQasm(qasm, { type: 'add-qubit' })));
    palette.querySelectorAll('.cc-op').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeGate = btn.dataset.gate;
        render(host, qasm, stats, onChange);
      });
    });

    const workspace = document.createElement('section');
    workspace.className = 'cc-workspace';
    workspace.innerHTML = `
      <div class="cc-toolbar">
        <button type="button" class="cc-tool" title="Undo">↶</button>
        <button type="button" class="cc-tool muted" title="Redo">↷</button>
        <span class="cc-align">Left alignment</span>
        <span class="cc-spacer"></span>
      </div>
    `;
    shell.appendChild(workspace);

    const gridWrap = document.createElement('div');
    gridWrap.className = 'cc-grid-wrap';
    workspace.appendChild(gridWrap);
    const grid = document.createElement('div');
    grid.className = 'cc-grid';
    grid.style.gridTemplateColumns = `4.5rem repeat(${cols}, minmax(3.4rem, 4.2rem))`;
    gridWrap.appendChild(grid);

    for (let qi = 0; qi < wires; qi++) {
      const label = document.createElement('div');
      label.className = 'cc-label';
      label.textContent = `q[${qi}]`;
      grid.appendChild(label);
      for (let ci = 0; ci < cols; ci++) {
        const op = ops[ci] || null;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = cellClass(op, qi);
        cell.textContent = cellText(op, qi);
        cell.title = op ? `${op.gate} q[${op.q.join('], q[')}]` : `add ${activeGate.toUpperCase()} on q[${qi}]`;

        if (!op) {
          cell.addEventListener('click', () => onChange(editQasm(qasm, { type: 'insert', gate: activeGate, q: qi })));
        } else {
          // Delete with Shift+click
          cell.addEventListener('click', (e) => {
            if (e.shiftKey && op.lineIndex != null) {
              onChange(editQasm(qasm, { type: 'delete', lineIndex: op.lineIndex }));
            } else if (op.param && op.lineIndex != null) {
              const current = (op.param || '').replace(/[()]/g, '');
              const newVal = prompt(`Edit ${op.gate} param (radians)`, current);
              if (newVal !== null) {
                onChange(editQasm(qasm, { type: 'update-param', lineIndex: op.lineIndex, param: newVal }));
              }
            }
          });
          cell.addEventListener('dblclick', () => {
            if (op.param && op.lineIndex != null) {
              const current = (op.param || '').replace(/[()]/g, '');
              const newVal = prompt(`Edit ${op.gate} param`, current);
              if (newVal !== null) {
                onChange(editQasm(qasm, { type: 'update-param', lineIndex: op.lineIndex, param: newVal }));
              }
            }
          });

          // Drag to reorder (Phase 3 design surface)
          cell.draggable = true;
          cell.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ lineIndex: op.lineIndex, gate: op.gate, q: op.q }));
            cell.style.opacity = '0.5';
          });
          cell.addEventListener('dragend', () => { cell.style.opacity = '1'; });
          cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.style.background = 'rgba(9,105,218,0.15)'; });
          cell.addEventListener('dragleave', () => { cell.style.background = ''; });
          cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.style.background = '';
            try {
              const from = JSON.parse(e.dataTransfer.getData('text/plain'));
              const to = { lineIndex: op.lineIndex, gate: op.gate, q: op.q };
              if (from.lineIndex === to.lineIndex) return;

              // Simple reorder in parsed ops
              const currentOps = parseOps(qasm);
              const fromIdx = currentOps.findIndex(o => o.lineIndex === from.lineIndex);
              const toIdx = currentOps.findIndex(o => o.lineIndex === to.lineIndex);
              if (fromIdx < 0 || toIdx < 0) return;

              const moved = currentOps.splice(fromIdx, 1)[0];
              currentOps.splice(toIdx, 0, moved);

              // Rebuild a simplified QASM with new order (keeps structure)
              onChange(editQasm(qasm, { type: 'reorder', newOps: currentOps }));
            } catch (_) {}
          });
        }
        grid.appendChild(cell);
      }
    }

    if (n > wires) {
      const more = document.createElement('div');
      more.className = 'cc-more';
      more.textContent = `+${n - wires} hidden wires`;
      host.appendChild(more);
    }
  }

  root.CircuitComposer = { render, parseOps, editQasm };
})(typeof window !== 'undefined' ? window : globalThis);
