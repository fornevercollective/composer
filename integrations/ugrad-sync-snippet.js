/**
 * Optional: add to ugrad-r0.html after quantum export to sync QASM into composerIBM.
 * <script src="file:///Users/qbit/models/chat/composerIBM/integrations/ugrad-sync-snippet.js"></script>
 */
(function () {
  if (typeof UGRAD === 'undefined' || !UGRAD.hook) return;
  UGRAD.hook('quantum-export', function (data) {
    if (!data || !data.qasm) return;
    try {
      localStorage.setItem('ugrad.lastQASM', data.qasm);
    } catch (_) {}
    try {
      new BroadcastChannel('quantum-loopback').postMessage({
        type: 'composerIBM-set-qasm',
        source: 'ugrad-r0',
        qasm: data.qasm
      });
    } catch (_) {}
  });
  var orig = window.ugradGetState;
  if (typeof orig === 'function') {
    window.ugradGetState = function () {
      var st = orig();
      if (st && st.lastQASM) {
        try {
          localStorage.setItem('ugrad.lastQASM', st.lastQASM);
        } catch (_) {}
      }
      return st;
    };
  }
})();
