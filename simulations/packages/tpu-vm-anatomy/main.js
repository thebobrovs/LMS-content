// createSim is a global from sim-sdk.js (classic script). An interactive cutaway
// of a Cloud TPU chip (host → PCIe → chip: two TensorCores each with scalar+SMEM,
// VPU+VMEM, 4 MXUs; shared HBM; ICI to neighbours). A workload toggle shows the
// 8th-gen divergence: TPU 8t (training) keeps SparseCores; TPU 8i (inference)
// swaps them for a CAE and triples on-chip SRAM. Click a part for role + spec.
// Theme-aware, SDK-wired, no CDNs.
const app = document.getElementById("app");

const PARTS = {
  host: { name: "Host", role: "The Linux host VM you SSH into (root). Your JAX or PyTorch/XLA code runs here and dispatches to the chip — no per-operation network hop to the accelerator.", spec: "x86 / Arm Axion host VM · root SSH" },
  pcie: { name: "PCIe", role: "The link between the host and the TPU chip. Your program crosses here to launch; the heavy compute then stays on the chip.", spec: "PCIe (host ↔ chip)" },
  chip: { name: "TPU chip", role: "Google's ML ASIC: TensorCores + HBM + a workload-specific block (SparseCores on TPU 8t, a CAE on TPU 8i) + ICI. It can't run general-purpose code.", spec: "TensorCores + HBM + SparseCore/CAE + ICI" },
  tensorcore: { name: "TensorCore", role: "The compute core. Each bundles 4 MXUs (matmul), a vector unit (VPU + VMEM), and a scalar unit (+ SMEM). 8th-gen chips carry two per chip.", spec: "4× MXU + VPU/VMEM + scalar/SMEM" },
  scalar: { name: "Scalar unit", role: "Runs control flow and computes the memory addresses that feed the vector and matrix units.", spec: "scalar control + addressing" },
  smem: { name: "SMEM — scalar memory", role: "The small on-chip scratchpad the scalar unit works from.", spec: "scalar scratchpad" },
  vpu: { name: "VPU — vector unit", role: "The non-matmul math: activations, softmax, normalization, elementwise ops. It's why real utilization (MFU) sits below the MXU's peak.", spec: "SIMD vector ALU" },
  vmem: { name: "VMEM — vector memory", role: "On-chip vector scratchpad kept close to compute; staging tensors here (not HBM) keeps the MXUs fed. On TPU 8i it triples (to 384 MB) so the KV cache lives on-chip.", spec: "vector scratchpad" },
  mxu: { name: "MXU — Matrix Multiply Unit", role: "Each TensorCore has 4 MXUs. Each is a systolic array where matmuls run — bf16 in, fp32 accumulate. This is where your model's FLOPs happen.", spec: "128×128 (256×256 on v6e/v7) · 16,384 MACs/cycle each" },
  hbm: { name: "HBM — High-Bandwidth Memory", role: "On-package memory shared by the TensorCores. Keeping the MXUs fed from HBM is the whole performance game — that's arithmetic intensity.", spec: "" },
  sparsecore: { name: "SparseCore", role: "A dataflow unit that accelerates very large embedding lookups — the heavy part of recommendation/ranking and MoE routing. On TPU 8t (training) there are four; TPU 8i replaces them with a CAE.", spec: "TPU 8t / v5p / v6e / v7 · embeddings + MoE" },
  cae: { name: "CAE — Collectives Acceleration Engine", role: "On TPU 8i (inference) the four SparseCores are replaced by one CAE on a chiplet die. It aggregates results across cores with near-zero latency — cutting on-chip collective latency ~5×, which is what makes auto-regressive decoding fast.", spec: "TPU 8i · replaces 4 SparseCores · −5× collective latency" },
  ici: { name: "ICI — Inter-Chip Interconnect", role: "High-speed links wiring chips into a slice and Pod, bypassing the host network. Collectives (all-reduce) ride these. TPU 8t uses a 3D torus; TPU 8i uses the lower-diameter Boardfly network.", spec: "8t: 3D torus · 8i: Boardfly (~7 hops/1,024 chips)" },
};

let selected = "chip";
let gen = "8t"; // 8t = training, 8i = inference
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function vmemSpec() { return gen === "8i" ? "384 MB on TPU 8i (3×) — holds the KV cache on-chip" : "128 MB on TPU 8t · vector scratchpad"; }
function hbmSpec() { return gen === "8i" ? "288 GB @ ≈8.6 TB/s (TPU 8i)" : "216 GB @ ≈6.5 TB/s (TPU 8t)"; }
function detail() {
  const base = PARTS[selected] || PARTS.chip;
  if (selected === "vmem") return { ...base, spec: vmemSpec() };
  if (selected === "hbm") return { ...base, spec: hbmSpec() };
  return base;
}
function select(part) {
  selected = part;
  if (part === "mxu" && !observed) { observed = true; sim.checkpoint("observe-anatomy"); }
  sim.event("inspect", { part });
  render();
}
function switchGen(g) {
  if (g === gen) return;
  if (selected === "sparsecore" && g === "8i") selected = "cae";
  else if (selected === "cae" && g === "8t") selected = "sparsecore";
  gen = g;
  sim.event("workload", { gen });
  render();
}
function mark(n) { return `<span class="marker">${n}</span>`; }
function cls(id) { return `part ${selected === id ? "sel" : ""}`; }

