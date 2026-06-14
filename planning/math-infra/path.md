# Math for Infra AI — path blueprint (TLDR)

**Path id:** `math-infra` · **Status:** BLUEPRINT — awaiting sign-off (then plan per topic, then build)
**Audience:** the same infra/SRE learner as `tpu-training-infra` (`personas/audience-infra-engineer.md` —
"Sam") — specifically those starting the TPU path who keep hitting *"why bf16? why multiples of 128?
why does a gradient hammer the network?"* and lack the AI-math intuition to answer it.
**Outcome (definition of done):** an infra engineer can read *why the math behaves the way it does* —
precision/memory boundaries, tensor shapes/padding, gradient bandwidth, topology graphs — well enough
to **provision and operate** the systems, **without any derivations** (no backprop, no calculus, no
graph-theory proofs).

## Why
Today the math intuition is taught *late and scattered* — embedded inside the hardware topics, so the
learner meets the silicon before the "why." The audience-reviewer (Sam) keeps surfacing the same gap:
"you don't need the math, but here's the systems translation" glosses bolted onto GELU, arithmetic
intensity, the 128-tile padding trap, gradients, the torus. This track **front-loads** those
intuitions as first-class topics so the why lands first and the hardware topics just reinforce it.

## What
Two themes, **capped at L200** (no L300/L400 depth):
- **Math for the Metal** (L100) — how numbers and dimensions dictate memory boundaries and throughput.
- **Math for the Network** (L200) — how training math becomes distributed networking problems.

**Non-goals:** derivatives/backprop, loss-function math, graph-theory proofs, anything requiring a
calculus or linear-algebra background. We give the *systems translation*, not the derivation.

## How
Every topic = a **concept lesson + a REUSED browser simulation** (we already built the sims; this track
gives them their math home) + the SRE bridge on every beat. **No new sims required.** Each topic is
Sam-gated (verdict must be `Clear`) before it ships. Built blueprint-first: this doc → a plan per topic
(why / what / how / when / must-learn / accuracy gates / sim) → build topic by topic, signing off each.

## When (sequencing) — OPEN DECISION
A **foundation** track: recommended **before or alongside** `tpu-training-infra` L100/L200. Two options
to confirm at sign-off:
- **(a)** Standalone path `math-infra` (its own track; tpu-training-infra topics `relatedTo` it). *Recommended.*
- **(b)** Prepend these as a "Level 0 / math foundation" inside the `tpu-training-infra` path.

## Topic map

**Status legend:** planned → plan-approved → in progress → on staging → signed off → published

### L100 — Math for the Metal (Arithmetic & Shapes)
*How numbers and dimensions dictate memory boundaries and throughput.*

| ID | Topic (`id`) | Why / What / How | Reused sim | Status |
|----|--------------|------------------|------------|--------|
| M1.1 | `math-infra/precision-and-memory` | **Why** weird formats (bf16/fp4) beat fp32: halving the bytes on the bus doubles **arithmetic intensity** and keeps the MXU fed. **What:** the dynamic-range-vs-precision trade (bf16 keeps fp32's exponent, drops mantissa; fp16 doesn't → overflow), bytes→intensity→roofline. **How:** systems translation — precision = a wire-format/compression trade; range = overflow/underflow; bandwidth-bound = a saturated bus. | `bf16-vs-fp32` + `arithmetic-intensity-calculator` | planned |
| M1.2 | `math-infra/tensor-shapes` | **Why** dimensions matter to an operator: TPUs are rigid (XLA static shapes); a dim not a multiple of the 128×128 MXU tile is silently **zero-padded** → wasted compute + surprise **OOMs**. **What:** tensor = shaped array; the MXU tile; padding math. **How:** padding ≈ disk-block/page rounding; a 129-wide matmul pads to 256 ≈ 4× waste; the operator's first question on a "mysterious OOM" = "are your dims multiples of 128?" | `arithmetic-intensity-calculator` (padding trap) | planned |

### L200 — Math for the Network (Gradients & Graphs)
*How training math becomes distributed networking problems.*

| ID | Topic (`id`) | Why / What / How | Reused sim | Status |
|----|--------------|------------------|------------|--------|
| M2.1 | `math-infra/gradients-and-bandwidth` | **Why** a gradient is an SRE problem: it's a **massive data payload** that must be synced across devices (**all-reduce**) every backward pass — the network cost of training. **What:** gradient = payload (not "how to differentiate"); **optimizer state bloat** (Adam ≈ 2× params in fp32 for momentum+variance) → the memory footprint that OOMs. **How:** all-reduce ≈ a network shuffle, bytes-on-the-wire = cost; optimizer state ≈ per-parameter bookkeeping you must budget HBM for. | `spmd-shard-explorer` (all-reduce bytes) | planned |
| M2.2 | `math-infra/topology-graphs` | **Why** evaluate the supercomputer's wiring: the torus is a **graph**. **What:** 3D coordinates, **modulo arithmetic** for wrap-around edges, "twisting" a torus. **How:** map to advanced network engineering — shortest-path trees, **hop counts**, **network diameter**, **bisection bandwidth**; twisting = a graph trick to shrink diameter and raise bisection bandwidth (no proofs). | `torus-3d` + `tpu-topology-explorer` | planned |

## Dedup with existing topics (the key risk)
Most of this content already lives in the hardware topics + 5 sims (verified): `tpu-chip-systolic-array`
(intensity, padding), `bf16-vs-fp32`/`arithmetic-intensity-calculator` sims, `spmd-multi-host`
(all-reduce), `tpu-topologies`/`tpu-ocs` (torus, twist, bisection). **Resolution:** the `math-infra`
topics become the **canonical home** for the *math intuition*; the hardware topics keep their inline
Sam-bridges but `relatedTo` the math topic and stop *re-deriving* the why. Per-topic blueprints will
each list the exact overlap and what the hardware topic should defer/cross-link, so we never teach
arithmetic intensity or the torus twice in full.

## Decisions to confirm at sign-off
1. **Standalone path (a) vs prepend to tpu-training-infra (b).** Recommend (a).
2. **Prerequisite vs parallel** — is `math-infra` a hard prereq for tpu-training-infra L100, or a
   recommended-alongside companion? Recommend recommended-alongside (don't gate the TPU path on it).
3. **Reuse-sims-only (no new sims).** Recommend yes — all four intuitions have an existing sim.
4. **Glossary:** new `glossary/math-infra.json` (per-path rule); shared terms (arithmetic intensity,
   bf16, mxu, hbm, padding) duplicated from `tpu-training-infra.json` — acceptable per convention.

## Definition of done (per topic)
Sam (infra/SRE) reads it once and can explain the *why* in systems terms — no derivations, every claim a
systems translation, the reused sim wired and theme/reduced-motion clean, every number traceable. Sam
verdict `Clear` before promote.
