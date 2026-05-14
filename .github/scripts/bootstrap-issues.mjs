#!/usr/bin/env node
// Create epic + task issues from `.github/issues/*.yml`. Idempotent: issues
// are matched by exact title; if an issue with the same title already exists
// (open or closed) the script reuses it.
//
//   node bootstrap-issues.mjs
//
// After all issues exist, the script:
//   1. Replaces `<!-- AUTO:CHILDREN -->` inside each epic body with a
//      task-list of child issue references (`- [ ] #N` per child).
//   2. Adds every issue to the Project v2 created by bootstrap-project.mjs.
//   3. Sets Status=Backlog, Milestone=<>, Area=<>, Priority=<>, Size=<> on
//      each project item based on the issue's labels.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { loadYaml } from "./lib/yaml.mjs";
import { ghJson, ghRaw, ghGraphQL, getRepo, log } from "./lib/gh.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".project-state.json");
const EPICS_PATH = join(__dirname, "..", "issues", "epics.yml");
const TASKS_PATHS = [
  join(__dirname, "..", "issues", "v0.1-tasks.yml"),
  join(__dirname, "..", "issues", "v0.2-tasks.yml"),
];

/**
 * @typedef {{
 *   title: string,
 *   milestone: string,
 *   labels: string[],
 *   body: string,
 *   epic?: string,
 *   "good-first-issue"?: boolean
 * }} IssueSpec
 */

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    throw new Error("No .project-state.json found. Run bootstrap-project.mjs first.");
  }
}

async function fetchExistingIssues() {
  const issues = await ghJson([
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    "500",
    "--json",
    "number,title,state,labels,milestone,body",
  ]);
  return new Map(issues.map((i) => [i.title, i]));
}

async function createIssue(spec) {
  const labels =
    spec["good-first-issue"] === true ? [...spec.labels, "good first issue"] : spec.labels;

  const args = [
    "issue",
    "create",
    "--title",
    spec.title,
    "--body",
    spec.body,
    "--milestone",
    spec.milestone,
  ];
  for (const label of labels) {
    args.push("--label", label);
  }
  const stdout = await ghRaw(args);
  const url = stdout.trim().split("\n").pop();
  const number = Number(url.split("/").pop());
  return { number, url };
}

async function ensureIssue(spec, existingByTitle) {
  const current = existingByTitle.get(spec.title);
  if (current) {
    log(`  = reuse`, `#${current.number} ${spec.title}`);
    return { number: current.number, body: current.body ?? "" };
  }
  const { number } = await createIssue(spec);
  log(`  + create`, `#${number} ${spec.title}`);
  return { number, body: spec.body };
}

async function replaceChildrenMarker(epicNumber, epicBody, childNumbers) {
  if (!childNumbers.length) return;
  const list = childNumbers.map((n) => `- [ ] #${n}`).join("\n");
  const newBody = epicBody.replace(/<!-- AUTO:CHILDREN -->/, list);
  if (newBody === epicBody) return; // marker was already replaced
  await ghRaw(["issue", "edit", String(epicNumber), "--body", newBody]);
  log(`  ~ link`, `epic #${epicNumber} children: ${childNumbers.map((n) => `#${n}`).join(", ")}`);
}

async function getIssueNodeId(repo, number) {
  const data = await ghGraphQL(`
    query {
      repository(owner: "${repo.owner.login}", name: "${repo.name}") {
        issue(number: ${number}) { id }
      }
    }
  `);
  return data.repository.issue.id;
}

async function addIssueToProject(projectId, issueNodeId) {
  const data = await ghGraphQL(`
    mutation {
      addProjectV2ItemById(input: {
        projectId: "${projectId}",
        contentId: "${issueNodeId}"
      }) {
        item { id }
      }
    }
  `);
  return data.addProjectV2ItemById.item.id;
}

async function setSingleSelectField(projectId, itemId, fieldId, optionId) {
  if (!optionId) return;
  await ghGraphQL(`
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "${projectId}",
        itemId: "${itemId}",
        fieldId: "${fieldId}",
        value: { singleSelectOptionId: "${optionId}" }
      }) {
        projectV2Item { id }
      }
    }
  `);
}

// Status and Milestone fields are managed by GitHub (auto-created on the
// project). We only set Area / Priority / Size on the custom SingleSelects
// that bootstrap-project.mjs created. The repo Milestone we passed to
// `gh issue create --milestone` will surface in the auto Milestone field.
function deriveFieldValues(spec) {
  const area = spec.labels.map((l) => l.match(/^area\/(.+)$/)?.[1]).find(Boolean) ?? null;
  const priority = spec.labels.map((l) => l.match(/^priority\/(.+)$/)?.[1]).find(Boolean) ?? null;
  const sizeRaw = spec.labels.map((l) => l.match(/^size\/(.+)$/)?.[1]).find(Boolean) ?? null;
  const size = sizeRaw ? sizeRaw.toUpperCase() : null;
  return {
    Area: area,
    Priority: priority,
    Size: size,
  };
}

async function main() {
  const state = await loadState();
  const repo = await getRepo();

  /** @type {IssueSpec[]} */
  const epics = await loadYaml(EPICS_PATH);
  /** @type {IssueSpec[][]} */
  const taskBatches = await Promise.all(TASKS_PATHS.map(loadYaml));
  const tasks = taskBatches.flat();

  log(
    "issues",
    `${epics.length} epics + ${tasks.length} tasks = ${epics.length + tasks.length} total`,
  );

  const existing = await fetchExistingIssues();

  log("issues", "creating epics");
  const epicByTitle = new Map();
  for (const spec of epics) {
    const issue = await ensureIssue(spec, existing);
    epicByTitle.set(spec.title, { ...issue, spec });
  }

  log("issues", "creating tasks");
  const childrenByEpic = new Map();
  const taskByTitle = new Map();
  for (const spec of tasks) {
    const issue = await ensureIssue(spec, existing);
    taskByTitle.set(spec.title, { ...issue, spec });
    if (spec.epic) {
      const list = childrenByEpic.get(spec.epic) ?? [];
      list.push(issue.number);
      childrenByEpic.set(spec.epic, list);
    }
  }

  log("issues", "linking task-lists into epic bodies");
  for (const [epicTitle, children] of childrenByEpic) {
    const epic = epicByTitle.get(epicTitle);
    if (!epic) {
      log(`  ! warn`, `unknown epic referenced by task: ${epicTitle}`);
      continue;
    }
    await replaceChildrenMarker(epic.number, epic.body, children);
  }

  log("issues", "adding to Project v2 and setting field values");
  const allEntries = [...epicByTitle.values(), ...taskByTitle.values()];
  for (const { number, spec } of allEntries) {
    const issueNodeId = await getIssueNodeId(repo, number);
    const itemId = await addIssueToProject(state.project.id, issueNodeId);

    const values = deriveFieldValues(spec);
    for (const [fieldName, optionName] of Object.entries(values)) {
      if (!optionName) continue;
      const field = state.fields[fieldName];
      if (!field) continue;
      const optionId = field.options[optionName];
      if (!optionId) {
        log(`  ! warn`, `no option "${optionName}" on field "${fieldName}" for #${number}`);
        continue;
      }
      await setSingleSelectField(state.project.id, itemId, field.id, optionId);
    }
    log(`  ✓ project`, `#${number} ${spec.title}`);
  }

  log("issues done", "all epics + tasks created, linked, and on the board");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
