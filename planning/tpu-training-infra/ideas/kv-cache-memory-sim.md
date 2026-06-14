# Idea capture — KV-cache memory lifecycle sim

**Status:** parked for a future **inference / serving** topic (not L100). Glossary terms
`kv cache` + `auto-regressive decoding` already shipped; this captures the sim + the deeper
treatment so it's ready when that topic is built.

## The concept (why it's worth building)
Turn the jargon "auto-regressive decoding" into an **operator-visceral OOM story**: a memory
bar where the **KV cache grows token-by-token until it hits a ceiling and OOMs**. This is the
strongest justification for the 8t/8i workload split — and exactly the infra framing the
audience-reviewer ("Sam") asks for. Origin: a learner-pasted "LLM Memory Allocation
Comparison" draft (training vs inference bars + an "Add Token" button).

## Refined design (accurate + our standard)
- **Two bars.** *Training*: Weights / Activations / **Optimizer state** (note: optimizer is the
  big block — ~2× the weights for Adam's momentum+variance in fp32). *Inference*: Weights +
  a **growing KV cache**.
- **Dynamic, not a fixed "30%".** "Add Token" (or a sequence-length slider) grows the KV-cache
  block in real time. The lesson is *inference is light until the cache balloons* — a static
  percentage undercuts that.
- **Ceiling = HBM capacity** (the real provisioning ceiling), with an **OOM banner** when the
  KV cache pushes past it at long context / large batch.
- **Takeaway names BOTH costs:** *capacity* (KV cache can OOM your slice at long context — you
  provision for it) and *bandwidth* (every token re-reads the whole cache → decoding is
  memory-bandwidth-bound → why inference-tuned silicon exists).
- **Deterministic numbers:** KV bytes = 2 (K+V) × layers × heads × head_dim × seq × batch ×
  dtype_bytes. No `Math.random` in visuals.
- **Our sim standard:** real `createSim` SDK (classic `<script src="./sim-sdk.js">`), Hyperstack
  tokens + light/dark via `data-theme`, `prefers-reduced-motion` honored, `addEventListener`
  (no inline onclick), one `sim.checkpoint("observe-kv-oom")`, `sim.resize` in rAF. (The pasted
  draft is dark-only Material styling with a mocked SDK — rework like the fusion sim.)

## Open SME / accuracy item to resolve before building
Our current 8i copy says the **384 MB SRAM "holds the KV cache."** A realistic serving KV cache
is **gigabytes** and is **HBM-resident**; 384 MB of on-chip SRAM cannot hold it. The accurate
framing: the cache lives in HBM and grows with sequence × batch (→ OOM); the 8i's larger SRAM +
CAE cut the **bandwidth/latency** cost of re-reading it each decode step. Reconcile this (and the
related "LLM decoder engine on the *training* 8t chip" question) in an SME pass — the sim's OOM
ceiling should be HBM, so the lesson and sim must agree. The shipped `kv cache` glossary entry
deliberately states growth + re-read cost **without** asserting a location, to avoid
contradicting the current 8i line until the SME pass settles it.

## Placement
A dedicated inference/serving topic (likely L300), where train-vs-serve memory IS the subject.
Forward-reference it from `why-tpus` / `tpu-evolution-bottlenecks` (which introduce 8t/8i) once
that topic exists.
