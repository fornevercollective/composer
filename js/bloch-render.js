/**
 * Dual Bloch canvas — trajectories, exact point, magnetic wave bridge.
 */
(function (root) {
  'use strict';

  const COL = {
    particle: '#3fb950',
    inverse: '#f85149',
    antimatter: '#bc8cff',
    trail: '#0969da',
    trail2: '#8a6d1f',
    flux: '#0969da',
    grid: '#c8d4e3',
    label: '#1f2937',
    dim: '#607087',
    bg: '#ffffff'
  };

  function clamp01(x) {
    return Math.max(0, Math.min(1, x || 0));
  }

  function mixColor(a, b, t) {
    const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
    const pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
    return (
      '#' +
      pa
        .map((v, i) => Math.round(v + (pb[i] - v) * clamp01(t)).toString(16).padStart(2, '0'))
        .join('')
    );
  }

  function prepareCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth || canvas.width / dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight || canvas.height / dpr));
    const tw = Math.round(w * dpr);
    const th = Math.round(h * dpr);
    // Avoid resetting the backing store during every drag frame; that reset is what causes visible blink/resize.
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function stressMetrics(state, rotX, rotY, cx1, cy1, cx2, cy2, r) {
    const p = state && state.particle;
    const inv = state && state.inverse;
    if (!p || !inv) return { tension: 0, depth: 0, compression: 0, dot: 0, exchange: 0, phase: 0 };
    const p1 = project(p.rx, p.ry, p.rz, cx1, cy1, r, rotX, rotY);
    const p2 = project(inv.rx, inv.ry, inv.rz, cx2, cy2, r, rotX, rotY);
    const planar = Math.hypot(p2.x - p1.x, p2.y - p1.y) / Math.max(1, Math.abs(cx2 - cx1) + r);
    const compression = clamp01(1 - planar);
    const depth = clamp01(Math.abs(p1.z - p2.z) * 0.5);
    const dot = p.rx * inv.rx + p.ry * inv.ry + p.rz * inv.rz;
    const exchange = Math.abs((state.link && state.link.exchange) || 0);
    const phase = Math.abs((state.link && state.link.phaseDiff) || 0) % (Math.PI * 2);
    const phaseStress = Math.min(1, phase / Math.PI);
    const tension = clamp01(0.42 * depth + 0.36 * compression + 0.14 * phaseStress + 0.08 * exchange);
    return { tension, depth, compression, dot, exchange, phase };
  }

  function drawCompressionRings(ctx, cx, cy, r, tension, rotX) {
    const color = mixColor('0969da', 'cf222e', tension);
    ctx.save();
    ctx.globalAlpha = 0.22 + tension * 0.42;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8 + tension * 1.4;
    for (let i = 0; i < 4; i++) {
      const k = 0.32 + i * 0.15;
      const squash = 0.12 + Math.abs(Math.sin(rotX)) * 0.22 + tension * 0.16;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * k, r * k * squash, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSphere(ctx, cx, cy, r, rotX, rotY, label) {
    const M = root.BlochMath;
    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    for (let lat = -60; lat <= 60; lat += 30) {
      const rl = r * Math.cos((lat * Math.PI) / 180);
      const yy = cy - r * Math.sin((lat * Math.PI) / 180) * Math.cos(rotX);
      ctx.beginPath();
      ctx.ellipse(cx, yy, rl, rl * Math.abs(Math.sin(rotX)) * 0.28 + 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let lon = 0; lon < 180; lon += 45) {
      ctx.beginPath();
      for (let a = 0; a <= 360; a += 6) {
        const rr = (a * Math.PI) / 180;
        const ll = (lon * Math.PI) / 180;
        const sx = Math.sin(rr) * Math.cos(ll);
        const sy = Math.cos(rr);
        const sz = Math.sin(rr) * Math.sin(ll);
        const p = M.rot3d(sx, sy, sz, rotX, rotY);
        const px = cx + p.x * r;
        const py = cy - p.y * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    const pN = M.rot3d(0, 1, 0, rotX, rotY);
    const pS = M.rot3d(0, -1, 0, rotX, rotY);
    ctx.fillStyle = COL.label;
    ctx.font = 'bold 9px monospace';
    ctx.fillText('|0⟩', cx + pN.x * r - 10, cy - pN.y * r - 4);
    ctx.fillText('|1⟩', cx + pS.x * r - 10, cy - pS.y * r + 12);
    if (label) {
      ctx.fillStyle = COL.dim;
      ctx.font = '8px monospace';
      ctx.fillText(label, cx - r, cy - r - 6);
    }
  }

  function project(rx, ry, rz, cx, cy, r, rotX, rotY) {
    const p = root.BlochMath.rot3d(rx, ry, rz, rotX, rotY);
    return { x: cx + p.x * r * 0.92, y: cy - p.y * r * 0.92, z: p.z };
  }

  function drawTrajectory(ctx, path, cx, cy, r, rotX, rotY, color, highlightLast) {
    if (!path || path.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    path.forEach((pt, i) => {
      const pr = project(pt.rx, pt.ry, pt.rz, cx, cy, r, rotX, rotY);
      if (i === 0) ctx.moveTo(pr.x, pr.y);
      else ctx.lineTo(pr.x, pr.y);
    });
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    path.forEach((pt, i) => {
      if (i % 4 !== 0 && i !== path.length - 1) return;
      const pr = project(pt.rx, pt.ry, pt.rz, cx, cy, r, rotX, rotY);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, i === path.length - 1 && highlightLast ? 0 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    const last = path[path.length - 1];
    const pr = project(last.rx, last.ry, last.rz, cx, cy, r, rotX, rotY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(pr.x, pr.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawPoint(ctx, b, cx, cy, r, rotX, rotY, color, label) {
    const pr = project(b.rx, b.ry, b.rz, cx, cy, r, rotX, rotY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(pr.x, pr.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.fillStyle = COL.label;
      ctx.font = '7px monospace';
      ctx.fillText(label, pr.x + 6, pr.y - 4);
    }
  }

  function drawMagneticBridge(ctx, r1, r2, wave, leftCx, rightCx, cy, r, rotX, rotY) {
    if (!wave || !wave.length) return;
    const midX = (leftCx + rightCx) / 2;
    ctx.strokeStyle = COL.flux;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    wave.forEach((s, i) => {
      const px = leftCx + (rightCx - leftCx) * s.u;
      const py = cy - s.z * r * 0.35 + Math.sin(s.phase * 3) * 8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const p1 = project(r1.rx, r1.ry, r1.rz, leftCx, cy, r, rotX, rotY);
    const p2 = project(r2.rx, r2.ry, r2.rz, rightCx, cy, r, rotX, rotY);
    ctx.strokeStyle = COL.flux + '88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(midX, cy - r * 0.5, p2.x, p2.y);
    ctx.stroke();
  }

  function renderDual(canvas, state) {
    const { ctx, w, h } = prepareCanvas(canvas);

    const rotX = state.rotX ?? -0.35;
    const rotY = state.rotY ?? 0.45;
    const r = Math.min(w, h) * 0.22;
    const leftCx = w * 0.28;
    const rightCx = w * 0.72;
    const cy = h * 0.52;

    drawSphere(ctx, leftCx, cy, r, rotX, rotY, 'particle |ψ⟩');
    drawSphere(ctx, rightCx, cy, r, rotX, rotY, 'inverse r⁻');
    const stress = stressMetrics(state, rotX, rotY, leftCx, cy, rightCx, cy, r);
    drawCompressionRings(ctx, leftCx, cy, r, stress.tension, rotX);
    drawCompressionRings(ctx, rightCx, cy, r, stress.tension, rotX);

    if (state.pathParticle) drawTrajectory(ctx, state.pathParticle, leftCx, cy, r, rotX, rotY, COL.trail, true);
    if (state.pathInverse) drawTrajectory(ctx, state.pathInverse, rightCx, cy, r, rotX, rotY, COL.trail2, true);

    if (state.particle) drawPoint(ctx, state.particle, leftCx, cy, r, rotX, rotY, COL.particle, 'ψ');
    if (state.inverse) drawPoint(ctx, state.inverse, rightCx, cy, r, rotX, rotY, COL.inverse, 'r⁻');
    if (state.antimatter) {
      const pr = project(state.antimatter.rx, state.antimatter.ry, state.antimatter.rz, leftCx, cy, r * 0.55, rotX, rotY);
      ctx.fillStyle = COL.antimatter;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COL.dim;
      ctx.font = '7px monospace';
      ctx.fillText('ψ̃', pr.x + 5, pr.y);
    }

    if (state.particle && state.inverse && state.wave) {
      drawMagneticBridge(ctx, state.particle, state.inverse, state.wave, leftCx, rightCx, cy, r, rotX, rotY);
    }

    ctx.fillStyle = COL.dim;
    ctx.font = '8px monospace';
    const p = state.particle;
    if (p) {
      ctx.fillText(
        `θ=${p.theta.toFixed(4)} φ=${p.phi.toFixed(4)} tension=${stress.tension.toFixed(3)} depth=${stress.depth.toFixed(3)} comp=${stress.compression.toFixed(3)}`,
        8,
        h - 8
      );
    }
  }

  /** IBM Composer–style single Bloch viewer (large centered sphere). */
  function renderSingle(canvas, state) {
    const { ctx, w, h } = prepareCanvas(canvas);

    const rotX = state.rotX ?? -0.35;
    const rotY = state.rotY ?? 0.45;
    const r = Math.min(w, h) * 0.38;
    const cx = w / 2;
    const cy = h / 2;

    drawSphere(ctx, cx, cy, r, rotX, rotY, null);

    if (state.pathParticle && state.pathParticle.length > 1) {
      drawTrajectory(ctx, state.pathParticle, cx, cy, r, rotX, rotY, COL.trail, true);
    }
    if (state.particle) {
      drawPoint(ctx, state.particle, cx, cy, r, rotX, rotY, COL.particle, null);
    }

    const p = state.particle;
    if (p) {
      const p0 = ((p.p0 != null ? p.p0 : Math.cos(p.theta / 2) ** 2) * 100).toFixed(1);
      ctx.fillStyle = COL.dim;
      ctx.font = '10px monospace';
      ctx.fillText(`|ψ⟩  P(|0⟩)=${p0}%`, 12, 18);
      ctx.fillText(`θ=${p.theta.toFixed(3)}  φ=${p.phi.toFixed(3)}`, 12, 32);
      ctx.fillText(
        `r=(${p.rx.toFixed(3)}, ${p.ry.toFixed(3)}, ${p.rz.toFixed(3)})`,
        12,
        h - 10
      );
    }

    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('drag to rotate', w - 12, h - 10);
    ctx.textAlign = 'left';
  }

  function renderPanel(canvas, state, mode) {
    const { ctx, w, h } = prepareCanvas(canvas);

    const rotX = state.rotX ?? -0.35;
    const rotY = state.rotY ?? 0.45;
    const layout = mode || 'single';
    const r = Math.max(26, Math.min(w, h) * (layout === 'single' ? 0.36 : 0.22));
    const p = state.particle;
    const inv = state.inverse;
    const anti = state.antimatter;
    const nodes = [];

    if (layout === 'single') {
      nodes.push({ x: w * 0.52, y: h * 0.52, r, b: p, label: '|ψ⟩', color: COL.particle, path: state.pathParticle });
    } else if (layout === 'stacked') {
      const rr = Math.max(22, Math.min(w * 0.11, h * 0.18));
      nodes.push({ x: w * 0.32, y: h * 0.32, r: rr, b: p, label: 'ψ', color: COL.particle, path: state.pathParticle });
      nodes.push({ x: w * 0.50, y: h * 0.50, r: rr, b: inv, label: 'r⁻', color: COL.inverse, path: state.pathInverse });
      nodes.push({ x: w * 0.68, y: h * 0.68, r: rr, b: anti, label: 'ψ̃', color: COL.antimatter });
    } else if (layout === 'quad') {
      const rr = Math.max(20, Math.min(w * 0.095, h * 0.19));
      nodes.push({ x: w * 0.25, y: h * 0.34, r: rr, b: p, label: 'ψ', color: COL.particle, path: state.pathParticle });
      nodes.push({ x: w * 0.48, y: h * 0.34, r: rr, b: inv, label: 'r⁻', color: COL.inverse, path: state.pathInverse });
      nodes.push({ x: w * 0.25, y: h * 0.72, r: rr, b: anti, label: 'ψ̃', color: COL.antimatter });
      nodes.push({ x: w * 0.48, y: h * 0.72, r: rr, b: p, label: 'entangled', color: COL.trail2, path: state.pathParticle });
    } else {
      const gap = layout === 'gapped' ? 0.22 : 0.16;
      const rr = Math.max(24, Math.min(w * 0.12, h * 0.24));
      nodes.push({ x: w * (0.5 - gap), y: h * 0.54, r: rr, b: p, label: 'ψ', color: COL.particle, path: state.pathParticle });
      nodes.push({ x: w * (0.5 + gap), y: h * 0.54, r: rr, b: inv, label: 'r⁻', color: COL.inverse, path: state.pathInverse });
    }

    nodes.forEach((node) => {
      drawSphere(ctx, node.x, node.y, node.r, rotX, rotY, node.label);
      if (node.path) drawTrajectory(ctx, node.path, node.x, node.y, node.r, rotX, rotY, node.color, true);
      if (node.b) drawPoint(ctx, node.b, node.x, node.y, node.r, rotX, rotY, node.color, null);
    });

    if (nodes.length > 1 && p && inv) {
      const stress = stressMetrics(state, rotX, rotY, nodes[0].x, nodes[0].y, nodes[1].x, nodes[1].y, nodes[0].r);
      nodes.slice(0, 2).forEach((node) => drawCompressionRings(ctx, node.x, node.y, node.r, stress.tension, rotX));
      ctx.strokeStyle = COL.flux + '99';
      ctx.lineWidth = 1.4;
      ctx.setLineDash(layout === 'gapped' ? [4, 4] : []);
      for (let i = 0; i < nodes.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.quadraticCurveTo((nodes[i].x + nodes[i + 1].x) / 2, h * 0.18, nodes[i + 1].x, nodes[i + 1].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    if ((layout === 'dual' || layout === 'gapped') && p && inv && state.wave && nodes[0] && nodes[1]) {
      drawMagneticBridge(ctx, p, inv, state.wave, nodes[0].x, nodes[1].x, nodes[0].y, nodes[0].r, rotX, rotY);
    }

    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    const metric = nodes.length > 1 ? stressMetrics(state, rotX, rotY, nodes[0].x, nodes[0].y, nodes[1].x, nodes[1].y, nodes[0].r) : null;
    ctx.fillText(metric ? `${layout} · tension ${metric.tension.toFixed(2)}` : 'drag to rotate', w - 12, h - 10);
    ctx.textAlign = 'left';
  }

  root.BlochRender = { renderDual, renderSingle, renderPanel, stressMetrics, drawSphere, project, COL };
})(typeof window !== 'undefined' ? window : globalThis);

