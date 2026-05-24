'use strict';

const $ = (id) => document.getElementById(id);

let engine = null;
const Lab = {
  get rotX() {
    return engine ? engine.state.rotX : -0.35;
  },
  set rotX(v) {
    if (engine) engine.state.rotX = v;
  },
  get rotY() {
    return engine ? engine.state.rotY : 0.45;
  },
  set rotY(v) {
    if (engine) engine.state.rotY = v;
  },
  get particle() {
    return engine ? engine.state.particle : null;
  },
  get inverse() {
    return engine ? engine.state.inverse : null;
  },
  get antimatter() {
    return engine ? engine.state.antimatter : null;
  },
  get link() {
    return engine ? engine.state.link : null;
  },
  get wave() {
    return engine ? engine.state.wave : null;
  },
  get pathParticle() {
    return engine ? engine.state.pathParticle : [];
  },
  get pathInverse() {
    return engine ? engine.state.pathInverse : [];
  },
  animId: null,
  t: 0,
  mode: 'qasm'
};

function ensureEngine() {
  if (!engine && window.BlochEngine) {
    engine = window.BlochEngine.create();
    const cv = $('cv-dual');
    if (cv) {
      cv.dataset.blochMode = 'dual';
      engine.bindDrag(cv);
    }
  }
  return engine;
}

function log(msg, cls) {
  const el = $('lab-log');
  if (!el) return;
  const d = document.createElement('div');
  d.className = cls || '';
  d.innerHTML = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

function getQasm() {
  if ($('lab-qasm')) return $('lab-qasm').value;
  return localStorage.getItem('composerIBM.lastQasm') || '';
}

function recompute() {
  const M = window.BlochMath;
  const D = window.BlochDual;
  const T = window.BlochTrajectory;

  const theta = parseFloat($('sl-theta').value);
  const phi = parseFloat($('sl-phi').value);
  const st = M.stateFromBloch(theta, phi);
  Lab.particle = M.blochFromState(st.alpha, st.beta);

  Lab.inverse = D.inverseBloch(Lab.particle);
  Lab.antimatter = D.antiparticleBloch(Lab.particle);

  const ox = parseFloat($('sl-ox').value);
  const oy = parseFloat($('sl-oy').value);
  const oz = parseFloat($('sl-oz').value);
  Lab.t = parseFloat($('sl-time').value) || 0;

  Lab.link = D.magneticLink(Lab.particle, Lab.inverse, {
    B0: parseFloat($('sl-B').value),
    omega: parseFloat($('sl-Bw').value),
    J: parseFloat($('sl-J').value),
    t: Lab.t
  });
  Lab.wave = D.magneticWaveSamples(Lab.particle, Lab.inverse, Lab.link, 56);

  const mode = $('traj-mode').value;
  if (mode === 'qasm') {
    Lab.pathParticle = T.parseQasmTrajectory(getQasm(), 0);
    Lab.pathInverse = Lab.pathParticle.map((pt) => D.inverseBloch(pt));
  } else if (mode === 'hamiltonian') {
    Lab.pathParticle = T.hamiltonianTrajectory(theta, phi, { x: ox, y: oy, z: oz }, 6, 100);
    Lab.pathInverse = Lab.pathParticle.map((pt) => D.inverseBloch(pt));
  } else {
    Lab.pathParticle = T.geodesicArc(theta, phi, Lab.inverse.theta, Lab.inverse.phi, 80);
    Lab.pathInverse = Lab.pathParticle.map((pt) => D.inverseBloch(pt));
  }

  if (Lab.pathParticle.length) {
    const last = Lab.pathParticle[Lab.pathParticle.length - 1];
    Lab.particle = last;
    Lab.inverse = D.inverseBloch(last);
    Lab.antimatter = D.antiparticleBloch(last);
  }

  renderEquations();
  paint();
  publishBloch();
}

function renderEquations() {
  const eqEl = $('eq-panel');
  if (!eqEl) return;
  const M = window.BlochMath;
  const D = window.BlochDual;
  const ctx = { omega: { x: parseFloat($('sl-ox').value), y: parseFloat($('sl-oy').value), z: parseFloat($('sl-oz').value) } };
  let html = '';
  M.EQUATIONS.forEach((eq) => {
    html += `<div class="eq-block"><div class="eq-name">${eq.name}</div><div class="eq-tex">${eq.tex}</div><div class="eq-val">${eq.eval(Lab.particle, ctx)}</div></div>`;
  });
  D.DUAL_EQUATIONS.forEach((eq) => {
    html += `<div class="eq-block dual"><div class="eq-name">${eq.name}</div><div class="eq-tex">${eq.tex}</div><div class="eq-val">${eq.eval(Lab.particle, Lab.inverse, Lab.antimatter, Lab.link)}</div></div>`;
  });
  eqEl.innerHTML = html.replace(/<\/?motion>/g, '');
}

function paint() {
  const eng = ensureEngine();
  const cv = $('cv-dual');
  if (eng && cv) eng.paintDual(cv);
}

function publishBloch() {
  const eng = ensureEngine();
  if (eng) eng.publish('composerIBM-bloch-lab');
}

function animate() {
  if (!$('chk-animate').checked) return;
  Lab.t += 0.05;
  $('sl-time').value = String(Lab.t % (Math.PI * 4));
  recompute();
  Lab.animId = requestAnimationFrame(animate);
}

function stopAnim() {
  if (Lab.animId) cancelAnimationFrame(Lab.animId);
  Lab.animId = null;
}

function init() {
  const qasm = getQasm();
  if ($('lab-qasm')) $('lab-qasm').value = qasm;

  ['sl-theta', 'sl-phi', 'sl-ox', 'sl-oy', 'sl-oz', 'sl-B', 'sl-Bw', 'sl-J', 'sl-time', 'traj-mode'].forEach((id) => {
    $(id).addEventListener('input', () => {
      stopAnim();
      recompute();
    });
  });

  $('btn-recompute').onclick = () => {
    stopAnim();
    recompute();
  };
  $('btn-import').onclick = () => {
    const q = localStorage.getItem('composerIBM.lastQasm') || localStorage.getItem('ugrad.lastQASM');
    if (q) {
      $('lab-qasm').value = q;
      log('<span class="ok">QASM imported</span>');
      recompute();
    } else log('<span class="warn">no QASM in storage</span>');
  };
  $('btn-spin').onclick = () => {
    if (Lab.animId) {
      stopAnim();
      $('chk-animate').checked = false;
      return;
    }
    $('chk-animate').checked = true;
    animate();
  };

  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel('bloch-state');
    ch.onmessage = (e) => {
      const d = e.data;
      if (!d || d.type !== 'bloch-state' || d.source === 'composerIBM-bloch-lab') return;
      if (d.qubits && d.qubits[0]) {
        $('sl-theta').value = d.qubits[0].theta;
        $('sl-phi').value = d.qubits[0].phi;
        recompute();
        log(`<span class="info">synced from ${d.source}</span>`);
      }
    };
  }

  ensureEngine();
  recompute();
  log('<span class="ok">Bloch lab ready</span> — dual sphere + magnetic link');
}

document.addEventListener('DOMContentLoaded', init);
