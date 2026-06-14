# Math for ML/AI Workloads — path blueprint (TLDR)

**Path id:** `math-infra` · **Status:** BLUEPRINT — awaiting map sign-off (then a plan per topic, then build)
**Audience:** the infra/SRE learner (`personas/audience-infra-engineer.md` — "Sam") — strong on distributed
systems, Linux, networking, GKE; new to AI math, no calculus/linear-algebra background. *Related to*
`tpu-training-infra` but it stands on its own: the math intuition behind **any** ML/AI workload, not just TPUs.
**Outcome (definition of done):** read *why the math behaves the way it does* — number precision, tensor
shapes, **how learning actually works (gradient descent)**, the distributed cost of gradients, and network
topology — well enough to **provision, size, and operate** ML/AI systems, with **zero derivations** (no
calculus, no backprop proofs, no graph-theory proofs).

## Why
Today the math intuition is taught *late and scattered* — buried inside the hardware topics, so the learner
meets the silicon before the "why," and never sees the general ML-math picture (what training *is*). The
audience-reviewer (Sam) keeps surfacing the same gap: "you don't need the math, but here's the systems
translation" glosses bolted onto GELU, arithmetic intensity, the 128 tile, gradients, the torus. This track
**front-loads** those intuitions as first-class topics — generalized to ML/AI, not TPU-specific — so the why
lands first and every hardware path just reinforces it.

## What
A self-contained **Math for ML/AI Workloads** track, **capped at L200** — systems translation, never the
derivation. Three arcs:
- **Math for the Metal** (L100) — how numbers and dimensions dictate memory and throughput.
- **Math of Learning** (L200) — what training actually is: gradient descent, and why it drives the infra.
- **Math for the Network** (L200) — how training math becomes distributed networking problems.

**Non-goals:** computing derivatives, loss-function calculus, graph-theory proofs, full ML modeling. We
build the mental model and the systems consequence, not the derivation.

## How
Every topic = a **concept lesson + one or more NEW browser simulations**, each giving a *different view* of
the idea (e.g., the bits of a float **and** the roofline; a loss surface **and** a convergence curve) — multiple
angles per topic, because that's where deeper understanding comes from. SRE bridge on every beat; a light
**Hard-Knocks** reasoning exercise; **Sam-gated** (`Clear`) before ship. New sims follow our standard (real
`createSim`, Hyperstack tokens + light/dark, `prefers-reduced-motion`, one observe-checkpoint, deterministic).
Built blueprint-first: this doc → a plan per topic → build topic by topic, signing off each.

## Topic map

**Status legend:** planned → plan-approved → in progress → on staging → signed off → published

