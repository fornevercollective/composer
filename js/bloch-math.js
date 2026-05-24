/**
 * Bloch sphere — exact state ↔ point on S² (standard |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩).
 */
(function (root) {
  'use strict';

  const TAU = 2 * Math.PI;

  function c(re, im) {
    return { re, im };
  }

  function cAdd(a, b) {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  function cMul(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  }

  function cConj(a) {
    return { re: a.re, im: -a.im };
  }

  function cNorm2(a) {
    return a.re * a.re + a.im * a.im;
  }

  function cScale(a, s) {
    return { re: a.re * s, im: a.im * s };
  }

  function normalizeState(alpha, beta) {
    const n2 = cNorm2(alpha) + cNorm2(beta);
    const n = Math.sqrt(n2) || 1;
    return { alpha: cScale(alpha, 1 / n), beta: cScale(beta, 1 / n) };
  }

  /** |ψ⟩ from Bloch angles (θ ∈ [0,π], φ ∈ [0,2π)). */
  function stateFromBloch(theta, phi) {
    const ct = Math.cos(theta / 2);
    const st = Math.sin(theta / 2);
    const alpha = c(ct, 0);
    const beta = c(st * Math.cos(phi), st * Math.sin(phi));
    return normalizeState(alpha, beta);
  }

  /** Bloch vector r = (⟨σx⟩, ⟨σy⟩, ⟨σz⟩) from amplitudes. */
  function blochFromState(alpha, beta) {
    const aC = cConj(alpha);
    const ab = cMul(aC, beta);
    const rx = 2 * ab.re;
    const ry = 2 * ab.im;
    const rz = cNorm2(alpha) - cNorm2(beta);
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    const theta = Math.acos(Math.max(-1, Math.min(1, rz)));
    let phi = Math.atan2(ry, rx);
    if (phi < 0) phi += TAU;
    return {
      rx: rx / r,
      ry: ry / r,
      rz: rz / r,
      theta,
      phi,
      alpha,
      beta,
      p0: cNorm2(alpha),
      p1: cNorm2(beta)
    };
  }

  /** μgrad-style mapping (weights slice → θ, φ) for bridge compatibility. */
  function blochFromWeightSlice(wSlice) {
    let theta = 0;
    let phi = 0;
    for (let i = 0; i < wSlice.length; i++) {
      theta += wSlice[i] * (i % 2 === 0 ? 1 : -1);
      phi += wSlice[i] * (i % 3 === 0 ? 0.7 : 0.3);
    }
    theta = Math.abs(theta % Math.PI);
    phi = phi % TAU;
    const st = stateFromBloch(theta, phi);
    return blochFromState(st.alpha, st.beta);
  }

  const I2 = [
    [c(1, 0), c(0, 0)],
    [c(0, 0), c(1, 0)]
  ];
  const SX = [
    [c(0, 0), c(1, 0)],
    [c(1, 0), c(0, 0)]
  ];
  const SY = [
    [c(0, 0), c(0, -1)],
    [c(0, 1), c(0, 0)]
  ];
  const SZ = [
    [c(1, 0), c(0, 0)],
    [c(0, 0), c(-1, 0)]
  ];

  function apply2x2(U, alpha, beta) {
    const na = cAdd(cMul(U[0][0], alpha), cMul(U[0][1], beta));
    const nb = cAdd(cMul(U[1][0], alpha), cMul(U[1][1], beta));
    return normalizeState(na, nb);
  }

  function rz(angle) {
    const e = { re: Math.cos(angle / 2), im: -Math.sin(angle / 2) };
    const em = { re: Math.cos(angle / 2), im: Math.sin(angle / 2) };
    return [
      [e, c(0, 0)],
      [c(0, 0), em]
    ];
  }

  function rx(angle) {
    const c0 = Math.cos(angle / 2);
    const s0 = Math.sin(angle / 2);
    return [
      [c(c0, 0), c(0, -s0)],
      [c(0, -s0), c(c0, 0)]
    ];
  }

  function ry(angle) {
    const c0 = Math.cos(angle / 2);
    const s0 = Math.sin(angle / 2);
    return [
      [c(c0, 0), c(-s0, 0)],
      [c(s0, 0), c(c0, 0)]
    ];
  }

  function rot3d(x, y, z, rotX, rotY) {
    const cy = Math.cos(rotY);
    const sy = Math.sin(rotY);
    const cx = Math.cos(rotX);
    const sx = Math.sin(rotX);
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    return { x: x2, y: y1, z: z2 };
  }

  /** Equation registry with live evaluators. */
  const EQUATIONS = [
    {
      id: 'state',
      name: '|ψ⟩ decomposition',
      tex: '|ψ⟩ = α|0⟩ + β|1⟩,  |α|²+|β|²=1',
      eval: (s) =>
        `α=${fmtC(s.alpha)}  β=${fmtC(s.beta)}  norm=${Math.sqrt(s.p0 + s.p1).toFixed(6)}`
    },
    {
      id: 'bloch-pauli',
      name: 'Pauli expectations',
      tex: 'r_x=2Re(α*β), r_y=2Im(α*β), r_z=|α|²-|β|²',
      eval: (s) => `r=(${s.rx.toFixed(5)}, ${s.ry.toFixed(5)}, ${s.rz.toFixed(5)})  |r|=${vecLen(s).toFixed(5)}`
    },
    {
      id: 'sphere',
      name: 'Spherical coords',
      tex: 'r_x=sinθ cosφ, r_y=sinθ sinφ, r_z=cosθ',
      eval: (s) => `θ=${s.theta.toFixed(5)} rad  φ=${s.phi.toFixed(5)} rad`
    },
    {
      id: 'prob',
      name: 'Measurement probs',
      tex: 'P(|0⟩)=cos²(θ/2)=(1+r_z)/2',
      eval: (s) => `P0=${(s.p0 * 100).toFixed(3)}%  P1=${(s.p1 * 100).toFixed(3)}%`
    },
    {
      id: 'hamiltonian',
      name: 'Unitary evolution',
      tex: 'iℏ ∂|ψ⟩/∂t = H|ψ⟩,  H=(ℏ/2)ω·σ',
      eval: (s, ctx) =>
        ctx && ctx.omega
          ? `ω=(${ctx.omega.x.toFixed(3)},${ctx.omega.y.toFixed(3)},${ctx.omega.z.toFixed(3)})  d|ψ⟩/dt on S²`
          : 'set ω in panel'
    }
  ];

  function fmtC(z) {
    const sign = z.im >= 0 ? '+' : '';
    return `${z.re.toFixed(4)}${sign}${z.im.toFixed(4)}i`;
  }

  function vecLen(s) {
    return Math.sqrt(s.rx * s.rx + s.ry * s.ry + s.rz * s.rz);
  }

  root.BlochMath = {
    c,
    cAdd,
    cMul,
    cConj,
    stateFromBloch,
    blochFromState,
    blochFromWeightSlice,
    apply2x2,
    rz,
    rx,
    ry,
    I2,
    SX,
    SY,
    SZ,
    rot3d,
    EQUATIONS,
    TAU,
    normalizeState
  };
})(typeof window !== 'undefined' ? window : globalThis);
