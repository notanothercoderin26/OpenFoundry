# Workshop Application Spec — "Multi-Domain COP"

The operational console that an analyst or a crisis-management coordinator opens during a shift. Built in Workshop, bound to the event-centric ontology defined in [`08_ontology_design.md`](08_ontology_design.md), driven by the unified event substrate from [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md). Every screen below is described by what the widget does and what it is bound to — not by the strings on the buttons.

> 🎯 FRAMING: The COP shows **events**, never assets. No screen in this application enumerates named critical infrastructure, named vessels, or named aircraft. The framing discipline from [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) is enforced by what the screens bind to, not by goodwill.

## App-level navigation

On open, the user lands on the **live situational map** — the default screen — with the last 24 hours of events plotted across all five domains. A persistent left sidebar exposes the other screens grouped into two clusters: the *situational* cluster (live map, event detail, domain pivot, anomaly queue) and the *artefact* cluster (briefing generator, history and audit). A top bar carries a global time-window selector and the dataset-version indicator (Foundry transaction id of the current substrate build), so the user always knows what build of the data they are looking at.

## Screen 1 — Landing / live situational map

The default screen. The user sees a map of Spain (peninsular + Baleares + Canarias) with the last 24 hours of events overlaid as point markers, colour-coded by `event_type` and sized by `severity_normalized`. A filter bar lets the user narrow by domain (multi-select), severity (range), and time window (presets: last 1 h, last 6 h, last 24 h, custom). A KPI strip across the top shows the event count per domain in the current window. A time-window selector at the top right binds to the same query.

| Widget | Bound object type | Filters | Action buttons |
|---|---|---|---|
| Map (Foundry Map widget) | `Event` interface | domain, severity, time window | hover → tooltip; click → opens screen 2 |
| Filter bar | `Event` interface | domain, severity, time window | apply, reset |
| KPI strip | `Event` interface (aggregated) | inherits filter bar | none |
| Time-window selector | global query parameter | n/a | preset / custom |

> 🎯 FRAMING: The map renders **events**, not assets. The spatial context layer underneath is generic — NUTS-3 province boundaries and INE population centres — with **no asset overlay** and no named-infrastructure layer. If a future iteration wants to add an asset overlay, that decision belongs in v2 with the governance changes documented in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).

## Screen 2 — Event detail

Reached by clicking an event marker on the map. A side panel slides in with the full properties of the concrete event type — a `SeismicEvent`'s magnitude, depth, EMS-98 intensity, location text; a `WeatherWarning`'s CAP severity / certainty / urgency (verbatim, not paraphrased) and the warning polygon; a `CyberAdvisory`'s CVE id, CVSS v3 score, vendor and product strings, CISA known-exploited flag; the aggregate-friendly fields of a `VesselObservation` or `AircraftObservation`. Below the properties, a *related events* section lists the neighbours computed via the `Event --neighbour_of--> Event` link (`[08_ontology_design.md](08_ontology_design.md)`), with configurable spatial-km and temporal-minutes thresholds (defaults: 50 km, 360 min). Three action buttons: `acknowledge_event`, `flag_for_followup`, `link_events`.

The side panel does **not** show MMSI, owner, vessel name, icao24, tail number, or callsign — even when the underlying event is a `VesselObservation` or `AircraftObservation`. Only the aggregate-friendly fields (`ship_type_class`, `altitude_band`, etc.) are exposed.

| Widget | Bound object type | Filters | Action buttons |
|---|---|---|---|
| Properties panel | concrete `Event` subtype | n/a | `acknowledge_event`, `flag_for_followup`, `link_events` |
| Neighbours list | `Event --neighbour_of--> Event` | spatial-km, temporal-min thresholds | click → opens detail of neighbour |

> 🎯 FRAMING: Individual identifiers (MMSI, icao24, tail number, owner, callsign) are **lineage-only** — preserved inside `payload_json` for reproducibility audits, never surfaced to the analyst. The event-detail panel is the screen most at risk of drift; it is the screen where the discipline is most strictly enforced.

## Screen 3 — Domain pivot

A time-series chart of event counts per domain over the last 30 days, with a toggle to overlay any two domains on the same chart. Useful for spotting temporal correlations — an AEMET warning spike alongside an IGN aftershock sequence, a CVE wave alongside an AIS density anomaly week. The chart is bound to a daily aggregation of the `Event` interface, computed in Pipeline Builder.

