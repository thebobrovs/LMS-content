// createSim is a global from sim-sdk.js (classic script). An interactive cutaway
// of a Cloud TPU chip, matching Google's architecture diagram: host → PCIe → chip
// (two TensorCores, each with scalar unit + SMEM, VPU + VMEM, and 4 MXUs), shared
// HBM, two SparseCores, and ICI links to neighbour chips. Click a part (or its
// numbered marker) to read its role + spec. Theme-aware, SDK-wired, no CDNs.
const app = document.getElementById("app");

const PARTS = {
  host: {
    name: "Host",
    role: "The Linux host VM you SSH into (root access). Your JAX or PyTorch/XLA code runs here and dispatches the work to the chip — there's no per-operation network hop to the accelerator.",
    spec: "x86 host VM · root SSH",
  },
  pcie: {
    name: "PCIe",
    role: "The link between the host and the TPU chip. Your program crosses here to launch, then the heavy compute stays on the chip.",
    spec: "PCIe (host ↔ chip)",
  },
  chip: {
    name: "TPU chip",
    role: "Google's ML ASIC. Holds one or more TensorCores, HBM, and SparseCores, and connects to neighbour chips over ICI. It can't run general-purpose code.",
    spec: "TensorCores + HBM + SparseCores + ICI",
  },
  tensorcore: {
    name: "TensorCore",
    role: "The compute core. Each one bundles 4 MXUs (matmul), a vector unit (VPU + VMEM), and a scalar unit (+ SMEM). A chip has one or more — this diagram shows two.",
    spec: "4× MXU + VPU/VMEM + scalar/SMEM",
  },
  scalar: {
    name: "Scalar unit",
    role: "Runs control flow and computes the memory addresses that feed the vector and matrix units.",
    spec: "scalar control + addressing",
  },
  smem: {
    name: "SMEM — scalar memory",
    role: "The small on-chip scratchpad the scalar unit works from.",
    spec: "scalar scratchpad",
  },
  vpu: {
    name: "VPU — vector unit",
    role: "The non-matmul math: activations, softmax, normalization, and elementwise ops. It's why real utilization (MFU) sits below the MXU's peak.",
    spec: "SIMD vector ALU",
  },
  vmem: {
    name: "VMEM — vector memory",
    role: "On-chip vector scratchpad kept close to compute. Staging tensors in VMEM (not HBM) is how you keep the MXUs fed.",
    spec: "vector scratchpad",
  },
  mxu: {
    name: "MXU — Matrix Multiply Unit",
    role: "Each TensorCore has 4 MXUs. Each is a systolic array where matmuls run — bf16 in, fp32 accumulate. This is where your model's FLOPs happen.",
    spec: "128×128 (256×256 on v6e/v7) · 16,384 MACs/cycle each",
  },
  hbm: {
    name: "HBM — High-Bandwidth Memory",
    role: "On-package memory shared by the TensorCores. Keeping the MXUs fed from HBM is the whole performance game — that's arithmetic intensity.",
    spec: "≈95 GB @ ≈2.8 TB/s (v5p)",
  },
  sparsecore: {
    name: "SparseCore",
    role: "A dataflow unit (two per chip on v5p) that accelerates very large embedding lookups — the heavy part of recommendation/ranking models and mixture-of-experts routing.",
    spec: "2 per chip (v5p) · embeddings/MoE",
  },
  ici: {
    name: "ICI — Inter-Chip Interconnect",
    role: "High-speed links wiring chips into a slice and Pod (a 3D torus), bypassing the host network. Collective operations (all-reduce) ride these.",
    spec: "6 links/chip (v5p) · forms the 3D torus",
  },
};

let selected = "chip";
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function select(part) {
  selected = part;
  if (part === "mxu" && !observed) { observed = true; sim.checkpoint("observe-anatomy"); }
  sim.event("inspect", { part });
  render();
}
function mark(n) { return `<span class="marker">${n}</span>`; }
function cls(id) { return `part ${selected === id ? "sel" : ""}`; }

// one TensorCore; pass badges=true to show the numbered markers (1..4) on the first.
function tensorCore(badges) {
  return `
    <div class="${cls("tensorcore")}" data-part="tensorcore" tabindex="0" role="button">
      <div class="tc-label">${badges ? mark(1) : ""}Tensor core</div>
      <div class="tc-units">
        <div class="${cls("scalar")} u" data-part="scalar" tabindex="0" role="button">${badges ? mark(2) : ""}Scalar unit</div>
        <div class="${cls("smem")} u" data-part="smem" tabindex="0" role="button">SMEM</div>
        <div class="${cls("vpu")} u" data-part="vpu" tabindex="0" role="button">${badges ? mark(3) : ""}VPU</div>
        <div class="${cls("vmem")} u" data-part="vmem" tabindex="0" role="button">VMEM</div>
      </div>
      <div class="mxus">
        ${[0, 1, 2, 3].map((i) => `<div class="${cls("mxu")} mxu" data-part="mxu" tabindex="0" role="button">${badges && i === 0 ? mark(4) : ""}MXU</div>`).join("")}
      </div>
    </div>`;
}

function render() {
  const d = PARTS[selected];
  app.innerHTML = `
    <div class="hint">Select a part to learn more.</div>
    <div class="stage">
      <div class="${cls("host")} side host" data-part="host" tabindex="0" role="button">Host</div>
      <div class="arr">↔</div>
      <div class="${cls("pcie")} side pcie" data-part="pcie" tabindex="0" role="button">PCIe</div>

      <div class="chip">
        <div class="cores">${tensorCore(true)}${tensorCore(false)}</div>
        <div class="${cls("hbm")} hbm" data-part="hbm" tabindex="0" role="button">${mark(5)}HBM</div>
        <div class="sparse">
          <div class="${cls("sparsecore")} sc" data-part="sparsecore" tabindex="0" role="button">${mark(6)}SparseCore</div>
          <div class="${cls("sparsecore")} sc" data-part="sparsecore" tabindex="0" role="button">SparseCore</div>
        </div>
        <div class="chip-name">Chip</div>
      </div>

      <div class="arr">↔</div>
      <div class="${cls("ici")} side ici" data-part="ici" tabindex="0" role="button">${mark(7)}ICI</div>
      <div class="arr">↔</div>
      <div class="${cls("chip")} side neighbor" data-part="chip" tabindex="0" role="button">Chip</div>
    </div>

    <div class="detail" role="status">
      <div class="dname">${d.name}</div>
      <div class="drole">${d.role}</div>
      <div class="dspec">${d.spec}</div>
    </div>`;

  app.querySelectorAll(".part").forEach((el) => {
    const part = el.getAttribute("data-part");
    el.addEventListener("click", (e) => { e.stopPropagation(); select(part); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(part); } });
  });
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
