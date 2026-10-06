#!/usr/bin/env node
/**
 * Upload a project's source strings to Stringherd.
 *
 * DeepL Sync push sends translations but never the source text, so the review screen
 * gets the source from here. Run it from the root of the project being localized.
 *
 * Usage:
 *   node upload-source.mjs --project fitjournal --file web-react/src/i18n/locales/en/common.json
 *
 * Options:
 *   --project   Stringherd project id (same as tms.project_id in .deepl-sync.yaml)   required
 *   --file      JSON catalog to upload, relative to the current folder                required
 *   --server    Stringherd URL                              default: http://localhost:8100
 *   --locale    Source locale                               default: en
 *   --commit    Commit id to record                         default: current git commit, if any
 *   --dry-run   Show what would be sent, without sending
 *
 * Auth: reads TMS_API_KEY from the environment (e.g. via `op run --env-file=...`).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    file: { type: "string" },
    server: { type: "string", default: "http://localhost:8100" },
    locale: { type: "string", default: "en" },
    commit: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!args.project) fail("--project is required (the tms.project_id from .deepl-sync.yaml).");
if (!args.file) fail("--file is required, e.g. --file web-react/src/i18n/locales/en/common.json");

/** Flatten nested JSON into dotted keys, the same way DeepL Sync names them. */
function flatten(node, prefix, out, skipped) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => flatten(item, prefix ? `${prefix}.${i}` : String(i), out, skipped));
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out, skipped);
    }
  } else if (typeof node === "string") {
    out[prefix] = node;
  } else {
    skipped.push(prefix);
  }
  return out;
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
}

let data;
try {
  data = JSON.parse(readFileSync(args.file, "utf-8").replace(/^﻿/, ""));
} catch (err) {
  fail(`could not read ${args.file} as JSON: ${err.message}`);
}

const skipped = [];
const strings = flatten(data, "", {}, skipped);
const file = args.file.replaceAll("\\", "/").replace(/^(\.\/)+/, "");
const commit = args.commit ?? currentCommit();
const body = { locale: args.locale, file, strings, ...(commit ? { commit } : {}) };

console.log(`${Object.keys(strings).length} strings from ${file}${commit ? ` (commit ${commit})` : ""}`);
if (skipped.length) console.log(`Skipped ${skipped.length} non-text value(s): ${skipped.slice(0, 5).join(", ")}`);

if (args["dry-run"]) {
  console.log("[dry-run] Nothing sent. First keys:", Object.keys(strings).slice(0, 5).join(", "));
  process.exit(0);
}

const apiKey = process.env.TMS_API_KEY;
if (!apiKey) fail("TMS_API_KEY is not set. Run through 1Password, e.g. op run --env-file=.env.l10n.op -- node ...");

const url = `${args.server.replace(/\/+$/, "")}/api/projects/${encodeURIComponent(args.project)}/source`;
let response;
try {
  response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `ApiKey ${apiKey}` },
    body: JSON.stringify(body),
  });
} catch (err) {
  fail(`could not reach Stringherd at ${args.server} (${err.cause?.code ?? err.message}). Is the server running?`);
}

const result = await response.json().catch(() => ({}));
if (!response.ok) {
  const detail = typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail ?? result, null, 2);
  fail(`Stringherd answered ${response.status}: ${detail}`);
}

console.log(
  `Uploaded to ${url}\n` +
    `  created: ${result.created}  filled: ${result.filled}  updated: ${result.updated}  unchanged: ${result.unchanged}\n` +
    `  approvals sent back to review: ${result.approvals_reset}`
);
if (result.removed?.length) {
  console.log(`  no longer in the file (${result.removed.length}): ${result.removed.slice(0, 10).join(", ")}`);
}
