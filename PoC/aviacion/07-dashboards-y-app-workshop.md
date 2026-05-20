# 07 — Dashboards and Workshop App

> The UI is what the client sees during 70% of the demo. If the dashboards are poor, it doesn't matter how powerful the backend is. Here is the design of the **3 screens** and the **Workshop App** that will be built in `apps/web` (React 19 + Vite + TypeScript) + `application-composition-service` (composition, pages, widgets, publish runtime — the equivalent of Foundry's App Builder).

---

## 🖥️ Screen 1 — "Operations Live" (main dashboard)

The view that **Ana (Ops Controller)** sees on login.

### Layout (16:9, 1920×1080)
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  OpenFoundry · Acme Airlines · Operations Live           [Ana ▾]   [🔔 12]      │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ┌─KPI 1─────────┐ ┌─KPI 2─────────┐ ┌─KPI 3─────────┐ ┌─KPI 4─────────┐         │
│ │ 🛫 Flights    │ │ ⚠ At Risk     │ │ ⏱ Avg Delay   │ │ 🛠 Open Events│         │
│ │  airborne     │ │  (HIGH/CRIT)  │ │  (last 1h)    │ │  (CRITICAL)   │         │
│ │   1,247       │ │     38        │ │   12 min      │ │      4        │         │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘         │
│                                                                                  │
│ ┌────────────────────── Live Map (60% width) ─────────────┐ ┌─Risk feed (40%)─┐│
│ │                                                          │ │ AAL 256 →JFK   ││
│ │   ╱╱ aircraft tracks (color = risk)                      │ │   HIGH  · 14m  ││
│ │   ● airports (size = throughput)                         │ │ DAL 1342 →ATL  ││
│ │   ⛅ weather overlay (toggle)                             │ │   CRIT  · 22m  ││
│ │                                                          │ │ … (scroll)     ││
│ └──────────────────────────────────────────────────────────┘ └────────────────┘│
│                                                                                  │
│ ┌── Top Risk Flights (table) ────────────────────────────────────────────────┐ │
│ │ Flight | A/C tail | Origin → Dest | ETD UTC | Risk | Cause            | ▸ │ │
│ │ ──────  ────────   ──────────────   ───────   ────   ───────────────    ── │ │
│ │ AAL256  N12345     LHR → JFK        14:30    HIGH   Convective at JFK  ▸ │ │
│ │ DAL1342 N98765     CDG → ATL        15:00    CRIT   Late aircraft       ▸ │ │
│ │ …                                                                          │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Widgets and services that feed them
| Widget | Service | Refresh |
|---|---|---|
| KPIs (4) | `ontology-query-service` (aggregated query) | 30 s |
| Live Map | `ontology-exploratory-analysis-service` (tracks + geospatial) + `ingestion-replication-service` (stream) | 5 s |
| Weather overlay | tiles served by the `geospatial-tiles` lib on top of `silver.weather_by_airport` | 5 min |
| Risk feed | `ontology-query-service` (top 50 risk_band ≥ HIGH) | 30 s |
| Top Risk Flights | same, with pagination | 30 s |

### Interactions
- Click on an aircraft on the map → side-panel with Flight + Aircraft detail + last weather observation.
- Click on a table row → opens **Screen 3 (Flight Detail)**.
- Header button **"Ask AIP"** → opens the copilot in an overlay.

---

## 🛠️ Screen 2 — "Fleet Health" (MRO view)

The view that **Luis (MRO Lead)** sees on login.

### Layout
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Fleet Health  ·  Acme Airlines        [Luis ▾]   [🔔 5]   Filter: A320 ✓        │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ┌─Recurring Defects (Heatmap) ──────────┐  ┌── Open Events by Severity ────────┐│
│ │  ATA chapter × Aircraft model         │  │ CRIT ████ 4                       ││
│ │  Color = count last 30d               │  │ HIGH ████████ 18                  ││
│ │  ↘ click cell to drill                │  │ MED  ████████████████ 47          ││
│ └───────────────────────────────────────┘  │ LOW  ████████████████████████ 132 ││
│                                            └────────────────────────────────────┘│
│ ┌── Aircraft list (sortable, filterable) ─────────────────────────────────────┐ │
│ │ Tail   | Model    | Hours | Last insp | Open evts | Status         | Actions│ │
│ │ N12345 | A320-214 | 38127 | 12d ago   |   3 (1H)  | IN_FLIGHT      |  ⋮     │ │
│ │ N67890 | A320-251 | 41209 | 5d  ago   |   1 (CRIT)| IN_MAINTENANCE |  ⋮     │ │
│ │ …                                                                            │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│ ┌── Parts at risk (lead time × demand) ────────────────────────────────────────┐│
│ │  HW-AIL-7421  ░░░░░░░░ lead 21d · forecast 12 needed in 14d  ⚠               ││
│ │  HW-ENG-1102  ░░░░     lead  7d · forecast 30 needed in 30d  ✓               ││
│ └─────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Interactions
- **Heatmap** click → table of the `MaintenanceEvent`s that make up that cell (drill).
- **Aircraft list ⋮** → menu with ontology actions: `flag-aircraft-for-inspection`, `assign-maintenance-event`.
- **Parts at risk** click → shows which workflows have reservations on them and allows creating `order-part`.

