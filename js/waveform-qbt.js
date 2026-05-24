/**
 * Ballistic waveform preview — offline Mach-scaled envelope before QPU sim billing.
 */
(function (root) {
  'use strict';

  function machEnvelope(mach, t, altIdx) {
    const m = Math.max(0.05, Math.min(25, mach));
    const alt = [0, 0.3, 0.7, 1.0][altIdx % 4] || 0;
    const shock = m > 1 ? Math.exp(-((t - 0.35) ** 2) / (0.02 + 0.001 * m)) * (m - 0.9) : 0;
    const carrier = Math.sin(2 * Math.PI * (8 + m * 2) * t) * Math.exp(-t * (1.2 + alt));
    const boom = m > 1 ? 0.4 * Math.sin(40 * Math.PI * t) * Math.exp(-t * 3) : 0;
    return carrier * (0.5 + 0.1 * m) + shock + boom;
  }

  function sampleWaveform(opts) {
    const mach = opts.mach ?? 1.0;
    const alt = opts.alt ?? 0;
    const n = opts.samples ?? 256;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out[i] = machEnvelope(mach, t, alt);
    }
    return { samples: out, mach, alt, metrics: ballisticMetrics(out) };
  }

  function ballisticMetrics(samples) {
    let max = 0,
      energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      max = Math.max(max, Math.abs(v));
      energy += v * v;
    }
    energy /= samples.length || 1;
    return { peak: max, energy: energy, ic: Math.sqrt(energy) };
  }

  function drawWaveform(canvas, samples, color) {
    if (!canvas || !samples) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color || '#0969da';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const mid = h / 2;
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = mid - samples[i] * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#607087';
    ctx.font = '9px monospace';
    ctx.fillText('QBT preview (offline)', 6, 12);
  }

  root.WaveformQBT = { sampleWaveform, drawWaveform, machEnvelope, ballisticMetrics };
})(typeof window !== 'undefined' ? window : globalThis);
