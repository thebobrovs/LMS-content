// `createSim` is provided as a global by sim-sdk.js (loaded as a classic script
// before this one) so the bundle works in the opaque-origin sandbox.
const app = document.getElementById("app");

// A 3x3 output-stationary systolic array computing C = A · B.
// cell[i][j] accumulates C[i][j]; on a moving diagonal wavefront, the MAC
// A[i][k]·B[k][j] lands on cell (i,j) at cycle k+i+j.
const N = 3;
const A = [
  [1, 2, 0],
  [0, 1, 3],
  [2, 0, 1],
];
const B = [
  [1, 0, 2],
  [3, 1, 0],
  [0, 4, 1],
];
const C_TRUE = A.map((row, i) =>
  B[0].map((_, j) => row.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)),
);
const MAX_CYCLE = 3 * (N - 1); // 6: last cell finishes at k=2,i=2,j=2

let cycle = -1; // -1 = not started
let acc = [];
let observed = false;
let timer = null;

function reset() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  cycle = -1;
  acc = Array.from({ length: N }, () => Array(N).fill(0));
  observed = false;
}

// {i,j,k} cells doing a MAC at cycle c.
function activeAt(c) {
  const out = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const k = c - i - j;
      if (k >= 0 && k < N) out.push({ i, j, k });
    }
  return out;
}

function step() {
  if (cycle >= MAX_CYCLE) return;
  cycle += 1;
  for (const { i, j, k } of activeAt(cycle)) acc[i][j] += A[i][k] * B[k][j];
  if (cycle >= MAX_CYCLE && !observed) {
    observed = true;
    sim.checkpoint("observe-matmul");
  }
  sim.event("cycle", { cycle });
  render();
}

function run() {
  if (timer) return;
  if (cycle >= MAX_CYCLE) reset();
  timer = setInterval(() => {
    step();
    if (cycle >= MAX_CYCLE) {
      clearInterval(timer);
      timer = null;
      render();
    }
  }, 650);
}

function reportSize() {
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function matrix(name, M, highlight) {
  const rows = M.map((row, r) =>
    `<tr>${row
      .map(
        (v, c) =>
          `<td class="${highlight.has(`${r},${c}`) ? "lit" : ""}">${v}</td>`,
      )
      .join("")}</tr>`,
  ).join("");
  return `<div class="mat"><div class="mat-name">${name}</div><table>${rows}</table></div>`;
}

function render() {
  const active = cycle >= 0 ? activeAt(cycle) : [];
  const cellActive = new Map(active.map((a) => [`${a.i},${a.j}`, a]));
  const aLit = new Set(active.map((a) => `${a.i},${a.k}`));
  const bLit = new Set(active.map((a) => `${a.k},${a.j}`));
  const done = cycle >= MAX_CYCLE;

  const grid = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const a = cellActive.get(`${i},${j}`);
      const cls = a ? "on" : done ? "done" : "";
      const term = a ? `<span class="term">+ ${A[i][a.k]}×${B[a.k][j]}</span>` : "";
      grid.push(
        `<div class="cell ${cls}" style="grid-row:${i + 1};grid-column:${j + 1}">
          <span class="acc">${acc[i][j]}</span>${term}
        </div>`,
      );
    }

  app.innerHTML = `
    <div class="controls">
      <button id="step" class="primary" ${done ? "disabled" : ""}>Step ▶</button>
      <button id="run" class="secondary" ${done ? "disabled" : ""}>Run</button>
      <button id="reset" class="secondary">Reset</button>
      <span class="cyc">Cycle ${Math.max(0, cycle)} / ${MAX_CYCLE}</span>
    </div>

    <div class="stage">
      ${matrix("B (flows down ↓)", B, bLit)}
      <div class="array">
        <div class="array-label">A (flows right →)</div>
        <div class="ag-wrap">
          ${matrix("A", A, aLit)}
          <div class="grid">${grid.join("")}</div>
        </div>
      </div>
    </div>

    <div class="readout" role="status">
      ${
        done
          ? `<span class="good">Done — the array holds C = A·B.</span> Every input streamed through once and was reused across the diagonal wavefront.`
          : cycle < 0
            ? `Each cell accumulates one output C[i][j]. Step the clock: on each cycle a diagonal of cells multiplies an A value by a B value and adds it in.`
            : `A diagonal wavefront of cells is multiplying-and-accumulating. Inputs march one step per cycle — no value is re-fetched from memory.`
      }
    </div>
    ${done ? `<div class="legend">Result matches A·B: ${JSON.stringify(C_TRUE)}.</div>` : ""}`;

  app.querySelector("#step").addEventListener("click", step);
  app.querySelector("#run").addEventListener("click", run);
  app.querySelector("#reset").addEventListener("click", () => {
    reset();
    render();
  });
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
  if (!sim.isInitialized() && cycle === -1 && app.innerHTML === "") {
    reset();
    render();
  }
}, 300);
