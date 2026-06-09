# TPU Training Infrastructure — path blueprint (TLDR)

**Path id:** `tpu-training-infra` · **Status:** MAP APPROVED — building topic-by-topic
**Audience:** Cloud-infrastructure engineers, SREs, and platform admins who know
distributed systems, Linux, and GKE, but are new to AI accelerators, compiler
stacks, and large-scale training dynamics.
**Outcome (definition of done):** Design, orchestrate, scale, optimize, and operate
Cloud TPU training clusters — from a single chip to tens of thousands — and predict
the effect of a slice shape, a sharding plan, a compiler decision, or a failed chip
on a real run.

## Why
Break the "compute is just compute" mindset. Push experienced infra engineers past
deploying containers and force them to understand how JAX software transformations
physically map to systolic arrays and bfloat16 precision boundaries — and how the
hardware, the compiler, and distributed failures actually behave. No black boxes.

## What
A battle-hardened TPU **training** path: the box (TPU VM) and the silicon (systolic
arrays, HBM, bf16), the two networks (ICI vs DCN), the JAX/XLA compiler, single-slice
SPMD and data I/O, megascale collectives + 3D parallelism + profiling, and operating
at "hero" scale (chaos, bare-metal control, custom kernels, serving). **Non-goals:**
not a general GPU/PyTorch course, not ML modeling, not a managed-Vertex click-through.

## How
Every topic = a **concept lesson + a browser simulation OR figures**, and most end
in a **Hard-Knocks Lab** (start broken/sub-optimal → apply the principle → working):
build the mental model in a sim, then build muscle memory in a lab. Each lab is a
**sim** we build (browser, no quota) or a **codelab** we link (real GKE/TPU). Built
blueprint-first: this doc → a plan per topic → topic by topic, signing off each.

## Topic map

**Status legend:** planned → plan-approved → in progress → on staging → signed off → published

### L100 — Foundational TPU Architecture & Provisioning
*Break "compute is just compute." Mental model of the hardware, the memory hierarchy, and how accelerators are provisioned in the cloud.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|--------------|------------------|-----------------|--------------|--------|
| 1.1 | `why-tpus` | "The box": you SSH into a host CPU sitting in front of the accelerator; the TPU VM model, chip anatomy (TensorCore/MXU/SparseCore/HBM), the scale ladder, and the **8th-gen split (8t training / 8i inference)** | — | sim `tpu-vm-anatomy` (**8t↔8i toggle**) | signed off |
| 1.2 | **`tpu-evolution-bottlenecks`** | **"Chasing the bottleneck": V1→8th gen, each generation a fix for what broke the last at scale (compute → memory → thermal → network → workload). Liquid cooling (v3), OCS (v4), the 8t/8i split** | — | interactive timeline + `<Steps>` | planned |
| 1.3 | `tpu-chip-systolic-array` | "The silicon": data streams through the systolic array in bf16 on a diagonal wavefront, reusing inputs; arithmetic intensity, the Padding Trap, FP4 | Arithmetic-intensity + padding calculator | sims `systolic-array` + `arithmetic-intensity-calculator` (**sim**) | on staging |
| 1.4 | **`tpu-topologies`** *(rename from `tpu-v5p-topology`)* | ICI vs DCN; 2D torus (v5e/v6e) vs 3D torus (v4/v5p/8t) vs **Boardfly (8i)** + OCS; shape dictates network diameter; the `e/p → t/i` naming | — | **sim `tpu-topology-explorer`** (2D/3D/Boardfly toggle) | published → generalizing |
| 1.5 | `tpu-provisioning-vm` | Execute on the host attached to the TPU; provision via GKE + Kueue + DWS Flex-start; MTU/capacity config; single- vs multi-host | provision a TPU VM + run on the host (**codelab**) | figure + sim `capacity-shape-selector` + lab (**codelab**) | planned |

