# How to cut a release

> A maintainer's checklist for cutting `vX.Y.Z`. Pairs with the
> conceptual page at
> [`../development/release-process.md`](../development/release-process.md);
> this is the literal, copy-pasteable flow.

## When to do it

You're a maintainer and:

- A milestone is feature-complete and CI is green.
- A patch release is needed for a regression on a previously
  published tag.

## Pre-release checklist

Before you start, confirm:

- [ ] `main` is green — no failing CI on the last commit.
- [ ] The Project board for the milestone has zero open
      `priority/p0` or `priority/p1` issues. Move them out or fix.
- [ ] The criterion bench artifact for the last commit is within
      budget — see
      [`../development/performance.md#the-regression-gate`](../development/performance.md#the-regression-gate).
- [ ] No security advisories are awaiting a fix.
- [ ] `CHANGELOG.md` `[Unreleased]` accurately reflects the
      shipping behaviour.

## Steps

### 1. Branch off `main`

```bash
git checkout main && git pull --ff-only
git checkout -b release/v0.1.0
```

### 2. Bump the three version files

Versions live in three places — they must move in lockstep:

```bash
# package.json (root)
#   "version": "0.1.0"
# Cargo.toml (root)
#   [workspace.package]
#   version = "0.1.0"
# apps/desktop/src-tauri/tauri.conf.json
#   "version": "0.1.0"
```

A quick verification:

```bash
rg '"version":' package.json apps/desktop/src-tauri/tauri.conf.json
rg 'version = ' Cargo.toml | head -3
```

All three should show the new version.

### 3. Promote the changelog

Edit [`../../CHANGELOG.md`](../../CHANGELOG.md):

```markdown
## [Unreleased]

(empty for now)

## [0.1.0] — 2026-MM-DD

### Added

- (everything that was in [Unreleased])
```

Add today's date in `YYYY-MM-DD`. Sort entries within each section
alphabetically by feature area for skimmability.

If a release fixes a CVE or other security issue, add a `### Security`
section and reference the GitHub advisory by URL.

### 4. Commit

```bash
git add -A
git commit -m "chore(release): v0.1.0"
```

### 5. Open the release PR

```bash
git push -u origin release/v0.1.0
gh pr create --title "chore(release): v0.1.0" --body "$(cat <<'EOF'
## Summary
- Bump versions in lockstep across `package.json`, `Cargo.toml`, `tauri.conf.json`.
- Promote `CHANGELOG.md` `[Unreleased]` to `[v0.1.0]` with today's date.

## Test plan
- [x] CI green on `main`.
- [x] Bench artifact within budget vs `main` baseline.
- [x] Manual smoke test on Windows + Linux: open vault, create note, save, reopen.

Closes <milestone tracking issue if any>.
EOF
)"
```

Branch protection requires reviews + green CI before merging the
release PR; **don't** `gh pr merge --admin` it.

### 6. Tag once the PR is merged

After the squash-merge:

```bash
git checkout main && git pull --ff-only
git tag -a v0.1.0 -m "Lattice v0.1.0 — Foundation"
git push origin v0.1.0
```

Tag annotation message: `Lattice <version> — <milestone name>`.
Match the milestone name from
[`.github/milestones.yml`](../../.github/milestones.yml).

### 7. Watch the release workflow

`.github/workflows/release.yml` triggers on tag push. Once the
v0.1 implementation lands, it builds artifacts for Windows + Linux,
signs them, and creates a draft GitHub Release. Watch from:

```bash
gh run watch
```

(Pre-v0.1 the workflow is a placeholder; the maintainer cutting
v0.1 implements the workflow as part of the milestone.)

### 8. Review and publish the draft Release

When the workflow finishes:

1. Open the draft Release in the GitHub UI (or `gh release view
v0.1.0 --web`).
2. Review the auto-generated notes; tweak prose if needed (the
   intent is "what changed, why does the user care").
3. Confirm artifacts are present (Windows `.msi`, Linux AppImage +
   `.deb`, etc.).
4. Click **Publish Release**.

### 9. Post-release tasks

- [ ] Close the milestone in
      [`.github/milestones.yml`](../../.github/milestones.yml) by
      setting `state: closed`, then run `node
.github/scripts/sync-milestones.mjs`.
- [ ] Update the Project board: move closed issues to "Done".
- [ ] Announce — Hacker News post, social media, project Discord
      (when those exist).
- [ ] Open the next milestone if not already open.

## Hot-fix releases

A regression on `v0.X.Y` that can't wait for `v0.(X+1).0`:

```bash
# Branch from the tag, not from main
git checkout -b hotfix/v0.X.Y v0.X.0

# Cherry-pick the fix from main, or fix in place
git cherry-pick <sha>

# Bump just the patch number; promote CHANGELOG entry under [v0.X.Y]
$EDITOR package.json Cargo.toml apps/desktop/src-tauri/tauri.conf.json CHANGELOG.md

git commit -am "chore(release): v0.X.Y"
git push -u origin hotfix/v0.X.Y

# Open a PR; once merged, tag from the merged main:
git tag -a v0.X.Y -m "Lattice v0.X.Y — <regression> hotfix"
git push origin v0.X.Y
```

If the fix isn't already in `main`, open a follow-up PR
cherry-picking it back.

## Roll-back

A bad release that's already published:

1. **Don't delete the tag.** Mark the GitHub Release as a
   "Pre-release" or add a "DO NOT INSTALL" banner instead.
2. Cut a `v0.X.(Z+1)` patch fix.
3. Update the auto-update manifest to point new installs at
   `v0.X.(Z+1)`. Existing installs auto-update on next launch.
4. Add a CHANGELOG note under `[v0.X.Z]` flagging the regression
   and the patch.

## Common issues

### "Tag already exists"

You re-pushed a tag that's already published. Don't force-push;
cut a `v0.X.(Z+1)` patch instead. Tags are permanent references.

### Branch protection blocks the merge

That's the system working — get a review and let CI pass. The
release PR is not special; it goes through the same gates as
any other PR.

### `commitlint` rejects "chore(release): v0.1.0"

It shouldn't — `chore` is in the allowed types and `release` is in
the allowed scopes
([`commitlint.config.cjs`](../../commitlint.config.cjs)). Re-check
the message format. The colon must follow the closing paren, not
the type.

### CI step references a different version

You bumped only one of the three version files. Run `rg '0.1.0' --
ROOT_PATH` to find drift; bump the missing file.

### Auto-update manifest didn't refresh

The `updater.endpoints` URL is what installed apps poll on launch.
If the manifest update failed in the workflow, fix and re-run; old
installs see the older version until the manifest catches up.

## References

- [`../development/release-process.md`](../development/release-process.md)
  — release process at the conceptual level.
- [`../../CHANGELOG.md`](../../CHANGELOG.md) — Keep a Changelog 1.1.0.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
  — the release workflow (placeholder pre-v0.1).
- [Tauri 2 updater plugin](https://v2.tauri.app/plugin/updater/) —
  signing + manifest format.
- [Conventional Commits](https://www.conventionalcommits.org/) —
  `chore(release):` PR title.
