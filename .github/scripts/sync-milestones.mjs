#!/usr/bin/env node
// Mirror `.github/milestones.yml` into the GitHub repo.
//
//   node sync-milestones.mjs
//
// Idempotent: re-running with no changes is a no-op.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadYaml } from "./lib/yaml.mjs";
import { ghJson, log } from "./lib/gh.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MILESTONES_PATH = join(__dirname, "..", "milestones.yml");

/**
 * @typedef {{ title: string, description?: string, state?: "open" | "closed" }} Milestone
 */

async function main() {
  log("sync-milestones", `reading ${MILESTONES_PATH}`);
  /** @type {Milestone[]} */
  const desired = await loadYaml(MILESTONES_PATH);
  log("sync-milestones", `${desired.length} milestones in YAML`);

  /** @type {Array<{ title: string, description: string | null, state: string, number: number }>} */
  const existing = await ghJson(["api", "repos/{owner}/{repo}/milestones?state=all&per_page=100"]);
  log("sync-milestones", `${existing.length} milestones currently on GitHub`);

  const existingByTitle = new Map(existing.map((m) => [m.title, m]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const milestone of desired) {
    const current = existingByTitle.get(milestone.title);
    const state = milestone.state ?? "open";
    const description = milestone.description ?? "";

    if (!current) {
      await ghJson([
        "api",
        "-X",
        "POST",
        "repos/{owner}/{repo}/milestones",
        "-f",
        `title=${milestone.title}`,
        "-f",
        `description=${description}`,
        "-f",
        `state=${state}`,
      ]);
      log("  + create", milestone.title);
      created++;
      continue;
    }

    const needsUpdate = (current.description ?? "") !== description || current.state !== state;
    if (needsUpdate) {
      await ghJson([
        "api",
        "-X",
        "PATCH",
        `repos/{owner}/{repo}/milestones/${current.number}`,
        "-f",
        `description=${description}`,
        "-f",
        `state=${state}`,
      ]);
      log("  ~ update", milestone.title);
      updated++;
    } else {
      unchanged++;
    }
  }

  log("sync-milestones done", `+${created} created, ~${updated} updated, =${unchanged} unchanged`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
