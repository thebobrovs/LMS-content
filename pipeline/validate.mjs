#!/usr/bin/env node
/**
 * Standalone validator for the LMS-content repo (root layout: topics/, paths/,
 * glossary/<pathId>.json, plus staging/). Runs in this repo's CI — the automated
 * gate of the staging → prod pipeline — without the application. Mirrors the
 * app's content rules (frontmatter, graph integrity, quiz indices, glossary).
 *
 * Glossaries are **per path** (glossary/<pathId>.json). A topic's <Term>s must
 * resolve in its *effective* glossary: the union of the glossaries of the paths
 * that contain the topic, or — for a topic in no path — the union of all
 * glossaries. Simulation `<Simulation id>` refs are checked against
 * simulations/packages. Usage:
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

// Per-path glossaries: glossary/<name>.json → { name: { term: entry } }.
const GLOSS_DIR = path.join(ROOT, "glossary");
const glossaries = {};
if (fs.existsSync(GLOSS_DIR)) {
  for (const f of fs.readdirSync(GLOSS_DIR)) {
    if (f.endsWith(".json")) {
      glossaries[f.replace(/\.json$/, "")] = JSON.parse(
        fs.readFileSync(path.join(GLOSS_DIR, f), "utf8"),
      );
    }
  }
}
const unionGloss = Object.assign({}, ...Object.values(glossaries));

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
    ? fs
        .readdirSync(SIMS_DIR, { withFileTypes: true })
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

// Parse paths up front: validate them and build topic → set(pathId).
const pathFiles = walk(path.join(ROOT, "paths"));
const parsedPaths = pathFiles.map((file) => ({
  pid: path.basename(file, ".mdx"),
  data: matter(fs.readFileSync(file, "utf8")).data,
}));
const pathsByTopic = new Map();
for (const { pid, data } of parsedPaths) {
  for (const lvl of data.levels ?? [])
    for (const tid of lvl.topics ?? []) {
      if (!pathsByTopic.has(tid)) pathsByTopic.set(tid, new Set());
      pathsByTopic.get(tid).add(pid);
    }
}

// A topic's effective glossary: union of its paths' glossaries, else union of all.
function effectiveGlossary(topicId) {
  const pids = pathsByTopic.get(topicId);
  if (!pids || pids.size === 0) return unionGloss;
  return Object.assign({}, ...[...pids].map((p) => glossaries[p] ?? {}));
}

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

  const gloss = effectiveGlossary(id);
  for (const m of content.matchAll(/<Term\b([^>]*)>([\s\S]*?)<\/Term>/g)) {
    const idAttr = m[1].match(/\bid=["']([^"']+)["']/);
    const key = (idAttr ? idAttr[1] : m[2]).toLowerCase().trim();
    if (!gloss[key]) {
      const pids = pathsByTopic.get(id);
      const where = pids ? `the glossary of its path(s): ${[...pids].join(", ")}` : "any path glossary";
      errors.push(`${id}: glossary term "${key}" is not defined in ${where}`);
    }
  }
  for (const m of content.matchAll(/<Simulation[^>]*\bid=(["'])(.*?)\1/g)) {
    if (!simIds.has(m[2])) errors.push(`${id}: simulation "${m[2]}" has no simulations/packages/${m[2]}`);
  }
}

// Paths: required fields + every level's topic ids must resolve.
for (const { pid, data } of parsedPaths) {
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
  `✓ valid — ${prod.length} prod topic(s)${includeStaging ? ` + ${staging.length} staged` : ""}, ${parsedPaths.length} path(s), ${Object.keys(glossaries).length} glossary file(s).`,
);
