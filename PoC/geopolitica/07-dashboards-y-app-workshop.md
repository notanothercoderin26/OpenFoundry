# 07 — Dashboards and Workshop app

> All UIs in this PoC are **Foundry resource types** in customer-facing language: a **Workshop module** (the analyst workbench) and a **Quiver dashboard** (the static operational view at the start). They are configured, not coded: the JSON config is persisted by `application-composition-service`, branch-aware, and respects markings. OpenFoundry's `apps/web` renders them.

The graph view is **not** a separate product — it is an Object-Explorer-style widget embedded in the Workshop module. See [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md) for the constraint.

---

## 🧭 Two UI surfaces

| # | Foundry resource | What it is | Audience |
|---|---|---|---|
| 1 | **Quiver dashboard** — *"Geopolitical Operations — Live"* | Static-by-default operational picture: KPIs, last-72-h events map, top-15 most-active actors, last 5 raised alerts. Refreshes every 60 s. | Anyone who can log in (read-only) |
| 2 | **Workshop module** — *"Geopolitical Intel Workbench"* | Interactive analyst app: filter set, map, timeline, object table, **graph**, AIP chat, action buttons. | Sofía (analyst) + Marcos (compliance) |

---

## 1️⃣ Quiver dashboard — "Geopolitical Operations — Live"

The dashboard is opened by both personas at the start of the demo and is **the first thing the customer sees**. It must give the operational picture in 5 seconds.

### Layout (Quiver cards)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Geopolitical Operations — Live                            User: Sofía  ▼  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │ Events  │ │ Events  │ │  Alerts │ │   Open  │ │ Pipeline│  KPI strip     │
│ │ last24h │ │ last72h │ │ last24h │ │  Cases  │ │ status  │                │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│                                                                             │
│ ┌──────────────────────────────────────┐  ┌──────────────────────────────┐ │
│ │  Map: Events last 72 h               │  │ Top 15 most-active actors    │ │
│ │  (CAMEO quad-class color, density)   │  │ (table, sorted by event_30d) │ │
│ └──────────────────────────────────────┘  └──────────────────────────────┘ │
│                                                                             │
│ ┌──────────────────────────────────────┐  ┌──────────────────────────────┐ │
│ │  Timeline: events per hour (24 h)    │  │ Latest 5 ActorAlerts          │ │
│ │  (stacked by source: GDELT / ACLED)  │  │ + "Acknowledge" button        │ │
│ └──────────────────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Card-by-card (Foundry resources used)

| Card | Foundry resource | Backing object set | Action button |
|---|---|---|---|
| Events last 24 h / 72 h | KPI card over ontology object set count | `Event` filtered by `event_datetime_utc ≥ now() - 24h` (or 72h) | — |
| Alerts last 24 h | KPI card | `ActorAlert.raised_at_utc ≥ now() - 24h` | — |
| Open Cases | KPI card | `InvestigationCase.status = 'OPEN'` | — |
| Pipeline status | Data Health summary card | `health_check_state` aggregate | "Open Pipeline Builder" deep link |
| Map (events 72 h) | Map widget over `Event` | `Event.event_datetime_utc ≥ now() - 72h` | "Open in Workshop" deep link |
| Top 15 actors | Object Table | `Actor.event_count_30d` top 15 | "Open Actor in Workshop" |
| Timeline | Time-series chart | aggregate count(*) over `Event` stacked by `source` | — |
| Latest alerts | Object Table | `ActorAlert` last 5 | **Acknowledge** action button (UC-5) |

