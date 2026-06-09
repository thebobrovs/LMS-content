// createSim is a global from sim-sdk.js (classic script). A matmul A[B×F]·W[F×F]
// in bf16. Teaches two things: (1) arithmetic intensity vs the v5p roofline ridge
// (~165 FLOP/byte) — raise the batch to go compute-bound; (2) the Padding Trap —
// dims off the MXU tile (128 / 256) get zero-padded, wasting compute + memory.
// Deterministic, theme-aware, no CDNs.
const app = document.getElementById("app");

const RIDGE = 165; // v5p ridge: ~459 bf16 TFLOP/s ÷ ~2.8 TB/s
let B = 256;       // batch
let F = 4096;      // feature / contraction dim
let tile = 128;    // MXU tile: 128 (v5p) or 256 (v6e/v7)
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
const ceilTo = (x, m) => Math.ceil(x / m) * m;

function metrics() {
  const intensity = (B * F) / (B + F);           // FLOP/byte for A·W in bf16
  const Bpad = ceilTo(B, 8);                      // batch → sublane multiple of 8
  const Fpad = ceilTo(F, tile);                   // feature → MXU tile (128/256)
  const util = (B * F) / (Bpad * Fpad);           // fraction of the padded tile that's real
  const waste = 1 - util;
  const bound = intensity >= RIDGE ? "compute" : "memory";
  return { intensity, Bpad, Fpad, util, waste, bound };
}

function render() {
  const m = metrics();
  if (m.bound === "compute" && !observed) { observed = true; sim.checkpoint("observe-roofline"); }

  // roofline axis (log10 intensity 1..1000), ridge marker + workload marker
  const pos = (v) => Math.max(0, Math.min(100, (Math.log10(Math.max(1, v)) / 3) * 100));
  const ridgePos = pos(RIDGE), wlPos = pos(m.intensity);

  app.innerHTML = `
    <div class="hint">A matmul <code>A[B×F]·W[F×F]</code> in bf16. Raise the batch to cross the ridge; mis-size a dim to trigger padding.</div>

    <div class="controls">
      <label>Batch <b>${B}</b><input id="b" type="range" min="8" max="1024" step="1" value="${B}"></label>
      <label>Feature <b>${F}</b><input id="f" type="range" min="128" max="8192" step="1" value="${F}"></label>
      <span class="tiles">MXU tile
        <button class="t ${tile === 128 ? "on" : ""}" data-t="128">128 · v5p</button>
        <button class="t ${tile === 256 ? "on" : ""}" data-t="256">256 · v6e/v7</button>
      </span>
    </div>

    <div class="roofline">
      <div class="rl-axis">
        <div class="rl-fill mem" style="width:${ridgePos}%"></div>
        <div class="rl-fill comp" style="left:${ridgePos}%;right:0"></div>
        <div class="ridge" style="left:${ridgePos}%"><span>ridge ≈ ${RIDGE}</span></div>
        <div class="wl ${m.bound}" style="left:${wlPos}%"><span>${m.intensity.toFixed(0)}</span></div>
      </div>
      <div class="rl-labels"><span>← memory-bound (idle)</span><span>compute-bound (full TFLOPs) →</span></div>
    </div>

    <div class="pad">
      <div class="pad-grid" title="one MXU tile: useful vs padded">
        <div class="useful" style="width:${(B / m.Bpad) * 100}%;height:${(F / m.Fpad) * 100}%"></div>
      </div>
      <div class="pad-num">
        <div>tile utilization <b class="${m.util < 0.7 ? "warn" : "ok"}">${(m.util * 100).toFixed(0)}%</b></div>
        <div>padded zeros <b class="${m.waste > 0.3 ? "warn" : ""}">${(m.waste * 100).toFixed(0)}%</b></div>
        <div>padded shape <b class="mono">${m.Bpad}×${m.Fpad}</b> <span class="mut">(from ${B}×${F})</span></div>
      </div>
    </div>

    <div class="readout" role="status">
      Arithmetic intensity <b>${m.intensity.toFixed(0)} FLOP/byte</b> →
      <b class="${m.bound === "compute" ? "ok" : "warn"}">${m.bound}-bound</b>${
        m.bound === "memory" ? ` (below the ~${RIDGE} ridge — the MXU starves)` : ` (above the ridge — the MXU runs near peak)`
      }.${
        m.waste > 0.3 ? ` <span class="warn">${(m.waste * 100).toFixed(0)}% of every tile is padded zeros — wasted compute + memory, and a path to a "mysterious" OOM.</span>` : ""
      }
    </div>`;

  app.querySelector("#b").addEventListener("input", (e) => { B = +e.target.value; render(); });
  app.querySelector("#f").addEventListener("input", (e) => { F = +e.target.value; render(); });
  app.querySelectorAll(".t").forEach((el) => el.addEventListener("click", () => { tile = +el.getAttribute("data-t"); render(); }));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
