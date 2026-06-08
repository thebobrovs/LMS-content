// `createSim` is provided as a global by sim-sdk.js (loaded as a classic script
// before this one) so the bundle works in the opaque-origin sandbox.
//
// Two modes:
//   "why"   — CPU (von Neumann, fetch-per-op) vs TPU (systolic, pump-once-reuse),
//             with live memory-read / cycle counters for a 3x3 matmul.
//   "array" — a weight-stationary 3x3 systolic array: weights in cells,
//             activations stream in from the left and are reused, partial sums
//             flow down, on a diagonal wavefront. Deterministic.
const app = document.getElementById("app");

let mode = "why";

/* ----------------------------- shared facts ----------------------------- */
// 3x3 matmul = 27 MACs. CPU re-fetches 2 operands per MAC (~54 reads), runs them
// sequentially (~27 cycles). The array reads each of 9 activations + 9 weights
// once (18 reads) and finishes in ~7 beats.
const OPS = 27;
const CPU_READS = 54, CPU_CYCLES = 27;
const TPU_READS = 18, TPU_CYCLES = 7;

/* ------------------------------- WHY mode ------------------------------- */
let whyTimer = null;
let whyFrac = 0; // 0..1 animation progress
let whyDone = false;

function resetWhy() {
  if (whyTimer) { clearInterval(whyTimer); whyTimer = null; }
  whyFrac = 0;
  whyDone = false;
}
function runWhy() {
  if (whyTimer) return;
  if (whyDone) resetWhy();
  render();
  whyTimer = setInterval(() => {
    whyFrac = Math.min(1, whyFrac + 0.04);
    const r = (id, v) => { const el = app.querySelector(id); if (el) el.textContent = v; };
    r("#cpu-reads", Math.round(whyFrac * CPU_READS));
    r("#cpu-cycles", Math.round(whyFrac * CPU_CYCLES));
    r("#tpu-reads", Math.round(whyFrac * TPU_READS));
    r("#tpu-cycles", Math.round(whyFrac * TPU_CYCLES));
    if (whyFrac >= 1) {
      clearInterval(whyTimer); whyTimer = null; whyDone = true; render();
    }
  }, 90);
}

function renderWhy() {
  const running = !!whyTimer;
  return `
    <div class="why">
      <div class="panel">
        <h4>CPU — von Neumann</h4>
        <div class="diagram cpu">
          <div class="node">RAM</div>
          <div class="bus"><span class="dot cpu-dot ${running ? "run" : ""}"></span></div>
          <div class="node">ALU</div>
        </div>
        <div class="stats">
          <span>memory reads <strong id="cpu-reads">${whyDone ? CPU_READS : 0}</strong></span>
          <span>cycles <strong id="cpu-cycles">${whyDone ? CPU_CYCLES : 0}</strong></span>
        </div>
        <div class="cap">fetch operands → compute → write back, for every op</div>
      </div>

      <div class="panel">
        <h4>TPU — systolic array</h4>
        <div class="diagram tpu">
          <span class="dot tpu-dot ${running ? "run" : ""}" style="animation-delay:0s"></span>
          <span class="dot tpu-dot ${running ? "run" : ""}" style="animation-delay:.5s"></span>
          <span class="dot tpu-dot ${running ? "run" : ""}" style="animation-delay:1s"></span>
          <span class="pe-mini">PE</span><span class="pe-mini">PE</span><span class="pe-mini">PE</span>
        </div>
        <div class="stats">
          <span>memory reads <strong id="tpu-reads">${whyDone ? TPU_READS : 0}</strong></span>
          <span>cycles <strong id="tpu-cycles">${whyDone ? TPU_CYCLES : 0}</strong></span>
        </div>
        <div class="cap">pump once, then reuse across the row</div>
      </div>
    </div>

    <div class="controls">
      <button id="why-run" class="primary">${whyDone ? "Replay" : "Run comparison ▶"}</button>
      <button id="why-reset" class="secondary">Reset</button>
    </div>

    <div class="readout" role="status">
      ${
        whyDone
          ? `<span class="good">Same ${OPS} MACs.</span> The CPU re-fetches operands ~${CPU_READS} times over ~${CPU_CYCLES} cycles; the array reads each input <strong>once</strong> (${TPU_READS} reads) and finishes in ${TPU_CYCLES} beats. Switch to <em>How: the array</em> to see why.`
          : `A 3×3 matmul is ${OPS} multiply-accumulates either way. Run it and watch the memory-read counters diverge — that gap is the whole point of the array.`
      }
    </div>`;
}

/* ------------------------------ ARRAY mode ------------------------------ */
const SIZE = 3;
const TOTAL = 9;
const WEIGHTS = [
  [2, 1, 3],
  [1, 4, 1],
  [3, 1, 2],
];
const INPUT = [
  [1, 2, 3, 0, 0, 0, 0, 0],
  [0, 4, 1, 2, 0, 0, 0, 0],
  [0, 0, 2, 3, 1, 0, 0, 0],
];

let cycle = 0;
let grid = [];
let log = [];
let observed = false;
let arrTimer = null;