---

## 🛩️ Screen 3 — "Flight Detail" / "Aircraft Detail"

Detail view when clicking on an ontology object. It is the Foundry-style **Object View**.

### Structure (tabs)
1. **Overview** — key properties, small map, risk.
2. **Linked objects** — ontology relationships: aircraft, origin/destination airports, weather observations, maintenance events.
3. **Timeline** — chronological events: scheduled departure, ADS-B segments, weather alerts, MRO events.
4. **Lineage** — embedded `lineage-service`: which pipelines each property comes from.
5. **Audit** — who has viewed/modified this object (from `audit-compliance-service`).
6. **Actions** — action buttons (with permissions respected).

---

## 🧱 Workshop App — "MRO Triage Workbench"

> The **Workshop App** equivalent to Foundry Workshop. The operator builds it with `application-composition-service` (low-code) without touching code.

### Purpose
A single screen where Luis triages the critical `MaintenanceEvent`s from the last 24 h and decides what to do with each one.

### Components
| Block | Type | Data |
|---|---|---|
| Filters (sidebar) | controls (model, severity, ATA chapter, fleet base) | params |
| Event list | object-list widget bound to filtered `MaintenanceEvent` | ontology query |
| Center panel | object-card of the selected event | ontology |
| "Aircraft history" sub-panel | mini-table of last 10 events for the same tail | ontology graph traversal |
| "Similar defects in fleet" sub-panel | table of events with the same `defect_code` + model | ontology graph traversal |
| Actions | buttons that invoke `assign-maintenance-event`, `order-part`, `flag-aircraft-for-inspection` | ontology actions |
| Side widget | "Ask AIP about this aircraft" | contextual copilot |

### Exportable configuration (format of `application-composition-service`)
```yaml
app:
  id: mro-triage-workbench
  title: "MRO Triage Workbench"
  audience: [mro-lead, mro-engineer]
  layout:
    type: 3-column
    left:  [filters-control]
    main:  [event-list, event-detail-card]
    right: [aircraft-history, similar-defects, ask-aip]
  components:
    - id: filters-control
      type: control-panel
      params:
        - { id: model_filter,    type: multi-select, options_query: "SELECT DISTINCT model_id FROM AircraftModel" }
        - { id: severity_filter, type: multi-select, default: [HIGH, CRITICAL] }
        - { id: ata_filter,      type: text }
    - id: event-list
      type: object-list
      object_type: MaintenanceEvent
      filter: |
        a.model_id IN ({{model_filter}})
        AND severity IN ({{severity_filter}})
        AND defect_code LIKE '{{ata_filter}}%'
        AND discovered_at_utc >= now() - INTERVAL '24 hours'
      sort: severity DESC, discovered_at_utc DESC
      on_select: bind:selected_event
    - id: event-detail-card
      type: object-card
      object: "{{selected_event}}"
      show_actions: [assign-maintenance-event, order-part]
    - id: aircraft-history
      type: object-list
      object_type: MaintenanceEvent
      filter: tail_number = '{{selected_event.tail_number}}'
      limit: 10
    - id: similar-defects
      type: object-list
      object_type: MaintenanceEvent
      filter: |
        defect_code = '{{selected_event.defect_code}}'
        AND aircraft.model_id = '{{selected_event.aircraft.model_id}}'
      limit: 20
    - id: ask-aip
      type: copilot-panel
      context_objects: [selected_event, selected_event.aircraft]
```

> Pending task: materialize `PoC/assets/apps/mro-triage-workbench.yaml` when implementing.

---

## 🎨 Minimal branding

- Logo `images/logo.png` at the top left.
- Primary color: the repo's (check `apps/web` for palette).
- **Optional** client branding: ability to upload their logo in `tenancy-organizations-service` and have it appear in the header.

---

## 🚦 Performance target (measure it)

| Screen | First contentful paint | Time to interactive |
|---|---|---|
| Operations Live | < 1.5 s | < 3 s |
| Fleet Health | < 1.5 s | < 3 s |
| Flight Detail | < 1 s | < 2 s |
| Workshop App | < 2 s | < 4 s |

If not met, **cache in `ontology-query-service`** and precompute aggregations.

---

## ✅ Concrete actions (when the PoC is executed)

1. Design the 3 screens in Figma or directly in `apps/web` before implementing.
2. Implement reusable components: `LiveMap`, `KpiCard`, `ObjectCard`, `ObjectList`, `ActionButton`, `CopilotPanel`.
3. Materialize the Workshop App in `application-composition-service`.
4. Validate performance with Lighthouse and `k6` (simulating 5 concurrent users).
5. Capture screenshots for the plan B (backup video).
