# HOME-001 — Workspace Home (`/`)

Task pack for building OpenFoundry's `/` home, visually aligned with Foundry's Compass. Designed to be executed step by step in a single session: context + references + spec + atomic tasks + prompt + DoD.

## 1. Context

- **Route:** `/`
- **Current component:** [apps/web/src/routes/Home.tsx](../../apps/web/src/routes/Home.tsx) (164 lines, migration scaffolding: header strip + 4 KPI cards + routes table + Recent + Environment).
- **Parent shell:** [apps/web/src/lib/components/AppShell.tsx](../../apps/web/src/lib/components/AppShell.tsx), with [Sidebar](../../apps/web/src/lib/components/Sidebar.tsx) and [Topbar](../../apps/web/src/lib/components/Topbar.tsx).
- **Token system:** `.of-*` classes and `--*` variables in [apps/web/src/styles/app.css](../../apps/web/src/styles/app.css). All work must use `of-page`, `of-panel`, `of-toolbar`, `of-button`, `of-input`, `of-table`, `of-chip`, `of-heading-xl/lg/md/sm`, `of-eyebrow`, `of-text-muted` and variables `var(--text-strong)`, `var(--border-subtle)`, `var(--status-success)`, etc. **Do not introduce hardcoded new colors or spacings.**
- **Inventory status:** [HOME-001 in the blueprint](../frontend-ui-flow-blueprint.md) marks it as `Partial / P0` — the screen exists but does not replicate Foundry's Compass pattern and target components (`ResourceTable`, `ActivityPanel`, `QuickActions`) are missing.

## 2. Visual Reference

Foundry doesn't have a single "home"; the closest equivalent to `/` is the **Compass** screen, which mixes "Data Catalog" with a space selector (Portfolios / Projects / Your files / Shared with you).

| Screenshot | Local path | What to look at |
|---|---|---|
| Compass Overview | [docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Overview_assets/img_001.png](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Overview_assets/img_001.png) | Full layout: left icon rail, top strip, Quick filters tabs, 3 promotional banners, search + facets, main table with FILE NAME / LAST MODIFIED / TAGS / PORTFOLIO. |
| Compass Data Catalog | [docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Data Catalog_assets/img_001.png](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Data%20Catalog_assets/img_001.png) | Clean header pattern: space tabs on top, large title + sub-tabs (Collections/Files), right-side action (Request data + `+ New`), compact NAME / FILES table. |
| Project navigation panel | [docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Use Project navigation panel_assets/img_001.png](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Use%20Project%20navigation%20panel_assets/img_001.png) | For the project sub-rail we'll reuse in `PROJECT-002`. Informational only here. |

**Pattern reading (what we take for `/`):**

1. **Spaces header** (top strip): horizontal tabs `Portfolios | Projects | Your files | Shared with you` with icons. No gradients, white background, bottom separator `1px solid var(--border-subtle)`. `Manage spaces ⚙️` button at the right edge.
2. **Title row**: large H1 (view title) + inline `Collections | Files` sub-tabs + right-side action cluster (`Request data` secondary + `+ New` primary green).
3. **Left filters rail** (in Overview): collapsible block Filters > Types > Status > Portfolios > Projects > Tags > Organizations.
4. **Banner row** (in Overview): 3 horizontal cards for Portfolios / Projects / Promoted items, each with a title, short description, `Apply` link and `Hide`.
5. **Main table**: thin rows with icon+name, auxiliary columns (LAST MODIFIED, TAGS chips, PORTFOLIO chip).

