// createSim is a global from sim-sdk.js (classic script). Pick a TPU slice + a
// need; read off the host/chip count, single- vs multi-host, and the recommended
// capacity mode with its trade-offs. Deterministic, theme-aware, no CDNs.
const app = document.getElementById("app");

const SLICES = [
  { id: "v5e-1", label: "v5e-1×1", chips: 1 },
  { id: "v5p-8", label: "v5p-8", chips: 8 },
  { id: "v6e-256", label: "v6e-256", chips: 256 },
  { id: "8t-1024", label: "8t-1024", chips: 1024 },
];
const NEEDS = [
  { id: "bursty", label: "Bursty experiment", rec: "dws", why: "ephemeral, queued, low cost — no preemption once it starts" },
  { id: "longrun", label: "Guaranteed long run", rec: "reservation", why: "committed capacity, never preempted" },
  { id: "cheap", label: "Cheapest / interruptible", rec: "spot", why: "lowest price, but can be preempted any time" },
];
// trade-off bars 0..3: availability · cost (lower=cheaper, shown as $) · preemption risk · queueing
const MODES = {
  ondemand: { label: "On-demand", avail: 2, cost: 2, preempt: 0, queue: 0 },
  reservation: { label: "Reservation", avail: 3, cost: 3, preempt: 0, queue: 0 },
  spot: { label: "Spot", avail: 1, cost: 0, preempt: 3, queue: 0 },
  dws: { label: "DWS Flex-start", avail: 2, cost: 1, preempt: 0, queue: 2 },
};

let si = 1;       // slice index
let ni = null;    // need index (null until chosen)
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function pickSlice(n) { si = n; render(); }
function pickNeed(n) {
  ni = n;
  if (!observed) { observed = true; sim.checkpoint("observe-capacity"); }
  sim.event("select", { slice: SLICES[si].id, need: NEEDS[ni].id });
  render();
}

function dots(v) {
  return [0, 1, 2].map((k) => `<span class="dot ${k < v ? "on" : ""}"></span>`).join("");
}

function render() {
  const s = SLICES[si];
  const hosts = Math.max(1, Math.ceil(s.chips / 8));
  const multi = hosts > 1;
  const sliceBtns = SLICES.map((x, n) => `<button class="opt ${n === si ? "on" : ""}" data-s="${n}">${x.label}</button>`).join("");
  const needBtns = NEEDS.map((x, n) => `<button class="opt ${n === ni ? "on" : ""}" data-n="${n}">${x.label}</button>`).join("");

  let result = `<div class="muted">Pick a need to get a recommended capacity mode.</div>`;
  if (ni !== null) {
    const need = NEEDS[ni];
    const m = MODES[need.rec];
    result = `
      <div class="rec"><span class="recmode">${m.label}</span> — ${need.why}</div>
      <div class="bars">
        <div class="brow"><span>availability</span>${dots(m.avail)}</div>
        <div class="brow"><span>cost</span>${dots(m.cost)} <span class="mut">(${["$", "$", "$$", "$$$"][m.cost]})</span></div>
        <div class="brow"><span>preemption risk</span>${dots(m.preempt)}</div>
        <div class="brow"><span>queueing</span>${dots(m.queue)}</div>
      </div>`;
  }

  app.innerHTML = `
    <div class="hint">Provisioning is an engineering decision: the slice sets the host count; the need sets the capacity mode.</div>

    <div class="group"><div class="glabel">Slice</div><div class="opts">${sliceBtns}</div></div>
    <div class="shape">
      <b>${s.chips}</b> chip${s.chips > 1 ? "s" : ""} · <b>${hosts}</b> host VM${hosts > 1 ? "s" : ""} ·
      <span class="tag ${multi ? "multi" : "single"}">${multi ? "multi-host (ICI)" : "single-host"}</span>
      ${multi ? `<span class="note">→ needs DCN networking (MTU 8896 + VPC firewall) to rendezvous</span>` : ""}
    </div>

    <div class="group"><div class="glabel">Need</div><div class="opts">${needBtns}</div></div>
    <div class="result">${result}</div>`;

  app.querySelectorAll("[data-s]").forEach((el) => el.addEventListener("click", () => pickSlice(+el.getAttribute("data-s"))));
  app.querySelectorAll("[data-n]").forEach((el) => el.addEventListener("click", () => pickNeed(+el.getAttribute("data-n"))));
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
