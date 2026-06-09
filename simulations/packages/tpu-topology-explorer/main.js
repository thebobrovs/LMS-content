// createSim is a global from sim-sdk.js (classic script). Compares network
// diameter (worst-case hops) across TPU topologies at the same chip count
// (1,024) — proving "shape dictates diameter," incl. the Boardfly 7-vs-16 result.
// Deterministic, theme-aware, no CDNs.
const app = document.getElementById("app");

const N = 1024;
const TOPOS = [
  { id: "2d", label: "2D torus", shape: "32 × 32", dia: 32, gens: "v5e · v6e",
    how: "A flat grid with wrapped edges. Worst-case ≈ √N hops.",
    why: "Cheapest to wire; fine for smaller inference pods." },
  { id: "3d", label: "3D torus", shape: "8 × 8 × 16", dia: 16, gens: "v4 · v5p · 8t",
    how: "A 3D grid with wrapped edges; OCS can reconfigure it and route around dead chips. Worst-case ≈ 1.5·∛N hops.",
    why: "Half the diameter of a 2D torus at the same chip count — good for training collectives." },
  { id: "boardfly", label: "Boardfly", shape: "OCS hierarchy", dia: 7, gens: "8i",
    how: "An optical hierarchy: 4-chip rings → boards → groups joined by Optical Circuit Switches.",
    why: "≈56% lower diameter than a 3D torus — built for low-latency inference collectives." },
];
const MAXD = 32;
let i = 1; // default to 3D torus
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function select(n) {
  i = n;
  if (TOPOS[i].id === "boardfly" && !observed) { observed = true; sim.checkpoint("observe-topology"); }
  sim.event("topology", { topo: TOPOS[i].id });
  render();
}

function render() {
  const t = TOPOS[i];
  const tabs = TOPOS.map((x, n) => `<button class="tab ${n === i ? "on" : ""}" data-i="${n}" role="tab" aria-selected="${n === i}">${x.label}</button>`).join("");
  const bars = TOPOS.map((x, n) => `
    <div class="barwrap ${n === i ? "sel" : ""}">
      <div class="bar" style="height:${(x.dia / MAXD) * 100}%"><span class="dval">${x.dia}</span></div>
      <span class="blabel">${x.label}</span>
    </div>`).join("");

  app.innerHTML = `
    <div class="hint">Same <b>${N} chips</b>, three shapes. The bar is <b>network diameter</b> — the worst-case hop count between any two chips. Fewer hops = faster collectives.</div>
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="chart" aria-hidden="true">${bars}<div class="axis-note">diameter (hops) — lower is better</div></div>
    <div class="detail" role="status">
      <div class="dname">${t.label} <span class="dnote">${t.shape} · ${t.gens}</span></div>
      <div class="drow"><span class="k">diameter</span> <b>${t.dia} hops</b> across ${N} chips</div>
      <div class="drow"><span class="k">how</span> ${t.how}</div>
      <div class="drow"><span class="k">why</span> ${t.why}</div>
    </div>`;

  app.querySelectorAll(".tab").forEach((el) => el.addEventListener("click", () => select(+el.getAttribute("data-i"))));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
