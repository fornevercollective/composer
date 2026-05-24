/**
 * Shared Bloch state engine — panel, lab, and standalone viewer.
 */
(function (root) {
  'use strict';

  function create(initial) {
    const state = {
      rotX: -0.35,
      rotY: 0.45,
      particle: null,
      inverse: null,
      antimatter: null,
      link: null,
      wave: null,
      pathParticle: [],
      pathInverse: [],
      t: 0,
      ...initial
    };

    function getOpts(opts) {
      const o = opts || {};
      return {
        qasm: o.qasm != null ? o.qasm : '',
        theta: o.theta != null ? o.theta : 1.2,
        phi: o.phi != null ? o.phi : 0.8,
        mode: o.mode || 'qasm',
        omega: o.omega || { x: 0.4, y: 0.3, z: 0.85 },
        magnetic: o.magnetic || { B0: 1, omega: 2, J: 0.35, t: state.t },
        usePathEnd: o.usePathEnd !== false
      };
    }

    function recompute(opts) {
      const M = root.BlochMath;
      const D = root.BlochDual;
      const T = root.BlochTrajectory;
      if (!M || !D || !T) return state;

      const o = getOpts(opts);
      const st = M.stateFromBloch(o.theta, o.phi);
      state.particle = M.blochFromState(st.alpha, st.beta);
      state.inverse = D.inverseBloch(state.particle);
      state.antimatter = D.antiparticleBloch(state.particle);

      state.t = o.magnetic.t || 0;
      state.link = D.magneticLink(state.particle, state.inverse, o.magnetic);
      state.wave = D.magneticWaveSamples(state.particle, state.inverse, state.link, 56);

      if (o.mode === 'qasm' && o.qasm) {
        state.pathParticle = T.parseQasmTrajectory(o.qasm, 0);
        state.pathInverse = state.pathParticle.map((pt) => D.inverseBloch(pt));
      } else if (o.mode === 'hamiltonian') {
        state.pathParticle = T.hamiltonianTrajectory(o.theta, o.phi, o.omega, 6, 100);
        state.pathInverse = state.pathParticle.map((pt) => D.inverseBloch(pt));
      } else if (o.mode === 'geodesic') {
        state.pathParticle = T.geodesicArc(o.theta, o.phi, state.inverse.theta, state.inverse.phi, 80);
        state.pathInverse = state.pathParticle.map((pt) => D.inverseBloch(pt));
      } else {
        state.pathParticle = [];
        state.pathInverse = [];
      }

      if (o.usePathEnd && state.pathParticle.length) {
        const last = state.pathParticle[state.pathParticle.length - 1];
        state.particle = last;
        state.inverse = D.inverseBloch(last);
        state.antimatter = D.antiparticleBloch(last);
      }

      return state;
    }

    function paintSingle(canvas) {
      if (!canvas || !root.BlochRender) return;
      root.BlochRender.renderSingle(canvas, snapshot());
    }

    function paintDual(canvas) {
      if (!canvas || !root.BlochRender) return;
      root.BlochRender.renderDual(canvas, snapshot());
    }

    function snapshot() {
      return {
        rotX: state.rotX,
        rotY: state.rotY,
        particle: state.particle,
        inverse: state.inverse,
        antimatter: state.antimatter,
        link: state.link,
        wave: state.wave,
        pathParticle: state.pathParticle,
        pathInverse: state.pathInverse
      };
    }

    function publish(source) {
      if (typeof BroadcastChannel === 'undefined' || !state.particle) return;
      try {
        new BroadcastChannel('bloch-state').postMessage({
          type: 'bloch-state',
          source: source || 'composerIBM',
          qubits: [
            { theta: state.particle.theta, phi: state.particle.phi, label: 'q0' },
            state.inverse
              ? { theta: state.inverse.theta, phi: state.inverse.phi, label: 'q0⁻' }
              : null
          ].filter(Boolean),
          dual: {
            particle: state.particle,
            inverse: state.inverse,
            antimatter: state.antimatter,
            link: state.link
          },
          timestamp: Date.now()
        });
      } catch (_) {}
    }

    function bindDrag(canvas) {
      let drag = false;
      let lx = 0;
      let ly = 0;
      const onPaint = () => {
        const mode = canvas.dataset.blochMode || 'single';
        if (root.BlochRender && root.BlochRender.renderPanel) root.BlochRender.renderPanel(canvas, snapshot(), mode);
        else if (mode === 'dual') paintDual(canvas);
        else paintSingle(canvas);
      };
      canvas.addEventListener('pointerdown', (e) => {
        drag = true;
        lx = e.clientX;
        ly = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        state.rotY += (e.clientX - lx) * 0.01;
        state.rotX += (e.clientY - ly) * 0.01;
        lx = e.clientX;
        ly = e.clientY;
        onPaint();
        canvas.dispatchEvent(new CustomEvent('bloch-rotate', { bubbles: true }));
      });
      canvas.addEventListener('pointerup', () => (drag = false));
      return { onPaint };
    }

    return {
      state,
      recompute,
      paintSingle,
      paintDual,
      snapshot,
      publish,
      bindDrag
    };
  }

  root.BlochEngine = { create };
})(typeof window !== 'undefined' ? window : globalThis);
