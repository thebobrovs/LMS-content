// createSim is a global from sim-sdk.js (classic script). One matmul + a chain of
// elementwise ops. Toggle XLA fusion: unfused, every op round-trips through HBM;
// fused, the intermediates stay on-chip and only the inputs/output touch HBM. Same
// FLOPs, far fewer bytes → arithmetic intensity jumps past the v5p ridge and the op
// flips from memory-bound to compute-bound. Deterministic, theme-aware, no CDNs.
const app = document.getElementById("app");

// One illustrative layer: A[512×512] @ W[512×512] → +bias → GELU → ×scale, bf16.
const TENSOR_MB = 0.5; // a 512×512 bf16 tensor ≈ 0.5 MB
const FLOPS = 2 * 512 * 512 * 512; // matmul dominates ≈ 268 MFLOP
const RIDGE = 165; // v5p ridge, FLOP/byte (1.3 callback)

const OPS = [
  { label: "MatMul", el: false },
  { label: "+ bias", el: true },
  { label: "GELU", el: true },
  { label: "× scale", el: true },
];

// Unfused: matmul reads A + W, writes Y (3); each elementwise reads + writes (2 each).
const UNFUSED_TRIPS = 3 + OPS.filter((o) => o.el).length * 2; // 9
const FUSED_TRIPS = 3; // read A, read W, write final — intermediates stay in VMEM

let fused = false;
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function setFused(v) {
  fused = v;
  if (fused && !observed) { observed = true; sim.checkpoint("observe-fusion"); }
  sim.event("fusion", { fused });
  render();
}

function render() {
  const trips = fused ? FUSED_TRIPS : UNFUSED_TRIPS;
  const mb = +(trips * TENSOR_MB).toFixed(1);
  const intensity = Math.round(FLOPS / (mb * 1e6));
  const compute = intensity > RIDGE;

  const opNodes = OPS.map((o, i) => {
    const onChip = fused && i > 0; // matmul still reads inputs; rest stay on-chip
    return `<div class="op ${o.el ? "elem" : "mm"}">
        <span class="oplabel">${o.label}</span>
        <span class="mem ${fused ? (i === 0 || i === OPS.length - 1 ? "hbm" : "vmem") : "hbm"}">${
          fused ? (i === 0 ? "↑ HBM in" : i === OPS.length - 1 ? "↓ HBM out" : "VMEM") : "⇅ HBM"
        }</span>
      </div>`;
  }).join(`<span class="arrow">→</span>`);

  app.innerHTML = `
    <div class="hint">XLA doesn't run your ops one by one — it <b>fuses</b> a chain into a single kernel so the in-between results never leave the chip. Same math, far fewer trips to <b>HBM</b>. Toggle it:</div>

    <div class="toggle">
      <button class="seg ${!fused ? "on" : ""}" data-f="0">Unfused</button>
      <button class="seg ${fused ? "on" : ""}" data-f="1">Fused (XLA)</button>
    </div>

    <div class="pipe ${fused ? "fusedwrap" : ""}">
      ${fused ? `<div class="kernel-label">1 fused kernel</div>` : ""}
      <div class="ops">${opNodes}</div>
    </div>
    <div class="hbmbar">HBM — off-chip DRAM · ${trips} round-trip${trips === 1 ? "" : "s"} this layer</div>

    <div class="stats">
      <div class="stat"><div class="k">HBM round-trips</div><div class="v">${trips}</div></div>
      <div class="stat"><div class="k">Data moved</div><div class="v">${mb} <small>MB</small></div></div>
      <div class="stat"><div class="k">Arithmetic intensity</div><div class="v">${intensity} <small>FLOP/byte</small></div></div>
      <div class="stat ${compute ? "good" : "warn"}"><div class="k">vs v5p ridge (${RIDGE})</div><div class="v">${compute ? "compute-bound" : "MEMORY-bound"}</div></div>
    </div>

    <div class="note">${
      fused
        ? `Fused: the matmul reads A and W once and writes the final result once — bias, GELU and scale ride along in the matmul's epilogue, in VMEM. <b>${intensity} FLOP/byte &gt; ${RIDGE}</b> → the MXU is the bottleneck, which is what you want.`
        : `Unfused: every op re-reads its input from HBM and writes its output back — <b>${trips} trips, ${mb} MB</b> for one layer's worth of math. <b>${intensity} FLOP/byte &lt; ${RIDGE}</b> → you're starved by memory, the MXU idles.`
    }</div>`;

  app.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("click", () => setFused(el.getAttribute("data-f") === "1")));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
