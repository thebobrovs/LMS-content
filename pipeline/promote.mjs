#!/usr/bin/env node
/**
 * Promote staged content to production. Moves staging/topics/<…>.mdx →
 * topics/<…>.mdx and flips `status: draft` → `published`. The final gate of the
 * staging → prod pipeline (run after human + sub-agent audit approves a draft).
 *
 *   node pipeline/promote.mjs staging/topics/ml-systems/foo.mdx
 *   node pipeline/promote.mjs --all     # promote every staged topic
 *
 * After promoting, run `node pipeline/validate.mjs` and commit.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "staging", "topics");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith(".mdx") ? [full] : [];
  });
}

const args = process.argv.slice(2);
const all = args.includes("--all");
let files;
if (all) {
  files = walk(STAGE);
} else if (args[0]) {
  files = [path.resolve(args[0])];
} else {
  console.error("Usage: node pipeline/promote.mjs <staging file> | --all");
  process.exit(2);
}

if (files.length === 0) {
  console.log("Nothing to promote.");
  process.exit(0);
}

for (const src of files) {
  if (!fs.existsSync(src)) {
    console.error(`Not found: ${src}`);
    process.exit(1);
  }
  const rel = path.relative(STAGE, src); // <subject>/<slug>.mdx
  const dest = path.join(ROOT, "topics", rel);

  let text = fs.readFileSync(src, "utf8");
  // Flip status to published in the frontmatter (add it if absent).
  if (/^status:\s*\w+/m.test(text)) {
    text = text.replace(/^status:\s*\w+/m, "status: published");
  } else {
    text = text.replace(/^---\n/, "---\nstatus: published\n");
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
  fs.rmSync(src);
  console.log(`promoted ${rel}  (staging → topics, status: published)`);
}

console.log("Done. Now run: node pipeline/validate.mjs   then commit + open a PR.");
