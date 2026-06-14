// createSim is a global from sim-sdk.js (classic script). Two-step flow: (1) Compile —
// trace the Python layer → StableHLO → XLA fuses the op chain, which unlocks the fused
// column; (2) Execute — race the unfused baseline (every op round-trips HBM, 9 trips)
// against the XLA-fused kernel (intermediates stay in VMEM, 3 trips). Same FLOPs, far
// fewer bytes → arithmetic intensity jumps past the v5p ridge and the layer flips from
// memory-bound to compute-bound. Deterministic, theme-aware, reduced-motion aware, no CDNs.

// Honor both the OS media query and the host's explicit reducedMotion flag (set in onInit).
let REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

// One illustrative layer: A[512×512] @ W[512×512] → +bias → GELU → ×scale, bf16.
const TENSOR_MB = 0.5; // a 512×512 bf16 tensor ≈ 0.5 MB
const FLOPS = 268; // matmul dominates ≈ 268 MFLOP (2·512³)
const RIDGE = 165; // v5p ridge, FLOP/byte

const UNFUSED_TRIPS = 9; // matmul reads A+W, writes Y (3); +bias/GELU/scale each read+write (6)
const FUSED_TRIPS = 3; // read A, read W, write final — intermediates stay in VMEM

let isRunning = false, jitDone = false, observedRace = false;
let uTrips = 0, fTrips = 0;

const $ = (id) => document.getElementById(id);
const btnJit = $("btn-jit"), btnRun = $("btn-run"), note = $("dynamic-note");

// In reduced-motion mode every delay collapses, so sequences resolve to their end-state
// (the CSS @media rule also kills the keyframes as a backstop).
const delay = (ms) => new Promise((r) => setTimeout(r, REDUCE ? 0 : ms));

function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 16)); }

// --- Step 1: JIT compile pipeline (trace → StableHLO → XLA), then unlock the fused column ---
async function runJit() {
  if (jitDone) return;
  btnJit.disabled = true;
  note.innerHTML = "<i>Tracing your Python into an abstract graph…</i>";
  $("cn-py").classList.add("active");
  await delay(500);
  $("ca-1").classList.add("active"); $("cn-trace").classList.add("active");
  await delay(900);
  note.innerHTML = "<i>Lowering to <b>StableHLO</b> — the portable, hardware-neutral IR…</i>";
  $("ca-2").classList.add("active"); $("cn-hlo").classList.add("active");
  await delay(900);
  note.innerHTML = "<i><b>XLA</b> compiles for TPU — fusing MatMul + bias + GELU + scale into one kernel…</i>";
  $("ca-3").classList.add("active"); $("cn-xla").classList.add("active");
  await delay(900);

  const fusedCol = $("fused-col");
  fusedCol.classList.remove("locked");
  if (!REDUCE) fusedCol.classList.add("highlight-pulse");
  btnRun.disabled = false;
  jitDone = true;
  note.innerHTML = "<b>Compiled.</b> XLA fused the chain into one kernel. Press <b>2 · Execute</b> to race the unfused baseline against the XLA-fused executable.";
  sim.event("jit-completed", {});
  reportSize();
}

// --- Dashboards ---
function updateM(prefix, addTrips) {
  if (prefix === "u") uTrips += addTrips; else fTrips += addTrips;
  const trips = prefix === "u" ? uTrips : fTrips;
  const mb = trips * TENSOR_MB;
  const intensity = mb > 0 ? Math.round(FLOPS / mb) : 0;
  $(`${prefix}-trips`).textContent = trips;
  $(`${prefix}-mb`).textContent = mb.toFixed(1);
  $(`${prefix}-intensity`).textContent = intensity;
  if (addTrips > 0 && !REDUCE) {
    $(`${prefix}-stat-trips`).classList.add("highlight");
    $(`${prefix}-stat-mb`).classList.add("highlight");
    setTimeout(() => {
      $(`${prefix}-stat-trips`).classList.remove("highlight");
      $(`${prefix}-stat-mb`).classList.remove("highlight");
    }, 200);
  }
}

function finalizeM(prefix) {
  const trips = prefix === "u" ? uTrips : fTrips;
  const intensity = Math.round(FLOPS / (trips * TENSOR_MB));
  const isCompute = intensity > RIDGE;
  const boundEl = $(`${prefix}-bound`);
  boundEl.textContent = isCompute ? "compute-bound" : "memory-bound";
  boundEl.className = `m-bound ${isCompute ? "good" : "warn"}`;
  $(`${prefix}-stat-intensity`).classList.add("highlight");
}