### L200 — Single-Slice Execution & The "No Black Box" Mandate
*Run on a single slice (up to one Pod), demystify the compiler, never starve the TPUs for data.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|--------------|------------------|-----------------|--------------|--------|
| 2.1 | `jax-xla-stack` | JAX/Flax/Optax; XLA fuses the graph into TPU machine code; AOT vs JIT; debug an OOM *before* training starts | — | sim: fusion → HBM trips · lab (**codelab**) | planned |
| 2.2 | `spmd-multi-host` | SPMD across a multi-host slice; identical binaries sync over ICI | Host 0 fails to rendezvous with Host 1 — diagnose the IP/DNS barrier mismatch in XLA logs | lab (**codelab**) | planned |
| 2.3 | `data-pipeline-io` | Idle TPUs waiting on host CPUs; Grain for deterministic loading, Orbax for async checkpointing HBM→GCS | Fix a host-side data bottleneck with Grain prefetch to double throughput | sim: infeed throughput · lab (**codelab**) | planned |

### L300 — Megascale & The "Scale Illusion" Sandbox
*Cross the Pod boundary safely. Master 3D parallelism and enforce strict profiling using simulated scale.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|--------------|------------------|-----------------|--------------|--------|
| 3.1 | `collectives` | How data actually moves: AllReduce/AllGather behave very differently on a 3D torus over ICI vs across DCN. The bridge from single-slice to mesh sharding | — | sim: collective on the torus | planned |
| 3.2 | `parallelism-and-sharding` | Map Data/Tensor/Pipeline parallelism to physical X/Y/Z; shard without a 10k-chip quota | **The Scale Illusion:** shard a 70B model across 2,048 *simulated* devices on one node without exceeding per-chip HBM | **sim: mesh-sharding + HBM — FLAGSHIP** | planned |
| 3.3 | `multislice-pathways` | Orchestrate across slices via Pathways; keep bandwidth-hungry TP on the tightest ICI axis, let PP span DCN | — | sim: ICI-vs-DCN mapping | planned |
| 3.4 | `performance-mfu` | Hardware observability; capture XProf traces; analyze HLO + collective stalls; MFU | Find a DCN stall bubble + sub-optimal broadcast in a degraded trace | **figure (annotated SVG) + lab (codelab)** — *not a sim* | planned |

### L400 — Chaos Engineering & Bare-Metal Control
*Survive hardware failures at scale, bypass the compiler for custom math, take full control of scheduling topology.*

| ID | Topic (`id`) | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|--------------|------------------|-----------------|--------------|--------|
| 4.1 | `fault-tolerance` | Training loops that survive hardware death; GKE node health + automated JobSet restarts | Chaos script kills nodes/slices mid-run — must auto-reload the latest Orbax checkpoint and resume, no human | lab (**codelab**) | planned |
| 4.2 | `bare-metal-control` | Bypass managed abstractions; All Capacity Mode for full topology visibility; route around faulty hosts/optical links. **Context: TPU 8i Boardfly (OCS, ~7 hops across 1,024 chips, −56% diameter) vs the v5p/8t 3D torus (16 hops)** | — | figure + lab (**codelab**) | planned |
| 4.3 | `pallas-kernels` | Low-level kernels in Python; manage the memory hierarchy to bypass XLA fusions; for novel architectures / MoE routing | — | **sim: Host RAM → HBM → VMEM → MXU tiers + the latency tax** · lab (**codelab**) | planned |
| 4.4 | `inference-serving` | The capstone: deploy with vLLM-TPU, quantize with Qwix; optimize for TTFT/latency, not just MFU | — | sim: quant/serving trade-off · lab (**codelab**) | planned |

## Decisions (resolved)
1. **Keep the 1.1/1.2 split** — "the box" (VM) vs "the silicon" (systolic) are different cognitive loads; combining makes learners gloss the math. ✅
2. **`collectives` as its own 3.1** — you can't teach 3D parallelism / multislice without it; it bridges single-slice → mesh. ✅
3. **Inference at 4.4** — training-titled path; serving has different operational intensity (TTFT/latency); a capstone. ✅
4. **`tpu-provisioning-vm`** — signals the hands-on GKE/Kueue/DWS-Flex operational goal. ✅
5. **Sim feasibility:** 3.4 = **figures + codelab** (a full XProf sim would be cruft); 4.3 Pallas = **a sim** (memory-tier mental models are weak — high value). ✅

## Already built (on staging)
`why-tpus` (1.1, signed off) + `tpu-chip-systolic-array` (now **1.3**) authored,
audited, on staging; `tpu-v5p-topology` (now **1.4**) reuses the existing published
lesson. New `tpu-evolution-bottlenecks` (**1.2**) is planned. **Flagship to nail:
the `mesh-sharding` sim in 3.2.**
