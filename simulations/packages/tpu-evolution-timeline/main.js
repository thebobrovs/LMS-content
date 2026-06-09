// createSim is a global from sim-sdk.js (classic script). "Chasing the bottleneck":
// step through TPU generations; each broke the wall that capped the last. The bar
// shows the per-pod performance multiplier (log scale) where the source gives a
// number. Theme-aware, SDK-wired, no CDNs. Deterministic.
const app = document.getElementById("app");

// Figures per the TPU-evolution source doc (T-AITPU...): V2 = baseline.
const GENS = [
  { id: "v1", label: "V1", pod: null, bottleneck: "Inference on CPUs/GPUs was too slow and power-hungry.", fix: "A dedicated internal inference ASIC — matmul only.", note: "internal inference accelerator" },
  { id: "v2", label: "V2", pod: 1, bottleneck: "A single chip couldn't train large models.", fix: "Distributed shared memory → the first multi-chip Pods; moved to training.", note: "baseline · 1×/chip · 1×/pod" },
  { id: "v3", label: "V3", pod: 12, bottleneck: "Rising performance density broke air cooling.", fix: "Liquid cooling.", note: "≈3×/chip · 12×/pod" },
  { id: "v4", label: "V4", pod: 100, bottleneck: "Pods grew too big and failure-prone for static copper wiring.", fix: "Optical Circuit Switches (OCS) — reconfigure slices and route around dead chips.", note: "≈6.6×/chip · 100×/pod" },
  { id: "v5", label: "v5e / v5p", pod: 750, bottleneck: "One chip couldn't be both cheap and peak-performance.", fix: "Split variants: v5e (efficiency) and v5p (performance).", note: "v5p · 21×/chip · 750×/pod" },
  { id: "v6e", label: "v6e", pod: null, bottleneck: "Cost-efficiency for inference and smaller training runs.", fix: "Trillium — ≈100× the performance of V2.", note: "Trillium" },
  { id: "v7", label: "v7", pod: null, bottleneck: "Raw pod scale.", fix: "Ironwood (TPU7x) — ships in two pod sizes, 256 and 9,216 chips.", note: "Ironwood · up to 9,216 chips/pod" },
  { id: "v8", label: "8th gen", pod: null, bottleneck: "Training and serving bottlenecks diverged too far for one chip.", fix: "Split the silicon: TPU 8t (training, SparseCore) vs TPU 8i (inference, CAE).", note: "8t / 8i workload split" },
];
const MAXLOG = Math.log10(750);

let i = 0; // selected index
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function select(n) {
  i = Math.max(0, Math.min(GENS.length - 1, n));
  if (i === GENS.length - 1 && !observed) { observed = true; sim.checkpoint("observe-evolution"); }
  sim.event("generation", { gen: GENS[i].id });
  render();
}

function render() {
  const g = GENS[i];
  const bars = GENS.map((x, n) => {
    const h = x.pod ? 16 + (Math.log10(x.pod) / MAXLOG) * 84 : x.id === "v1" ? 10 : 100;
    const mega = !x.pod && x.id !== "v1";
    return `<button class="gen ${n === i ? "sel" : ""}" data-i="${n}" role="tab" aria-selected="${n === i}" title="${x.label}">
        <span class="bar ${mega ? "mega" : ""}" style="height:${h}%">${x.pod ? `<span class="mult">${x.pod}×</span>` : mega ? `<span class="mult">▲</span>` : ""}</span>
        <span class="glabel">${x.label}</span>
      </button>`;
  }).join("");

  app.innerHTML = `
    <div class="hint">Each generation broke the bottleneck that capped the last. Step through it — the bar is the per-pod performance multiplier (where the doc gives a number).</div>
    <div class="axis-y">per-pod performance ↑</div>
    <div class="chart" role="tablist">${bars}</div>

    <div class="controls">
      <button id="prev" class="secondary" ${i === 0 ? "disabled" : ""}>◀ Prev</button>
      <button id="next" class="primary" ${i === GENS.length - 1 ? "disabled" : ""}>Step ▶</button>
      <button id="reset" class="secondary">Reset</button>
      <span class="pos">${i + 1} / ${GENS.length}</span>
    </div>

    <div class="detail" role="status">
      <div class="dname">${g.label} <span class="dnote">${g.note}</span></div>
      <div class="drow"><span class="k bad">Bottleneck</span> ${g.bottleneck}</div>
      <div class="drow"><span class="k good">Fix</span> ${g.fix}</div>
    </div>`;

  app.querySelectorAll(".gen").forEach((el) => el.addEventListener("click", () => select(+el.getAttribute("data-i"))));
  app.querySelector("#prev").addEventListener("click", () => select(i - 1));
  app.querySelector("#next").addEventListener("click", () => select(i + 1));
  app.querySelector("#reset").addEventListener("click", () => select(0));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
