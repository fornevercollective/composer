/**
 * Offline preflight — gate/qubit/depth heuristics before portal submission.
 */
(function (root) {
  'use strict';

  function getBackends() {
    if (root.QPUFleet && root.QPUFleet.backendsMap) return root.QPUFleet.backendsMap();
    return {
      ibm_torino: { qubits: 133, name: 'ibm_torino' },
      ibm_miami: { qubits: 120, name: 'ibm_miami' },
      ibm_fez: { qubits: 156, name: 'ibm_fez' },
      'local-aer': { qubits: 32, name: 'local-aer' }
    };
  }

  function parseStats(qasm) {
    const lines = String(qasm || '').split('\n');
    let qubits = 0,
      gates = 0,
      twoQ = 0,
      measures = 0,
      depth = 0;
    const qubitRe = /qubit\s*\[\s*(\d+)\s*\]|qreg\s+\w+\s*\[\s*(\d+)\s*\]/gi;
    let m;
    while ((m = qubitRe.exec(qasm))) {
      qubits = Math.max(qubits, parseInt(m[1] || m[2], 10));
    }
    if (!qubits) {
      const single = qasm.match(/qubit\[(\d+)\]/);
      if (single) qubits = parseInt(single[1], 10);
    }
    for (const raw of lines) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('//') || /^OPENQASM|^include/i.test(line)) continue;
      if (/^(qubit|bit|qreg|creg)/i.test(line)) continue;
      if (/^measure\b/i.test(line)) {
        measures++;
        gates++;
        depth++;
        continue;
      }
      if (/^barrier\b/i.test(line)) continue;
      if (/^(cx|cz|ch|ccx|cp|swap|iswap)/i.test(line)) {
        twoQ++;
        gates++;
        depth++;
        continue;
      }
      if (/^(h|x|y|z|s|t|sx|rx|ry|rz|u\d?|p|id)\b/i.test(line) || /\)\s*q\[/i.test(line)) {
        gates++;
        depth++;
      }
    }
    return { qubitCount: qubits, gateCount: gates, twoQubitGates: twoQ, measureCount: measures, circuitDepth: depth };
  }

  function preflight(qasm, backendKey, opts) {
    const BACKENDS = getBackends();
    const backend = BACKENDS[backendKey] || BACKENDS.ibm_torino || { qubits: 133, name: 'ibm_torino' };
    const shots = (opts && opts.shots) || 1024;
    const s = parseStats(qasm);
    const checks = [];

    checks.push({
      name: 'qubit budget',
      pass: s.qubitCount <= backend.qubits,
      severity: 'critical',
      detail: `${s.qubitCount}/${backend.qubits} qubits`
    });
    checks.push({
      name: 'has measure',
      pass: s.measureCount > 0,
      severity: 'high',
      detail: `${s.measureCount} measure(s)`
    });
    checks.push({
      name: 'gate count',
      pass: s.gateCount < 5000,
      severity: 'high',
      detail: `${s.gateCount} gates (soft limit 5000)`
    });
    checks.push({
      name: 'depth estimate',
      pass: s.circuitDepth < 800,
      severity: 'medium',
      detail: `depth ~${s.circuitDepth}`
    });
    checks.push({
      name: 'syntax header',
      pass: /OPENQASM\s+[23]/i.test(qasm),
      severity: 'medium',
      detail: /OPENQASM\s+3/i.test(qasm) ? 'OpenQASM 3' : /OPENQASM\s+2/i.test(qasm) ? 'OpenQASM 2' : 'missing OPENQASM'
    });

    const passCount = checks.filter((c) => c.pass).length;
    const criticalFails = checks.filter((c) => !c.pass && c.severity === 'critical').length;
    const highFails = checks.filter((c) => !c.pass && c.severity === 'high').length;
    let verdict = 'GO';
    if (criticalFails) verdict = 'ABORT';
    else if (highFails) verdict = 'WARN';

    const scorePct = Math.round((passCount / checks.length) * 100);
    const estFidelity = Math.max(0, 100 - s.twoQubitGates * 0.15 - s.circuitDepth * 0.02);

    return {
      verdict,
      backend: backend.name,
      backendQubits: backend.qubits,
      shots,
      ...s,
      checks,
      passCount,
      criticalFails,
      highFails,
      scorePct,
      estimatedFidelity: estFidelity,
      estimatedCost: shots * (s.gateCount * 0.01 + 1),
      failureRate: verdict === 'GO' ? 0 : verdict === 'WARN' ? 12 : 45
    };
  }

  root.QbitPreflightLite = { preflight, parseStats, getBackends };
})(typeof window !== 'undefined' ? window : globalThis);
