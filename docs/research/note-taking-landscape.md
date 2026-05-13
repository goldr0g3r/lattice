# Note-taking landscape (2026)

> A working map of the PKM (Personal Knowledge Management) tools
> Lattice will ship against. Updated as the market moves. Maintained
> for **Lattice** by `@goldr0g3r`.

## 0. Why this document exists

Before we write a single line of editor code, we need to be honest
about the field. Where is the market crowded? Where is it
under-served? Which feature combinations are no one else offering?
This file is the answer, and it is the **input** to
[`vision.md`](../vision.md) and every roadmap milestone.

## 1. How the market segments (2026)

The PKM space is no longer one category. We see five clusters:

| Cluster                | Bet                                                  | Examples                              |
| ---------------------- | ---------------------------------------------------- | ------------------------------------- |
| **Simple capturers**   | "Just remember everything; the app is invisible."    | Apple Notes, Bear, Google Keep        |
| **Power builders**     | "Build your own knowledge base; we give you blocks." | Notion, Craft, Capacities, ClickUp    |
| **Networked thinkers** | "Link everything; the graph is the value."           | Obsidian, Logseq, Roam, Tana          |
| **AI-first**           | "The model is the interface."                        | Mem, Reflect, Saner.ai                |
| **Specialists**        | "We win one job; you ignore the rest."               | Joplin (sync), Standard Notes (E2EE), Anytype (P2P) |

Lattice deliberately sits **between Networked thinkers and AI-first**
with a strong **Specialists** flank on the engineer/ML axis. We
borrow Obsidian's "your files are yours" (Networked thinkers), Mem's
"AI over your vault" (AI-first), and Joplin/Standard-Notes' "we take
your data ownership seriously" (Specialists).

## 2. Per-product deep-dives

For each product: positioning, strengths, weaknesses, open-source
status, pricing, what we **learn** from them, and what we'll do
**differently**.

### 2.1 Obsidian

- **Positioning**: the gold-standard plain-Markdown PKM for individual
  power users.
- **Strengths**: local-first, plain `.md` files, ~2 000 community
  plugins, mature graph view, big community, Markdown round-trip is
  good (not perfect), free for personal use.
- **Weaknesses**: **closed-source**, freemium sync ($10/mo) and
  publishing ($20/mo) are the business model; AI is community-plugin
  only (no first-class story); editor is OK but not block-modern;
  mobile is functional but not first-class; vendor lock-in is
  emotional, not technical — but it exists.
- **Open source?** **No.** Free-as-in-beer for individuals. Closed
  business model.
- **Pricing**: free personal; $50/yr Catalyst; $10/mo Sync; $20/mo
  Publish; $50/yr Commercial.
- **What we learn**: the "files-on-disk" promise is the wedge that
  beats Notion; community plugins make or break the platform;
  Markdown round-trip is non-negotiable.
- **What we do differently**: ship as **open source** under AGPL
  ([ADR-0007](../decisions/0007-agpl-3-license.md)) so the trust line
  isn't "we promise"; **AI-native** with both cloud-BYO and Ollama;
  **engineer/ML-first blocks** (Dataset, Model, Experiment, Citation);
  Tauri 2 shell so we're 10× smaller than Obsidian's bundled Electron.

### 2.2 Notion

- **Positioning**: the all-in-one workspace for teams; "Lego for
  documents".
- **Strengths**: best-in-class block editor, beautiful UI, strong
  team-collaboration features, slash commands invented here, public
  pages, embed-anything.
