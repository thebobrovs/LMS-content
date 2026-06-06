# LMS content

The learning content for **LMS** ([thebobrovs/LMS](https://github.com/thebobrovs/LMS))
— topics, paths, the shared glossary, and media. The application repo checks this
out at build time (`scripts/fetch-content.mjs`) and renders it; nothing here is
application code.

## Layout

```
topics/<subject>/<slug>.mdx   # PROD lessons (published) = knowledge-graph nodes
paths/<id>.mdx                # curated tracks (levels 100/200/300) over topics
glossary.json                 # shared term → definition (+ optional link)
media/                        # images/diagrams, served at /media/…
staging/                      # DRAFTS awaiting audit + promotion
personas/                     # per-topic SME experts (who authors each topic)
skills/                       # authoring skills + the SME content pipeline
pipeline/                     # validate.mjs · promote.mjs · AUDIT.md
```

- A topic's `id` is its path under `topics/` without `.mdx`
  (e.g. `data-structures/hash-tables`).
- Reference images as `/media/<file>`.

## Authoring

Frontmatter and the MDX component set (Simulation, YouTube, Callout, Flashcard,
Quiz, Steps, Figure, Tip, Term) are documented in the application repo under
[`skills/`](https://github.com/thebobrovs/LMS/tree/main/skills) — see
`lms-authoring-topics`, `lms-authoring-paths`, `lms-authoring-simulations`. A
per-file validator lives there too:
`node skills/lms-authoring-topics/scripts/validate.mjs <file>`.

## Authoring pipeline (SME → staging → prod)

New topics are authored by a **subject-matter-expert persona**, drafted in
**staging**, **audited** (automated + human + sub-agent critics), then **promoted**
to production:

1. **Adopt the persona** for the topic (`personas/`, resolved by topic id →
   subject → `_default`). You are now that expert.
2. **Research → plan → draft** into `staging/topics/…` with `status: draft`
   (follow the `skills/sme-content-pipeline` + `skills/lms-authoring-topics`).
3. **Audit** — `node pipeline/validate.mjs --staging` (CI gate) + the
   `pipeline/AUDIT.md` critics + a human PR review (preview with a
   `CONTENT_STAGING=1` app build).
4. **Promote** — `node pipeline/promote.mjs staging/topics/<…>.mdx` → moves to
   `topics/`, sets `status: published`; `npm run validate`; merge → the app
   rebuilds and the topic goes live.

```bash
npm install              # gray-matter for the validators
npm run validate         # validate prod content
npm run validate:staging # validate prod + staging
npm run promote -- staging/topics/<subject>/<slug>.mdx
```

Content-only changes never require an app code change. The app repo's CI also
re-validates after fetch (and checks simulation refs against its registry).
