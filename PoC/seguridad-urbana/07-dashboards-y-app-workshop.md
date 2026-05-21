# 07 — Dashboards and Workshop app

> All UIs in this PoC are **Foundry resource types** in customer-facing language: a **Workshop module** (the operations workbench for Anna and Jordi) and a **Quiver dashboard** (the live operational picture). They are configured, not coded: the JSON config is persisted by `application-composition-service`, branch-aware, and respects markings. OpenFoundry's `apps/web` renders them.

**Explicit differentiator vs the geopolitical PoC**: this PoC has **no graph widget**. The decision-loop is spatio-temporal — the analyst's pivot is **Map ↔ Object Table ↔ Forecast Chart**, not graph traversal. The closest cousins on this surface are LAPD-style and NYPD-style operational dashboards rather than Gotham-style link-analysis workbenches.

---

## 🧭 Two UI surfaces

| # | Foundry resource | What it is | Audience |
|---|---|---|---|
| 1 | **Quiver dashboard** — *"Urban Public-Safety Operations — Live"* | Live operational picture: KPI strip, Barcelona map colored by next-24 h forecast, top-10 highest-load neighborhoods. Refreshes every 60 s. | Anyone who can log in (read-only). |
| 2 | **Workshop module** — *"Urban Public-Safety Operations"* | Interactive operations workbench: 4 screens — Operational map, Comparative analysis, Daily briefing, Action history. | Anna (commander) + Jordi (analyst). |

Frontend route entry (matches the existing pattern in `apps/web/src/routes/poc/`):
`apps/web/src/routes/poc/seguridad-urbana/` — one folder, with `dashboard.tsx` for the Quiver surface and `workbench.tsx` for the Workshop module shell.

---

## 1️⃣ Quiver dashboard — "Urban Public-Safety Operations — Live"

The dashboard is opened by both personas at the start of the demo. It must give the operational picture in 5 seconds.

### Layout (Quiver cards)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Urban Public-Safety Operations — Live                    User: Anna ▼       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                          │
│ │Incidents │ │  Active  │ │  Alerts  │ │ Forecast │   KPI strip              │
│ │  72 h    │ │  reinf.  │ │  pending │ │ MAE 7 d  │                          │
│ │          │ │  zones   │ │          │ │ vs base. │                          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                          │
│                                                                              │
│ ┌──────────────────────────────────────────────┐  ┌─────────────────────────┐│
│ │ Map: 73 neighborhoods                        │  │ Top-10 highest-load     ││
│ │ choropleth = next-24 h LoadForecast          │  │ neighborhoods           ││
│ │ (UC-1, click → deep link to Workshop)        │  │ (Object Table)          ││
│ │                                              │  │ name · expected · Δbase ││
│ └──────────────────────────────────────────────┘  └─────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Card-by-card (Foundry resources used)

| Card | Foundry resource | Backing object set | Action button |
|---|---|---|---|
| Incidents 72 h | KPI card | `Incident.event_datetime_utc ≥ now() - 72h`, `count(*)` | — |
| Active reinforcement zones | KPI card | `ReinforcementZone.status='ACTIVE'`, `count(*)` | "Open in Workshop" deep link |
| Alerts pending | KPI card | `IncidentAlert.acknowledged_at_utc IS NULL`, `count(*)` | "Open in Workshop" deep link |
| Forecast MAE (last 7 d) | KPI card | computed: `mae(model) - mae(baseline)` over 7-day backtest | tooltip: `model_version` + `generated_at_utc` |
| Map (next-24 h forecast) | Map widget over `Neighborhood` polygons | `LoadForecast.target_date = current_date + 1` aggregated across the 4 shifts, joined to `Neighborhood.geometry` | "Open in Workshop" deep link |
| Top-10 neighborhoods | Object Table | `LoadForecast` for next-24 h, sorted desc by `expected_incidents` aggregated across 4 shifts | "Open Neighborhood in Workshop" |

Branching caveat: the Quiver dashboard does **not** need to be modifiable on a branch (Foundry limitation — Workshop branching applies to the Workshop module, not Quiver). The branch demo in UC-6 targets the **Workshop module**.

---

## 2️⃣ Workshop module — "Urban Public-Safety Operations"

The workbench has **4 screens** organized as tabs in the header. The JSON config in `application-composition-service` declares widgets, variables, and bindings for all four.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Urban Public-Safety Operations         User: Anna ▼   Branch: main          │
│  [ Operational map ] [ Comparative analysis ] [ Daily briefing ] [ Action history ]
├──────────────────────────────────────────────────────────────────────────────┤
│                            (active screen content)                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

Branch awareness: when the customer opens the module on the `chronic-priority-2026Q4` branch, the header shows `Branch: chronic-priority-2026Q4` and the **propose-chronic-priority** action enables.