- **Weaknesses**: **cloud-only** (offline mode is read-mostly and
  unreliable); proprietary block DB — export is lossy; performance
  degrades hard past 10 k pages; AI is a paid add-on; **not yours**
  in any meaningful sense (your data lives on Notion's servers).
- **Open source?** **No.** SaaS.
- **Pricing**: free personal (with limits); $10/user/mo Plus;
  $15/user/mo Business; $25/user/mo Enterprise; +$10/user/mo AI.
- **What we learn**: block-based editing UX is the bar; slash commands
  are table-stakes; teams will pay for collaboration.
- **What we do differently**: **local-first**, **plain files**, the
  block editor is TipTap ([ADR-0003](../decisions/0003-tiptap-prosemirror-editor.md))
  serialising to Markdown on every save, AI included (not a $10/mo
  upsell), no account required to use the app.

### 2.3 Evernote

- **Positioning**: the old guard of "remember everything"; web
  clipping pioneer; still has ~225 M users on paper.
- **Strengths**: best-in-class web clipper, scanned-document OCR,
  decades-deep search, reminders, an existing army of users.
- **Weaknesses**: **stagnant for years**, multiple ownership changes,
  AI bolted on late, no real plugin story, performance complaints,
  pricing has crept up. Lost almost all its mindshare to Notion and
  Obsidian since 2018.
- **Open source?** **No.**
- **Pricing**: $14.99/mo Personal; $17.99/mo Professional;
  $24.99/mo Teams.
- **What we learn**: web clipping is a feature, not a wedge — it must
  be **excellent** if you have it, but it's not enough on its own;
  trust degrades quickly under ownership changes (a warning to any
  SaaS).
- **What we do differently**: bookmarking ships as a **browser
  extension** plus offline archive in v0.8, integrated tightly with
  the vault (clippings are just notes), not a separate product line.

### 2.4 Logseq

- **Positioning**: open-source, outliner-first, local plain files
  (Markdown or Org).
- **Strengths**: **open source (AGPL-3.0)**, local-first, outliner
  model loved by a vocal subset, queries (datalog) are powerful, free.
- **Weaknesses**: outliner-only — heavy users of regular Markdown find
  it awkward; performance issues on large graphs; Electron-based →
  big bundle, big memory; mobile is rough; AI is community plugins
  only; sync is a separate paid SaaS layer; pace of development has
  slowed.
- **Open source?** **Yes (AGPL-3.0).**
- **Pricing**: free; paid sync.
- **What we learn**: AGPL-3.0 is a viable license for a PKM; the
  outliner crowd is **real but niche** — we won't bet the company on
  it; queries are gold.
- **What we do differently**: **document + outline are both first-class**
  (TipTap blocks), Tauri 2 instead of Electron, query layer is SQL
  over DuckDB ([ROADMAP.md](../../ROADMAP.md) v0.9) instead of datalog
  for familiarity.

### 2.5 Joplin

- **Positioning**: the open-source "Evernote replacement" with
  end-to-end encrypted sync.
- **Strengths**: **open source (MIT)**, local SQLite + plain-file
  export, E2EE sync to your own backend (WebDAV, S3, Nextcloud,
  Dropbox, etc.), cross-platform, web clipper, very respectful of
  privacy.
- **Weaknesses**: editor is functional but feels dated (no slash,
  no block model, weak embeds); UI looks like 2015; community plugin
  ecosystem is small; no graph; no AI; mobile UX is rough.
- **Open source?** **Yes (MIT).** Sponsored by Joplin Cloud as a
  paid hosted option.
- **Pricing**: free; Joplin Cloud $2.99–$7.99/mo.
- **What we learn**: E2EE sync with BYO storage is a real wedge for a
  privacy-conscious sub-segment — Joplin owns this niche; the visual
  story matters and Joplin under-invests there.
- **What we do differently**: visual identity from day one
  ([ADR-0010](../decisions/0010-design-tokens-and-typography.md));
  modern block editor; first-class AI; engineer/ML-first blocks.

### 2.6 Reflect

- **Positioning**: "the AI-first daily-notes app for thinkers".
- **Strengths**: GPT-4-class AI baked deeply (chat with your notes,
  auto-tagging, structured prompts); polished daily-notes flow; clean
  visual design; backlinks done right.
- **Weaknesses**: **cloud-only**, **closed-source**, $10/mo, vendor
  lock-in, very small editor (no code-blocks-with-syntax, no real
  embeds), no mobile-Android (iOS-first), no plugins.
- **Open source?** **No.**
- **Pricing**: $10/mo.
- **What we learn**: AI-over-vault sells; thinkers will pay for it;
  Reflect's pricing tells you "it's a viable line item in 2026".
- **What we do differently**: **local-first AI** (Ollama path), **BYO
  key** for cloud (no vendor markup), open source, full block editor,
  Windows/Linux/Android.

### 2.7 Anytype

- **Positioning**: open-source, **P2P-first** all-in-one workspace —
  "Notion if Notion was yours".
- **Strengths**: open source (its own non-OSI license, "Any Source
  Available License" — moving toward OSI); end-to-end encrypted; P2P
  sync; objects/relations data model is closer to a graph DB than a
  doc.
- **Weaknesses**: **proprietary block DB on disk** — not Markdown
  files; very steep learning curve (objects+relations is not the
  mainstream mental model); performance was rough through 2024,
  improved in 2025; the license is novel and confusing for would-be
  contributors.
- **Open source?** **Source-available** under a custom license; OSI
  status is debated. Treat as semi-open.
- **Pricing**: free; paid features in development.
- **What we learn**: there's appetite for a **Notion-shaped tool that
  isn't a SaaS**; P2P sync is appealing but adoption is slow because
  it changes the user mental model.
- **What we do differently**: **plain Markdown on disk**
  ([ADR-0006](../decisions/0006-local-first-plain-markdown.md)) — the
  Anytype block DB is a non-starter for our "your files are yours"
  promise; sync is client-server CRDT ([ADR-0005](../decisions/0005-yrs-crdt-sync.md))
  not P2P for v1.

### 2.8 Bear

- **Positioning**: beautiful Markdown writing app for Apple.
- **Strengths**: gorgeous typography, fast, simple, native Apple
  Sync, loved for its tag-based organisation.
- **Weaknesses**: **Apple-only**, closed-source, $30/yr subscription,
  no block model, no AI, no plugins, no Linux/Windows/Android, no
  graph.
- **Open source?** **No.**
- **Pricing**: $30/yr.
- **What we learn**: writing aesthetics matter — Bear's typography
  attracts a serious subset of writers; tag trees are powerful.
- **What we do differently**: Lattice's design system
  ([ADR-0010](../decisions/0010-design-tokens-and-typography.md))
  treats typography as a feature, not an afterthought, and we ship
  on the platforms Apple users' colleagues actually use too.

### 2.9 Standard Notes

- **Positioning**: privacy-first, encrypted-everywhere notes; the
  "for when you're a journalist or a dissident" choice.
- **Strengths**: **open source (AGPL-3.0)**, end-to-end encrypted,
  long-term-archival mindset, multi-platform, principled stance on
  privacy.
- **Weaknesses**: the free tier is intentionally minimal (no rich
  editor, no tags, no themes without paying); paid tier is $90/yr
  Standard or $120/yr Professional; UI is functional but stark; no
  AI (philosophical objection); no graph.
- **Open source?** **Yes (AGPL-3.0).**
- **Pricing**: free (minimal); $90–$120/yr.
- **What we learn**: E2EE done right earns deep trust; pricing tiers
  that gate the rich editor are a turn-off — we won't do that.
- **What we do differently**: rich editor is free for everyone; E2EE
  applies to sync only (the local file is decrypted because we want
  `grep` and `git` to work); AI is opt-in but not philosophically
  refused.

### 2.10 Roam Research

- **Positioning**: the cult favourite that started the "block-based,
  bidirectional links" wave.
- **Strengths**: pioneered daily notes + block references + queries;
  vibrant power-user community; query language is uniquely
  expressive.
- **Weaknesses**: cloud-only, closed-source, **$15/mo**, performance
  has been a complaint for years, founder drama hurt the brand,
  largely lost mindshare to Logseq + Tana + Obsidian.
- **Open source?** **No.**
- **Pricing**: $15/mo Pro; $500 5-year Believer.
- **What we learn**: block-level references and transclusion are
  beloved features; pricing yourself above Notion needs the magic to
  match.
- **What we do differently**: block references via TipTap node IDs,
  not a Roam-style separate-storage block; pricing model is "free,
  forever" because of [ADR-0007](../decisions/0007-agpl-3-license.md).

### 2.11 Apple Notes

- **Positioning**: the default that's surprisingly good in 2026.
- **Strengths**: free, fast, well-integrated with iCloud, scribble
  support, scanning, password-protected notes, smart-folders by
  query.
- **Weaknesses**: Apple-only, no Markdown, weak export, no plugins,
  no AI vault chat, vendor lock-in (iCloud), no graph, no tagging
  beyond hashtags.
- **Open source?** **No.**
- **Pricing**: free with iCloud.
- **What we learn**: speed + integration with the OS share-sheet beats
  feature lists for the casual user; we won't out-Apple Apple on
  iCloud integration, but we **can** out-engineer them on the file
  format.
- **What we do differently**: not Apple's market in v1.0; if a casual
  user shows up we're polite, but the wedge is engineers, not the
  median iPhone owner.

### 2.12 Mem

- **Positioning**: "the self-organising AI workspace".
- **Strengths**: clever AI auto-tagging and connection-suggestions;
  beautiful onboarding; chat-with-your-notes was an early standout.
- **Weaknesses**: cloud-only, closed-source, very narrow editor
  (no real code, no math, no embeds), pricing $14.99/mo, has shifted
  positioning multiple times in two years, future is uncertain.
- **Open source?** **No.**
- **Pricing**: $10–$14.99/mo Mem X.
- **What we learn**: AI auto-tagging is **table stakes** as of 2026;
  users now expect "suggested tags" the way they expect spellcheck.
- **What we do differently**: AI suggestions are local-by-default
  (Ollama) for users who care; auto-tagging is a feature, not the
  product.

### 2.13 Craft

- **Positioning**: beautifully-designed block editor for individuals
  and small teams; "Notion if it cared about typography".
- **Strengths**: gorgeous UI, native Apple feel, strong block model,
  great public-page sharing, AI assistant integrated.
- **Weaknesses**: Apple-first (Windows is second-class, no Linux, no
  Android), cloud-required, closed-source, $5–$12/mo, no plugin
  ecosystem, no graph, no engineer/ML niche features.
- **Open source?** **No.**
- **Pricing**: free with limits; $5–$12/mo Plus; team tiers.
- **What we learn**: design quality is a moat; sharing-as-a-link is
  loved.
- **What we do differently**: cross-platform from day one
  (Windows+Linux+Android, with macOS later); plain files; open source.

### 2.14 Capacities

- **Positioning**: "object-based" PKM — every note is typed
  (person, book, project, dataset).
- **Strengths**: typed objects + relations are powerful for
  research; clean UI; daily notes; the data model is closer to
  what ML practitioners actually need than free-form Markdown is.
- **Weaknesses**: cloud-only, closed-source, $7.99–$19.99/mo,
  proprietary on-disk format, no graph view yet, small community,
  weak plugin story.
- **Open source?** **No.**
- **Pricing**: free; $7.99/mo Pro; team tiers.
- **What we learn**: **typed objects are the wedge** for the
  research/ML crowd — Capacities is on to something, but they pay
  for it with vendor lock-in and SaaS dependency.
- **What we do differently**: typed objects (Dataset, Model,
  Experiment, Citation) ship as **first-class blocks that round-trip
  through plain Markdown** ([ROADMAP.md](../../ROADMAP.md) v0.7), not
  as proprietary DB rows.

## 3. Comparison matrix

Coverage matrix for the dimensions we care about. ✅ = strong, 🟡 =
partial, ❌ = absent / weak / closed.

| Tool             | Local-first | Open source         | AI-native | Engineer/ML | Plugins | Time-travel | E2EE sync     | Linux | Android |
| ---------------- | ----------- | ------------------- | --------- | ----------- | ------- | ----------- | ------------- | ----- | ------- |
| Obsidian         | ✅          | ❌                  | 🟡        | 🟡          | ✅      | ❌          | 🟡 (paid)     | ✅    | ✅      |
| Notion           | ❌          | ❌                  | 🟡 (add-on)| ❌          | ✅      | 🟡          | ❌            | ✅    | ✅      |
| Evernote         | ❌          | ❌                  | 🟡        | ❌          | 🟡      | 🟡          | ❌            | ❌    | ✅      |
| Logseq           | ✅          | ✅ (AGPL-3.0)       | ❌        | 🟡          | ✅      | ❌          | 🟡 (paid)     | ✅    | 🟡      |
| Joplin           | ✅          | ✅ (MIT)            | ❌        | ❌          | 🟡      | 🟡          | ✅            | ✅    | ✅      |
| Reflect          | ❌          | ❌                  | ✅        | ❌          | ❌      | ❌          | 🟡            | ❌    | ❌      |
| Anytype          | ✅          | 🟡 (source-avail.)  | ❌        | ❌          | 🟡      | 🟡          | ✅ (P2P)      | ✅    | ✅      |
| Bear             | 🟡          | ❌                  | ❌        | ❌          | ❌      | ❌          | 🟡 (Apple)    | ❌    | ❌      |
| Standard Notes   | 🟡          | ✅ (AGPL-3.0)       | ❌        | ❌          | 🟡      | ❌          | ✅            | ✅    | ✅      |
| Roam             | ❌          | ❌                  | ❌        | ❌          | 🟡      | ❌          | ❌            | ✅    | ✅      |
| Apple Notes      | 🟡          | ❌                  | 🟡 (Apple Intel.) | ❌  | ❌      | ❌          | ✅ (iCloud)   | ❌    | ❌      |
| Mem              | ❌          | ❌                  | ✅        | ❌          | ❌      | ❌          | ❌            | ❌    | ❌      |
| Craft            | 🟡          | ❌                  | 🟡        | ❌          | ❌      | ❌          | 🟡            | ❌    | 🟡      |
| Capacities       | ❌          | ❌                  | 🟡        | 🟡 (typed)  | ❌      | ❌          | ❌            | ✅    | ✅      |
| **Lattice**      | **✅**      | **✅ (AGPL-3.0)**   | **✅**    | **✅**      | **✅**  | **✅**      | **✅**        | **✅**| **✅**  |

The cell where Lattice is the **only** ✅ across the row determines the
wedge. We're alone in: { local-first **and** open-source **and**
AI-native **and** engineer/ML-first **and** time-travel }.

## 4. What's missing from the market

Three gaps we can fill in v1.0:

1. **An open-source, local-first PKM that is genuinely AI-native.**
   Obsidian & Logseq are local-first and open-ish but AI is a plugin.
   Reflect & Mem are AI-first but cloud-only and closed. Nothing
   currently in the market combines AGPL + plain files + first-class
   AI panel + BYO-key + Ollama.

2. **A PKM that treats engineering / ML as a first-class workflow.**
   Capacities does typed objects but only in cloud-DB. Obsidian needs
   ~6 plugins to feel right for a researcher. None of the AI-first
   tools render `.ipynb`, do DOI lookups, or model an Experiment.

3. **Git-style time-travel on every note.** Almost no tool does this
   cleanly. Obsidian users hand-roll it with the Git plugin; Notion
   has version history but it's hard to query. A native, per-note
   diff/blame view is a feature nobody is leading on, and engineers
   are the audience most likely to actually want it.

These three gaps — call them **AI + engineer/ML + time-travel** —
plus the table-stakes baseline (local-first plain files, modern block
editor, great search, great mobile, open source) define the Lattice
wedge.

## 5. Risks the market sends us

- **Obsidian could open-source.** Unlikely (their business model
  depends on it), but if it happened our open-source axis collapses.
  Hedge: invest in the AI + engineer/ML + time-travel features so we
  don't rely solely on the open-source axis to differentiate.
- **A well-funded SaaS could clone us.** AGPL ([ADR-0007](../decisions/0007-agpl-3-license.md))
  closes the obvious loophole; brand and community do the rest.
- **The AI-first crowd could finally crack local LLM speed.** Good for
  us — that's exactly the bet our Ollama-first strategy makes.
- **PKM market fatigue.** Possible. The way out is to **earn one
  beachhead** (the engineer with 1 000 markdown notes) and let them
  pull the next persona behind them.

## 6. Citations & further reading

- Obsidian — official site and forum, 2026 plugin counts as listed at
  https://obsidian.md/plugins.
- Notion vs. Obsidian comparison roundup — *The Sweet Setup*, 2026.
- Joplin & Standard Notes — official documentation, license files.
- "State of PKM 2026" — awe.cool — segmentation map referenced for
  the cluster framing.
- "Local-first software" — Ink & Switch (Kleppmann et al.), 2019 —
  foundational paper for our category.
- Reflect launch and AI-feature breakdown — *Lifehacker*, 2024.
- Anytype 2.0 release notes (P2P sync + license).
- Logseq AGPL-3.0 LICENSE file — https://github.com/logseq/logseq.
- Capacities object model docs — https://docs.capacities.io.
- Bear iCloud-only architecture — Shiny Frog blog.
- Craft typography deep-dive — Craft blog, 2025.

## 7. Maintenance

This file is **append-only on substance** — if a product changes
materially we update the cell and add a note in the §6 citations log.
We do a full sweep at the start of every minor-version cycle.
