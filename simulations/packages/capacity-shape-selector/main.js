// createSim is a global from sim-sdk.js (classic script). Pick a TPU slice, a
// need, and a max run time; read off the host/chip count and the recommended
// capacity mode — including the two DWS modes (Flex Start ≤7d, Calendar ≤90d),
// where run time routes the decision. Deterministic, theme-aware, no CDNs.
const app = document.getElementById("app");

const SLICES = [
  { id: "v5e-1", label: "v5e-1×1", chips: 1 },
  { id: "v5p-8", label: "v5p-8", chips: 8 },
  { id: "v6e-256", label: "v6e-256", chips: 256 },
  { id: "8t-1024", label: "8t-1024", chips: 1024 },
];

const RUNTIMES = [
  { label: "1 hour", days: 1 / 24 },
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year+", days: 365 },
];

const NEEDS = [
  { id: "now", label: "A few chips, right now" },
  { id: "flex", label: "Uninterrupted · flexible start" },
  { id: "fixed", label: "Uninterrupted · scheduled start" },
  { id: "cheap", label: "Cheapest · can restart" },
];

// trade-off bars 0..3 · max = run-time ceiling
const MODES = {
  ondemand: { label: "On-demand", avail: 2, cost: 2, preempt: 0, queue: 0, max: "unbounded", why: "available now, full price — no planning, no commitment." },
  reservation: { label: "Reservation", avail: 3, cost: 3, preempt: 0, queue: 0, max: "committed term", why: "committed capacity, guaranteed and never preempted — for the longest runs." },
  spot: { label: "Spot", avail: 1, cost: 0, preempt: 3, queue: 0, max: "until preempted", why: "lowest price, but preempted any time — only if your job checkpoints and restarts." },
  dwsflex: { label: "DWS · Flex Start", avail: 2, cost: 1, preempt: 0, queue: 2, max: "≤ 7 days", why: "queued, low cost, flexible start; not preempted once it starts." },
  dwscalendar: { label: "DWS · Calendar", avail: 2, cost: 2, preempt: 0, queue: 1, max: "1–90 days", why: "reserve a future window with a guaranteed start time — predictable scheduled runs." },
};

let si = 1;
let ni = null;
let ri = 2; // runtime index (3 days)
let observed = false;

function reportSize() { requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8)); }
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function recommend(needId, days) {
  if (needId === "cheap") return { mode: "spot" };
  if (needId === "now") return { mode: "ondemand" };
  if (needId === "flex" && days <= 7) return { mode: "dwsflex" };
  if (days <= 90)
    return {
      mode: "dwscalendar",
      note: needId === "flex" ? "Past Flex Start's 7-day cap — reserve a window with Calendar." : null,
    };
  return { mode: "reservation", note: "Beyond Calendar's 90-day window — needs a committed reservation." };
}

function dots(v) {
  return [0, 1, 2].map((k) => `<span class="dot ${k < v ? "on" : ""}"></span>`).join("");
}

function pickSlice(n) { si = n; render(); }
function pickNeed(n) {
  ni = n;
  if (!observed) { observed = true; sim.checkpoint("observe-capacity"); }
  sim.event("select", { slice: SLICES[si].id, need: NEEDS[ni].id, runtime: RUNTIMES[ri].label });
  render();
}

function render() {
  const s = SLICES[si];
  const rt = RUNTIMES[ri];
  const hosts = Math.max(1, Math.ceil(s.chips / 8));
  const multi = hosts > 1;
  const sliceBtns = SLICES.map((x, n) => `<button class="opt ${n === si ? "on" : ""}" data-s="${n}">${x.label}</button>`).join("");
  const needBtns = NEEDS.map((x, n) => `<button class="opt ${n === ni ? "on" : ""}" data-n="${n}">${x.label}</button>`).join("");

  let result = `<div class="muted">Pick a need to get a recommended capacity mode.</div>`;
  if (ni !== null) {
    const rec = recommend(NEEDS[ni].id, rt.days);
    const m = MODES[rec.mode];
    result = `
      <div class="rec"><span class="recmode">${m.label}</span> — ${m.why}</div>
      <div class="fit"><b>Max run time:</b> ${m.max} · your run: <b>${rt.label}</b></div>
      ${rec.note ? `<div class="ruleout">${rec.note}</div>` : ""}
      <div class="bars">
        <div class="brow"><span>availability</span>${dots(m.avail)}</div>
        <div class="brow"><span>cost</span>${dots(m.cost)} <span class="mut">(${["$", "$", "$$", "$$$"][m.cost]})</span></div>
        <div class="brow"><span>preemption risk</span>${dots(m.preempt)}</div>
        <div class="brow"><span>queue / lead time</span>${dots(m.queue)}</div>
      </div>`;
  }

  app.innerHTML = `
    <div class="hint">The slice sets the host count; the need <em>and how long it runs</em> set the capacity mode — DWS Flex Start caps at 7 days, Calendar at 90.</div>

    <div class="group"><div class="glabel">Slice</div><div class="opts">${sliceBtns}</div></div>
    <div class="shape">
      <b>${s.chips}</b> chip${s.chips > 1 ? "s" : ""} · <b>${hosts}</b> host VM${hosts > 1 ? "s" : ""} ·
      <span class="tag ${multi ? "multi" : "single"}">${multi ? "multi-host (ICI)" : "single-host"}</span>
      ${multi ? `<span class="note">→ needs DCN networking (MTU 8896 + VPC firewall) to rendezvous</span>` : ""}
    </div>

    <div class="group">
      <div class="glabel">Max run time</div>
      <div class="rtrow">
        <input id="rt" type="range" min="0" max="${RUNTIMES.length - 1}" step="1" value="${ri}" aria-label="Max run time">
        <span class="rtval">${rt.label}</span>
      </div>
    </div>

    <div class="group"><div class="glabel">Need</div><div class="opts">${needBtns}</div></div>
    <div class="result">${result}</div>`;

  app.querySelectorAll("[data-s]").forEach((el) => el.addEventListener("click", () => pickSlice(+el.getAttribute("data-s"))));
  app.querySelectorAll("[data-n]").forEach((el) => el.addEventListener("click", () => pickNeed(+el.getAttribute("data-n"))));
  app.querySelector("#rt").addEventListener("input", (e) => { ri = +e.target.value; render(); });
  reportSize();
}

const sim = createSim({ onInit({ theme }) { applyTheme(theme); render(); } });
setTimeout(() => { if (!sim.isInitialized() && app.innerHTML === "") render(); }, 300);