function blank() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ act: 0, psum: 0 })));
}
function resetArray() {
  if (arrTimer) { clearInterval(arrTimer); arrTimer = null; }
  cycle = 0;
  grid = blank();
  log = [];
  observed = false;
}
function note(c) {
  if (c === 1) return "Cycle 1 — first activation enters cell (0,0); multiply begins.";
  if (c === 2) return "Cycle 2 — activations shift right, partial sums shift down.";
  if (c === 3) return "Cycle 3 — all rows streaming; each input is reused as it passes.";
  if (c === 5) return "Cycle 5 — peak: most cells compute at once, with no memory re-fetch.";
  if (c >= 7 && c < TOTAL) return `Cycle ${c} — queues draining; results trickle out the bottom.`;
  if (c >= TOTAL) return "Done — outputs exited the bottom. Each input was read once and reused.";
  return `Cycle ${c} — array pumping.`;
}
function step() {
  if (cycle >= TOTAL) return;
  const next = blank();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) next[r][c].psum = r === 0 ? 0 : grid[r - 1][c].psum;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) next[r][c].act = c === 0 ? INPUT[r][cycle] || 0 : grid[r][c - 1].act;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (next[r][c].act > 0) next[r][c].psum += next[r][c].act * WEIGHTS[r][c];
  grid = next;
  cycle += 1;
  log.push(note(cycle));
  log = log.slice(-3);
  if (cycle >= TOTAL && !observed) { observed = true; sim.checkpoint("observe-matmul"); }
  sim.event("cycle", { cycle });
  render();
}
function togglePlay() {
  if (arrTimer) { clearInterval(arrTimer); arrTimer = null; render(); return; }
  if (cycle >= TOTAL) resetArray();
  arrTimer = setInterval(() => { step(); if (cycle >= TOTAL) { clearInterval(arrTimer); arrTimer = null; render(); } }, 900);
  render();
}
function activeCount() {
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c].act > 0) n++;
  return n;
}
function renderArray() {
  const done = cycle >= TOTAL;
  const util = Math.round((activeCount() / (SIZE * SIZE)) * 100);
  let rows = "";
  for (let r = 0; r < SIZE; r++) {
    const inVal = cycle < TOTAL ? INPUT[r][cycle] || 0 : 0;
    let cells = "";
    for (let c = 0; c < SIZE; c++) {
      const { act, psum } = grid[r][c];
      const on = act > 0;
      cells += `<div class="pe ${on ? "on" : ""}"><span class="w">w${WEIGHTS[r][c]}</span><span class="math">${on ? `${act}×${WEIGHTS[r][c]}` : "·"}</span><span class="psum">Σ${psum}</span></div>`;
    }
    rows += `<div class="row"><div class="inq ${inVal > 0 ? "data" : "zero"}">${cycle < TOTAL ? inVal : ""}</div>${cells}</div>`;
  }
  return `
    <div class="controls">
      <button id="step" class="primary" ${done ? "disabled" : ""}>Pump ▶</button>
      <button id="play" class="secondary" ${done ? "disabled" : ""}>${arrTimer ? "Pause" : "Auto"}</button>
      <button id="reset" class="secondary">Reset</button>
      <span class="metrics"><span>cycle <strong>${cycle}</strong>/${TOTAL}</span><span>util <strong class="util">${util}%</strong></span></span>
    </div>
    <div class="axis">↓ partial sums flow down · activations flow right →</div>
    <div class="array">${rows}</div>
    <div class="readout" role="status">
      ${
        done
          ? `<span class="good">Done.</span> Peaked at ${SIZE * SIZE} MACs/beat — each input was read from memory once and reused across the row.`
          : cycle === 0
            ? `Weights are loaded and stationary. Inputs enter <strong>staggered</strong> (each row a beat behind the one above), so the computing cells form a moving diagonal. Pump the clock.`
            : `${util}% of cells are computing this beat. Watch each activation get reused as it marches right.`
      }
    </div>
    <div class="log">${log.map((l) => `<div>${l}</div>`).join("")}</div>
    <div class="legend"><span class="k w">weight</span> <span class="k a">active activation</span> <span class="k s">Σ partial sum</span></div>`;
}

/* ------------------------------- shell -------------------------------- */
function reportSize() {
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
function switchMode(m) {
  if (m === mode) return;
  if (whyTimer) { clearInterval(whyTimer); whyTimer = null; }
  if (arrTimer) { clearInterval(arrTimer); arrTimer = null; }
  mode = m;
  render();
}
function render() {
  app.innerHTML = `
    <div class="tabs" role="tablist">
      <button id="tab-why" class="tab ${mode === "why" ? "active" : ""}" role="tab" aria-selected="${mode === "why"}">Why: CPU vs TPU</button>
      <button id="tab-array" class="tab ${mode === "array" ? "active" : ""}" role="tab" aria-selected="${mode === "array"}">How: the array</button>
    </div>
    <div class="body">${mode === "why" ? renderWhy() : renderArray()}</div>`;

  app.querySelector("#tab-why").addEventListener("click", () => switchMode("why"));
  app.querySelector("#tab-array").addEventListener("click", () => switchMode("array"));

  if (mode === "why") {
    app.querySelector("#why-run").addEventListener("click", runWhy);
    app.querySelector("#why-reset").addEventListener("click", () => { resetWhy(); render(); });
  } else {
    app.querySelector("#step").addEventListener("click", step);
    app.querySelector("#play").addEventListener("click", togglePlay);
    app.querySelector("#reset").addEventListener("click", () => { resetArray(); render(); });
  }
  reportSize();
}

const sim = createSim({
  onInit({ theme }) {
    applyTheme(theme);
    resetWhy();
    resetArray();
    render();
  },
});

setTimeout(() => {
  if (!sim.isInitialized() && app.innerHTML === "") { resetWhy(); resetArray(); render(); }
}, 300);
