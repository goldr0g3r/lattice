#!/usr/bin/env node
// Apply the repo-level settings + branch protection that aren't expressible
// as a config file. Re-runnable; the API calls are idempotent.
//
//   node bootstrap-repo.mjs                   # apply settings only
//   node bootstrap-repo.mjs --apply-protection # also apply branch protection on main
//
// Branch protection is gated behind a flag because it requires CI to have
// run at least once on a PR so the check names match (`ci / meta`,
// `commitlint`).

import { ghJson, ghRaw, log } from "./lib/gh.mjs";

const APPLY_PROTECTION = process.argv.includes("--apply-protection");

const TOPICS = [
  "notes",
  "knowledge-management",
  "tauri",
  "rust",
  "react",
  "markdown",
  "local-first",
  "ai",
  "obsidian-alternative",
  "pkm",
  "aiml",
];

const REPO_DESCRIPTION =
  "Lattice — a modern, local-first, AI-native PKM for engineers and ML practitioners. Tauri 2 + Rust + React. Windows, Linux, Android.";

async function applyRepoSettings() {
  log("repo-settings", "topics, description, merge defaults");

  await ghJson([
    "api",
    "-X",
    "PATCH",
    "repos/{owner}/{repo}",
    "-f",
    `description=${REPO_DESCRIPTION}`,
    "-F",
    "has_discussions=true",
    "-F",
    "has_issues=true",
    "-F",
    "has_projects=true",
    "-F",
    "has_wiki=false",
    "-F",
    "allow_squash_merge=true",
    "-F",
    "allow_merge_commit=false",
    "-F",
    "allow_rebase_merge=false",
    "-f",
    "squash_merge_commit_title=PR_TITLE",
    "-f",
    "squash_merge_commit_message=PR_BODY",
    "-F",
    "delete_branch_on_merge=true",
    "-F",
    "allow_auto_merge=true",
    "-F",
    "allow_update_branch=true",
  ]);

  await ghJson([
    "api",
    "-X",
    "PUT",
    "repos/{owner}/{repo}/topics",
    "-f",
    `names[]=${TOPICS.join(",")}`,
  ]).catch(async () => {
    const args = ["api", "-X", "PUT", "repos/{owner}/{repo}/topics"];
    for (const topic of TOPICS) {
      args.push("-f", `names[]=${topic}`);
    }
    await ghJson(args);
  });

  log("repo-settings", "applied");
}

async function applyBranchProtection() {
  log("branch-protection", "applying to main");

  // The list of contexts is the contract between CI and branch protection.
  // Each entry must match a job's `name:` (or its templated value) exactly.
  // Updated in v0.1 PR #11 once the monorepo scaffold landed.
  const requiredContexts = [
    "ci / meta",
    "ci / frontend (ubuntu-latest)",
    "ci / frontend (windows-latest)",
    "ci / rust (ubuntu-latest)",
    "ci / rust (windows-latest)",
    "ci / desktop-build (ubuntu-latest)",
    "ci / desktop-build (windows-latest)",
    "commitlint",
  ];

  const body = {
    required_status_checks: {
      strict: true,
      contexts: requiredContexts,
    },
    enforce_admins: false,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 1,
    },
    required_linear_history: true,
    required_conversation_resolution: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    lock_branch: false,
    restrictions: null,
  };

  await ghRaw(
    ["api", "-X", "PUT", "repos/{owner}/{repo}/branches/main/protection", "--input", "-"],
    { input: JSON.stringify(body) },
  );

  log("branch-protection", "applied");
}

async function main() {
  await applyRepoSettings();
  if (APPLY_PROTECTION) {
    await applyBranchProtection();
  } else {
    log("branch-protection", "skipped (rerun with --apply-protection once CI checks exist)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
