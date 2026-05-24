/**
 * Dual inverse Bloch spheres — antiparticle (CPT), antipodal r→−r, magnetic wave link.
 */
(function (root) {
  'use strict';

  const BM = () => root.BlochMath;

  /** Complex conjugate state (charge conjugation on amplitudes). */
  function conjugateState(alpha, beta) {
    const M = BM();
    return M.normalizeState(M.cConj(alpha), M.cConj(beta));
  }

  function negateAmps(alpha, beta) {
    const M = BM();
    return M.normalizeState(M.c(-alpha.re, -alpha.im), M.c(-beta.re, -beta.im));
  }

  /** Antiparticle / CPT-like: i σ_y |ψ*⟩ */
  function antiparticleState(alpha, beta) {
    const M = BM();
    const st = conjugateState(alpha, beta);
    return M.apply2x2(M.SY, st.alpha, st.beta);
  }

  /** Antipodal Bloch point (inverse through origin). */
  function inverseBloch(b) {
    const M = BM();
    const neg = negateAmps(b.alpha, b.beta);
    const inv = M.blochFromState(neg.alpha, neg.beta);
    inv.label = 'inverse';
    inv.partner = 'antipodal';
    inv.rx = -b.rx;
    inv.ry = -b.ry;
    inv.rz = -b.rz;
    inv.theta = Math.PI - b.theta;
    inv.phi = (b.phi + Math.PI) % M.TAU;
    return inv;
  }

  function antiparticleBloch(b) {
    const M = BM();
    const ap = antiparticleState(b.alpha, b.beta);
    const out = M.blochFromState(ap.alpha, ap.beta);
    out.label = 'antimatter';
    out.partner = 'CPT';
    return out;
  }

  /**
   * Magnetic coupling between particle (r1) and inverse (r2).
   * H_mag = −(μ/2) B·σ  →  precession ω = γ B
   * Exchange-like link: H_int ∝ J r1·r2
   */
  function magneticLink(r1, r2, opts) {
    const B0 = (opts && opts.B0) ?? 1.0;
    const omega = (opts && opts.omega) ?? 2.0;
    const J = (opts && opts.J) ?? 0.35;
    const t = (opts && opts.t) ?? 0;

    const dot = r1.rx * r2.rx + r1.ry * r2.ry + r1.rz * r2.rz;
    const cross = {
      x: r1.ry * r2.rz - r1.rz * r2.ry,
      y: r1.rz * r2.rx - r1.rx * r2.rz,
      z: r1.rx * r2.ry - r1.ry * r2.rx
    };
    const crossLen = Math.sqrt(cross.x ** 2 + cross.y ** 2 + cross.z ** 2) || 1e-9;

    const Bx = B0 * Math.cos(omega * t);
    const By = B0 * Math.sin(omega * t) * 0.6;
    const Bz = B0 * 0.3 * Math.sin(omega * t * 1.7);

    const gamma = (opts && opts.gamma) ?? 1.0;
    const omega1 = {
      x: gamma * (By * r1.rz - Bz * r1.ry + J * cross.x),
      y: gamma * (Bz * r1.rx - Bx * r1.rz + J * cross.y),
      z: gamma * (Bx * r1.ry - By * r1.rx + J * cross.z)
    };
    const omega2 = {
      x: -gamma * (By * r2.rz - Bz * r2.ry + J * cross.x),
      y: -gamma * (Bz * r2.rx - Bx * r2.ry + J * cross.y),
      z: -gamma * (Bx * r2.ry - By * r2.rx + J * cross.z)
    };

    return {
      B: { x: Bx, y: By, z: Bz },
      dot,
      exchange: J * dot,
      cross,
      crossNorm: crossLen,
      omega1,
      omega2,
      phaseDiff: Math.atan2(r1.ry, r1.rx) - Math.atan2(r2.ry, r2.rx),
      fluxAxis: { x: cross.x / crossLen, y: cross.y / crossLen, z: cross.z / crossLen }
    };
  }

  /** Sample magnetic wave bridge between sphere centers (parametric). */
  function magneticWaveSamples(r1, r2, link, n) {
    const samples = [];
    const steps = n || 48;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const phase = link.B.x * Math.cos(link.B.z * u * Math.PI * 2) + link.B.y * Math.sin(u * Math.PI * 4);
      samples.push({
        u,
        x: r1.rx * (1 - u) + r2.rx * u + link.fluxAxis.x * 0.12 * Math.sin(phase),
        y: r1.ry * (1 - u) + r2.ry * u + link.fluxAxis.y * 0.12 * Math.sin(phase),
        z: r1.rz * (1 - u) + r2.rz * u + link.fluxAxis.z * 0.12 * Math.cos(phase),
        phase
      });
    }
    return samples;
  }

  const DUAL_EQUATIONS = [
    {
      id: 'inverse',
      name: 'Inverse (antipodal)',
      tex: 'r⁻ = −r  ↔  |ψ⁻⟩ phase-flip partner',
      eval: (p, inv) =>
        `r⁻=(${inv.rx.toFixed(4)},${inv.ry.toFixed(4)},${inv.rz.toFixed(4)})  Δθ=${Math.abs(p.theta - inv.theta).toFixed(4)}`
    },
    {
      id: 'antimatter',
      name: 'Antimatter (CPT)',
      tex: '|ψ̃⟩ = iσ_y |ψ*⟩',
      eval: (p, _inv, anti) =>
        `r̃=(${anti.rx.toFixed(4)},${anti.ry.toFixed(4)},${anti.rz.toFixed(4)})  P0̃=${(anti.p0 * 100).toFixed(2)}%`
    },
    {
      id: 'magnetic',
      name: 'Magnetic coupling',
      tex: 'H_mag=−(μ/2)B·σ,  H_int∝J r₁·r₂',
      eval: (_p, _inv, _anti, link) =>
        `B=(${link.B.x.toFixed(3)},${link.B.y.toFixed(3)},${link.B.z.toFixed(3)})  r₁·r₂=${link.dot.toFixed(4)}  J=${link.exchange.toFixed(4)}`
    },
    {
      id: 'flux',
      name: 'Flux tube (cross product)',
      tex: 'F ∝ r₁×r₂  (magnetic connection axis)',
      eval: (_p, _inv, _anti, link) =>
        `|r₁×r₂|=${link.crossNorm.toFixed(4)}  Δφ=${link.phaseDiff.toFixed(4)} rad`
    }
  ];

  root.BlochDual = {
    conjugateState,
    antiparticleState,
    inverseBloch,
    antiparticleBloch,
    magneticLink,
    magneticWaveSamples,
    DUAL_EQUATIONS
  };
})(typeof window !== 'undefined' ? window : globalThis);