### Screen (i) — Operational map (UC-1)

Live map of Barcelona; neighborhoods colored by next-24 h forecast. Clicking a neighborhood opens a side panel with history, forecast, and the `mark-reinforcement-zone` button.

```
┌─── Filter bar ────────────────────────────────────────────────────────────┐
│ Date [today▾] Shift [NOCHE▾] Typology [ALL▾] Active zones [☐]            │
└───────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐  ┌───────────────────────────────────┐
│ Map widget                       │  │ Side panel: selected Neighborhood │
│ choropleth = forecast            │  │ ─ name + district                 │
│ markers = last 24 h Incidents    │  │ ─ KPI: incidents_30d, per_1000    │
│ click neighborhood → side panel  │  │ ─ Chart: incidents/day last 30 d  │
│ click incident   → popup         │  │ ─ Chart: forecast next 7 d        │
│                                  │  │ ─ Button: [ Mark reinforcement ▸ ]│
└──────────────────────────────────┘  └───────────────────────────────────┘
```

| Widget | Foundry resource | Variables read | Variables written | Action |
|---|---|---|---|---|
| Filter bar | Filter | — | `date_filter`, `shift_filter`, `typology_filter`, `active_zones_only` | — |
| Map | Map widget over `Neighborhood` + `Incident` | `date_filter`, `shift_filter`, `typology_filter` | `selected_neighborhood_id` (on click) | — |
| Side-panel KPI cards | MarkdownCard + KPI cards | `selected_neighborhood_id` | — | — |
| 30-day history chart | Chart (line) over `Incident` aggregated daily | `selected_neighborhood_id` | — | — |
| 7-day forecast chart | Chart (line + CI ribbon) over `LoadForecast` | `selected_neighborhood_id` | — | — |
| Reinforcement button | ButtonGroup (single button) | `selected_neighborhood_id`, `shift_filter` | — | `mark-reinforcement-zone` |

Data-bind hints: the Map widget binds two layers — a choropleth layer over `Neighborhood` joined to `LoadForecast` filtered by `date_filter`+`shift_filter`, and a point layer over `Incident` filtered by the same date+typology window. The side panel binds its three charts to the `selected_neighborhood_id` variable; the variable is the single source of cross-widget selection.

### Screen (ii) — Comparative analysis (UC-2)

Neighborhood multi-select, overlaid time series, day × hour heatmap. The canonical demo selects Raval + Gòtic during La Mercè.

```
┌─── Filter bar ────────────────────────────────────────────────────────────┐
│ Neighborhoods [Raval × Gòtic ×▾] Window [La Mercè 2024▾] Typology [ALL▾] │
└───────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐  ┌───────────────────────────────────┐
│ Chart: time series               │  │ Chart: day×hour heatmap           │
│ overlaid, one line / neighborhood│  │ one tile per (dow, hour)          │
│ x = date, y = incidents          │  │ color = count                     │
└──────────────────────────────────┘  └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Object Table — Incidents in the selected (neighborhoods × window)       │
│ columns: event_datetime_utc, typology_macro, typology_detail,           │
│          street_label (markings: ANALYST-CORE), shift_id                │
└─────────────────────────────────────────────────────────────────────────┘
```

| Widget | Foundry resource | Variables read | Variables written | Action |
|---|---|---|---|---|
| Multi-select neighborhood filter | Filter | — | `compare_neighborhood_ids` (list) | — |
| Window filter | Filter | — | `compare_window` (tuple<date,date>) | — |
| Time-series chart | Chart (multi-line) over `Incident` | `compare_neighborhood_ids`, `compare_window` | — | — |
| Heatmap | Chart (heatmap, day-of-week × hour) | `compare_neighborhood_ids`, `compare_window` | — | — |
| Object Table | ObjectTable over `Incident` | `compare_neighborhood_ids`, `compare_window` | — | inline `acknowledge-incident-alert` when row is an alert |

### Screen (iii) — Daily briefing (UC-4)

AIP-drafted markdown briefing for the next shift. Big "Generate" button at the top, MarkdownCard renders the result, "Export PDF" button at the bottom.

```
┌─── Briefing config ───────────────────────────────────────────────────────┐
│ Target date [2026-05-22▾] Target shift [NOCHE▾] Scope [All districts▾]   │
│ [ Generate briefing ▸ ]   (calls generate-daily-briefing action)         │
└───────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MarkdownCard — narrative_markdown                                        │
│ (AIP-drafted, includes citation chips → click jumps to the cited object) │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Object Table — proposed zones                                            │
│ columns: neighborhood, district, expected_incidents (next shift),         │
│          baseline_expected, Δ vs baseline                                  │
└──────────────────────────────────────────────────────────────────────────┘

[ Export PDF ▸ ]
```

