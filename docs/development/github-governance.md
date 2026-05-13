# GitHub governance (config-as-code)

> Everything that lives on GitHub — labels, milestones, the Project v2
> board, epic + task issues, branch protection, repo settings — is
> committed as files in `.github/`. To change any of it, edit the file
> and re-run the relevant script. **Do not click around in the UI**
> for things tracked here; the next sync will overwrite your change.

## Why config-as-code

- **Reproducible**: a fresh contributor (or a forked repo, or a
  disaster-recovery rebuild) can rehydrate the whole project state
  with one command.
- **Auditable**: every label tweak shows up as a normal PR with a
  diff, an author, a review.
- **Trustworthy**: if the GitHub UI drifts, the next `sync-*` run
  pulls it back to the YAML.

## File map

```text
.github/
├─ labels.yml              # all repo labels
├─ milestones.yml          # all milestones
├─ issues/
│  ├─ epics.yml            # 10 epic tracking issues (one per milestone)
│  ├─ v0.1-tasks.yml       # 12 fine-grained v0.1 issues
│  └─ v0.2-tasks.yml       # 6 fine-grained v0.2 issues
├─ scripts/
│  ├─ package.json         # `yaml` is the only dependency
│  ├─ lib/
│  │  ├─ gh.mjs            # thin wrapper around the `gh` CLI
│  │  └─ yaml.mjs          # thin wrapper around the `yaml` package
│  ├─ sync-labels.mjs      # mirror labels.yml → GitHub
│  ├─ sync-milestones.mjs  # mirror milestones.yml → GitHub
│  ├─ bootstrap-repo.mjs   # repo settings + (optional) branch protection
│  ├─ bootstrap-project.mjs# create Project v2 + custom fields
│  └─ bootstrap-issues.mjs # create epics + tasks; wire into project
└─ workflows/
   ├─ label-sync.yml       # CI-side runner for sync-labels (PR #5)
   └─ …                    # see ci.yml, commitlint.yml, etc. (PR #5)
```

## Prerequisites

- **Node 20+** on your machine.
- **GitHub CLI (`gh`)** authenticated as a user with `repo` + `project`
  scope: `gh auth login --scopes "repo,project,read:org"`.
- One-time inside `.github/scripts/`:

  ```bash
  cd .github/scripts
  pnpm install   # or: npm install
  ```

  This pulls the only dependency (`yaml`) into a gitignored
  `node_modules/`.

## Common operations

### Edit a label

1. Edit `.github/labels.yml`.
2. Open a PR. Once it merges to `main`, the
   `label-sync` workflow (PR #5) mirrors the change automatically.
3. To apply locally without waiting for CI:

   ```bash
   cd .github/scripts
   node sync-labels.mjs              # create + update
   node sync-labels.mjs --prune      # also delete labels not in YAML
   ```

### Add or update a milestone

```bash
node .github/scripts/sync-milestones.mjs
```

### Bootstrap a fresh repo (one-time)

```bash
cd .github/scripts
node bootstrap-repo.mjs           # topics, discussions, merge defaults
node sync-labels.mjs
node sync-milestones.mjs
node bootstrap-project.mjs        # creates "Lattice — Roadmap" Project v2
node bootstrap-issues.mjs         # creates epics + v0.1 + v0.2 tasks
node bootstrap-repo.mjs --apply-protection  # only after CI has run once
```

### Re-create the Project v2 board after deleting it

The Project v2 board lives outside the repo. If it's deleted, restore
it with:

```bash
rm .github/scripts/.project-state.json   # drop cached IDs
node .github/scripts/bootstrap-project.mjs
node .github/scripts/bootstrap-issues.mjs
```

The issue YAMLs are append-only sources of truth — `bootstrap-issues.mjs`
detects existing issues by title and won't create duplicates.

### Add a new issue type to the system

1. If it's a one-off, just open the issue in the UI.
2. If it's a tracked task that other scripts will key off, add it to
   `.github/issues/v0.X-tasks.yml`, then re-run
   `node .github/scripts/bootstrap-issues.mjs`.

## State file: `.project-state.json`

`bootstrap-project.mjs` writes `/.github/scripts/.project-state.json`
containing the Project v2 node ID, project number, and a map of
field/option IDs. **This file is gitignored** because it's a cache,
not a source of truth — re-running the bootstrap from a fresh clone
re-creates it. `bootstrap-issues.mjs` reads it to know which Project
to attach issues to and which option IDs to set on each item.

## Branch protection — when to apply

`bootstrap-repo.mjs --apply-protection` requires the **exact** CI
check names. Those names only exist after the first run of
`.github/workflows/ci.yml` (PR #5) on a PR. So the order is:

1. Merge PR #5 (CI workflows).
2. Open any subsequent PR — the `ci / meta` and `commitlint` checks
   appear in the Checks tab.
3. Run `node .github/scripts/bootstrap-repo.mjs --apply-protection`.

Required checks initially: **`ci / meta`** and **`commitlint`**.
The `frontend (*)` and `rust (*)` jobs are added to the required
list once the v0.1 monorepo scaffold lands (tracked by the
"ci(repo): tighten CI baseline once monorepo scaffolds" v0.1 issue).

## Drift detection

The `label-sync.yml` workflow (PR #5) runs `sync-labels.mjs` on every
push to `main` that touches `.github/labels.yml`. There's no
corresponding `milestone-sync` workflow yet — milestones are stable
enough that running the script by hand is fine. We'll add it if
milestone churn becomes a thing.

## Troubleshooting

- **`gh` returns 403 on Project v2 calls** — your token lacks the
  `project` scope. Run `gh auth refresh --scopes "repo,project,read:org"`.
- **A label sync is creating a duplicate** — the name comparison is
  case-sensitive. Check the YAML for case drift.
- **Milestone sync fails with 422** — the milestone title likely
  contains characters GitHub rejects (e.g., leading/trailing
  whitespace). Trim and retry.
- **Project board has missing field options** — re-run
  `bootstrap-project.mjs`; it adds missing options idempotently.
- **Issue body has a stray `<!-- AUTO:CHILDREN -->`** — that epic had
  no child issues at script time. Add a child to the relevant
  `v0.X-tasks.yml` and re-run `bootstrap-issues.mjs`, or remove the
  marker manually if the epic genuinely has no children.

## When to change this doc

This file is itself part of the contract. Update it whenever you:

- Add a new YAML config under `.github/`.
- Add a new script under `.github/scripts/`.
- Change the required CI check names for branch protection.
- Change the Project v2 field set.
