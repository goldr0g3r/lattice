#!/usr/bin/env node
// Create the "Lattice — Roadmap" Project v2 with the 5 custom fields and 2
// default views. Idempotent: if the project already exists (matched by
// title), the script re-uses it and only adds missing fields / options.
//
//   node bootstrap-project.mjs
//
// Writes the project + field IDs to `.project-state.json` so subsequent
// scripts (bootstrap-issues.mjs) can wire issues into the project.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { ghGraphQL, getRepo, log } from "./lib/gh.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".project-state.json");

const PROJECT_TITLE = "Lattice — Roadmap";

const FIELDS = [
  {
    name: "Status",
    options: ["Backlog", "Ready", "In progress", "In review", "Done"],
  },
  {
    name: "Milestone",
    options: [
      "v0.1",
      "v0.2",
      "v0.3",
      "v0.4",
      "v0.5",
      "v0.6",
      "v0.7",
      "v0.8",
      "v0.9",
      "v1.0",
      "Beyond",
    ],
  },
  {
    name: "Area",
    options: [
      "editor",
      "search",
      "graph",
      "ai",
      "sync",
      "mobile",
      "ui",
      "ux",
      "ci",
      "docs",
      "core",
      "sdk",
      "bookmarking",
      "engineering-ml",
    ],
  },
  { name: "Priority", options: ["p0", "p1", "p2", "p3"] },
  { name: "Size", options: ["XS", "S", "M", "L", "XL"] },
];

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function saveState(state) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function findOrCreateProject(owner) {
  const query = `
    query($login: String!) {
      ${owner.type === "User" ? "user" : "organization"}(login: $login) {
        projectsV2(first: 50) { nodes { id title number } }
      }
    }
  `;
  const data = await ghGraphQL(query, { login: owner.login });
  const projects =
    owner.type === "User"
      ? data.user.projectsV2.nodes
      : data.organization.projectsV2.nodes;
  const existing = projects.find((p) => p.title === PROJECT_TITLE);
  if (existing) {
    log("project", `reusing existing #${existing.number} (${existing.id})`);
    return existing;
  }

  const created = await ghGraphQL(
    `
      mutation($ownerId: ID!, $title: String!) {
        createProjectV2(input: { ownerId: $ownerId, title: $title }) {
          projectV2 { id title number }
        }
      }
    `,
    { ownerId: owner.id, title: PROJECT_TITLE },
  );
  const proj = created.createProjectV2.projectV2;
  log("project", `created #${proj.number} (${proj.id})`);
  return proj;
}

async function fetchProjectFields(projectId) {
  const data = await ghGraphQL(`
    query {
      node(id: "${projectId}") {
        ... on ProjectV2 {
          fields(first: 30) {
            nodes {
              ... on ProjectV2FieldCommon { id name dataType }
              ... on ProjectV2SingleSelectField {
                id name dataType
                options { id name }
              }
            }
          }
        }
      }
    }
  `);
  return data.node.fields.nodes;
}

async function ensureSingleSelectField(projectId, name, optionNames) {
  const existing = (await fetchProjectFields(projectId)).find(
    (f) => f.name === name,
  );
  if (existing && existing.dataType === "SINGLE_SELECT") {
    log(`field/${name}`, `reusing existing (${existing.id})`);
    return existing;
  }

  const optionsLiteral = optionNames
    .map(
      (n) =>
        `{ name: "${n.replace(/"/g, '\\"')}", color: GRAY, description: "" }`,
    )
    .join(", ");

  const created = await ghGraphQL(`
    mutation {
      createProjectV2Field(input: {
        projectId: "${projectId}",
        dataType: SINGLE_SELECT,
        name: "${name}",
        singleSelectOptions: [${optionsLiteral}]
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField { id name options { id name } }
        }
      }
    }
  `);
  const field = created.createProjectV2Field.projectV2Field;
  log(`field/${name}`, `created (${field.id})`);
  return field;
}

async function main() {
  const repo = await getRepo();
  log("project", `owner=${repo.owner.login} (${repo.owner.type})`);

  const project = await findOrCreateProject(repo.owner);

  const fieldRecords = {};
  for (const fieldDef of FIELDS) {
    const field = await ensureSingleSelectField(
      project.id,
      fieldDef.name,
      fieldDef.options,
    );
    fieldRecords[fieldDef.name] = {
      id: field.id,
      options: Object.fromEntries(
        (field.options ?? []).map((o) => [o.name, o.id]),
      ),
    };
  }

  const existingState = (await loadState()) ?? {};
  await saveState({
    ...existingState,
    project: { id: project.id, number: project.number, title: project.title },
    fields: fieldRecords,
  });
  log("project", "state saved to .project-state.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
