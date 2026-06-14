# Math for Infra AI — path blueprint (TLDR)

**Path id:** `math-infra` · **Status:** BLUEPRINT — awaiting map sign-off (then a plan per topic, then build)
**Audience:** the same infra/SRE learner as `tpu-training-infra` (`personas/audience-infra-engineer.md` —
"Sam") — experienced with distributed systems, Linux, networking, and GKE, but new to AI math. The
learner who keeps hitting *"why bf16? why multiples of 128? why does a gradient hammer the network?"*
and has no calculus/linear-algebra background to answer it.
**Outcome (definition of done):** read *why the math behaves the way it does* — precision/memory
boundaries, tensor shapes, gradient bandwidth, topology graphs — well enough to **provision and operate**
the systems, with **zero derivations** (no backprop, no calculus, no graph-theory proofs).

## Why
Today the math intuition is taught *late and scattered* — buried inside the hardware topics, so the
learner meets the silicon before the "why." The audience-reviewer (Sam) keeps surfacing the same gap:
"you don't need the math, but here's the systems translation" glosses bolted onto GELU, arithmetic
intensity, the 128-tile padding trap, gradients, the torus. This track **front-loads** those intuitions
as first-class topics so the why lands first and the hardware path just reinforces it.

## What
Two themes, **capped at L200** (no L300/L400 depth) — give the systems translation, never the derivation:
- **Math for the Metal** (L100) — how numbers and dimensions dictate memory boundaries and throughput.
- **Math for the Network** (L200) — how training math becomes distributed networking problems.

**Non-goals:** derivatives/backprop, loss-function math, graph-theory proofs, anything needing calculus
or linear algebra. Not an ML-modeling course; not a re-teach of the hardware (that's `tpu-training-infra`).

## How
Every topic = a **concept lesson + a REUSED browser simulation** (we already built the sims; this track
gives them their math home), with the **SRE bridge on every beat** and a light **Hard-Knocks** reasoning
exercise (start from a wrong/sub-optimal number → apply the principle → correct it). **No new sims.**
Each topic is **Sam-gated** (verdict `Clear`) before it ships. Built blueprint-first: this doc → a plan
per topic → build topic by topic, signing off each.

## Topic map

**Status legend:** planned → plan-approved → in progress → on staging → signed off → published

### L100 — Math for the Metal (Arithmetic & Shapes)
*How numbers and dimensions dictate memory boundaries and throughput.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|--------------|------------------|-----------------|--------------|--------|
| M1.1 | `precision-and-memory` | "Bytes are the lever": why AI uses bf16/fp4 instead of fp32 — halving the bytes on the bus doubles **arithmetic intensity** and keeps the MXU fed. The dynamic-range-vs-precision trade (bf16 keeps fp32's exponent, drops mantissa; fp16 keeps precision but **overflows**). Systems framing: precision = a wire-format/compression trade; range = overflow/underflow; bandwidth-bound = a saturated bus. | Find the magnitude where **fp16 → inf but bf16 holds**; explain why, in one sentence, from the exponent bits. | sims `bf16-vs-fp32` + `arithmetic-intensity-calculator` (**reuse**) | planned |
| M1.2 | `tensor-shapes` | "Why dimensions matter to an operator": TPUs are rigid (XLA static shapes); a dimension not a multiple of the **128×128 MXU tile** is silently **zero-padded** → wasted compute + memory → surprise **OOMs**. Tensor = shaped array; the tile; padding math. Framing: padding ≈ disk-block/page rounding; a 129-wide matmul pads to 256 ≈ 4× waste. | A job that "should fit" **OOMs**: spot the dim that's `128k+1`, realign to a multiple of 128, recover the memory. | sim `arithmetic-intensity-calculator` (padding trap) (**reuse**) | planned |

### L200 — Math for the Network (Gradients & Graphs)
*How training math becomes distributed networking problems.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|--------------|------------------|-----------------|--------------|--------|
| M2.1 | `gradients-and-bandwidth` | "A gradient is an SRE problem": it's a **massive data payload** synced across devices (**all-reduce**) every backward pass — the network cost of training. **Optimizer-state bloat** (Adam ≈ 2× the params in fp32 for momentum + variance) is the memory footprint that OOMs. We never compute a derivative. Framing: all-reduce ≈ a network shuffle (bytes-on-the-wire = cost); optimizer state ≈ per-parameter bookkeeping you must budget HBM for. | Size the **optimizer + gradient memory** for a given model; decide whether it fits per-chip HBM, and if not, what to shard. | sim `spmd-shard-explorer` (all-reduce bytes) (**reuse**) | planned |
| M2.2 | `topology-graphs` | "How to evaluate the wiring": the torus is a **graph**. 3D coordinates, **modulo arithmetic** for wrap-around edges, "twisting." Mapped to advanced network engineering: shortest-path trees, **hop count**, **network diameter**, **bisection bandwidth**. Twisting a torus = a graph trick to shrink diameter and raise bisection bandwidth — no proofs. | Two slice shapes, same chip count: pick the one with the **lower diameter / higher bisection**, and say why in graph terms. | sims `torus-3d` + `tpu-topology-explorer` (**reuse**) | planned |

## Decisions
**Resolved (recommended; confirm at sign-off):**
1. **Reuse-sims-only** — all four intuitions already have a built sim; this track is their math home, no new sims. ✅
2. **Capped at L200** — give the systems translation, not the derivation; L300/L400 math is out of scope. ✅
3. **Light Hard-Knocks** — reasoning exercises ("predict the OOM / pick the better shape"), not codelabs (these are math, not ops). ✅

**Open (need your call):**
4. **Structure** — standalone `math-infra` path *(recommended)* vs. prepend as a "Level 0" math foundation inside `tpu-training-infra`.
5. **Sequencing** — hard prerequisite for the TPU path vs. *recommended-alongside* companion *(recommended)*.

## Reuse & dedup (the key risk)
Most of this content already lives in the hardware topics + 5 sims (verified): `tpu-chip-systolic-array`
(intensity, padding), the `bf16-vs-fp32` / `arithmetic-intensity-calculator` sims, `spmd-multi-host`
(all-reduce), `tpu-topologies` / `tpu-ocs` (torus, twist, bisection). **Resolution:** the `math-infra`
topics become the **canonical home** for the *math intuition*; the hardware topics keep their inline
Sam-bridges but `relatedTo` the math topic and stop *re-deriving* the why. Each per-topic blueprint will
name the exact overlap to thin, so we never teach arithmetic intensity or the torus twice in full.

## Glossary
New `glossary/math-infra.json` (per-path rule). Shared terms (arithmetic intensity, bf16, mxu, hbm,
padding) are duplicated from `tpu-training-infra.json` — acceptable per the existing convention.

## Definition of done (per topic)
Sam (infra/SRE, no ML math) reads it once and can explain the *why* in systems terms — no derivations,
every claim a systems translation, the reused sim wired and theme/reduced-motion clean, every number
traceable. **Sam verdict `Clear` before promote.**
