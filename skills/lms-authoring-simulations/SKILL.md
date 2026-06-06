---
name: lms-authoring-simulations
description: Build an LMS simulation — a small, self-contained interactive web app that a lesson embeds in a sandboxed iframe with a one-line <Simulation id> tag. Use when creating a new interactive demo/visualization for a lesson, editing an existing simulation, or wiring a simulation's checkpoints into progress. Covers the package layout, sim.config.json manifest, the postMessage SDK (init/theme/props ↔ ready/resize/checkpoint/event), the CRITICAL classic-scripts requirement, the build/registry step, and how to embed.
---

# Building a simulation

A **simulation** is a tiny web app (HTML/CSS/JS, no framework, no build step) that
runs in a sandboxed iframe and talks to the host lesson via a `postMessage` SDK.
Simulations are the product's core experience — make them small, focused, and
genuinely interactive.

## Where it goes

```
simulations/packages/<id>/
  sim.config.json     # manifest: id, title, version, props, checkpoints
  index.html          # loads the SDK + main.js as CLASSIC scripts
  main.js             # your app logic
  style.css           # theme-aware styles (mirror the design tokens)
```

Simulation packages live in **this content repo** (`simulations/packages/`); the
host↔sim **SDK** stays in the app repo (the contract). At build, the app fetches
these packages and `npm run sims` copies each + the SDK into `public/sims/<id>/`,
regenerating the registry. Locally here, validate your package with
`node pipeline/validate.mjs` (it checks every `<Simulation id>` has a package). A
lesson embeds it:

```mdx
<Simulation id="<id>" height={400} props={{ /* optional */ }} />
```

A copyable starter is in [template/](template/). The SDK contract is in
[reference/sdk-protocol.md](reference/sdk-protocol.md).

## ⚠️ The one rule that breaks sims if you get it wrong

The host iframe is `sandbox="allow-scripts"` with **no `allow-same-origin`** — an
opaque/null origin (intentional isolation). **ES module scripts are fetched with
CORS and are blocked from a null origin**, so a sim that uses
`<script type="module">` / `import` renders **blank**.

**Always load the SDK and your code as CLASSIC scripts:**

```html
<script src="./sim-sdk.js"></script>   <!-- exposes a global createSim() -->
<script src="./main.js"></script>      <!-- uses the global, no import -->
```

Never use `import`/`type="module"` in a simulation bundle.

## main.js skeleton

```js
// createSim is a global from sim-sdk.js (classic script). No imports.
const app = document.getElementById("app");
let state = /* ... */;

function render() {
  app.innerHTML = `…your UI…`;
  // wire event listeners here
  requestAnimationFrame(() => sim.resize(document.body.scrollHeight + 8));
}

const sim = createSim({
  onInit({ props, theme }) {        // host → sim, once
    applyTheme(theme);              // "light" | "dark" | "system"
    // read props (defaults from sim.config.json)
    render();
  },
});

// When the learner does the meaningful thing, fire the checkpoint ONCE:
function onGoalReached() {
  sim.checkpoint("<checkpoint-id>"); // must match sim.config.json
  sim.event("did-thing", { /* analytics payload */ });
}

// Fallback so the bundle still renders if opened directly (no host init):
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
    { "id": "<checkpoint-id>", "hint": "What the learner does to reach it." }
  ]
}
```

- `id` must equal the directory name and the `<Simulation id>` you embed.
- `checkpoints` you fire feed topic **mastery coverage** — give each a clear `hint`.
- Bump `version` when you change behavior (bundles are versioned in the registry).

## Theming & accessibility

- Copy the token block from an existing sim's `style.css` (e.g.
  `simulations/packages/hash-collision/style.css`) so the sim matches light/dark.
- Apply the `theme` from `onInit` by setting `document.documentElement.dataset.theme`.
- Honor `reducedMotion` (also passed to `onInit`) — no essential motion-only cues.
- Always-visible focus ring; keyboard-operable controls.

## Build, register, embed, validate

```bash
npm run sims              # build bundles + regenerate the registry (do this first)
# then embed <Simulation id="<id>" /> in a topic
npm run validate-content  # confirms the embed resolves in the registry
npm run build             # full check
```

## Rich, "amazing" simulations (the standard to aim for)

Big, dashboard-style sims (controls + live telemetry + animated canvas + quests +
math) are exactly what this system is for. To bring one in:

- **CDN libraries are fine** — Tailwind Play CDN, MathJax, etc. load via classic
  `<script src="https://…">`, which is *not* CORS-blocked in the sandbox. (Vendor
  them later if you need offline/production-grade CSS.) Still **no ES modules**.
- **Map the sim's own "quests"/milestones to `sim.checkpoint(id)`** so they feed
  topic mastery — declare each id in `sim.config.json`. (See
  `simulations/packages/moe-factory` for a full example: 3 quests → 3 checkpoints.)
- **Auto-resize** tall/dynamic sims: poll `document.body.scrollHeight` and call
  `sim.resize()` when it changes, so the iframe grows with content (tabs, modals).
  ```js
  let lastH = 0;
  setInterval(() => {
    const h = document.body.scrollHeight;
    if (Math.abs(h - lastH) > 4) { lastH = h; sim.resize(h + 8); }
  }, 400);
  ```
- **Theme:** a sim may ship its own palette (e.g. a dark dashboard). Ideally read
  `theme` from `onInit` and adapt; a self-themed sim is acceptable if it reads
  well in both modes.
- Embed with a generous initial `height` (the sim resizes itself after load):
  `<Simulation id="moe-factory" height={1200} />`.

## Verify it actually renders

A simulation runs in an opaque-origin iframe, so the host page can't read into it.
To check interactivity, open the bundle directly at
`http://localhost:3000/sims/<id>/index.html` and drive it there. If it's blank,
the #1 cause is using ES modules instead of classic scripts (see the rule above).