**Adaptation to OpenFoundry** (Foundry's spaces don't apply literally — we're a generic workspace):

- Space tabs → `Recent | Pinned | Shared with you | Trash` (local tabs of the home, not a rail).
- Collections/Files sub-tabs → `Resources | Activity` (local tabs of the home).
- Primary `+ New` → dropdown menu with `New project / New dataset / New pipeline / Upload data`.
- Banners → keep only ONE optional banner ("Welcome / Quick start") with a close button; the `Hide` is real.
- Left filters rail → DO NOT replicate literally on `/`; that lives in `/datasets` and `/projects`. On home, only small facets inside the search bar.

## 3. Target Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Sidebar       │  Topbar (breadcrumbs · branch · share · save · user)       │
│  (existing)    ├────────────────────────────────────────────────────────────┤
│                │  [SpacesTab] Recent · Pinned · Shared · Trash    Manage ⚙ │
│                ├────────────────────────────────────────────────────────────┤
│                │  H1: Workspace                          Request data  [+ New ▾]│
│                │  Sub-tabs: Resources · Activity                            │
│                ├────────────────────────────────────────────────────────────┤
│                │  ┌─ KPI ─┐ ┌─ KPI ─┐ ┌─ KPI ─┐ ┌─ KPI ─┐                  │
│                │  │ 56    │ │ 8     │ │ 24    │ │ 3     │                  │
│                │  │ Resour│ │ Builds│ │ Object│ │Branch │                  │
│                │  └───────┘ └───────┘ └───────┘ └───────┘                  │
│                ├────────────────────────────────────────────────────────────┤
│                │  ┌──────────────────────────────────┐  ┌──────────────┐   │
│                │  │ Resources         [search] [⋮]   │  │ Activity     │   │
│                │  │ ┌──────────────────────────────┐ │  │ • event 1    │   │
│                │  │ │ Name | Path | Owner | Status │ │  │ • event 2    │   │
│                │  │ │ ...                          │ │  │ • event 3    │   │
│                │  │ └──────────────────────────────┘ │  ├──────────────┤   │
│                │  │ Pagination · 1–10 of 56          │  │ Quick start  │   │
│                │  └──────────────────────────────────┘  │ • Project    │   │
│                │                                        │ • Dataset    │   │
│                │                                        │ • Pipeline   │   │
│                │                                        ├──────────────┤   │
│                │                                        │ Environment  │   │
│                │                                        │ Branch master│   │
│                │                                        └──────────────┘   │
└────────────────┴────────────────────────────────────────────────────────────┘
```

Regions (top to bottom):

1. **L0 Spaces strip** — new, inside the `<section className="of-page">`. Horizontal tabs with a bottom border and a right-side `Manage spaces` button.
2. **L1 Title row** — H1 + local sub-tabs + right action cluster (`Request data` secondary + `+ New` primary with a menu).
3. **L2 KPI ribbon** — 4 thin cards with `of-panel`. Reuses what the current Home already has but adjusts sizes (number `var(--text-strong)`, eyebrow on top).
4. **L3 Two-column grid** —
   - Left column (~2/3): `Resources` card with header (title + search + menu) and a compact `of-table`.
   - Right column (~1/3): stack of `Activity`, `Quick start`, `Environment` cards.
5. **L4 (future)** — the Compass row of promotional banners is NOT built in this slice; noted as a follow-up.

## 4. Component Plan

| Component | Status | Decision |
|---|---|---|
| `AppShell` / `Sidebar` / `Topbar` | Exists | Do not touch in this slice. |
| `SpacesTab` | Does NOT exist | Inline in `Home.tsx` for now — just 4 static tabs, no extraction. We'll extract when it repeats in another screen. |
| `KpiCard` | Does NOT exist | Inline in `Home.tsx`. The current form is already good, just adjust size and eyebrow. |
| `ResourceTable` | Does NOT exist (target in the blueprint) | **Do not create the primitive here.** Implement the home table as local JSX in `Home.tsx` following `of-table`. Extraction comes in `DATASET-001` or a refactor task. |
| `ActivityList` | Does NOT exist | Inline. Mock items for now (icon + action + timestamp). |
| `QuickStartCard` | Does NOT exist | Inline. List of 3-4 actions linking to `/projects`, `/datasets`, `/pipelines`. |
| `EnvironmentCard` | Already inline | Reuse. |

Rule: **no shared primitives are to be extracted in this slice.** The goal is to close the `/` visual; primitives are extracted when they appear in the 2nd/3rd screen.

## 5. Atomic Tasks

Each task is small enough to do in one focused turn.

- [ ] **T1** Remove the `MIGRATED_ROUTES` array from `Home.tsx` (debug). Replace with a small `DEFAULT_RESOURCES` constant with 8-12 mock entries reflecting what a real user would see (projects, datasets, pipelines, dashboards).
- [ ] **T2** Implement **L0 Spaces strip** with 4 tabs (`Recent`, `Pinned`, `Shared with you`, `Trash`). Active tab via local state `useState<'recent'|'pinned'|'shared'|'trash'>('recent')`. `Manage spaces ⚙️` button on the right (linking to `/settings` for now). Styling: bottom border `1px solid var(--border-subtle)`, padding `8px 0`, gap between tabs.
- [ ] **T3** Implement **L1 Title row**: H1 `Workspace` with `of-heading-xl`, `Resources | Activity` sub-tabs with local state, and right-side cluster with `Request data` (`of-button`) + `+ New ▾` (`of-button of-button--primary`). The `+ New` menu can be a native `<details>` or a simple `position:absolute` for now; it opens a list with `New project`, `New dataset`, `New pipeline`, `Upload data`, each linking to the corresponding route.
- [ ] **T4** Refine **L2 KPI ribbon**: keep the current 4-card grid but bump the number to `font-size: 28px; font-weight: 600` and add microcopy below the number (e.g. "↑ 12% week over week" in muted). Keep `of-eyebrow` at the top.
- [ ] **T5** Implement **L3 left — Resources card**: header with title + search input + three-dot menu (placeholder). `of-table` with columns `Name | Path | Owner | Last modified | Status`. Rows come from `DEFAULT_RESOURCES`. Status renders as `of-chip` (success / warning / info depending on mock value). Footer with "1–10 of 56" + dummy pagination (disabled buttons if N=10).
- [ ] **T6** Implement **L3 right**: three stacked cards with `of-panel`:
  - `Activity` — list of 4-6 mock items with icon, text, relative timestamp. Each item is a flex row with a subtle top border `1px solid var(--border-subtle)`.
  - `Quick start` — 4 links: New project, New dataset, New pipeline, Browse marketplace.
  - `Environment` — what's already there (Branch / Ontology / Access / Build health).
- [ ] **T7** Visual check: bring up the dev server, open `/`, compare against the [Compass Overview screenshot](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Overview_assets/img_001.png) and the [Data Catalog screenshot](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Data%20Catalog_assets/img_001.png). Note visible discrepancies (spacing, alignment, type hierarchy). Iterate T2-T6 until closed.

## 6. Implementation Prompt

Paste this prompt into a fresh Claude Code session (or use it as explicit guidance for the current session):

```
Task: implement HOME-001 (workspace home `/`) following docs/tasks/HOME-001.md.

Critical context:
- File: apps/web/src/routes/Home.tsx
- Token system: of-* classes and --* variables in apps/web/src/styles/app.css. DO NOT use
  hardcoded colors, DO NOT invent new spacings outside the token system.
- Visual references (read both images before starting):
  - docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Overview_assets/img_001.png
  - docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Data Catalog_assets/img_001.png
- Target layout: see "Target Layout" section in docs/tasks/HOME-001.md.

Rules:
- DO NOT create new shared components in this slice. Everything inline in Home.tsx.
- DO NOT touch Sidebar, Topbar, AppShell, or the router.
- Mock data allowed — no real backend fetches.
- Use existing of-* classes; if a required class doesn't exist, add it to
  apps/web/src/styles/app.css following the pattern of the others (don't break the system).

Steps: run T1..T7 from docs/tasks/HOME-001.md in order, marking each as
done in the todo list. After T7, bring up the dev server and report
visible discrepancies vs the screenshots.

Definition of done: see "Definition Of Done" section of the task pack.
```

## 7. Definition Of Done

- [ ] `/` renders the 5 regions: Spaces strip, Title row, KPI ribbon, Resources card (left), right column (Activity + Quick start + Environment).
- [ ] The 4 Spaces tabs are clickable and the active one changes style (no need to load different content in this slice — only the active style).
- [ ] The `Resources | Activity` sub-tabs toggle which left column is shown.
- [ ] The `+ New ▾` button opens a menu with 4 actions linking to the correct routes.
- [ ] Zero inline styles with hardcoded colors; all via `of-*` classes and `var(--*)` variables.
- [ ] No new external UI library imports. No shared component extracted.
- [ ] The layout doesn't break at `1280×800` or `1920×1080` viewports (real Foundry targets >=1280).
- [ ] Visual diff vs the Compass Data Catalog screenshot: type hierarchy and density match by eye (not pixel-perfect, but "feels" Foundry).
- [ ] No regressions on other routes: `/datasets`, `/projects`, `/pipelines` still mount under the same shell.
- [ ] Commit pending, suggested message: `feat(web/home): mirror Compass workspace landing for HOME-001`.

## 8. Follow-ups (not in this slice)

- **HOME-002**: promotional banner row (Portfolios / Projects / Promoted items) like Compass Overview, with a real `Hide` in localStorage.
- **HOME-003**: when `Activity` exists in the backend (`GET /workspace/recents` already exists in `workspace.ts`), replace the mock with a real fetch with loading/empty/error.
- **HOME-004**: cmd+k command palette — `SEARCH-001` in the inventory.
- **Refactor extract**: when `ResourceTable` is needed for the 3rd time (probably `DATASET-001`), extract it from Home + Datasets to `lib/components/ResourceTable.tsx` with a prop API that serves both cases.

## 9. Notes For Other Sessions

- If the dev server won't come up: `pnpm --filter @openfoundry/web dev` from the root, or check `apps/web/package.json` for the actual script.
- If you need real recents data for T6: `apps/web/src/lib/api/workspace.ts` exports `listRecents()`. But **in this slice we use mock** to avoid coupling.
- If the spacer between the Topbar and the start of the Home content looks off: see `AppShell.tsx` — it's probably forcing a `padding-top` that conflicts with the new spaces strip. Resolve by moving the strip inside the existing padding, NOT by modifying AppShell.
