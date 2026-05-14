// Conventional Commits enforcement for Lattice.
//
// This config is used by:
//   - local pre-commit hooks (if a contributor installs husky / lefthook),
//   - any tooling that respects `commitlint.config.cjs` at the repo root.
//
// PR-title validation in CI is done by `amannn/action-semantic-pull-request`
// in `.github/workflows/commitlint.yml`. Keep the `types` and `scopes`
// lists below in sync with that workflow.

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "repo",
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
        "desktop",
        "android",
        "release",
        "deps",
        "adr",
        "github",
      ],
    ],
    "scope-empty": [0],
    "subject-case": [2, "never", ["upper-case", "pascal-case", "start-case"]],
    "header-max-length": [2, "always", 100],
  },
};
