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
Break the "compute is just compute" mindset. Experienced infra engineers can deploy
containers but stall the moment the work is a TPU training job: they can't see why
a model OOMs before step 1, why the chips sit idle, or why a collective is crawling.
This path forces them to confront the physical realities of the hardware, the XLA
compiler, and distributed failure — no black boxes.

## What
A battle-hardened TPU **training** path. It covers the silicon (systolic arrays,
HBM, bf16), the two networks (ICI vs DCN), the JAX/XLA compiler, single-slice SPMD
execution and data I/O, megascale 3D parallelism and profiling, and operating at
"hero" scale (chaos/fault-tolerance, bare-metal control, custom kernels, serving).
**Non-goals:** it is not a general GPU/PyTorch course, not an ML-modeling course,
and not a managed-Vertex click-through — it's about the infrastructure underneath.

## How
Every topic = a **concept lesson + a browser simulation OR figures**, and most end
in a **Hard-Knocks Lab** (start broken/sub-optimal → apply the principle → working).
Each lab is either a **sim** we build (browser, no quota) or a **codelab** we link
(real GKE/TPU). Concept and "why" live here; real-hardware execution lives in the
linked codelab. Built blueprint-first (this doc → per-topic plans → topic-by-topic).

## Topic map

> Each topic needs an approved plan (`topics/<id>.md`) before it's built.
> **Bold** = change from the source plan (kept the why/systolic split, added
> `collectives`, tagged every lab sim-vs-codelab).

| ID | Level | Topic (`id`) | One-line objective | Visual / lab | Status |
|----|-------|--------------|--------------------|--------------|--------|
| 1.1 | 100 | `why-tpus` | Explain what a TPU is and how you reach it (the VM) | sim `tpu-vm-anatomy` | on staging |
| 1.2 | 100 | `tpu-chip-systolic-array` | Explain how a TPU computes a matmul; reason about arithmetic intensity | sim `systolic-array` · lab: intensity (**sim**) | on staging |
| 1.3 | 100 | `tpu-v5p-topology` | Distinguish ICI vs DCN; pick a slice shape | sim `torus-3d` | published |
| 1.4 | 100 | `tpu-provisioning-vm` | Provision a TPU VM on GKE (Flex-start) and run on the host | lab: provision (**codelab**) | planned |
| 2.1 | 200 | `jax-xla-stack` | Use JAX transforms; read XLA fusion/HLO; debug an OOM before training | sim: fusion → HBM trips · lab (**codelab**) | planned |
| 2.2 | 200 | `spmd-multi-host` | Run SPMD across hosts; diagnose a rendezvous failure | lab: rendezvous (**codelab**) | planned |
| 2.3 | 200 | `data-pipeline-io` | Keep TPUs fed (Grain) and checkpoint async (Orbax) | sim: infeed throughput · lab (**codelab**) | planned |
| 3.1 | 300 | **`collectives`** | Explain all-reduce/all-gather and their cost on a torus | sim: collective on the torus | planned |
| 3.2 | 300 | `parallelism-and-sharding` | Shard a 70B model across a **simulated** mesh within HBM limits | **sim: mesh-sharding + HBM (flagship)** | planned |
| 3.3 | 300 | `multislice-pathways` | Cross the Pod boundary; map TP/PP to ICI/DCN via Pathways | sim: ICI-vs-DCN mapping | planned |
| 3.4 | 300 | `performance-mfu` | Read an XProf trace; find the stall; compute MFU | sim: trace forensics · lab (**codelab**) | planned |
| 4.1 | 400 | `fault-tolerance` | Survive node/slice death; auto-resume from Orbax | lab: chaos (**codelab**) | planned |
| 4.2 | 400 | `bare-metal-control` | Route around faulty hosts (Cluster Director / All Capacity Mode) | lab (**codelab**) | planned |
| 4.3 | 400 | `pallas-kernels` | Write a Pallas kernel; manage VMEM vs HBM | sim: memory-hierarchy kernel · lab (**codelab**) | planned |
| 4.4 | 400 | `inference-serving` | Serve efficiently (vLLM-TPU) and quantize (Qwix) | sim: quant/serving trade-off · lab (**codelab**) | planned |

**Status legend:** planned → plan-approved → in progress → on staging → signed off → published

## Open questions / decisions to make
- **Keep 1.1/1.2 split?** I split the source's overloaded "Topic 1.1" into
  `why-tpus` + `tpu-chip-systolic-array` (already built and digest well). Confirm.
- **`collectives` as its own 3.1?** Added it (the source folds it away, but a
  megascale path needs it taught). Confirm placement, or fold into 1.3/3.4.
- **Inference only at 4.4?** This is training-centric; serving lands last. OK, or
  pull a serving beat earlier?
- **`tpu-slices-and-vms` vs `tpu-provisioning-vm`** — the current spine had
  `tpu-slices-and-vms`; renamed to `tpu-provisioning-vm` (GKE Flex-start focus).
- Sim feasibility: 3.4 "trace forensics" and 4.3 "Pallas VMEM/HBM" are the two
  least-obvious sims — confirm they're worth building vs. figures + codelab.
