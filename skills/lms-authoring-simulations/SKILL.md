---
name: lms-authoring-simulations
description: Build an LMS simulation — a small, self-contained interactive web app a lesson embeds in a sandboxed iframe via <Simulation id>. Use when creating, editing, or wiring up a lesson's interactive demo. Covers the DESIGN STANDARD (compact, on-theme, one concept, one checkpoint — no quests/dashboards), the package layout, sim.config.json, the postMessage SDK (init/theme/props ↔ ready/resize/checkpoint/event), the CRITICAL classic-scripts rule, and build/embed/validate.
---

# Building a simulation

A **simulation** is a tiny web app (plain HTML/CSS/JS — no framework, no build
step) that runs in a sandboxed iframe and talks to the host lesson via a
`postMessage` SDK. The simulation is the **centerpiece** of a lesson: the prose
sets it up and interprets it. Make it small, focused, and genuinely interactive.

## The design standard (match these — they are the house style)

Exemplars to copy the level and look from: **`moe-factory`** (routing → % compute),
**`consistent-hash-ring`** (remap fraction), **`systolic-array`** (matmul
wavefront), **`lru-cache`** (eviction). New sims must look and behave like these.

1. **One concept, one checkpoint.** A sim teaches a *single* idea and fires
   exactly one `observe-*` checkpoint the moment the learner sees the key insight.
   **No quest chains, no score, no "Completed!" modal, no game.** (We removed those
   on purpose.)
2. **Compact — no long scrolling.** The whole sim should be visible at a glance,
   ~**250–480px** tall. After each render, report height once:
   `requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8))`.
   It is **not** a full-screen dashboard.
3. **On-theme, plain CSS only.** Copy the token block from
   [`template/style.css`](template/style.css) and apply the host `theme` via
   `document.documentElement.dataset.theme`. **No CSS frameworks or CDNs**
   (no Tailwind Play, no MathJax unless math is truly essential and vendored),
   **no off-brand palettes** — it must read correctly in light *and* dark.
4. **A measurable readout.** Show one live line that makes the trade-off concrete
   (% compute, remap fraction, hit rate, cycle count). This is the takeaway in
   numbers — keep it to a line, not a telemetry panel.
5. **Standard anatomy, top→bottom:** `controls` → visualization → `readout`
   (the result) → one-line `legend`.
6. **Deterministic core.** Derive behavior from inputs/props (e.g. a small hash),
   not runtime randomness, so results are reproducible and explainable.
7. **Interaction & a11y.** One primary action + a few controls + **Reset**;
   keyboard-operable; always-visible focus ring; honor `reducedMotion` (no
   essential motion-only cue).

### Design checklist (must pass before promoting)

- [ ] One concept; one `observe-*` checkpoint; no quests/score/modal.
- [ ] Compact, no long scroll; resizes to its content.
- [ ] Token theme (copied block); correct in light + dark; respects reduced motion.
- [ ] Plain HTML/CSS/JS — no CSS framework or CDN.
- [ ] A measurable readout that states the takeaway.
- [ ] `controls → viz → readout → legend`; keyboard + focus ring.
- [ ] Deterministic core; classic scripts; `sim.resize` after render.

## Where it goes

```
simulations/packages/<id>/
  sim.config.json     # manifest: id, title, version, props, checkpoints
  index.html          # loads the SDK + main.js as CLASSIC scripts
  main.js             # your app logic
  style.css           # token-themed styles (copy the standard block)
```

Packages live in **this content repo**; the host↔sim **SDK** stays in the app
repo. At build, the app fetches each package and copies it + the SDK into
`public/sims/<id>/`, regenerating the registry. A copyable starter is in
[template/](template/) — it already follows the standard, so **start by copying
the template**. The SDK contract is in [reference/sdk-protocol.md](reference/sdk-protocol.md).

Embed in a lesson (default height; the sim self-resizes):

```mdx
<Simulation id="<id>" props={{ /* optional */ }} />
```

## ⚠️ The one rule that breaks sims if you get it wrong

The host iframe is `sandbox="allow-scripts"` with **no `allow-same-origin`** — an
opaque/null origin (intentional isolation). **ES module scripts are CORS-blocked
from a null origin**, so a sim using `<script type="module">` / `import` renders
**blank**. Always load the SDK and your code as **CLASSIC scripts**:

```html
<script src="./sim-sdk.js"></script>   <!-- exposes a global createSim() -->
<script src="./main.js"></script>      <!-- uses the global, no import -->
```

Never use `import` / `type="module"` in a simulation bundle.

## main.js skeleton

```js
// createSim is a global from sim-sdk.js (classic script). No imports.
const app = document.getElementById("app");
let state = /* derived from props; deterministic */;

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme; // "system" → prefers-color-scheme
}

function render() {
  app.innerHTML = `
    <div class="controls">…primary action · Reset…</div>
    <div class="viz">…</div>
    <div class="readout" role="status">…the measurable takeaway…</div>
    <div class="legend">…one line…</div>`;
  // wire listeners here
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}

const sim = createSim({
  onInit({ props, theme }) { applyTheme(theme); /* read props */ render(); },
});

// Fire the single checkpoint when the learner sees the insight — ONCE:
function onInsight() { sim.checkpoint("observe-x"); sim.event("did-x", {}); }

// Fallback so the bundle renders if opened directly (no host init):
setTimeout(() => { if (!sim.isInitialized()) render(); }, 300);
```

## sim.config.json

```json
{
  "id": "<id>",
  "title": "<Human title>",
  "version": "1.0.0",
  "props": { "n": { "type": "number", "default": 4 } },
  "checkpoints": [
    { "id": "observe-x", "hint": "What the learner does to see the insight." }
  ]
}
```

- `id` must equal the directory name and the embedded `<Simulation id>`.
- Prefer **one** checkpoint (`observe-*`). It feeds topic **mastery coverage**.
- Bump `version` when behavior changes (bundles are versioned in the registry).

## Theming & accessibility

- Copy the token block from [`template/style.css`](template/style.css) so the sim
  matches light/dark; apply `theme` from `onInit` via `dataset.theme`.
- Honor `reducedMotion` (passed to `onInit`). Visible focus ring; keyboard-operable.

## Build, embed, validate

```bash
node pipeline/validate.mjs   # confirms every <Simulation id> has a package
# (the app's build copies packages + SDK into public/sims and registers them)
```

## Verify it actually renders

A sim runs in an opaque-origin iframe, so the host page can't read into it. Drive
the bundle directly at `http://localhost:3000/sims/<id>/index.html`. Check it's
**compact** (no long scroll), reads well in light + dark, and fires its one
checkpoint. If it's blank, the #1 cause is ES modules instead of classic scripts.
