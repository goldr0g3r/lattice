#!/usr/bin/env node
// Mirror `.github/labels.yml` into the GitHub repo.
//
//   node sync-labels.mjs            # create + update labels (default safe)
//   node sync-labels.mjs --prune    # also delete labels not in the YAML
//
// Idempotent: re-running with no changes is a no-op.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadYaml } from "./lib/yaml.mjs";
import { ghJson, ghRaw, log } from "./lib/gh.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = join(__dirname, "..", "labels.yml");

const PRUNE = process.argv.includes("--prune");

/**
 * @typedef {{ name: string, color: string, description: string }} Label
 */

async function main() {
  log("sync-labels", `reading ${LABELS_PATH}`);
  /** @type {Label[]} */
  const desired = await loadYaml(LABELS_PATH);
  log("sync-labels", `${desired.length} labels in YAML`);

  /** @type {Label[]} */
  const existing = await ghJson([
    "label",
    "list",
    "--json",
    "name,color,description",
    "--limit",
    "200",
  ]);
  log("sync-labels", `${existing.length} labels currently on GitHub`);

  const existingByName = new Map(existing.map((l) => [l.name, l]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const label of desired) {
    const current = existingByName.get(label.name);
    if (!current) {
      // `--force` makes this idempotent if the label was created by another
      // workflow (e.g., actions/labeler racing with us) between our
      // `label list` call and now. Without it, `gh label create` errors out.
      await ghRaw([
        "label",
        "create",
        label.name,
        "--color",
        label.color,
        "--description",
        label.description ?? "",
        "--force",
      ]);
      log("  + create", label.name);
      created++;
      continue;
    }
    const needsUpdate =
      current.color.toLowerCase() !== label.color.toLowerCase() ||
      (current.description ?? "") !== (label.description ?? "");
    if (needsUpdate) {
      await ghRaw([
        "label",
        "edit",
        label.name,
        "--color",
        label.color,
        "--description",
        label.description ?? "",
      ]);
      log("  ~ update", label.name);
      updated++;
    } else {
      unchanged++;
    }
  }

  let pruned = 0;
  if (PRUNE) {
    const desiredNames = new Set(desired.map((l) => l.name));
    for (const current of existing) {
      if (desiredNames.has(current.name)) continue;
      await ghRaw(["label", "delete", current.name, "--yes"]);
      log("  - delete", current.name);
      pruned++;
    }
  }

  log(
    "sync-labels done",
    `+${created} created, ~${updated} updated, =${unchanged} unchanged${PRUNE ? `, -${pruned} pruned` : ""}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
