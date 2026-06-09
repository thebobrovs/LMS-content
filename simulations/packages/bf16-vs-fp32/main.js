// createSim is a global from sim-sdk.js (classic script). Drag a value and see how
// fp32, bf16, and fp16 represent it. The point: bf16 keeps fp32's full 8-bit
// exponent (same dynamic range) but drops mantissa bits (precision) at half the
// bytes — which is exactly the trade ML training wants. Deterministic, no CDNs.
const app = document.getElementById("app");

const FORMATS = [
  { id: "fp32", label: "FP32", sign: 1, exp: 8, mant: 23, bytes: 4 },
  { id: "bf16", label: "BF16", sign: 1, exp: 8, mant: 7, bytes: 2 },
  { id: "fp16", label: "FP16", sign: 1, exp: 5, mant: 10, bytes: 2 },
];
// log10(value); slider drives the exponent.
let L = 0; // value = 10^L
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function fmtNum(v) {
  if (v >= 1e4 || v < 1e-3) return v.toExponential(1);
  return (Math.round(v * 1000) / 1000).toString();
}
function repr(v, f) {
  const a = Math.abs(v);
  if (f.id === "fp32") return { ok: true, errPct: 0.000006 };
  if (f.id === "bf16") return { ok: true, errPct: 0.39 }; // ~2^-8; range = fp32's
  // fp16: 5-bit exponent → normal max 65504, subnormals to ~6e-8
  if (a > 65504) return { ok: false, status: "OVERFLOW → ∞" };
  if (a < 6e-8) return { ok: false, status: "UNDERFLOW → 0" };
  return { ok: true, errPct: 0.05 }; // ~2^-11
}

function strip(f) {
  let cells = `<span class="bit sign" title="sign"></span>`;
  cells += Array(f.exp).fill('<span class="bit exp"></span>').join("");
  cells += Array(f.mant).fill('<span class="bit mant"></span>').join("");
  return cells;
}

function render() {
  const v = Math.pow(10, L);
  const reps = FORMATS.map((f) => ({ f, r: repr(v, f) }));
  const fp16fail = !reps[2].r.ok;
  if (fp16fail && !observed) { observed = true; sim.checkpoint("observe-bf16"); }

  // range axis log10 from -45..38
  const lo = -45, hi = 38, pos = (x) => ((x - lo) / (hi - lo)) * 100;
  const wideL = pos(-45), wideR = pos(38);
  const f16L = pos(-7.2), f16R = pos(4.8); // ~6e-8 .. 65504
  const mark = Math.max(0, Math.min(100, pos(L)));

  const cards = reps.map(({ f, r }) => `
    <div class="card ${f.id} ${!r.ok ? "fail" : ""}">
      <div class="chead"><b>${f.label}</b> <span class="bytes">${f.bytes} bytes</span></div>
      <div class="strip">${strip(f)}</div>
      <div class="counts"><span class="ce">${f.exp} exp</span> · <span class="cm">${f.mant} mantissa</span></div>
      <div class="val">${r.ok ? `≈ ${fmtNum(v)}` : `<span class="bad">${r.status}</span>`}</div>
      <div class="err">${r.ok ? (r.errPct < 0.001 ? "exact" : `±${r.errPct}% rounding`) : "can't represent"}</div>
    </div>`).join("");

  app.innerHTML = `
    <div class="hint">Drag the value. <b>bf16</b> keeps fp32's full <b>8-bit exponent</b> (same range) but only 7 mantissa bits — <b>half the bytes</b>. <b>fp16</b> trades range for precision and breaks at the extremes.</div>

    <div class="slider">
      <label>value = 10<sup>${L.toFixed(1)}</sup> = <b>${fmtNum(v)}</b></label>
      <input id="L" type="range" min="-10" max="10" step="0.1" value="${L}">
      <div class="presets">
        <button data-l="-7">tiny gradient (1e-7)</button>
        <button data-l="0">≈1</button>
        <button data-l="5">big activation (1e5)</button>
      </div>
    </div>

    <div class="cards">${cards}</div>

    <div class="range">
      <div class="rlabel">dynamic range (log scale)</div>
      <div class="raxis">
        <div class="rbar wide" style="left:${wideL}%;width:${wideR - wideL}%"><span>fp32 / bf16</span></div>
        <div class="rbar narrow" style="left:${f16L}%;width:${f16R - f16L}%"><span>fp16</span></div>
        <div class="rmark ${fp16fail ? "out" : ""}" style="left:${mark}%"></div>
      </div>
    </div>

    <div class="readout" role="status">
      ${
        fp16fail
          ? `<span class="bad">fp16 can't hold this value</span> — its 5-bit exponent is too narrow. <b>bf16 still works</b>, because it kept fp32's 8-bit exponent. That range is why ML picked bf16.`
          : `bf16 represents this within <b>±0.39%</b> — coarser than fp16, but ML training averages that out. What it can't lose is <b>range</b>: gradients span ~1e-7 to activations ~1e5, and only an 8-bit exponent covers both.`
      } The MXU multiplies in bf16 but <b>accumulates in fp32</b>, so rounding doesn't pile up.
    </div>`;

  app.querySelector("#L").addEventListener("input", (e) => { L = +e.target.value; render(); });
  app.querySelectorAll(".presets button").forEach((b) => b.addEventListener("click", () => { L = +b.getAttribute("data-l"); render(); }));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