function tensorCore(badges) {
  const vmemLabel = gen === "8i" ? `VMEM <span class="x3">3×</span>` : "VMEM";
  return `
    <div class="${cls("tensorcore")}" data-part="tensorcore" tabindex="0" role="button">
      <div class="tc-label">${badges ? mark(1) : ""}Tensor core</div>
      <div class="tc-units">
        <div class="${cls("scalar")} u" data-part="scalar" tabindex="0" role="button">${badges ? mark(2) : ""}Scalar unit</div>
        <div class="${cls("smem")} u" data-part="smem" tabindex="0" role="button">SMEM</div>
        <div class="${cls("vpu")} u" data-part="vpu" tabindex="0" role="button">${badges ? mark(3) : ""}VPU</div>
        <div class="${cls("vmem")} u ${gen === "8i" ? "big" : ""}" data-part="vmem" tabindex="0" role="button">${vmemLabel}</div>
      </div>
      <div class="mxus">
        ${[0, 1, 2, 3].map((i) => `<div class="${cls("mxu")} mxu" data-part="mxu" tabindex="0" role="button">${badges && i === 0 ? mark(4) : ""}MXU</div>`).join("")}
      </div>
    </div>`;
}

function bottomRow() {
  if (gen === "8t") {
    return `<div class="sparse">
        <div class="${cls("sparsecore")} sc" data-part="sparsecore" tabindex="0" role="button">${mark(6)}SparseCore</div>
        <div class="${cls("sparsecore")} sc" data-part="sparsecore" tabindex="0" role="button">SparseCore</div>
      </div>`;
  }
  return `<div class="sparse">
      <div class="${cls("cae")} sc cae" data-part="cae" tabindex="0" role="button">${mark(6)}CAE — Collectives Acceleration Engine</div>
    </div>`;
}

function render() {
  const d = detail();
  const hbmGB = gen === "8i" ? "288" : "216";
  app.innerHTML = `
    <div class="topbar">
      <div class="gentabs" role="tablist">
        <button class="gtab ${gen === "8t" ? "on" : ""}" data-gen="8t" role="tab" aria-selected="${gen === "8t"}">Training · 8t</button>
        <button class="gtab ${gen === "8i" ? "on" : ""}" data-gen="8i" role="tab" aria-selected="${gen === "8i"}">Inference · 8i</button>
      </div>
      <span class="hint">Select a part to learn more · toggle the workload to see the silicon change.</span>
    </div>

    <div class="stage">
      <div class="${cls("host")} side host" data-part="host" tabindex="0" role="button">Host</div>
      <div class="arr">↔</div>
      <div class="${cls("pcie")} side pcie" data-part="pcie" tabindex="0" role="button">PCIe</div>

      <div class="chip">
        <div class="cores">${tensorCore(true)}${tensorCore(false)}</div>
        <div class="${cls("hbm")} hbm" data-part="hbm" tabindex="0" role="button">${mark(5)}HBM ${hbmGB} GB</div>
        ${bottomRow()}
        <div class="chip-name">TPU ${gen} · ${gen === "8t" ? "training" : "inference"}</div>
      </div>

      <div class="arr">↔</div>
      <div class="${cls("ici")} side ici" data-part="ici" tabindex="0" role="button">${mark(7)}ICI</div>
      <div class="arr">↔</div>
      <div class="${cls("chip")} side neighbor" data-part="chip" tabindex="0" role="button">Chip</div>
    </div>

    <div class="gennote">${
      gen === "8t"
        ? "<strong>TPU 8t (training):</strong> SparseCores for embeddings, on a 3D-torus network."
        : "<strong>TPU 8i (inference):</strong> SparseCores → <strong>CAE</strong> (−5× on-chip collective latency), VMEM tripled to 384 MB for the KV cache, on the Boardfly network."
    }</div>

    <div class="detail" role="status">
      <div class="dname">${d.name}</div>
      <div class="drole">${d.role}</div>
      <div class="dspec">${d.spec}</div>
    </div>`;

  app.querySelectorAll(".gtab").forEach((el) =>
    el.addEventListener("click", () => switchGen(el.getAttribute("data-gen"))),
  );
  app.querySelectorAll(".part").forEach((el) => {
    const part = el.getAttribute("data-part");
    el.addEventListener("click", (e) => { e.stopPropagation(); select(part); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(part); } });
  });
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