Branching caveat: the Quiver dashboard does **not** need to be modifiable on a branch (this is a public Foundry limitation — see [Workshop branching docs](https://www.palantir.com/docs/foundry/workshop/branching-rebasing/)). The branch demo in UC-6 targets the **Workshop module**, not Quiver.

---

## 2️⃣ Workshop module — "Geopolitical Intel Workbench"

The workbench is the heart of the demo. It is **configured**, not coded — the JSON config in `application-composition-service` declares widgets, variables, and bindings.

> The canonical declarative module is [`assets/workshop-module.json`](assets/workshop-module.json) (4 variables, 2 header widgets, 3 sections, button group with 3 confirmable Actions, vertex_graph_embed wired through a `vertexGraphRid` variable). Operator registers it via [`infra/scripts/poc-geopolitica/register-workshop-module.sh`](../../infra/scripts/poc-geopolitica/register-workshop-module.sh). The JSON is smoke-tested against `NormalizeAppContract` at `make test` (see `services/application-composition-service/internal/models/poc_workshop_smoke_test.go`), so drift breaks CI rather than the demo. The JSON wins on drift with this doc.

### Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Geopolitical Intel Workbench                       User: Sofía  ▼  Branch: main │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─── Filter bar ──────────────────────────────────────────────────────────┐ │
│ │ Country [UA▾] Date range [last 72 h▾] Actor kind [ALL▾] Sanctioned [☐] │ │
│ │ Search: ____________________   ▶ Apply                                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌──────────────────────────┐  ┌────────────────────────────────────────────┐ │
│ │  Map (events)            │  │  Timeline (events/hour)                    │ │
│ │  → click marker selects  │  │  → drag window narrows date filter         │ │
│ └──────────────────────────┘  └────────────────────────────────────────────┘ │
│                                                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Object Table — Actors matching current filter                           │ │
│ │  columns: display_name, kind, country, sanctioned, event_count_30d,…    │ │
│ │  → row click selects an Actor (drives Graph widget + Action buttons)    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────┐  ┌─────────────────────────────────────────┐ │
│ │  Graph widget               │  │  AIP Chat                               │ │
│ │  focus: selected Actor      │  │  "Summarize activity of selected actor" │ │
│ │  N-hop expansion, link-type │  │  → uses Object query tool on selection  │ │
│ │  filter, marking-aware      │  │  → can propose actions w/ confirmation  │ │
│ └─────────────────────────────┘  └─────────────────────────────────────────┘ │
│                                                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Action buttons (Button Group)                                           │ │
│ │  [ Add to Watchlist ] [ Flag Actor ] [ Open Investigation Case ]         │ │
│ │  [ Acknowledge Alert ] [ Propose Sanctions Extension (branch-only) ]     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Variables (Workshop concept)

| Variable | Type | Bound to |
|---|---|---|
| `country_filter` | string | Filter bar → Map / Object Table / Timeline / AIP chat |
| `date_window` | (timestamp, timestamp) | All widgets |
| `actor_kind_filter` | enum | Object Table |
| `sanctioned_only` | bool | Object Table + Map dot styling |
| `selected_actor_id` | string nullable | Graph + AIP chat + Action buttons |
| `graph_max_hops` | int (1, 2, 3) | Graph widget |
| `graph_link_types` | list<string> | Graph widget |

Branch awareness: when the customer opens the module on the `sanctions-extension-2026Q3` branch, the same widgets read from branch-materialized datasets. The KPI strip in the top corner shows "Branch: sanctions-extension-2026Q3" so the analyst is never confused.

---

## 3️⃣ Widgets — Foundry-native acceptance per widget

| Widget | Foundry doc | Acceptance for this PoC |
|---|---|---|
| Map | [Workshop Map widget](https://www.palantir.com/docs/foundry/workshop/widgets-map/) | Renders ≥ 10k markers without freezing; color = CAMEO quad-class; click selects `Event`; respects markings. |
| Object Table | [Workshop Object Table](https://www.palantir.com/docs/foundry/workshop/widgets-object-table) | Sortable, filterable, paginated; inline links to the Action buttons; respects markings (redacted cells render `[redacted]`). |
| Button Group | [Workshop Button Group](https://www.palantir.com/docs/foundry/workshop/widgets-button-group/) | One button per Action Type listed in [`05-ontologia-geopolitica.md`](05-ontologia-geopolitica.md). Disabled state when role/marking/branch context forbids. |
| Timeline | (Workshop time-series equivalent) | Stacked by `source`; drag selects window → updates `date_window`. |
| Graph | (Object Explorer equivalent embedded in Workshop) | See section below. |
| AIP Chat | [AIP Chatbot in Workshop](https://www.palantir.com/docs/foundry/chatbot-studio/overview/) | See [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md). Uses selection variables as tool inputs. |

---

## 4️⃣ The Graph widget (the differentiator)

The graph widget is the place where intelligence customers compare us against Foundry's Gotham heritage. It must, at minimum:

1. Render a focus node (the selected `Actor`) and up to 200 nodes / 600 edges from a 2-hop expansion.
2. Allow toggling which link types are visible: `MEMBER_OF`, `AFFILIATED_WITH`, `ASSOCIATED_WITH`, `INVOLVED_IN`, `SANCTIONED_BY`, `MENTIONED_IN`.
3. Allow toggling hops (1 / 2 / 3).
4. Color-code nodes by `Actor.kind` and shape sanctioned actors distinctly.
5. Selection on the graph updates `selected_actor_id` everywhere (round-trip with Object Table).
6. **Respect markings**: nodes/edges that the user is not cleared to see render as a placeholder ("hidden by policy") with a count, not a redacted blank. The AIP chatbot inherits this filter.
7. Stream changes in real time when on the live demo window — new nodes appear as the underlying ontology refreshes.

### Backing query
The widget calls the ontology N-hop expansion endpoint defined in [`05-ontologia-geopolitica.md`](05-ontologia-geopolitica.md) sample query #3. The endpoint must enforce marking filters server-side and return paginated graphs.

### Acceptance test
- 2-hop expansion from a sanctioned `Person` returns ≤ 200 nodes in ≤ 1.5 s p95.
- Graph nodes hidden by markings appear as "+ N hidden" placeholders, never as actual content.

---

## 5️⃣ Action buttons (Button Group)

| Button label | Action Type | Visible to | Notes |
|---|---|---|---|
| Add to Watchlist | `add-to-watchlist` | analyst, compliance | Opens param dialog (watchlist picker + reason). |
| Flag Actor | `flag-actor` | analyst, compliance | Severity dropdown + reason. |
| Open Investigation Case | `open-investigation-case` | compliance | Title + priority + assignee + summary. |
| Acknowledge Alert | `acknowledge-alert` | analyst, compliance | Note (optional). Visible only when an `ActorAlert` is selected. |
| Propose Sanctions Extension | `propose-sanctions-extension` | compliance, **branch context only** | Disabled with tooltip "requires Global Branch" when on `main`. |

Every button submission flows through `ontology-actions-service`, lands in the Action Log, and triggers the appropriate side effect (notification / webhook / workflow). The Action Log is queryable from a deep link in the module header.

---

## 6️⃣ AIP chat widget integration with the rest of the module

The chat panel is **not isolated** — it shares the Workshop variables. The relevant patterns:

- *"Summarize activity of the selected actor"* → tool call reads `selected_actor_id`.
- *"Show me sanctioned actors in this country in the last 72 h"* → tool reads `country_filter` and `date_window`.
- *"Propose to add these 3 to the watchlist"* → tool calls the `add-to-watchlist` Action Type, requires confirmation, lands in Action Log.

See [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md) for the system prompt, tool registrations, and verbatim user prompts the demo uses.

---

## ✅ Concrete actions (when the PoC is executed)

1. Create the Workshop module config JSON under `tools/poc-geopolitica/workshop/workbench.json`. Load via `application-composition-service`.
2. Create the Quiver dashboard config under `tools/poc-geopolitica/quiver/operations-live.json`. Load via the dashboard endpoint.
3. Verify each widget renders with seed data (run on the rehearsal box).
4. Verify branch toggle: switch to the `sanctions-extension-2026Q3` branch — the same module re-renders with branched data, KPI strip shows branch label, "Propose Sanctions Extension" button enables.
5. Verify markings: log in as Sofía → graph widget shows full neighborhood; log in as Marcos → certain `NewsArticle` titles render as `[redacted]` and the graph shows "+N hidden" placeholders where appropriate.
6. Capture screenshots for the demo backup deck.
