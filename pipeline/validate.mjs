#!/usr/bin/env node
/**
 * Standalone validator for the LMS-content repo (root layout: topics/, paths/,
 * glossary.json, plus staging/). Runs in this repo's CI — the automated gate of
 * the staging → prod pipeline — without the application. Mirrors the app's
 * content rules (frontmatter, graph integrity, quiz indices, glossary terms).
 *
 * Simulation `<Simulation id>` refs are NOT checked here (the registry lives in
 * the app repo); the app's CI validates those after fetch. Usage:
 *
 *   node pipeline/validate.mjs            # validate prod (topics/ + paths/)
 *   node pipeline/validate.mjs --staging  # also validate staging/topics/**
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const includeStaging = process.argv.includes("--staging");
const errors = [];

const glossary = fs.existsSync(path.join(ROOT, "glossary.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "glossary.json"), "utf8"))
  : {};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith(".mdx") ? [full] : [];
  });
}

// Simulation ids available in this repo (one dir per sim under simulations/packages).
const SIMS_DIR = path.join(ROOT, "simulations", "packages");
const simIds = new Set(
  fs.existsSync(SIMS_DIR)
    ? fs.readdirSync(SIMS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(SIMS_DIR, e.name, "sim.config.json")))
        .map((e) => e.name)
    : [],
);

// Collect topic ids from a topics dir, rooted for id derivation.
function topicsFrom(dir) {
  return walk(dir).map((file) => {
    const id = path.relative(dir, file).replace(/\.mdx$/, "").split(path.sep).join("/");
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    return { id, file, data, content };
  });
}

const prod = topicsFrom(path.join(ROOT, "topics"));
const staging = includeStaging ? topicsFrom(path.join(ROOT, "staging", "topics")) : [];
const topics = [...prod, ...staging];
const ids = new Set(topics.map((t) => t.id));

for (const t of topics) {
  const { id, data, content } = t;
  for (const f of ["title", "summary", "difficulty", "estimatedMinutes", "tags"]) {
    if (data[f] === undefined) errors.push(`${id}: missing required field "${f}"`);
  }
  if (data.difficulty !== undefined && !["beginner", "intermediate", "advanced"].includes(data.difficulty))
    errors.push(`${id}: difficulty "${data.difficulty}" must be beginner|intermediate|advanced`);
  if (data.status !== undefined && !["draft", "published"].includes(data.status))
    errors.push(`${id}: status "${data.status}" must be draft|published`);
  if (data.estimatedMinutes !== undefined && (!Number.isInteger(data.estimatedMinutes) || data.estimatedMinutes <= 0))
    errors.push(`${id}: estimatedMinutes must be a positive integer`);
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.length === 0))
    errors.push(`${id}: tags must be a non-empty array`);
  if (data.level !== undefined && (!Number.isInteger(data.level) || data.level <= 0))
    errors.push(`${id}: level must be a positive integer`);

  for (const p of data.prerequisites ?? [])
    if (!ids.has(p)) errors.push(`${id}: prerequisite "${p}" does not exist`);
  for (const r of data.relatedTo ?? [])
    if (!ids.has(r)) errors.push(`${id}: relatedTo "${r}" does not exist`);

  (data.quiz ?? []).forEach((q, i) => {
    if (!Array.isArray(q.choices) || q.choices.length < 2) errors.push(`${id}: quiz[${i}] needs ≥2 choices`);
    else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length)
      errors.push(`${id}: quiz[${i}] answer ${q.answer} out of range`);
  });

  for (const m of content.matchAll(/<Term\b([^>]*)>([\s\S]*?)<\/Term>/g)) {
    const idAttr = m[1].match(/\bid=["']([^"']+)["']/);
    const key = (idAttr ? idAttr[1] : m[2]).toLowerCase().trim();
    if (!glossary[key]) errors.push(`${id}: glossary term "${key}" is not defined`);
  }
  for (const m of content.matchAll(/<Simulation[^>]*\bid=(["'])(.*?)\1/g)) {
    if (!simIds.has(m[2])) errors.push(`${id}: simulation "${m[2]}" has no simulations/packages/${m[2]}`);
  }
}

// Paths: every level's topic ids must resolve.
for (const file of walk(path.join(ROOT, "paths"))) {
  const pid = path.basename(file, ".mdx");
  const { data } = matter(fs.readFileSync(file, "utf8"));
  for (const f of ["title", "summary", "levels"]) {
    if (data[f] === undefined) errors.push(`path ${pid}: missing "${f}"`);
  }
  for (const lvl of data.levels ?? [])
    for (const tid of lvl.topics ?? [])
      if (!ids.has(tid)) errors.push(`path ${pid}: topic "${tid}" (level ${lvl.level}) does not exist`);
}

if (errors.length) {
  console.error(`✗ content validation failed — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ valid — ${prod.length} prod topic(s)${includeStaging ? ` + ${staging.length} staged` : ""}, ${walk(path.join(ROOT, "paths")).length} path(s).`,
);
