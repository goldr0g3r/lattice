// Thin wrapper around the `gh` CLI so the rest of the scripts read like
// async/await application code instead of shell incantations.
//
// All functions throw on non-zero exit. Callers are expected to catch and
// turn errors into actionable log lines.

import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

/**
 * Run `gh <args>` and return stdout as a string. Throws on non-zero exit.
 * Stderr is forwarded to the parent process so the user sees `gh` errors.
 *
 * @param {string[]} args
 * @param {{ input?: string }} [opts]
 * @returns {Promise<string>}
 */
export function ghRaw(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      stdio: ["pipe", "pipe", "inherit"],
      shell: false,
    });
    const out = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`gh ${args.join(" ")} exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}

/**
 * Run `gh` and parse the stdout as JSON. Same error semantics as `ghRaw`.
 *
 * @template T
 * @param {string[]} args
 * @param {{ input?: string }} [opts]
 * @returns {Promise<T>}
 */
export async function ghJson(args, opts) {
  const stdout = await ghRaw(args, opts);
  if (!stdout.trim()) return /** @type {T} */ ({});
  return JSON.parse(stdout);
}

/**
 * Run a GraphQL query/mutation through `gh api graphql`.
 * Passes the query via stdin to avoid shell-escaping nightmares.
 *
 * @template T
 * @param {string} query  GraphQL document
 * @param {Record<string, string | number | boolean>} [variables]
 * @returns {Promise<T>}
 */
export async function ghGraphQL(query, variables = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === "string") {
      args.push("-f", `${key}=${value}`);
    } else {
      args.push("-F", `${key}=${value}`);
    }
  }
  const stdout = await ghRaw(args);
  const parsed = JSON.parse(stdout);
  if (parsed.errors && parsed.errors.length) {
    throw new Error(`GraphQL error: ${parsed.errors.map((e) => e.message).join("; ")}`);
  }
  return parsed.data;
}

/**
 * Discover the {owner, repo, defaultBranch} of the current repo.
 *
 * @returns {Promise<{ owner: { login: string, id: string, type: "User"|"Organization" }, name: string, defaultBranchRef: { name: string }, id: string }>}
 */
export async function getRepo() {
  const data = await ghGraphQL(`
    query {
      repository(owner: "${await getOwnerLogin()}", name: "${await getRepoName()}") {
        id
        defaultBranchRef { name }
        name
        owner { __typename login ... on User { id } ... on Organization { id } }
      }
    }
  `);
  const r = data.repository;
  return {
    id: r.id,
    name: r.name,
    defaultBranchRef: r.defaultBranchRef,
    owner: {
      login: r.owner.login,
      id: r.owner.id,
      type: r.owner.__typename,
    },
  };
}

let _cachedOwner = null;
let _cachedRepo = null;

async function getOwnerLogin() {
  if (_cachedOwner) return _cachedOwner;
  const json = await ghJson(["repo", "view", "--json", "owner"]);
  _cachedOwner = json.owner.login;
  return _cachedOwner;
}

async function getRepoName() {
  if (_cachedRepo) return _cachedRepo;
  const json = await ghJson(["repo", "view", "--json", "name"]);
  _cachedRepo = json.name;
  return _cachedRepo;
}

/**
 * Convenience: log a step in a consistent format.
 *
 * @param {string} step
 * @param {string} [detail]
 */
export function log(step, detail) {
  const stamp = new Date().toISOString().slice(11, 19);
  if (detail !== undefined) {
    console.log(`[${stamp}] ${step} — ${detail}`);
  } else {
    console.log(`[${stamp}] ${step}`);
  }
}
