// createSim is a global from sim-sdk.js (classic script). A single transformer layer —
// MatMul → +bias → GELU → ×scale — raced two ways. Unfused: every op round-trips its
// tensor through HBM (9 trips). Fused: XLA keeps the intermediates in VMEM, so only the
// inputs and the final result touch HBM (3 trips). Same FLOPs, far fewer bytes → the
// arithmetic intensity jumps past the v5p ridge (165) and the layer flips from
// memory-bound to compute-bound. Deterministic, theme-aware, no CDNs.

// Honor both the OS media query and the host's explicit reducedMotion flag (set in onInit).
let REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

// One illustrative layer: A[512×512] @ W[512×512] → +bias → GELU → ×scale, bf16.
const TENSOR_MB = 0.5; // a 512×512 bf16 tensor ≈ 0.5 MB
const FLOPS = 268; // matmul dominates ≈ 268 MFLOP (2·512³)
const RIDGE = 165; // v5p ridge, FLOP/byte

const UNFUSED_TRIPS = 9; // matmul reads A+W, writes Y (3); each of 3 elementwise: read+write (6)
const FUSED_TRIPS = 3; // read A, read W, write final — intermediates stay in VMEM

let running = false;
let observed = false;

const $ = (id) => document.getElementById(id);
const btn = $("btn-run");

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// In reduced-motion mode every delay collapses, so the race resolves to its end-state
// without any moving pulses (the CSS @media rule also kills the keyframes as a backstop).
const delay = (ms) => new Promise((r) => setTimeout(r, REDUCE ? 0 : ms));

function activate(el, cls, ms) {
  if (!el) return Promise.resolve();
  el.classList.add(cls);
  return delay(ms).then(() => el.classList.remove(cls));
}

// One HBM round-trip on a lane: a pulse up (read) or down (write), plus the block glow.
async function hbmTrip(laneId, blockId, dir) {
  const lane = $(laneId), block = $(blockId);
  block && block.classList.add("active");
  await activate(lane, dir === "up" ? "active-up" : "active-down", 400);
  block && block.classList.remove("active");
}

function setStat(prefix, trips) {
  const mb = +(trips * TENSOR_MB).toFixed(1);
  $(`${prefix}-trips`).textContent = trips;
  $(`${prefix}-mb`).textContent = mb.toFixed(1);
  return mb;
}

function finalize(prefix, trips) {
  const mb = +(trips * TENSOR_MB).toFixed(1);
  const intensity = Math.round(FLOPS / mb);
  const compute = intensity > RIDGE;
  $(`${prefix}-intensity`).textContent = intensity;
  $(`${prefix}-stat-intensity`).classList.add("highlight");
  const bound = $(`${prefix}-bound`);
  bound.textContent = compute ? "compute-bound" : "memory-bound";
  bound.classList.remove("good", "warn");
  bound.classList.add(compute ? "good" : "warn");
  return { intensity, compute };
}

// Unfused: each op reads its input from HBM and writes its output back.
async function runUnfused() {
  let trips = 0;
  const lane = (i) => `u-hl-${i}`;
  // MatMul: read A, read W, write Y — 3 trips on lane 0.
  $("u-op-0").classList.add("active");
  for (let k = 0; k < 3; k++) { await hbmTrip(lane(0), "u-hbm-block", k < 2 ? "up" : "down"); setStat("u", ++trips); }
  $("u-op-0").classList.remove("active");
  // +bias, GELU, ×scale: each reads then writes — 2 trips apiece.
  for (let i = 1; i < 4; i++) {
    $(`u-op-${i}`).classList.add("active");
    await hbmTrip(lane(i), "u-hbm-block", "up"); setStat("u", ++trips);
    await hbmTrip(lane(i), "u-hbm-block", "down"); setStat("u", ++trips);
    $(`u-op-${i}`).classList.remove("active");
  }
  finalize("u", UNFUSED_TRIPS);
}

// Fused: read inputs once, cascade through VMEM, write the result once.
async function runFused() {
  let trips = 0;
  // MatMul reads A + W from HBM (2 trips, in-lane).
  $("f-op-0").classList.add("active");
  await hbmTrip("f-hl-0", "f-hbm-block", "up"); setStat("f", ++trips);
  await hbmTrip("f-hl-0", "f-hbm-block", "up"); setStat("f", ++trips);
  $("f-op-0").classList.remove("active");
  // +bias, GELU, ×scale ride along in VMEM — no HBM traffic.
  for (let i = 1; i < 4; i++) {
    const vl = $(`f-vl-${i - 1}`);
    if (vl) { vl.classList.add("active"); await delay(200); vl.classList.remove("active"); }
    $(`f-op-${i}`).classList.add("active");
    await delay(REDUCE ? 0 : 120);
    $(`f-op-${i}`).classList.remove("active");
  }
  // Write the final result back to HBM (1 trip, out-lane).
  await hbmTrip("f-hl-3", "f-hbm-block", "down"); setStat("f", ++trips);
  finalize("f", FUSED_TRIPS);
}

async function runRace() {
  if (running) return;
  running = true;
  btn.disabled = true;
  // reset
  ["u", "f"].forEach((p) => {
    $(`${p}-trips`).textContent = "0";
    $(`${p}-mb`).textContent = "0.0";
    $(`${p}-intensity`).textContent = "0";
    $(`${p}-stat-intensity`).classList.remove("highlight");
    const b = $(`${p}-bound`); b.textContent = "running…"; b.classList.remove("good", "warn");
  });
  $("dynamic-note").innerHTML = "Running both pipelines…";
  reportSize();

  const u = finalizeView("u");
  const f = finalizeView("f");
  await Promise.all([runUnfused(), runFused()]);

  const note = `Same layer, same FLOPs. <b>Unfused</b> took <b>${UNFUSED_TRIPS} HBM round-trips (${(UNFUSED_TRIPS * TENSOR_MB).toFixed(1)} MB)</b> → ${u.intensity} FLOP/byte, <b>below the ${RIDGE} ridge → memory-bound</b>, the MXU idles waiting on memory. <b>Fused</b> took just <b>${FUSED_TRIPS} (${(FUSED_TRIPS * TENSOR_MB).toFixed(1)} MB)</b> → ${f.intensity} FLOP/byte, <b>past the ridge → compute-bound</b>: the bias, GELU and scale ride along in the matmul's epilogue, in VMEM. That's the whole win — XLA removed the round-trips, not the math.`;
  $("dynamic-note").innerHTML = note;

  if (!observed) { observed = true; sim.checkpoint("observe-fusion"); }
  sim.event("race-complete", { unfusedIntensity: u.intensity, fusedIntensity: f.intensity });
  reportSize();
  running = false;
  btn.disabled = false;
}

// Precompute the end-state numbers so the closing note can reference both columns.
function finalizeView(prefix) {
  const trips = prefix === "u" ? UNFUSED_TRIPS : FUSED_TRIPS;
  const mb = +(trips * TENSOR_MB).toFixed(1);
  const intensity = Math.round(FLOPS / mb);
  return { intensity, compute: intensity > RIDGE };
}

btn.addEventListener("click", runRace);

const sim = createSim({
  onInit({ theme, reducedMotion }) { REDUCE = REDUCE || reducedMotion; applyTheme(theme); reportSize(); },
});
setTimeout(() => { if (!sim.isInitialized()) reportSize(); }, 300);
