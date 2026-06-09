// createSim is a global from sim-sdk.js (classic script). An interactive cutaway
// of a Cloud TPU: the host VM you SSH into, the TPU chip (TensorCore = MXU +
// vector + scalar units), HBM, and the ICI links to neighbor chips. Click a part
// to read its role + spec. Theme-aware, SDK-wired, no CDNs.
const app = document.getElementById("app");

const PARTS = {
  host: {
    name: "Host VM (CPU)",
    role: "The Linux VM you SSH into. Your JAX or PyTorch/XLA code runs here and dispatches the work to the TPU. You get root access for setup and debugging.",
    spec: "x86 host · root SSH · drives the attached chips",
  },
  pcie: {
    name: "Host ↔ chip link",
    role: "Your program crosses from the host CPU to the TPU chip to launch — then the heavy compute stays on the chip, so this link isn't the bottleneck.",
    spec: "PCIe between host and TPU",
  },
  chip: {
    name: "TPU chip",
    role: "Google's machine-learning ASIC. It holds one or more TensorCores plus HBM and is purpose-built for matrix math — it cannot run general-purpose code.",
    spec: "1+ TensorCores · HBM · ICI links",
  },
  tensorcore: {
    name: "TensorCore",
    role: "The compute core of the chip: a matrix unit (MXU) for matmuls, plus a vector unit and a scalar unit for everything else.",
    spec: "MXU + vector unit + scalar unit",
  },
  mxu: {
    name: "MXU — Matrix Multiply Unit",
    role: "A systolic array of multiply-accumulators — this is where your matmuls actually run. Inputs are multiplied in bf16 and accumulated in fp32.",
    spec: "128×128 (256×256 on v6e/v7) · 16,384 MACs/cycle",
  },
  vpu: {
    name: "Vector unit (VPU)",
    role: "The non-matmul math: activations, softmax, normalization, and elementwise ops. It's why real utilization (MFU) is below the MXU's peak.",
    spec: "SIMD vector ALU",
  },
  scalar: {
    name: "Scalar unit",
    role: "Runs control flow and computes the memory addresses that feed the vector and matrix units.",
    spec: "scalar control + addressing",
  },
  hbm: {
    name: "HBM — High-Bandwidth Memory",
    role: "On-package memory that feeds the cores. Keeping the MXU fed from HBM is the whole performance game — that's arithmetic intensity.",
    spec: "≈95 GB @ ≈2.8 TB/s (v5p)",
  },
  ici: {
    name: "ICI — Inter-Chip Interconnect",
    role: "High-speed links wiring chips into a slice and a Pod — bypassing the host network. Collective operations (all-reduce) ride these.",
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

function partAttrs(id) {
  return `class="part ${selected === id ? "sel" : ""}" data-part="${id}" tabindex="0" role="button" aria-pressed="${selected === id}"`;
}

function render() {
  const d = PARTS[selected];
  app.innerHTML = `
    <div class="hint">A Cloud TPU is a host VM wired to a TPU chip. Click any part to see what it does.</div>
    <div class="stage">
      <div ${partAttrs("host")} id="p-host">
        <div class="bt">Host VM</div><div class="bs">CPU · you SSH here</div>
      </div>

      <div ${partAttrs("pcie")} id="p-pcie"><span>PCIe</span></div>

      <div class="chip" ${selected === "chip" ? 'data-sel="1"' : ""}>
        <button class="chip-tab ${selected === "chip" ? "sel" : ""}" data-part="chip">TPU chip</button>
        <div ${partAttrs("tensorcore")} id="p-tc">
          <div class="tc-label">TensorCore</div>
          <div class="tc-grid">
            <div ${partAttrs("mxu")} id="p-mxu">
              <div class="bt">MXU</div><div class="bs">128² · 16K MAC/cyc</div>
            </div>
            <div class="units">
              <div ${partAttrs("vpu")} id="p-vpu">Vector</div>
              <div ${partAttrs("scalar")} id="p-scalar">Scalar</div>
            </div>
          </div>
        </div>
        <div ${partAttrs("hbm")} id="p-hbm"><span>HBM ≈95 GB</span></div>
      </div>

      <div ${partAttrs("ici")} id="p-ici"><div class="bt">ICI</div><div class="bs">→ neighbor chips</div></div>
    </div>

    <div class="detail" role="status">
      <div class="dname">${d.name}</div>
      <div class="drole">${d.role}</div>
      <div class="dspec">${d.spec}</div>
    </div>`;

  app.querySelectorAll(".part, .chip-tab").forEach((el) => {
    const part = el.getAttribute("data-part");
    el.addEventListener("click", (e) => { e.stopPropagation(); select(part); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(part); } });
  });
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
