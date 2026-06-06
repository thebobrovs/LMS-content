// `createSim` is provided as a global by sim-sdk.js (loaded as a classic script
// before this one) so the bundle works in the opaque-origin sandbox.
//
// Steps through the v5p scaling hierarchy: chip → host → cube → slice → pod →
// Multislice, showing the chip count and which interconnect tier binds each
// level (ICI inside a pod, DCN across pods).

const app = document.getElementById("app");

const LEVELS = [
  {
    name: "Chip",
    count: "1 chip",
    net: "ICI",
    detail:
      "One v5p chip has six ICI links (±X, ±Y, ±Z) totalling 4,800 Gbps. It is one node in the 3D torus.",
    viz: () => grid(1, 1, "chip"),
  },
  {
    name: "Host (tray)",
    count: "4 chips",
    net: "ICI",
    detail:
      "A host machine (ct5p-hightpu-4t) packages 4 chips with a CPU host — the unit you actually SSH into.",
    viz: () => grid(4, 4, "chip"),
  },
  {
    name: "Cube",
    count: "64 chips · 4×4×4",
    net: "ICI",
    detail:
      "The smallest building block with full 3D-torus wrap-around on all three axes. Larger slices stack cubes.",
    viz: () => cube(),
  },
  {
    name: "Slice",
    count: "64 → 8,960 chips",
    net: "ICI",
    detail:
      "A contiguous sub-volume of the pod, optically (OCS) wired into its own 3D torus. You choose the shape — e.g. 8×8×8 vs 4×4×32 — to match your parallelism.",
    viz: () => blocks(6, "cube"),
  },
  {
    name: "Pod (superpod)",
    count: "8,960 chips · 16×20×28",
    net: "ICI",
    detail:
      "A full v5p pod: one giant 3D torus where every hop is ICI. The largest single-ICI domain.",
    viz: () => blocks(28, "cube"),
  },
  {
    name: "Multislice",
    count: "many pods",
    net: "DCN",
    detail:
      "Join multiple slices/pods over the Data Center Network (DCN) for jobs bigger than one pod. Cross-slice traffic is DCN — far slower than ICI, so keep tight communication inside a slice.",
    viz: () => multislice(),
  },
];

let i = 0;
let reached = false;

function grid(n, perRow, cls) {
  let cells = "";
  for (let k = 0; k < n; k++) cells += `<i class="cell ${cls}"></i>`;
  return `<div class="grid" style="grid-template-columns:repeat(${perRow},1fr)">${cells}</div>`;
}

function cube() {
  // Four 4×4 layers shown side by side = 64 chips.
  let layers = "";
  for (let l = 0; l < 4; l++) layers += `<div class="layer">${grid(16, 4, "chip")}</div>`;
  return `<div class="cube">${layers}</div>`;
}

function blocks(n, cls) {
  let b = "";
  for (let k = 0; k < n; k++) b += `<i class="block ${cls}"></i>`;
  return `<div class="blocks">${b}</div>`;
}

function multislice() {
  return `<div class="multi">
    <span class="pod">Pod</span><span class="dcn">DCN</span>
    <span class="pod">Pod</span><span class="dcn">DCN</span>
    <span class="pod">Pod</span>
  </div>`;
}

function render() {
  const lvl = LEVELS[i];
  const steps = LEVELS.map(
    (l, k) =>
      `<button class="step ${k === i ? "active" : ""} ${k < i ? "done" : ""}" data-k="${k}">${l.name}</button>`,
  ).join('<span class="arrow">→</span>');

  app.innerHTML = `
    <div class="steps">${steps}</div>
    <div class="stage">${lvl.viz()}</div>
    <div class="info">
      <div class="head">
        <span class="name">${lvl.name}</span>
        <span class="count">${lvl.count}</span>
        <span class="net net-${lvl.net.toLowerCase()}">${lvl.net}</span>
      </div>
      <p class="detail">${lvl.detail}</p>
    </div>
    <div class="nav">
      <button id="prev" class="secondary" ${i === 0 ? "disabled" : ""}>← Prev</button>
      <span class="pos">${i + 1} / ${LEVELS.length}</span>
      <button id="next" ${i === LEVELS.length - 1 ? "disabled" : ""}>Next →</button>
    </div>`;

  app.querySelectorAll(".step").forEach((b) =>
    b.addEventListener("click", () => go(Number(b.dataset.k))),
  );
  app.querySelector("#prev").addEventListener("click", () => go(i - 1));
  app.querySelector("#next").addEventListener("click", () => go(i + 1));

  if (i === LEVELS.length - 1 && !reached) {
    reached = true;
    sim.checkpoint("reach-multislice");
  }
  sim.event("level", { level: LEVELS[i].name });
  reportSize();
}

function go(k) {
  i = Math.max(0, Math.min(LEVELS.length - 1, k));
  render();
}

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function reportSize() {
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}

const sim = createSim({
  onInit({ theme }) {
    applyTheme(theme);
    render();
  },
});

// Fallback for opening the bundle directly (no host init).
setTimeout(() => {
  if (!sim.isInitialized() && !app.childElementCount) render();
}, 300);
