# How to triage a bug

> Turning a fresh `type/bug` issue into a tracked, scoped, owned
> piece of work. The mechanics live behind `gh`; the discipline is
> in this page.

## When to do it

You're a maintainer (or a `help wanted` contributor) reviewing the
[`status/needs-triage`](https://github.com/goldr0g3r/lattice/issues?q=is%3Aopen+label%3Astatus%2Fneeds-triage)
queue. A new issue showed up; before anyone can fix it, somebody has
to:

- Confirm the bug exists.
- Categorise it (area, priority, size).
- Tie it to a milestone.
- Move it onto the Project board.

## The triage flow

### 1. Read the issue all the way through

Don't skim. The reporter wrote the issue once; you reading it
once is the cheapest possible step.

Look for:

- A clear **steps to reproduce**.
- The **expected vs actual** behaviour.
- The **environment** — OS, Lattice version, vault size.
- A **log snippet** or stack trace if it's a crash.

If anything is missing, that's the first triage outcome — comment
asking for the missing info, label `status/needs-triage`,
move on.

### 2. Reproduce

Try to reproduce locally. Three outcomes:

- **You reproduce it.** Move on to step 3.
- **You can't reproduce it.** Comment with what you tried, ask
  the reporter for more details, label `status/needs-triage`.
- **It's a "user error" / "by design"**. Politely explain, link to
  the relevant doc / ADR / vision page, close the issue. Be kind
  — they took the time to file.

### 3. Apply the labels

Three labels minimum (the taxonomy is in
[`.github/labels.yml`](../../.github/labels.yml)):

- **`type/*`** — almost always `type/bug` for incoming issues; some
  reclassify to `type/feature` or `type/task` after reading.
- **`area/*`** — pick one. `area/editor`, `area/search`,
  `area/graph`, `area/ai`, `area/sync`, `area/mobile`, `area/ui`,
  `area/ux`, `area/ci`, `area/docs`, `area/core`, `area/sdk`,
  `area/bookmarking`, `area/engineering-ml`.
- **`priority/*`** — be honest:

  | Label         | Meaning                                             |
  | ------------- | --------------------------------------------------- |
  | `priority/p0` | Drop everything — blocks a release or breaks users. |
  | `priority/p1` | High priority — needed for the next milestone.      |
  | `priority/p2` | Medium — should land within 1–2 milestones.         |
  | `priority/p3` | Low — nice to have / whenever.                      |

Optionally:

- **`size/*`** — T-shirt size (xs / s / m / l / xl). Set this when
  it'll help an owner pick up the issue.
- **`good first issue`** — small scope, clear acceptance, no
  arcane context required.
- **`help wanted`** — the maintainers' hands are full; community
  help would land it sooner.

Use the GitHub UI or the CLI:

```bash
gh issue edit 142 \
  --add-label "type/bug,area/editor,priority/p1,size/m" \
  --remove-label "status/needs-triage" \
  --add-label "status/ready"
```

### 4. Tie it to a milestone

If the bug blocks a release, set its milestone to the appropriate
`v0.X` from
[`.github/milestones.yml`](../../.github/milestones.yml):

```bash
gh issue edit 142 --milestone "v0.1 — Foundation"
```

If it's a `priority/p3` "whenever" item, leave the milestone
unset.

### 5. Move it onto the Project board

The `bootstrap-issues.mjs` script does this for newly-created
issues. For an issue already in the repo:

```bash
gh project item-add <project-number> --owner goldr0g3r --url <issue-url>
```

…or use the GitHub UI's "Projects" sidebar.

The Project's auto-set fields (Status, Milestone) come from the
issue's labels and milestone. Custom fields (Area, Priority, Size)
are also auto-set from the labels by `bootstrap-issues.mjs`; if you
edit labels, the fields refresh on the next sync run. Background
in [`../development/github-governance.md`](../development/github-governance.md).

### 6. Comment with the disposition

Close the loop with the reporter. Three flavours:

**Triaged, no immediate work** —

> Triaged as `priority/p2`, `area/editor`, scoped to v0.3. We'll
> fix it before search ships. Thanks for the clear repro!

**Triaged, ready for an owner** —

> Triaged as `priority/p1`, `area/core`, `size/s`. This is a
> [`good first issue`](https://github.com/goldr0g3r/lattice/labels/good%20first%20issue) — happy to mentor someone through the
> fix; comment if interested.

**Closed as not-a-bug** —

> Closing — this is intentional behaviour, locked by [ADR-0010](../decisions/0010-design-tokens-and-typography.md)
> on the design-token system. If you'd like a `--high-contrast` theme,
> open a `type/feature` issue and we'll consider it for v1.0
> accessibility.

Be specific. Link the ADR, the doc, the related issue, the PR.

## When the issue should become several issues

Some bugs are actually three bugs in a trench coat. If the report
is "search is broken on Linux and the AI panel crashes and the
sidebar doesn't render", split:

```bash
gh issue edit 142 --title "[Tracking] Multiple v0.3 regressions on Linux"
# add label `type/task`, leave the original
gh issue create --title "fix(search): query parser crashes on Linux" --body "Spun out of #142. …"
gh issue create --title "fix(ai): panel crash on cold start" --body "Spun out of #142. …"
gh issue create --title "fix(ui): sidebar empty on first render" --body "Spun out of #142. …"
```

Cross-link them. The original becomes a tracking issue with three
bullet checkboxes pointing at the spin-outs.

## When to close vs keep open

**Close** when:

- The behaviour is intentional and documented.
- The bug is a duplicate of an open issue (link the duplicate).
- The reporter says they no longer hit the bug.
- A subsequent release fixes it (verify before closing).

**Keep open** when:

- The bug is real but the fix isn't immediate.
- A workaround is documented but the root cause isn't addressed.
- It's tracking a longer-term effort.

Don't close issues just because they're old; closing an old
unfixed bug doesn't fix the bug. Re-triage stale ones with the
[`stale.yml` workflow](../../.github/workflows/stale.yml) doing the
politeness scaffolding.

## Common issues

### Two issues with the same root cause

Comment on the newer one: "Duplicate of #N. Closing in favour of
the older issue. Subscribe there for updates." Close the
duplicate. Move the newer issue's specific repro into the
older issue's body or as a comment.

### A reporter is hostile or unreasonable

Stay polite. The
[`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) governs the
interaction. If it crosses the line, lock the issue (`gh issue lock
142 --reason off-topic` or via UI) and escalate via the project's
moderation channel.

### A bug is also a security issue

**Don't** continue triaging in public. Comment privately if
possible, or DM the reporter and direct them to
[`SECURITY.md`](../../SECURITY.md)'s private vulnerability
reporting flow. Then close the public issue with a neutral comment
("Following up privately"). The Security Advisory takes over.

### Triage backlog grows

Once a week, sweep the
[`status/needs-triage`](https://github.com/goldr0g3r/lattice/issues?q=is%3Aopen+label%3Astatus%2Fneeds-triage)
queue. The longer issues sit untriaged, the more new contributors
infer (correctly or not) that the project doesn't care.

## References

- [`.github/labels.yml`](../../.github/labels.yml) — full label
  taxonomy.
- [`.github/milestones.yml`](../../.github/milestones.yml) — milestone
  definitions.
- [`../development/github-governance.md`](../development/github-governance.md)
  — labels, milestones, the Project board as code.
- [`../../CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) — the
  interaction rules.
- [`../../SECURITY.md`](../../SECURITY.md) — the security-issue
  escalation path.
