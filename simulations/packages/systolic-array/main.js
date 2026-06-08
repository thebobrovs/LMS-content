// `createSim` is provided as a global by sim-sdk.js (loaded as a classic script
// before this one) so the bundle works in the opaque-origin sandbox.
//
// A weight-stationary 3x3 systolic array. Weights sit in the cells; activations
// stream in from the left (staggered so they meet partial sums on a diagonal
// wavefront); partial sums flow down. Each input is read once and reused across
// the row — the whole point. Deterministic (fixed weights + inputs).
const app = document.getElementById("app");

const SIZE = 3;
const TOTAL = 9; // cycles until the last output exits the bottom
const WEIGHTS = [
  [2, 1, 3],
  [1, 4, 1],
  [3, 1, 2],
];
// Activations per row, staggered with leading zeros (row r delayed r cycles) so
// values align as they flow diagonally.
const INPUT = [
  [1, 2, 3, 0, 0, 0, 0, 0],
  [0, 4, 1, 2, 0, 0, 0, 0],
  [0, 0, 2, 3, 1, 0, 0, 0],
];

let cycle = 0;
let grid = [];
let log = [];
let observed = false;
let timer = null;

function blank() {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ act: 0, psum: 0 })),
  );
}

function reset() {
  if (timer) { clearInterval(timer); timer = null; }
  cycle = 0;
  grid = blank();
  log = [];
  observed = false;
}

function note(cyc) {
  if (cyc === 1) return "Cycle 1 — first activation enters cell (0,0); multiply begins.";
  if (cyc === 2) return "Cycle 2 — activations shift right, partial sums shift down.";
  if (cyc === 3) return "Cycle 3 — all rows streaming; each input is reused as it passes.";
  if (cyc === 5) return "Cycle 5 — peak: most cells compute at once, with no memory re-fetch.";
  if (cyc >= 7 && cyc < TOTAL) return `Cycle ${cyc} — queues draining; results trickle out the bottom.`;
  if (cyc >= TOTAL) return "Done — outputs exited the bottom. Each input was read once and reused.";
  return `Cycle ${cyc} — array pumping.`;
}

function step() {
  if (cycle >= TOTAL) return;
  const next = blank();
  // partial sums flow DOWN
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      next[r][c].psum = r === 0 ? 0 : grid[r - 1][c].psum;
  // activations flow RIGHT (column 0 pulls from the input queue this cycle)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      next[r][c].act = c === 0 ? INPUT[r][cycle] || 0 : grid[r][c - 1].act;
  // multiply-accumulate inside each active cell
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (next[r][c].act > 0) next[r][c].psum += next[r][c].act * WEIGHTS[r][c];

  grid = next;
  cycle += 1;
  log.push(note(cycle));
  log = log.slice(-3);

  if (cycle >= TOTAL && !observed) {
    observed = true;
    sim.checkpoint("observe-matmul");
  }
  sim.event("cycle", { cycle });
  render();
}

function togglePlay() {
  if (timer) { clearInterval(timer); timer = null; render(); return; }
  if (cycle >= TOTAL) reset();
  timer = setInterval(() => {
    step();
    if (cycle >= TOTAL) { clearInterval(timer); timer = null; render(); }
  }, 900);
  render();
}

function activeCount() {
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c].act > 0) n++;
  return n;
}

function reportSize() {
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function render() {
  const done = cycle >= TOTAL;
  const util = Math.round((activeCount() / (SIZE * SIZE)) * 100);

  let rows = "";
  for (let r = 0; r < SIZE; r++) {
    const inVal = cycle < TOTAL ? INPUT[r][cycle] || 0 : 0;
    const cells = [];
    for (let c = 0; c < SIZE; c++) {
      const { act, psum } = grid[r][c];
      const on = act > 0;
      cells.push(
        `<div class="pe ${on ? "on" : ""}">
           <span class="w">w${WEIGHTS[r][c]}</span>
           <span class="math">${on ? `${act}×${WEIGHTS[r][c]}` : "·"}</span>
           <span class="psum">Σ${psum}</span>
         </div>`,
      );
    }
    rows += `<div class="row">
        <div class="inq ${inVal > 0 ? "data" : "zero"}" title="next activation into row ${r}">${cycle < TOTAL ? inVal : ""}</div>
        ${cells.join("")}
      </div>`;
  }

  app.innerHTML = `
    <div class="controls">
      <button id="step" class="primary" ${done ? "disabled" : ""}>Pump ▶</button>
      <button id="play" class="secondary" ${done ? "disabled" : ""}>${timer ? "Pause" : "Auto"}</button>
      <button id="reset" class="secondary">Reset</button>
      <span class="metrics">
        <span>cycle <strong>${cycle}</strong>/${TOTAL}</span>
        <span>util <strong class="util">${util}%</strong></span>
      </span>
    </div>

    <div class="axis">↓ partial sums flow down · activations flow right →</div>
    <div class="array">${rows}</div>

    <div class="readout" role="status">
      ${
        done
          ? `<span class="good">Done.</span> Peaked at ${SIZE * SIZE} MACs/beat — a CPU would re-fetch operands for all 27 ops; the array read each input once and reused it.`
          : cycle === 0
            ? `Weights are loaded and stationary. Pump the clock: activations stream in from the left and are reused across the row — no per-op memory fetch.`
            : `${util}% of cells are computing this beat. Watch each activation get reused as it marches right.`
      }
    </div>

    <div class="log">${log.map((l) => `<div>${l}</div>`).join("")}</div>
    <div class="legend"><span class="k w">weight</span> <span class="k a">active activation</span> <span class="k s">Σ partial sum</span> · incoming queue on the left</div>`;

  app.querySelector("#step").addEventListener("click", step);
  app.querySelector("#play").addEventListener("click", togglePlay);
  app.querySelector("#reset").addEventListener("click", () => { reset(); render(); });
  reportSize();
}

const sim = createSim({
  onInit({ theme }) {
    applyTheme(theme);
    reset();
    render();
  },
});

setTimeout(() => {
  if (!sim.isInitialized() && cycle === 0 && app.innerHTML === "") {
    reset();
    render();
  }
}, 300);
