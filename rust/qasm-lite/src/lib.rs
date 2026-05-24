//! Fast OpenQASM stats for composerIBM (Rust / optional WASM).

use regex::Regex;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct QasmStats {
    pub qubit_count: u32,
    pub gate_count: u32,
    pub two_qubit_gates: u32,
    pub measure_count: u32,
    pub depth: u32,
    pub openqasm_version: u8,
}

pub fn analyze_qasm_source(qasm: &str) -> QasmStats {
    let mut qubits = 0u32;
    let mut gates = 0u32;
    let mut two_q = 0u32;
    let mut measures = 0u32;
    let mut depth = 0u32;

    let ver = if qasm.contains("OPENQASM 3") {
        3
    } else if qasm.contains("OPENQASM 2") {
        2
    } else {
        0
    };

    let qubit_re = Regex::new(r"(?i)qubit\s*\[\s*(\d+)\s*\]|qreg\s+\w+\s*\[\s*(\d+)\s*\]").unwrap();
    for cap in qubit_re.captures_iter(qasm) {
        let n: u32 = cap
            .get(1)
            .or_else(|| cap.get(2))
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);
        qubits = qubits.max(n);
    }

    let two_re = Regex::new(r"(?i)^(cx|cz|ch|ccx|cp|swap|iswap)\b").unwrap();
    let one_re = Regex::new(r"(?i)^(h|x|y|z|s|t|sx|rx|ry|rz|u\d?|p|id)\b|\)\s*q\[").unwrap();
    let meas_re = Regex::new(r"(?i)^measure\b").unwrap();

    for raw in qasm.lines() {
        let line = raw.split("//").next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("OPENQASM") || line.starts_with("include") {
            continue;
        }
        if line.starts_with("qubit") || line.starts_with("bit") || line.starts_with("qreg") || line.starts_with("creg")
        {
            continue;
        }
        if line.starts_with("barrier") {
            continue;
        }
        if meas_re.is_match(line) {
            measures += 1;
            gates += 1;
            depth += 1;
            continue;
        }
        if two_re.is_match(line) {
            two_q += 1;
            gates += 1;
            depth += 1;
            continue;
        }
        if one_re.is_match(line) {
            gates += 1;
            depth += 1;
        }
    }

    QasmStats {
        qubit_count: qubits,
        gate_count: gates,
        two_qubit_gates: two_q,
        measure_count: measures,
        depth,
        openqasm_version: ver,
    }
}

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn analyze_qasm(qasm: &str) -> String {
    serde_json::to_string(&analyze_qasm_source(qasm)).unwrap_or_else(|_| "{}".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bell_stats() {
        let qasm = r#"OPENQASM 3.0;
qubit[2] q;
h q[0];
cx q[0], q[1];
measure q[0];
"#;
        let s = analyze_qasm_source(qasm);
        assert_eq!(s.qubit_count, 2);
        assert!(s.gate_count >= 3);
    }
}
