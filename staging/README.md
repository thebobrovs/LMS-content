# staging/

Drafts live here until they pass audit and are promoted to production.

```
staging/topics/<subject>/<slug>.mdx   # status: draft
staging/<id>.plan.md                   # optional research plan
```

- Authored by the topic's **SME persona** (`../personas/`) following the
  **`sme-content-pipeline`** skill.
- Validated by `node pipeline/validate.mjs --staging` and the Content CI gate.
- Previewable in the app with a `CONTENT_STAGING=1` build.
- Promoted with `node pipeline/promote.mjs staging/topics/<…>.mdx` → moves to
  `topics/` and sets `status: published`.

Nothing in `staging/` is served in production — the app only fetches `topics/`.
