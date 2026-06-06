// `createSim` is provided as a global by sim-sdk.js (loaded as a classic script
// before this one) so the bundle works in the opaque-origin sandbox.
const app = document.getElementById("app");

let buckets = 8;
let table = [];
let collisionReported = false;

function hash(key) {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return ((sum % buckets) + buckets) % buckets;
}

function initTable() {
  table = Array.from({ length: buckets }, () => []);
  collisionReported = false;
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

function render(statusMsg, collision = false) {
  const rows = table
    .map(
      (b, i) => `
      <div class="bucket-idx">${i}</div>
      <div class="bucket ${b.length > 1 ? "has-collision" : ""}">
        ${b.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join("")}
      </div>`,
    )
    .join("");

  app.innerHTML = `
    <div class="controls">
      <input id="key" placeholder="Type a key, e.g. 'ab'" autocomplete="off" aria-label="Key to insert" />
      <button id="insert">Insert</button>
      <button id="reset" class="secondary">Reset</button>
    </div>
    <div class="status ${collision ? "collision" : ""}" role="status">
      ${statusMsg ?? `Insert keys into ${buckets} buckets. A bucket holding 2+ keys is a collision.`}
    </div>
    <div class="buckets">${rows}</div>
    <div class="legend">Hash = (sum of character codes) mod ${buckets}.</div>`;

  const input = app.querySelector("#key");
  app.querySelector("#insert").addEventListener("click", () => doInsert(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doInsert(input.value);
  });
  app.querySelector("#reset").addEventListener("click", () => {
    initTable();
    render();
  });
  input.focus();
  reportSize();
}

function doInsert(raw) {
  const key = (raw || "").trim();
  if (!key) return;
  const idx = hash(key);
  table[idx].push(key);

  const collision = table[idx].length > 1;
  let msg = `"${escapeHtml(key)}" → bucket ${idx}.`;
  if (collision) {
    msg = `Collision! "${escapeHtml(key)}" also hashed to bucket ${idx}.`;
    if (!collisionReported) {
      collisionReported = true;
      sim.checkpoint("cause-collision");
    }
  }
  sim.event("insert", { key, bucket: idx, collision });
  render(msg, collision);
}

const sim = createSim({
  onInit({ props, theme }) {
    const n = Number(props?.buckets);
    buckets = Number.isFinite(n) && n > 0 ? n : 8;
    applyTheme(theme);
    initTable();
    render();
  },
});

// Fallback for opening the bundle directly (no host init): render with defaults.
setTimeout(() => {
  if (!sim.isInitialized() && table.length === 0) {
    initTable();
    render();
  }
}, 300);