| Widget | Foundry resource | Variables read | Variables written | Action |
|---|---|---|---|---|
| Briefing config filter | Filter + Button | — | `briefing_target_date`, `briefing_target_shift_id`, `briefing_scope_districts` | — |
| Generate button | ButtonGroup (single button) | the three above | sets `current_briefing_id` on success | `generate-daily-briefing` |
| AIP chat (optional, embedded) | AipChat | `current_briefing_id` | — | tool calls bound to the briefing context |
| Briefing narrative | MarkdownCard | `current_briefing_id.narrative_markdown` | — | citation chips link to objects |
| Proposed zones table | ObjectTable over `Neighborhood` joined to `LoadForecast` | `current_briefing_id.proposed_zones` | — | per-row `mark-reinforcement-zone` |
| Export PDF button | ButtonGroup | `current_briefing_id` | — | calls `export-briefing-pdf` (utility, not an ontology Action) |

### Screen (iv) — Action history (UC-3 + after-action review)

List of all `ReinforcementZone` records with motive, status, outcome. The after-action review loop closes here via `register-zone-outcome`.

```
┌─── Filter bar ────────────────────────────────────────────────────────────┐
│ Status [ALL▾] Date range [last 30 d▾] Created by [ALL▾]                  │
└───────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Object Table — ReinforcementZone                                         │
│ columns: zone_id, motive, neighborhoods, shift_id, start_at, end_at,     │
│          status, outcome, outcome_narrative (truncated)                  │
│ row click → side panel with the full narrative + linked Incidents        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Side panel: selected zone                                                │
│ ─ full narrative                                                         │
│ ─ Object Table of Incidents OCCURRED_IN the zone's neighborhoods         │
│   during [start_at, end_at]                                              │
│ ─ ButtonGroup: [ Register outcome ] [ Close zone ]                       │
└──────────────────────────────────────────────────────────────────────────┘
```

