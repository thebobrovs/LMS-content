# TPU Training Infrastructure — path blueprint (TLDR)

**Path id:** `tpu-training-infra` · **Status:** drafting
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
A battle-hardened TPU **training** path: the silicon (systolic arrays, HBM, bf16),
the two networks (ICI vs DCN), the JAX/XLA compiler, single-slice SPMD and data I/O,
megascale 3D parallelism and profiling, and operating at "hero" scale (chaos,
bare-metal control, custom kernels, serving). **Non-goals:** not a general
GPU/PyTorch course, not ML modeling, not a managed-Vertex click-through.

## How
Every topic = a **concept lesson + a browser simulation OR figures**, and most end
in a **Hard-Knocks Lab** (start broken/sub-optimal → apply the principle → working).
Each lab is annotated as a **sim** we build (browser, no quota) or a **codelab** we
link (real GKE/TPU). Built blueprint-first: this doc → a plan per topic → topic by
topic, signing off each before the next.

## Topic map (your structure, annotated with sim/codelab + status)

### L100 — Foundational TPU Architecture & Provisioning
*Objective: Break "compute is just compute." Build a mental model of the physical hardware, the memory hierarchy, and how accelerators are provisioned in the cloud.*

| ID | Topic | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|-------|------------------|-----------------|--------------|--------|
| 1.1 | **TPU Architecture, Systolic Arrays & Precision** | Silicon: TensorCores, SparseCores, HBM; data streams through the systolic array in bf16; you can't debug memory-bound work without the diagonal-wavefront model | Calculate arithmetic intensity for matrix sizes on v5p vs v6e | sims `tpu-vm-anatomy` + `systolic-array` · lab (**sim**) | on staging* |
| 1.2 | **Topologies & The Two Networks (ICI vs DCN)** | ICI vs DCN; visualize the 2D torus (v6e) vs 3D torus (TPU7x); shape dictates network diameter; know when a collective runs over ICI vs DCN | — | sim `torus-3d` (reuse) | published† |
| 1.3 | **Provisioning & The TPU VM Architecture** | Execute on the host CPU attached to the TPU; provision via GKE with Flex-start capacity | (provision a TPU VM) | figure + lab (**codelab**) | planned |

### L200 — Single-Slice Execution & The "No Black Box" Mandate
*Objective: Run on a single slice (up to one Pod), demystify the compiler, never starve the TPUs for data.*

| ID | Topic | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|-------|------------------|-----------------|--------------|--------|
| 2.1 | **The JAX AI Stack & XLA Compilation** | JAX/Flax/Optax; XLA fuses the graph into TPU machine code; AOT vs JIT; debug an OOM before training starts | — | sim: fusion → HBM trips · lab (**codelab**) | planned |
| 2.2 | **Multi-Host Execution & SPMD** | SPMD across a multi-host slice; identical binaries sync over ICI | Host 0 fails to rendezvous with Host 1 — diagnose the IP/DNS barrier mismatch in XLA logs | lab (**codelab**) | planned |
| 2.3 | **Data Starvation & Asynchronous I/O (Grain & Orbax)** | Idle TPUs waiting on host CPUs; Grain for deterministic loading, Orbax for async checkpointing HBM→GCS | Fix a host-side data bottleneck with Grain prefetch to double throughput | sim: infeed throughput · lab (**codelab**) | planned |

### L300 — Megascale & The "Scale Illusion" Sandbox
*Objective: Cross the Pod boundary safely. Master 3D parallelism and enforce strict profiling using simulated scale.*

| ID | Topic | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|-------|------------------|-----------------|--------------|--------|
| 3.1 | **3D Parallelism & Simulated Device Meshes** | Distribute data/tensors across the mesh without a 10k-chip quota; map DP/TP/PP to physical X/Y/Z | **The Scale Illusion:** shard a 70B model across 2,048 *simulated* devices on one node without exceeding per-chip HBM | **sim: mesh-sharding + HBM (flagship)** | planned |
| 3.2 | **Multislice Training & Pathways** | Orchestrate across slices via Pathways; keep bandwidth-hungry TP on the tightest ICI axis, let PP span DCN | — | sim: ICI-vs-DCN mapping | planned |
| 3.3 | **Performance Profiling (The XProf Mandate)** | Hardware-integrated observability; capture traces; analyze HLO + collective stalls | Read a broken XProf trace — find the DCN stall bubble + sub-optimal broadcast; prove you understand MFU | sim: trace forensics · lab (**codelab**) | planned |

### L400 — Chaos Engineering & Bare-Metal Control
*Objective: Survive hardware failures at scale, bypass the compiler for custom math, take full control of scheduling topology.*

| ID | Topic | What / How / Why | Hard-Knocks Lab | Visual / lab | Status |
|----|-------|------------------|-----------------|--------------|--------|
| 4.1 | **Chaos Engineering & Fault Tolerance** | Training loops that survive hardware death; GKE node health + automated JobSet restarts | A chaos script kills GKE nodes/slices mid-run — setup must auto-reload the latest Orbax checkpoint and resume, no human | lab (**codelab**) | planned |
| 4.2 | **Bare-Metal Control: TPU Cluster Director** | Bypass managed abstractions; All Capacity Mode for full topology visibility; route around faulty hosts/optical links | — | figure + lab (**codelab**) | planned |
| 4.3 | **Custom Kernels with Pallas** | Low-level kernels in Python; manage VMEM vs HBM to bypass XLA fusions; for novel architectures / MoE routing | — | sim: VMEM-vs-HBM kernel · lab (**codelab**) | planned |
| 4.4 | **High-Performance Inference Serving** | Deploy with vLLM-TPU; quantize with Qwix; maximize tokens/sec at best perf-per-cost | — | sim: quant/serving trade-off · lab (**codelab**) | planned |

**Status legend:** planned → plan-approved → in progress → on staging → signed off → published

## Mapping to what's already built
\* **Topic 1.1** is already built and on staging as **two** lessons — `why-tpus`
(the TPU/TensorCore/HBM/SparseCore anatomy + the VM model, with the
`tpu-vm-anatomy` sim) and `tpu-chip-systolic-array` (the systolic array + bf16 +
arithmetic intensity, with the `systolic-array` sim). Your 1.1's arithmetic-intensity
lab lives in the systolic topic.
† **Topic 1.2** reuses the existing published `tpu-v5p-topology` lesson (`torus-3d` sim).

## The one decision this raises
Your **Topic 1.1** is one lesson; we already shipped it as **two** (because silicon +
systolic + precision + SparseCore + HBM is heavy for one sitting, and the split
audited well). Also, parts of `why-tpus` (the VM model) overlap your **Topic 1.3**
(Provisioning & TPU VM). So, for 1.1/1.3, pick one:
- **(A) Keep the split** — present 1.1 as two short lessons under one banner, and let
  1.3 focus on GKE provisioning (the VM concept already introduced). *(Recommended —
  no rework; both already built + audited.)*
- **(B) Merge to match exactly** — combine `why-tpus` + `systolic-array` into a single
  long Topic 1.1, and move the VM material into 1.3.

Everything else follows your plan verbatim.
