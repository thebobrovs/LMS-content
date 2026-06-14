// createSim is a global from sim-sdk.js (classic script). A [batch, features] tensor on a
// 2×4 device mesh (data axis = 2 hosts, model axis = 4 chips/host). Pick a PartitionSpec and
// see which chip owns which shard, the collective Shardy must insert to keep the math correct,
// and the bytes it puts on the wire. Deterministic, theme-aware, reduced-motion safe, no CDNs.

let REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

// One illustrative tensor: [batch 512, features 1024] in bf16 ≈ 1.0 MB, laid out as a
// 2 (batch bands) × 4 (feature bands) block grid — 8 blocks of 0.125 MB, matching the mesh.
const TENSOR_MB = 1.0;
const DATA = 2, MODEL = 4; // mesh axis sizes
const BLOCK_MB = TENSOR_MB / (DATA * MODEL);

const SPECS = {
  data: {
    spec: "P('data', None)", kind: "Data-parallel",
    perChipMB: BLOCK_MB * MODEL,            // one batch band = 4 blocks
    replicas: MODEL,                        // each band held by the 4 model chips
    collective: "all-reduce", axis: "data", net: "ici",
    bytes: 2 * TENSOR_MB,                   // ring all-reduce moves ≈2× the data
    note: "Shard the <b>batch</b> across the <code>data</code> axis; replicate the parameters. The forward pass needs no comms — but the backward pass must reconcile gradients, so Shardy inserts an <b>all-reduce over the data axis</b>. On one slice that rides the fast <b>ICI</b>; across slices (Multislice) it would fall back to the DCN.",
  },
  model: {
    spec: "P(None, 'model')", kind: "Model/tensor-parallel",
    perChipMB: BLOCK_MB * DATA,             // one feature band = 2 blocks
    replicas: DATA,                         // each band held by the 2 data chips
    collective: "all-gather", axis: "model", net: "ici",
    bytes: 0.75 * TENSOR_MB,                // all-gather moves ≈(n−1)/n of the tensor
    note: "Shard the <b>features</b> across the <code>model</code> axis; each chip holds a slice of every row. To use the full activation an op must reassemble it, so Shardy inserts an <b>all-gather over the model axis</b> — chatty, which is why model-parallel wants the tightest <b>ICI</b>.",
  },
  replicated: {
    spec: "P()", kind: "Fully replicated",
    perChipMB: TENSOR_MB,                   // whole tensor
    replicas: DATA * MODEL,                 // all 8 chips
    collective: "none", axis: "", net: "none",
    bytes: 0,
    note: "No sharding: <b>every chip stores the whole tensor</b>. Zero collectives — but also zero memory saving (8 copies of everything). Fine for small things (a scalar, a tiny config); ruinous for the weights of a large model.",
  },
};

let spec = "data";
let observed = false;

const $ = (id) => document.getElementById(id);
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 16)); }

// Which of the 8 blocks (br·4+bc) does chip (r,c) own under the current spec?
function owns(r, c, br, bc) {
  if (spec === "data") return br === r;          // owns its batch band (all feature cols)
  if (spec === "model") return bc === c;         // owns its feature band (all batch rows)
  return true;                                   // replicated: owns everything
}

function chipHTML(r, c) {
  const ownClass = spec === "data" ? "own-data" : spec === "model" ? "own-model" : "own-rep";
  let blocks = "";
  for (let br = 0; br < DATA; br++) {
    for (let bc = 0; bc < MODEL; bc++) {
      const on = owns(r, c, br, bc) ? ` ${ownClass}` : "";
      blocks += `<div class="tblock${on}"></div>`;
    }
  }
  const mb = SPECS[spec].perChipMB;
  return `<div class="chip">
      <div class="chip-id">d${r}·m${c}</div>
      <div class="tmap">${blocks}</div>
      <div class="chip-mb">${mb.toFixed(3)} <small>MB</small></div>
    </div>`;
}

function render() {
  document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.spec === spec));

  $("tensor-cap").innerHTML = `Tensor: <b>[batch 512, features 1024]</b>, bf16 ≈ <b>${TENSOR_MB.toFixed(1)} MB</b> · Mesh: <b>2 × 4</b> (axis <code>data</code>=2 hosts, <code>model</code>=4 chips/host)`;

  // Mesh: 2 hosts (data rows), 4 chips each (model cols)
  let mesh = "";
  for (let r = 0; r < DATA; r++) {
    let row = "";
    for (let c = 0; c < MODEL; c++) row += chipHTML(r, c);
    mesh += `<div class="host"><div class="host-label">Host ${r} · <code>data=${r}</code></div><div class="chip-row">${row}</div></div>`;
  }
  $("mesh").innerHTML = mesh;

  const s = SPECS[spec];
  const collCell = s.collective === "none"
    ? `<div class="d-v"><span class="pill none">none</span></div>`
    : `<div class="d-v">${s.collective} <small>over ${s.axis}</small><br><span style="font-size:13px">≈${s.bytes.toFixed(2)} MB</span> <span class="pill ${s.net}">${s.net.toUpperCase()}</span></div>`;
  $("dashboard").innerHTML = `
    <div class="d-stat"><div class="d-k">Per-chip memory</div><div class="d-v">${s.perChipMB.toFixed(3)} <small>MB</small></div></div>
    <div class="d-stat"><div class="d-k">Copies of each shard</div><div class="d-v">${s.replicas}<small> / 8 chips</small></div></div>
    <div class="d-stat"><div class="d-k">Collective inserted</div>${collCell}</div>`;

  $("note").innerHTML = `<b>${s.kind}</b> — ${s.note}`;
  reportSize();
}

function setSpec(next) {
  if (next === spec) return;
  spec = next;
  if (!observed) { observed = true; sim.checkpoint("observe-spmd"); }
  sim.event("sharding", { spec: SPECS[spec].spec });
  render();
}

document.querySelectorAll(".seg-btn").forEach((b) =>
  b.addEventListener("click", () => setSpec(b.dataset.spec)));

const sim = createSim({
  onInit({ theme, reducedMotion }) { REDUCE = REDUCE || reducedMotion; applyTheme(theme); render(); },
});
new ResizeObserver(() => reportSize()).observe(document.body);
setTimeout(() => { if (!sim.isInitialized()) render(); }, 300);
