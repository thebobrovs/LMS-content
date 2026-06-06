# SME personas

Each topic has a **Subject-Matter Expert persona** — the voice and standard an
authoring agent adopts to research, plan, draft, and revise that topic. A persona
is a brief an agent loads (alongside the `sme-content-pipeline` skill) before it
touches a topic, so content is written by a consistent "expert," not a generalist.

## Files
- `_template.md` — copy this to start a new persona.
- `<topic-id-or-subject>.md` — one per topic (e.g. `ml-systems/tpu-v5p-topology.md`)
  or per subject (e.g. `data-structures.md`) when topics share an expert.

A topic resolves its persona by: exact topic id → else its subject → else the
`_default` persona.

## What a persona is for
The persona defines **who is writing**: their expertise, the authoritative
sources they trust, the standards they refuse to compromise on, and the voice
they use. The **process** they follow (research → plan → stage → audit → promote)
is in the `sme-content-pipeline` skill; the persona is the *expert* that runs it.

## How an agent uses one
1. Load the persona for the topic + the `sme-content-pipeline` skill.
2. Research from the persona's sources; write the plan; draft into `staging/`.
3. Spawn the audit critics (see `pipeline/AUDIT.md`); revise until they pass.
4. After human sign-off, promote to prod.