| Widget | Bound object type | Filters | Action buttons |
|---|---|---|---|
| Time-series chart | daily `Event` count by `event_type` | domain (two-select for overlay), date range | overlay toggle |

> ⚠️ VERIFY: confirm the time-series widget supports two-axis overlay; if not, render as two stacked panels.

## Screen 4 — Anomaly queue

An Object Table bound to a derived `EventCluster` view, computed by a Pipeline Builder transform that applies configurable rules — for example *"any seismic event with Mw > 4 in the last 6 h"* or *"AIS observation density anomaly within 50 km of an active AEMET warning polygon"*. Each row carries the cluster summary, the contributing event ids, the rule that triggered it, and two action buttons.

| Widget | Bound object type | Filters | Action buttons |
|---|---|---|---|
| Object Table | derived `EventCluster` view | rule, time window, status (open / acknowledged / dismissed) | `acknowledge_event`, `dismiss_false_positive` |

> ⚖️ ETHICS: No anomaly becomes an "incident" until a human acknowledges it. The two buttons on each row express the only two states the system itself can move into. Promotion to incident is a human act, with an audit trail. The anomaly queue is the human-in-the-loop guarantee referenced in [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) and reinforced in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).

## Screen 5 — Briefing generator

A button group selects a time window (last 6 h, yesterday, ongoing incident — the last preset binds to a user-flagged event). An AIP-Logic-backed action produces a one-page situational briefing for the chosen window: a short narrative paragraph per domain, the event counts, the notable individual events (by Object ID), and a closing *open questions* section. The output is rendered as a markdown card on-screen and exported as PDF on demand. Every briefing cites the contributing Object IDs and the dataset version (Foundry transaction id) it was computed on.

| Widget | Bound object type | Filters | Action buttons |
|---|---|---|---|
| Button group | global query parameter | window preset | generate |
| Briefing card | AIP-Logic output bound to `Event` interface | window | export PDF |

> 💡 TIP: every briefing carries the dataset version + transaction ID so a reader can reproduce the same briefing later. Reproducibility is a feature; treat it as one.

## Screen 6 — History and audit

An Object Table bound to the `ActionLog` object type (see [`08_ontology_design.md`](08_ontology_design.md)). Shows every past acknowledgement, follow-up flag, manual link, dismissal, and briefing-export. Filterable by actor user, time window, action type, target event type. Read-only.

| Widget | Bound object type | Filters | Action buttons |
|---|---|---|---|
| Object Table | `ActionLog` | actor, time window, action type, target event type | none (read-only) |

## User flow that demonstrates value

A four-step walkthrough rehearsed for the demo (aligned with [`12_demo_script.md`](12_demo_script.md)):

1. The coordinator opens the app and lands on the live situational map. The Cabo de Gata Mw 5.3 seismic event from 14 July 2025 is visible as a coloured marker off the Almería coast.
2. The coordinator clicks the marker. The event-detail side panel opens with the IGN-reported properties and a *related events* list: nearby `VesselObservation` aggregates in the same spatial-temporal window, active `WeatherWarning`s in the affected provinces, recent `CyberAdvisory` items trending across Spain in the last week.
3. The coordinator presses `acknowledge_event`, which writes an `ActionLog` row and updates the KPI strip's *acknowledged* count.
4. The coordinator opens the briefing generator with the *ongoing incident* preset and produces a one-page markdown card with the event id, the contributing neighbours, and the dataset version — ready for shift handover.

## What the Workshop console is NOT

- It is **not a decision system**. It supports orientation; the coordinator decides.
- It is **not a target catalogue**. It binds to events, not to assets.
- It is **not an individual-tracking tool**. MMSI, icao24, tail numbers, and owners are filtered before they reach any screen.
- It **never paraphrases CAP severity / certainty / urgency labels**; AEMET's vocabulary appears verbatim.
- It is **not an alerting system**. The anomaly queue surfaces rule-based candidates for human review; nothing auto-escalates.

See [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) for the full framing discipline and [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) for the governance posture this app inherits. The next document — [`10_aip_agent_spec.md`](10_aip_agent_spec.md) — applies the same discipline to the analyst-assistant agent. The demo runbook that exercises every screen above is [`12_demo_script.md`](12_demo_script.md).