### L100 — Math for the Metal (Arithmetic & Shapes)
*How numbers and dimensions dictate memory boundaries and throughput.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | New sim(s) — *different views* | Status |
|----|--------------|------------------|-----------------|-------------------------------|--------|
| M1.1 | `precision-and-memory` | Bytes are the lever: bf16/fp4 beat fp32 because halving the bytes doubles **arithmetic intensity** and keeps the MXU fed; the range-vs-precision trade (bf16 keeps fp32's exponent, drops mantissa; fp16 overflows). | Find the magnitude where **fp16 → inf but bf16 holds**; explain it from the exponent bits. | **NEW `number-format-explorer`** — drag a value, watch the sign/exponent/mantissa bits and where it rounds or overflows across fp32/bf16/fp16/fp4. *2nd view:* reuse `arithmetic-intensity-calculator` (bytes → intensity → roofline). | planned |
| M1.2 | `tensor-shapes` | TPUs/accelerators are rigid: a dimension not a multiple of the **128 MXU tile** is zero-padded → wasted compute + memory → surprise **OOMs**. Tensor = shaped array; matmul shapes; padding math. | A job that "should fit" **OOMs**: spot the `128k+1` dim, realign, recover the memory. | **NEW `matmul-tiler`** — drag M/K/N dims, see the 128×128 tiling grid, the padded zeros, and the wasted FLOP/memory %. | planned |

### L200 — Math of Learning (Gradient Descent)
*What training actually is — and why it shapes every operational decision.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | New sim(s) — *different views* | Status |
|----|--------------|------------------|-----------------|-------------------------------|--------|
| M2.1 | `gradient-descent` | What "training" means without the calculus: a **loss surface**, the gradient points downhill, you take **many small steps**; the **learning rate** sets step size (too big → diverge/oscillate, too small → crawl); momentum. *Why infra cares:* training is thousands of iterative steps, not one shot — which is why jobs run for weeks, need checkpoints, and carry optimizer state. | Given a diverging run, decide: is the **learning rate** too high or the data bad? Tune it to converge. | **NEW `gradient-descent-explorer`** — a 2D loss landscape with a stepping marker + LR/momentum sliders. *2nd view:* a live **loss-vs-step convergence curve** (same sim) showing diverge/oscillate/converge. | planned |

### L200 — Math for the Network (Distributed Gradients & Graphs)
*How training math becomes distributed networking and memory problems.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | New sim(s) — *different views* | Status |
|----|--------------|------------------|-----------------|-------------------------------|--------|
| M2.2 | `gradients-and-bandwidth` | The infra consequence of M2.1: each step's gradient is a **payload synced across devices** (**all-reduce**) — the network cost; and the **optimizer state** (Adam ≈ 2× the params) is the memory that OOMs. | Size **weights + grads + optimizer + activations** for a model; does it fit per-chip HBM? If not, what do you cut/shard? | **NEW `training-memory-budget`** — stacked bars (weights · grads · Adam state · activations) vs HBM; toggle precision/sharding to fit; watch it OOM. *2nd view:* reuse `spmd-shard-explorer` (the all-reduce on the wire). | planned |
| M2.3 | `topology-graphs` | The torus is a **graph**: 3D coordinates, **modulo** wrap-around edges, "twisting." Mapped to network engineering: shortest-path trees, **hop count**, **diameter**, **bisection bandwidth**; twisting shrinks diameter and raises bisection. | Two slice shapes, same chip count: pick the lower-diameter / higher-bisection one, in graph terms. | **NEW `network-graph-explorer`** — an abstract node/edge graph with live diameter / bisection / hop-count metrics and a twist toggle. *2nd view:* reuse `torus-3d` (the physical 3D wiring). | planned |

## Decisions
**Resolved (recommended; confirm at sign-off):**
1. **Build NEW sims** (reverses the earlier reuse-only call) — each topic gets a fresh sim giving a
   *different view*, often paired with a complementary view (a second new mode, or a reused hardware sim),
   because multiple angles drive deeper learning. *Note: this is a larger build — ~5 new sims.* ✅
2. **Generalized scope** — math for ML/AI workloads broadly (incl. **gradient descent**), not TPU-only;
   related to `tpu-training-infra` but standalone. ✅
3. **Capped at L200**, systems translation only, no derivations. ✅
4. **Light Hard-Knocks** reasoning exercises (predict the OOM / tune the LR / pick the better shape). ✅

**Open (need your call):**
5. **Structure** — standalone `math-infra` path *(recommended)* vs. prepend into `tpu-training-infra`.
6. **Sequencing** — hard prerequisite vs. *recommended-alongside* companion *(recommended)*.

## Reuse & dedup (now lower-risk)
Because the new sims take a *different angle* (the bits of a float, a loss surface, a memory budget, an
abstract graph) than the existing TPU-hardware sims (`bf16-vs-fp32`, `systolic-array`, `torus-3d`,
`spmd-shard-explorer`), they **complement** rather than duplicate — and several hardware sims appear as the
optional "2nd view." The `math-infra` topics still become the canonical *math-intuition* home; the hardware
topics keep their inline Sam-bridges and `relatedTo` the math topic instead of re-deriving. Per-topic
blueprints will name the exact overlap to thin.

## Glossary
New `glossary/math-infra.json` (per-path rule). Shared terms (arithmetic intensity, bf16, mxu, hbm, padding)
duplicated from `tpu-training-infra.json`; new terms (gradient descent, learning rate, loss, optimizer state,
diameter, bisection bandwidth, dynamic range, mantissa) defined here.

## Definition of done (per topic)
Sam (infra/SRE, no ML math) reads it once and can explain the *why* in systems terms — no derivations, every
claim a systems translation, the new sim(s) wired to our standard and theme/reduced-motion clean, every
number traceable. **Sam verdict `Clear` before promote.**