function resetRace() {
  uTrips = 0; fTrips = 0;
  updateM("u", 0); updateM("f", 0);
  ["u", "f"].forEach((p) => {
    const b = $(`${p}-bound`); b.textContent = "running…"; b.className = "m-bound";
    $(`${p}-stat-intensity`).classList.remove("highlight");
  });
  // Clear race-only state, but leave the compile-stage nodes lit.
  document.querySelectorAll(".op.active, .hbm-block.active").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".active-up, .active-down").forEach((el) => el.classList.remove("active-up", "active-down"));
}

// --- Animation primitives ---
async function hbmTrip(prefix, laneIdx, dir) {
  const lane = $(`${prefix}-hl-${laneIdx}`), block = $(`${prefix}-hbm-block`);
  block.classList.add("active");
  lane.classList.add(dir === "up" ? "active-up" : "active-down");
  await delay(400);
  lane.classList.remove("active-up", "active-down");
  block.classList.remove("active");
}
async function executeOp(prefix, opIdx, ms) {
  const op = $(`${prefix}-op-${opIdx}`);
  op.classList.add("active");
  await delay(ms);
  op.classList.remove("active");
}
async function vmemTransfer(prefix, laneIdx) {
  const vl = $(`${prefix}-vl-${laneIdx}`);
  vl.classList.add("active");
  await delay(200);
  vl.classList.remove("active");
}

// --- Execution runners ---
async function runUnfused() {
  // MatMul: read A+W (2) + write Y (1) = 3 trips on lane 0.
  await hbmTrip("u", 0, "up"); updateM("u", 2);
  await executeOp("u", 0, 300);
  await hbmTrip("u", 0, "down"); updateM("u", 1);
  await delay(50);
  // +bias, GELU, ×scale: each reads then writes — 2 trips apiece.
  for (let i = 1; i < 4; i++) {
    await hbmTrip("u", i, "up"); updateM("u", 1);
    await executeOp("u", i, 300);
    await hbmTrip("u", i, "down"); updateM("u", 1);
    await delay(50);
  }
  finalizeM("u");
}

async function runFused() {
  // MatMul reads A + W from HBM (2 trips, in-lane).
  await hbmTrip("f", 0, "up"); updateM("f", 2);
  // +bias, GELU, ×scale ride along in VMEM — no HBM traffic.
  await executeOp("f", 0, 200); await vmemTransfer("f", 0);
  await executeOp("f", 1, 200); await vmemTransfer("f", 1);
  await executeOp("f", 2, 200); await vmemTransfer("f", 2);
  await executeOp("f", 3, 200);
  // Write the final result back to HBM (1 trip, out-lane).
  await hbmTrip("f", 3, "down"); updateM("f", 1);
  finalizeM("f");
}

// --- Step 2: Execute the race ---
async function runRace() {
  if (isRunning || !jitDone) return;
  isRunning = true;
  btnRun.disabled = true;
  resetRace();
  note.innerHTML = "<i>Racing the two pipelines…</i>";
  sim.event("race-started", {});

  if (REDUCE) {
    // Skip the animation; jump straight to the end-state.
    uTrips = UNFUSED_TRIPS; fTrips = FUSED_TRIPS;
    updateM("u", 0); updateM("f", 0);
    finalizeM("u"); finalizeM("f");
  } else {
    await Promise.all([runUnfused(), runFused()]);
  }

  note.innerHTML = "<b>Done.</b> Same layer, same FLOPs. The fused kernel keeps intermediates in VMEM — <b>9 → 3</b> HBM round-trips, so arithmetic intensity climbs from <b>60</b> to <b>179</b> FLOP/byte, past the v5p ridge (165). The layer flips from <b>memory-bound</b> to <b>compute-bound</b>: XLA removed the trips, not the math.";
  isRunning = false;
  btnRun.disabled = false;
  if (!observedRace) { observedRace = true; sim.checkpoint("observe-fusion"); }
  sim.event("race-complete", { unfusedTrips: UNFUSED_TRIPS, fusedTrips: FUSED_TRIPS });
  reportSize();
}

btnJit.addEventListener("click", runJit);
btnRun.addEventListener("click", runRace);

const sim = createSim({
  onInit({ theme, reducedMotion }) { REDUCE = REDUCE || reducedMotion; applyTheme(theme); reportSize(); },
});

// Auto-resize when content height changes (e.g. when the fused column unlocks).
new ResizeObserver(() => reportSize()).observe(document.body);
setTimeout(() => { if (!sim.isInitialized()) reportSize(); }, 300);
