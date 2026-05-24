/**
 * IronLine ↔ composerIBM bridge.
 *
 * Drop into composerIBM via:
 *   <script src="integrations/ironline-bridge.js"></script>
 *
 * Pipes:
 *   - BroadcastChannel('quantum-loopback')   →   POST {ironline}/v1/jobs
 *   - {ironline}/v1/route/explain            →   window.IronLine.explain(task)
 *
 * Events ingested (from ugrad-r0 / composerIBM PWA):
 *   composerIBM-set-qasm           → task: "quantum", input: qasm
 *   circuit-run-request            → task: "quantum-run"
 *   bloch-state-update             → task: "concept-steer"
 *
 * No bundler required. Pure ES module-free script.
 */
(function () {
  var DEFAULT_BASE = 'http://127.0.0.1:9472';
  var BASE = (window.IRONLINE_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  var CLIENT = 'composerIBM';

  function postJob(payload) {
    return fetch(BASE + '/v1/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-IronLine-Client': CLIENT,
        'X-IronLine-Task': payload.task || 'quantum',
      },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (j) {
        return { status: r.status, body: j };
      });
    });
  }

  function explain(task) {
    return fetch(BASE + '/v1/route/explain?task=' + encodeURIComponent(task))
      .then(function (r) { return r.json(); });
  }

  function chat(task, messages) {
    return fetch(BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-IronLine-Client': CLIENT,
        'X-IronLine-Task': task,
      },
      body: JSON.stringify({ messages: messages, stream: false }),
    }).then(function (r) { return r.json(); });
  }

  function attach() {
    var bc;
    try { bc = new BroadcastChannel('quantum-loopback'); } catch (_) { return; }
    bc.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d || typeof d !== 'object') return;
      switch (d.type) {
        case 'composerIBM-set-qasm':
          postJob({ task: 'quantum', input: d.qasm, source: d.source || 'unknown' });
          break;
        case 'circuit-run-request':
          postJob({ task: 'quantum-run', input: d.qasm, backend: d.backend });
          break;
        case 'bloch-state-update':
          postJob({ task: 'concept-steer', input: JSON.stringify(d.state || {}) });
          break;
        default:
          break;
      }
    };
  }

  window.IronLine = {
    base: BASE,
    job: postJob,
    chat: chat,
    explain: explain,
    health: function () { return fetch(BASE + '/healthz').then(function (r) { return r.json(); }); },
  };

  attach();
})();
