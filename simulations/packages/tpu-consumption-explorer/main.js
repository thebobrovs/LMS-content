// createSim is a global from sim-sdk.js (classic script). The high-level Cloud TPU
// landscape: pick a consumption PATH (Direct VM / GKE / Vertex) and a HOST CONFIG
// (single / multi / sub) and see the stack shift between "you manage it" and
// "managed for you" — with storage and networking always underneath.
const app = document.getElementById("app");

// Layers, top (your job) to bottom (hardware). managed[] per path → who runs it.
const LAYERS = ["Your workload (model code)", "Orchestration", "TPU VM — host + chips", "Storage — GCS / Hyperdisk ML", "Networking — VPC / DCN"];

const PATHS = [
  { id: "direct", label: "Direct TPU VM", control: 3,
    orch: "You · gcloud / Queued Resources", managed: [false, false, false, false, false],
    use: "Research and custom stacks — full control, you SSH in and run JAX / PyTorch-XLA." },
  { id: "gke", label: "GKE", control: 2,
    orch: "GKE — auto provision · scale · heal (XPK → Kueue)", managed: [false, true, true, false, true],
    use: "Production training & serving at scale — containerized, orchestrated, multi-host." },
  { id: "vertex", label: "Vertex AI / Agent Platform", control: 1,
    orch: "Vertex — fully managed jobs, tuning & serving", managed: [false, true, true, true, true],
    use: "Managed training, tuning and serving/agents — the least ops, the least control." },
];

const HOSTS = [
  { id: "single", label: "Single-host", hosts: 1, chips: 4, used: 4, desc: "One TPU VM — small slices fit on a single host." },
  { id: "multi", label: "Multi-host", hosts: 3, chips: 4, used: 4, desc: "A slice spanning several VMs; chips wired by ICI, host processes rendezvous over DCN." },
  { id: "sub", label: "Sub-host", hosts: 1, chips: 4, used: 1, desc: "Only a portion of a host's chips (e.g. 1 of 4) — granular, cost-saving." },
];

let pi = 0, hi = 0, observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function pickPath(n) {
  pi = n;
  if (!observed) { observed = true; sim.checkpoint("observe-consumption"); }
  sim.event("path", { path: PATHS[pi].id });
  render();
}
function pickHost(n) { hi = n; render(); }

function render() {
  const p = PATHS[pi];
  const h = HOSTS[hi];

  const pathTabs = PATHS.map((x, n) => `<button class="tab ${n === pi ? "on" : ""}" data-p="${n}">${x.label}</button>`).join("");
  const layers = LAYERS.map((name, i) => {
    if (i === 0) return `<div class="layer you"><span>${name}</span><span class="who you-t">you</span></div>`;
    const label = i === 1 ? `${name}: <span class="orch">${p.orch}</span>` : name;
    const managed = p.managed[i];
    return `<div class="layer ${managed ? "mgd" : "you"}"><span>${label}</span><span class="who ${managed ? "mgd-t" : "you-t"}">${managed ? "managed" : "you"}</span></div>`;
  }).join("");

  const conv = 4 - p.control; // convenience inverse of control
  const meter = (v, max) => Array.from({ length: max }, (_, k) => `<span class="seg ${k < v ? "on" : ""}"></span>`).join("");

  const hostTabs = HOSTS.map((x, n) => `<button class="htab ${n === hi ? "on" : ""}" data-h="${n}">${x.label}</button>`).join("");
  const hostDiagram = Array.from({ length: h.hosts }, (_, hostIdx) => {
    const chips = Array.from({ length: h.chips }, (_, c) => `<span class="chip ${c < h.used ? "used" : ""}"></span>`).join("");
    return `<div class="hostvm"><div class="chips">${chips}</div><div class="hlabel">host VM</div></div>`;
  }).join(`<span class="ici">ICI</span>`);

  app.innerHTML = `
    <div class="hint">You never rent a bare chip — you consume <b>host + chip VM units</b> through a path. Pick one and watch what <b>you</b> manage vs what's <b>managed</b>. Storage and networking are always there underneath.</div>

    <div class="tabs">${pathTabs}</div>

    <div class="grid">
      <div class="stack">${layers}</div>
      <div class="side">
        <div class="meterbox">
          <div class="mrow"><span>control</span><span class="segs">${meter(p.control, 3)}</span></div>
          <div class="mrow"><span>convenience</span><span class="segs">${meter(conv, 3)}</span></div>
        </div>
        <div class="use">${p.use}</div>
        <div class="hostsec">
          <div class="glabel">Workload shape</div>
          <div class="htabs">${hostTabs}</div>
          <div class="hostrow">${hostDiagram}</div>
          <div class="hdesc">${h.desc}</div>
        </div>
      </div>
    </div>`;

  app.querySelectorAll("[data-p]").forEach((el) => el.addEventListener("click", () => pickPath(+el.getAttribute("data-p"))));
  app.querySelectorAll("[data-h]").forEach((el) => el.addEventListener("click", () => pickHost(+el.getAttribute("data-h"))));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
