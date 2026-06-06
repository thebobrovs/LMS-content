# Simulation SDK protocol

The host (lesson page) and the simulation (sandboxed iframe) talk only through
`postMessage`. The shared SDK (`simulations/sdk/sim-sdk.js`, copied into every
bundle as `sim-sdk.js`) wraps this. The sim never reaches into the host and vice
versa — the only channel is these messages.

## Messages

**Host → sim**
| Message | Payload | Meaning |
|---------|---------|---------|
| `init` | `{ props, theme, reducedMotion }` | Sent once after the sim signals `ready`. `props` come from the `<Simulation props={…}>` embed merged with `sim.config.json` defaults. `theme` is `"light"` \| `"dark"`. |
| `reset` | — | Host asks the sim to reset (the SDK reloads the iframe). |

**Sim → host**
| Message | Payload | Meaning |
|---------|---------|---------|
| `ready` | — | Sent automatically by `createSim()` so the host knows to send `init`. |
| `resize` | `{ height }` | Ask the host to size the iframe (call `sim.resize(px)` after render). |
| `checkpoint` | `{ id }` | The learner reached a milestone. Fire **once** per checkpoint; the id must be declared in `sim.config.json`. Counts toward topic mastery. |
| `event` | `{ name, data }` | Optional analytics/telemetry signal. |

## The `createSim` API (what your `main.js` uses)

```js
const sim = createSim({
  onInit({ props, theme, reducedMotion }) { /* set up + first render */ },
});

sim.isInitialized();        // boolean — has the host sent `init`?
sim.resize(height);         // → host: { type: "resize", height }
sim.checkpoint(id);         // → host: { type: "checkpoint", id }
sim.event(name, data);      // → host: { type: "event", name, data }
```

## Lifecycle

```
iframe loads  →  createSim() sends { ready }
host receives ready  →  sends { init, props, theme, reducedMotion }
SDK calls your onInit(...)  →  you render + sim.resize(...)
learner interacts  →  you call sim.checkpoint(id) / sim.event(...)
```

## Gotchas

- **Classic scripts only.** The iframe has an opaque origin; `import` / `type="module"`
  is CORS-blocked and the sim renders blank. Load `sim-sdk.js` then `main.js` as
  plain `<script src>` tags. The SDK exposes `createSim` as a global for this reason.
- **Idempotent checkpoints.** Latch each checkpoint so it fires once, even if the
  learner repeats the action.
- **Resize after every render** so the iframe doesn't clip or leave a gap.
- **Don't assume init.** Include a `setTimeout` fallback that renders with defaults
  if `init` never arrives (e.g. the bundle opened directly for testing).