| Widget | Foundry resource | Variables read | Variables written | Action |
|---|---|---|---|---|
| Filter bar | Filter | — | `history_status_filter`, `history_date_window`, `history_creator_filter` | — |
| Zone table | ObjectTable over `ReinforcementZone` | the three above | `selected_zone_id` | — |
| Side panel narrative | MarkdownCard | `selected_zone_id` | — | — |
| Linked-incident table | ObjectTable over `Incident` (joined via `OCCURRED_IN` + zone's `neighborhood_ids` × time window) | `selected_zone_id` | — | — |
| Action buttons | ButtonGroup | `selected_zone_id` | — | `register-zone-outcome`, `close-reinforcement-zone` |

---

## 3️⃣ Workshop variables — consolidated

| Variable | Type | Screen | Bound to |
|---|---|---|---|
| `date_filter` | date | (i) | Map, side panel, ObjectTable |
| `shift_filter` | string (Shift) | (i) | Map choropleth, mark-zone button |
| `typology_filter` | enum | (i) | Map markers |
| `active_zones_only` | bool | (i) | Map overlay |
| `selected_neighborhood_id` | string nullable | (i) | Side panel, mark-zone button |
| `compare_neighborhood_ids` | list<string> | (ii) | Time series, heatmap, ObjectTable |
| `compare_window` | (date, date) | (ii) | Time series, heatmap, ObjectTable |
| `briefing_target_date` | date | (iii) | Generate button → action params |
| `briefing_target_shift_id` | string (Shift) | (iii) | Generate button → action params |
| `briefing_scope_districts` | list<string> | (iii) | Generate button → action params |
| `current_briefing_id` | string nullable | (iii) | MarkdownCard, ObjectTable, Export-PDF |
| `history_status_filter` | enum | (iv) | Zone table |
| `history_date_window` | (date, date) | (iv) | Zone table |
| `history_creator_filter` | string nullable | (iv) | Zone table |
| `selected_zone_id` | string nullable | (iv) | Side panel, action buttons |

---

## 4️⃣ Widget catalogue — Foundry-native acceptance

| Widget | Foundry doc | Acceptance for this PoC |
|---|---|---|
| Map | [Workshop Map widget](https://www.palantir.com/docs/foundry/workshop/widgets-map/) | Renders 73 neighborhood polygons + ≥ 5 k incident markers without freezing; choropleth scale legible; click selects; respects markings (`ANALYST-CORE` redacts `street_label` / `lat` / `lon` for OPS-only users — neighborhood-level rollups still render). |
| Object Table | [Workshop Object Table](https://www.palantir.com/docs/foundry/workshop/widgets-object-table) | Sortable, filterable, paginated; inline buttons to action types; redacted cells render `[redacted]`; multi-select supported on screen (ii). |
| Filter | [Workshop Filter](https://www.palantir.com/docs/foundry/workshop/widgets-filter/) | Date, enum, multi-select, free-text variants; writes to Workshop variables. |
| ButtonGroup | [Workshop Button Group](https://www.palantir.com/docs/foundry/workshop/widgets-button-group/) | One button per Action Type listed in [`05-ontologia-seguridad-urbana.md`](05-ontologia-seguridad-urbana.md). Disabled state when role / marking / branch context forbids (tooltip shows why). |
| Chart | [Workshop Chart](https://www.palantir.com/docs/foundry/workshop/widgets-chart/) | Line (history + forecast w/ CI ribbon), multi-line (comparative), heatmap (day-of-week × hour). |
| MarkdownCard | [Workshop Markdown](https://www.palantir.com/docs/foundry/workshop/widgets-markdown/) | Renders AIP-drafted briefing markdown; citation chips are object-id links that update Workshop variables on click. |
| AipChat | [AIP Chatbot in Workshop](https://www.palantir.com/docs/foundry/chatbot-studio/overview/) | See [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md). Uses Workshop variables as tool inputs; refuses `PII-RESIDENT` queries from users without the marking. |

**No graph widget is used.** This is explicit and intentional — the customer's decision-loop is spatio-temporal forecasting and after-action review, not link analysis. If a future contract pivots to gang-affiliation / network analysis, the geopolitica module can be lifted in; that is a different sale.

---

## 5️⃣ Action buttons — consolidated mapping

| Button label | Screen | Action Type | Visible to | Notes |
|---|---|---|---|---|
| Mark reinforcement zone | (i), (iii) | `mark-reinforcement-zone` | commander | Param dialog: neighborhoods, motive, start/end, shift. |
| Generate briefing | (iii) | `generate-daily-briefing` | commander, analyst | Param dialog: target date, shift, scope districts. |
| Export PDF | (iii) | (utility — not an ontology action) | commander, analyst | Server-side render of the MarkdownCard + proposed-zones table. |
| Register outcome | (iv) | `register-zone-outcome` | commander | Param dialog: incident_count_during_zone, narrative. |
| Close zone | (iv) | `close-reinforcement-zone` | commander + senior-commander approval | Param dialog: outcome enum, narrative. |
| Acknowledge alert | (ii) row inline | `acknowledge-incident-alert` | commander, analyst | Inline on `IncidentAlert` rows. |
| Propose chronic priority | (iv), branch-only | `propose-chronic-priority` | commander, **branch context only** | Disabled with tooltip "requires Global Branch" when on `main`. |

Every button submission flows through `ontology-actions-service`, lands in the Action Log, and triggers the appropriate side effect (notification / workflow). The Action Log is queryable from a deep link in the module header.

---

## 6️⃣ AIP chat integration with the rest of the module

The AIP chat is **embedded inside screen (iii)** (Daily briefing) so it shares the briefing variables. The relevant patterns:

- *"Why is el Raval flagged tonight?"* → tool reads `selected_neighborhood_id` (or the briefing's `proposed_zones`) and returns a structured explanation citing `LoadForecast`, `gold.neighborhood_rolling_features`, and the relevant `is_festival` flag.
- *"Propose 5 reinforcement zones for tomorrow's NOCHE"* → tool reads `briefing_target_date`+`briefing_target_shift_id`, returns a ranked list, attaches it as `proposed_zones` on the briefing draft. The commander still has to click `mark-reinforcement-zone` per zone — the AIP does not write actions silently.
- *"Show me the census composition of el Raval"* → if the user lacks `PII-RESIDENT`, the AIP refuses and explains why; if the user has the marking, it returns the coarsened neighborhood-level aggregate, **never** sub-neighborhood census-tract detail.

See [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md) for the system prompt, tool registrations, and verbatim user prompts the demo uses.

---

## ✅ Concrete actions (when the PoC is executed)

1. Create the Workshop module config JSON under `tools/poc-seguridad-urbana/workshop/operations.json` (four screens, the variables in §3, the widget bindings above). Load via `application-composition-service`.
2. Create the Quiver dashboard config under `tools/poc-seguridad-urbana/quiver/operations-live.json`. Load via the dashboard endpoint.
3. Verify each widget renders with seed data on the rehearsal box; in particular confirm the choropleth legend on the Map widget is legible at projector resolution.
4. Verify branch toggle: switch to `chronic-priority-2026Q4` — the same module re-renders, the header shows the branch label, and "Propose chronic priority" enables on screen (iv).
5. Verify markings: log in as Jordi (`ANALYST-CORE`) → Map markers show `street_label`, `lat`, `lon`; log in as Anna (`OPS-CORE`) → those three columns render as `[redacted]` while the neighborhood choropleth and the forecast still work, and the AIP refuses to surface them when she asks.
6. Capture screenshots of all four screens for the demo backup deck (plan B), including one screen-(iv) shot with at least one closed zone showing an honest non-positive `outcome` to reinforce the credibility narrative.
