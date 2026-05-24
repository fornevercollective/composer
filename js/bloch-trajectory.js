/**
 * Exact Bloch trajectories — QASM gate chain + Hamiltonian geodesics on S².
 */
(function (root) {
  'use strict';

  const BM = () => root.BlochMath;

  function snapshot(alpha, beta, meta) {
    const b = BM().blochFromState(alpha, beta);
    return { ...b, alpha, beta, meta: meta || {} };
  }

  function parseQasmTrajectory(qasm, targetQubit) {
    const M = BM();
    const q = targetQubit ?? 0;
    let st = M.stateFromBloch(0.3, 0.4);
    let alpha = st.alpha;
    let beta = st.beta;
    const path = [snapshot(alpha, beta, { step: 0, gate: 'init' })];

    const lines = String(qasm || '').split('\n');
    let step = 0;
    for (const raw of lines) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line) continue;
      const qpat = new RegExp(`q\\[${q}\\]`, 'i');
      if (!qpat.test(line) && !/q\[0\]/.test(line) && q === 0 && /q\[/.test(line)) {
        const m = line.match(/q\[(\d+)\]/);
        if (m && parseInt(m[1], 10) !== q) continue;
      }

      let U = null;
      let gate = null;
      if (/^h\s+q/i.test(line) && qpat.test(line)) {
        U = M.ry(Math.PI);
        gate = 'h';
      } else if (/^x\s+q/i.test(line) && qpat.test(line)) {
        U = M.rx(Math.PI);
        gate = 'x';
      } else if (/^y\s+q/i.test(line) && qpat.test(line)) {
        U = M.ry(Math.PI);
        gate = 'y';
      } else if (/^z\s+q/i.test(line) && qpat.test(line)) {
        U = M.rz(Math.PI);
        gate = 'z';
      } else if (/^sx\s+q/i.test(line) && qpat.test(line)) {
        U = M.rx(Math.PI / 2);
        gate = 'sx';
      } else if (/rz\s*\(([^)]+)\)/i.test(line) && qpat.test(line)) {
        const ang = parseFloat(line.match(/rz\s*\(([^)]+)\)/i)[1]);
        if (!isNaN(ang)) {
          U = M.rz(ang);
          gate = `rz(${ang})`;
        }
      } else if (/rx\s*\(([^)]+)\)/i.test(line) && qpat.test(line)) {
        const ang = parseFloat(line.match(/rx\s*\(([^)]+)\)/i)[1]);
        if (!isNaN(ang)) {
          U = M.rx(ang);
          gate = `rx(${ang})`;
        }
      } else if (/ry\s*\(([^)]+)\)/i.test(line) && qpat.test(line)) {
        const ang = parseFloat(line.match(/ry\s*\(([^)]+)\)/i)[1]);
        if (!isNaN(ang)) {
          U = M.ry(ang);
          gate = `ry(${ang})`;
        }
      }

      if (U) {
        step++;
        st = M.apply2x2(U, alpha, beta);
        alpha = st.alpha;
        beta = st.beta;
        path.push(snapshot(alpha, beta, { step, gate }));
      }
    }
    return path;
  }

  /** Hamiltonian H = (ω/2) n·σ — integrate on Bloch sphere (RK4). */
  function hamiltonianTrajectory(theta0, phi0, omega, duration, steps) {
    const M = BM();
    const n = steps || 120;
    const T = duration ?? 4;
    const w = omega || { x: 0.4, y: 0.3, z: 0.85 };
    const wn = Math.sqrt(w.x ** 2 + w.y ** 2 + w.z ** 2) || 1;
    const nx = w.x / wn;
    const ny = w.y / wn;
    const nz = w.z / wn;

    let st = M.stateFromBloch(theta0, phi0);
    const path = [snapshot(st.alpha, st.beta, { t: 0, type: 'hamiltonian' })];

    const dt = T / n;
    for (let i = 1; i <= n; i++) {
      const t = i * dt;
      const dth = wn * dt;
      st = M.apply2x2(M.rz(nz * dth), st.alpha, st.beta);
      st = M.apply2x2(M.ry(ny * dth), st.alpha, st.beta);
      st = M.apply2x2(M.rx(nx * dth), st.alpha, st.beta);
      path.push(snapshot(st.alpha, st.beta, { t, type: 'hamiltonian', omega: w }));
    }
    return path;
  }

  function geodesicArc(theta0, phi0, theta1, phi1, segments) {
    const M = BM();
    const n = segments || 64;
    const path = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const th = theta0 + (theta1 - theta0) * u;
      const ph = phi0 + (phi1 - phi0) * u;
      const st = M.stateFromBloch(th, ph);
      path.push(snapshot(st.alpha, st.beta, { u, type: 'geodesic' }));
    }
    return path;
  }

  root.BlochTrajectory = {
    parseQasmTrajectory,
    hamiltonianTrajectory,
    geodesicArc,
    snapshot
  };
})(typeof window !== 'undefined' ? window : globalThis);
