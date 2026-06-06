// `createSim` is provided as a global by sim-sdk.js (loaded as a classic script
// before this one) so the bundle works in the opaque-origin sandbox.
const app = document.getElementById("app");

let capacity = 3;
let order = []; // keys, most-recently-used first
let evictionReported = false;
let lastTouched = null;
let lastEvicted = null;

function reset() {
  order = [];
  evictionReported = false;
  lastTouched = null;
  lastEvicted = null;
}

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme; // "system" → prefers-color-scheme
  }
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function reportSize() {
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}

function render(statusMsg, kind) {
  const slots = order.length
    ? order
        .map(
          (k) =>
            `<span class="slot ${k === lastTouched ? "touched" : ""}">${escapeHtml(k)}</span>`,
        )
        .join("")
    : `<span class="empty">empty</span>`;

  const evicted = lastEvicted
    ? `<span class="slot evicted">${escapeHtml(lastEvicted)}</span>`
    : "";

  app.innerHTML = `
    <div class="controls">
      <input id="key" placeholder="Access a key, e.g. 'A'" autocomplete="off" aria-label="Key to access" />
      <button id="access">Access</button>
      <button id="reset" class="secondary">Reset</button>
    </div>
    <div class="status ${kind ?? ""}" role="status">
      ${statusMsg ?? `Capacity ${capacity}. Access keys; when full, the least-recently-used key is evicted.`}
    </div>
    <div class="cache">
      <span class="end">MRU</span>
      <div class="slots">${slots}</div>
      <span class="end">LRU</span>
    </div>
    <div class="evicted-row">${evicted ? `Evicted: ${evicted}` : ""}</div>
    <div class="legend">Each access moves a key to most-recently-used (left). Over capacity (${capacity}), the LRU key (right) is evicted.</div>`;

  const input = app.querySelector("#key");
  app.querySelector("#access").addEventListener("click", () => doAccess(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAccess(input.value);
  });
  app.querySelector("#reset").addEventListener("click", () => {
    reset();
    render();
  });
  input.focus();
  reportSize();
}

function doAccess(raw) {
  const key = (raw || "").trim();
  if (!key) return;
  lastTouched = key;
  lastEvicted = null;

  const hit = order.includes(key);
  // Move (or insert) the key at the front = most-recently-used.
  order = order.filter((k) => k !== key);
  order.unshift(key);

  let msg;
  let kind;
  if (hit) {
    msg = `Hit: "${escapeHtml(key)}" was cached — promoted to most-recently-used.`;
    kind = "hit";
  } else if (order.length > capacity) {
    lastEvicted = order.pop(); // drop the least-recently-used
    msg = `Miss: stored "${escapeHtml(key)}". Cache full — evicted LRU key "${escapeHtml(lastEvicted)}".`;
    kind = "evict";
    if (!evictionReported) {
      evictionReported = true;
      sim.checkpoint("cause-eviction");
    }
  } else {
    msg = `Miss: stored "${escapeHtml(key)}".`;
    kind = "miss";
  }
  sim.event("access", { key, hit, evicted: lastEvicted });
  render(msg, kind);
}

const sim = createSim({
  onInit({ props, theme }) {
    const n = Number(props?.capacity);
    capacity = Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
    applyTheme(theme);
    reset();
    render();
  },
});

// Fallback for opening the bundle directly (no host init): render with defaults.
setTimeout(() => {
  if (!sim.isInitialized() && order.length === 0) {
    reset();
    render();
  }
}, 300);
