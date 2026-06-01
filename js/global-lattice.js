/**
 * Global Quantum Lattice — world-scale view of all available quantum systems,
 * their geographic distribution, connection "hops", and estimated latency.
 * Uses existing QPUFleet (lat/lon/region) + QPUCalibrations for error coloring.
 * Designed to feel like a mission-control codex map (ties into "spacex trajectory" + existing codex button).
 */
(function (root) {
  'use strict';

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let fleet = [];
  let calibs = null;
  let hovered = null;

  function prepareCanvas(el) {
    if (!el) return null;
    canvas = el;
    ctx = canvas.getContext('2d', { alpha: true });
    dpr = root.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    return ctx;
  }

  function project(lat, lon, w, h) {
    // Simple equirectangular projection (good enough for overview)
    const x = (lon + 180) / 360 * w;
    const y = (90 - lat) / 180 * h;
    return { x, y };
  }

  function estimatedLatency(q1, q2) {
    if (!q1 || !q2 || q1.lat == null || q2.lat == null) return 35;
    // Very rough great-circle + internet base latency model (ms)
    const dLat = (q2.lat - q1.lat) * Math.PI / 180;
    const dLon = (q2.lon - q1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(q1.lat*Math.PI/180) * Math.cos(q2.lat*Math.PI/180) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const km = 6371 * c;
    const base = 15 + Math.min(120, km / 150); // ~light + routing
    const tzDelta = Math.abs((q1.lon || 0) - (q2.lon || 0)) / 15;
    return Math.round(base + tzDelta * 4);
  }

  function draw() {
    if (!ctx || !canvas) return;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    // Subtle background grid (world lines feel)
    ctx.strokeStyle = 'rgba(200,212,227,0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const y = (h / 6) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const x = (w / 8) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    const nodes = fleet.filter(q => q.lat != null && q.lon != null && q.q > 0);

    // Draw "hops" (major inter-hub connections + same-vendor long-haul)
    ctx.strokeStyle = 'rgba(9,105,218,0.25)';
    ctx.lineWidth = 1.2;

    const hubs = ['ibm', 'quantinuum', 'ionq', 'rigetti', 'google'];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const sameVendor = a.vendor === b.vendor;
        const isHubLink = hubs.some(h => a.name.includes(h) && b.name.includes(h));
        if (sameVendor || isHubLink) {
          const p1 = project(a.lat, a.lon, w, h);
          const p2 = project(b.lat, b.lon, w, h);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    nodes.forEach((q) => {
      const p = project(q.lat, q.lon, w, h);
      const calib = calibs && calibs.get ? calibs.get(q.name) : null;
      const err = calib ? (calib.stats?.median_err_2q || calib.stats?.median_err_1q || 0.01) : 0.01;
      const size = Math.max(4, Math.min(14, Math.log2(q.q || 50) * 1.6));
      const isHovered = hovered && hovered.name === q.name;

      // Node
      ctx.fillStyle = isHovered ? '#45b8e8' : (err < 0.005 ? '#3fb950' : err < 0.02 ? '#d4a72c' : '#f85149');
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();

      // Label (small)
      if (q.q > 50 || isHovered) {
        ctx.fillStyle = '#1f2937';
        ctx.font = '9px monospace';
        ctx.fillText((q.name || '').split('_').pop(), p.x + size + 3, p.y + 3);
      }
    });

    // Latency legend / hovered info
    ctx.fillStyle = '#607087';
    ctx.font = '10px monospace';
    ctx.fillText('Global Quantum Codex — nodes sized by qubits, color by median 2Q error. Lines = same-vendor / major hops. Latency on hover (synthetic model).', 10, 18);

    if (hovered) {
      const ref = nodes.find(n => n.name.includes('ibm_torino')) || nodes[0];
      const lat = estimatedLatency(hovered, ref);
      ctx.fillStyle = '#1f2937';
      ctx.fillText(`${hovered.name} → ~${lat}ms to ${ref.name.split('_').pop()} (est.)`, 10, h - 10);
    }
  }

  function onMove(e) {
    if (!canvas || !fleet.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * canvas.width / dpr;
    const y = (e.clientY - rect.top) / rect.height * canvas.height / dpr;

    let closest = null;
    let minDist = 18;

    fleet.forEach((q) => {
      if (q.lat == null) return;
      const p = project(q.lat, q.lon, canvas.width / dpr, canvas.height / dpr);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < minDist) {
        minDist = d;
        closest = q;
      }
    });
    hovered = closest;
    draw();
  }

  function init(hostId = 'global-lattice-canvas') {
    const host = root.document.getElementById(hostId);
    if (!host) return;

    canvas = root.document.createElement('canvas');
    canvas.id = hostId;
    canvas.style.cssText = 'width:100%;height:320px;display:block;border-radius:6px;background:#f8fbff;cursor:crosshair;';
    host.innerHTML = '';
    host.appendChild(canvas);

    prepareCanvas(canvas);

    // Data
    if (root.QPUFleet && root.QPUFleet.all) {
      fleet = root.QPUFleet.all();
    }
    if (root.QPUCalibrations) {
      calibs = root.QPUCalibrations;
    }

    // Interactions
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => { hovered = null; draw(); });

    // Initial draw
    draw();

    // Redraw on window resize (simple)
    root.addEventListener('resize', () => {
      prepareCanvas(canvas);
      draw();
    }, { passive: true });

    return { draw, refresh: () => draw() };
  }

  root.GlobalLattice = { init, draw };
})(typeof window !== 'undefined' ? window : globalThis);