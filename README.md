# LMS content

The learning content for **LMS** ([thebobrovs/LMS](https://github.com/thebobrovs/LMS))
— topics, paths, the shared glossary, and media. The application repo checks this
out at build time (`scripts/fetch-content.mjs`) and renders it; nothing here is
application code.

## Layout

```
topics/<subject>/<slug>.mdx   # one lesson = one knowledge-graph node
paths/<id>.mdx                # curated tracks (levels 100/200/300) over topics
glossary.json                 # shared term → definition (+ optional link)
media/                        # images/diagrams, served at /media/…
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

## Workflow

Edit MDX/JSON here → open a PR → on merge, the application rebuilds and redeploys
with the new content (no app deploy needed for content-only changes). CI in the
app repo validates frontmatter, graph integrity, simulation refs, and glossary
terms.
