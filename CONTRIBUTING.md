# Content development cycle

How a lesson (topic), path, glossary, simulation, or resource goes from idea to
live — **author → validate → audit → review on staging → promote → deploy prod**.

Two repos are involved:

- **`LMS-content`** (this repo) — the content itself plus the staging→prod
  pipeline (`pipeline/`, `personas/`, `skills/`, `staging/`).
- **`LMS`** (the app) — fetches this content at build time and deploys two
  Firebase Hosting sites: **production** (published only) and **staging**
  (drafts visible, `noindex`).

```
 author ──► validate ──► audit ──► review on staging ──► promote ──► deploy prod
 (draft)     (CI)       (critics)    (staging site)       (PR)        (live)
```

Nothing in `staging/` is ever served in production, and any `status: draft`
content is dropped from the production build — only the **staging site** renders
drafts.

---

## 1. Author (draft)

Adopt the topic's **SME persona** (`personas/<subject>.md`) and follow the
skills: **`skills/sme-content-pipeline`** (the process) + **`skills/lms-authoring-topics`**
(the format). Two ways to create a draft:

- **A — stage a new file:** `staging/topics/<subject>/<slug>.mdx` with
  `status: draft` (and an optional `staging/<id>.plan.md` research plan).
- **B — edit in place:** a `topics/<…>.mdx` left at `status: draft`. The admin
  portal's **content editor** (web) produces these as a branch + commit + PR.

Supporting content (each scoped per path/topic):

| What | Where | Notes |
|------|-------|-------|
| Glossary terms | `glossary/<pathId>.json` | A topic resolves `<Term>`s against the glossaries of the paths that contain it. |
| Resources | `resources/<pathId>.json` | Videos, AI prompts, NotebookLM links; optional `topic` tag. |
| Simulations | `simulations/packages/<id>/` | Classic scripts (`sim.config.json` + `index.html` + `main.js` + `style.css`); see `skills/lms-authoring-simulations`. |
| Media | `media/` | Images referenced by topics. |

## 2. Validate (automated gate)

```bash
node pipeline/validate.mjs --staging
```

Checks frontmatter, graph edges (prereq/related exist), quiz answer ranges,
that every `<Term>` resolves in the topic's effective glossary, that every
`<Simulation>` has a package, and the resources files. This is the
`content-ci.yml` gate that runs on **every PR**.

## 3. Audit (human + sub-agent critics)

Run the gate in **`pipeline/AUDIT.md`**: spawn independent critic sub-agents —
**technical accuracy**, **pedagogy**, **voice/standard**, **self-containment** —
each returning pass/fail with specifics. A majority must pass; revise until
green.

## 4. Review on staging (test)

Render the draft on the staging site and read it like a learner would. From the
**app repo**:

```bash
cd ../LMS
npm run deploy:staging      # builds with drafts, deploys hosting:staging
```

→ **https://lms-staging-45c03.web.app** — renders drafts, shows a "Staging
preview" banner and a **Draft** badge on unpublished items, and is `noindex`
(learners never see it; it isn't linked from production or indexed by search).

## 5. Promote (draft → published)

- **Staged file:** `node pipeline/promote.mjs staging/topics/<…>.mdx`
  (moves it to `topics/` and flips `status: published`).
- **In-place draft:** set `status: published` in the topic's frontmatter.

Then re-validate, commit, and open a PR **in `LMS-content`**:

```bash
node pipeline/validate.mjs
git add -A && git commit && gh pr create
```

CI (`validate.mjs`) gates the PR; a reviewer reads the staging preview and
merges.

## 6. Push to prod

After the `LMS-content` PR merges, redeploy the public app. From the **app repo**:

```bash
cd ../LMS
npm run deploy              # builds published-only, deploys hosting:production
```

The app refetches the merged content and the new lesson goes live at
**https://lms-p-45c03.web.app**.

> Multi-site note: always use `npm run deploy` (production) or
> `npm run deploy:staging` — never bare `firebase deploy --only hosting`, which
> would push the same build to **both** sites.

---

## Reference

- **Experts:** `personas/`
- **Skills:** `skills/sme-content-pipeline`, `lms-authoring-topics`,
  `lms-authoring-paths`, `lms-authoring-simulations`
- **Gate & promote:** `pipeline/validate.mjs`, `pipeline/AUDIT.md`,
  `pipeline/promote.mjs`
- **Draft flow:** `staging/` (drafts, never served in prod) → `topics/`
  (published)
