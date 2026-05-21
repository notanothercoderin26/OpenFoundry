# Demo Script — the 15-minute live runbook

> Audience: a mixed room of command staff and technical reviewers. Single presenter. One Foundry tab, one slide deck, one set of index cards. The narration is in command-staff language; jargon is held to the glossary defined in [`14_glossary.md`](14_glossary.md).

> 🎯 FRAMING: Every sentence the presenter says must reinforce the resilience COP framing — event-centric, generic spatial context, human-in-the-loop. The single most damaging failure mode on stage is drift into *"see what's exposed"* or *"see what could be hit"* language. If a question from the room invites that drift, the presenter answers in the framing of [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) and brings the demo back to events.

> ⚖️ ETHICS: The per-MMSI refusal demo (minute 12–14) is rehearsed precisely because it is the most credible on-stage demonstration that the system has refusal teeth. Skipping it weakens the demo. Improvising around it weakens it more.

## The 15-minute spine

| Min | Action | Narration | Fallback if it fails live |
|---|---|---|---|
| 00–02 | Title slide; one-sentence problem statement; the COP framing slide | *"Today a coordinator orienting on a multi-domain incident opens five browser tabs and calls a colleague. This PoC fuses five public open-data event streams onto one substrate inside Foundry, so the same coordinator orients on one screen. The unit of analysis is the event, not the asset — this is a resilience COP, not a target catalogue."* | Slides only — no live system needed. |
| 02–04 | Open Ontology Manager; show the `Event` interface and its five implementations (`SeismicEvent`, `WeatherWarning`, `CyberAdvisory`, `VesselObservation`, `AircraftObservation`); show generic `GeographicArea` and `AdministrativeRegion`; explicitly name the absent `CriticalInfrastructure` type | *"One interface, five concrete event types, generic spatial context. There is no critical-infrastructure object type in this ontology by design — see [`08_ontology_design.md`](08_ontology_design.md)."* | Pre-captured screenshot of the Ontology Manager view of the interface and its implementations. |
| 04–07 | Open the Workshop COP Landing screen; let the live map render; click the rehearsed seismic event — the Cabo de Gata Mw 5.3 of 14 July 2025 | *"The map shows events from the last 24 hours across all five domains. I click the rehearsed felt earthquake. The side panel opens."* | Screenshot of the Landing screen with the event pre-selected; narrate the same arc over the screenshot. |
| 07–10 | The event detail side panel surfaces `neighbour_of` events — AIS aggregate counts per H3 cell in the surrounding waters, active AEMET warnings in the same NUTS-3 provinces. Click *acknowledge_event*; the Action Type write-back lands in the Action Log | *"The coordinator sees, fused on one screen, what previously took three tabs and a phone call. Nothing is named — counts per spatial bucket, warnings by area. The acknowledge action is written back to Foundry's Action Log; the audit trail is automatic."* | Screenshots of the side panel and of the Action Log entry; narrate the same arc. |
| 10–12 | Open the AIP Agent panel; run the three rehearsed prompts from [`10_aip_agent_spec.md`](10_aip_agent_spec.md) in order; let each response render fully before moving on | *"The Agent operates over the same ontology, with a tool allow-list. Three rehearsed questions, three bounded answers — each cites the events it consulted and the time window."* | Pre-saved Agent transcript on a slide; read the answer aloud. Do NOT improvise an unrehearsed prompt — the canonical-decisions doc forbids it. |
| 12–14 | Honest limits slide: read the framing-discipline paragraph aloud; close on the *v2-with-operator-data* message. Then run the rehearsed per-MMSI prompt from the index card and demonstrate the Agent refusing | *"What this would look like with operator data and proper crisis-management governance is v2 — operator events on the same substrate, not a target file. To show the system has refusal teeth: I ask the Agent for the trajectory of a specific MMSI. It refuses, citing scope."* | Screenshot of the refusal response; read the refusal text aloud. |
| 14–15 | Decision slide; one question to the room | *"The decision being asked is v2 or stop. Both are defensible. See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) for the frame."* | Slide only. |

## Rehearsal checklist (run T-60 minutes)

- [ ] Foundry branch snapshot taken; rollback to it rehearsed.
- [ ] AIP Agent warmed — the three rehearsed prompts and the per-MMSI refusal prompt all run within the last hour, no cold-start latency on stage.
- [ ] Cabo de Gata Mw 5.3 (14 July 2025) seismic event pre-positioned on the Landing map. If the 24-hour window has rolled past it, swap to another rehearsed felt earthquake from the IGN catalogue and update the index card.
- [ ] At least one anomaly-queue candidate pre-positioned, with one prior dismissal already in the audit log so the live confirm/dismiss interaction visibly demonstrates both buttons against a populated queue (cross-ref [`09_workshop_app_spec.md`](09_workshop_app_spec.md) screen 4).
- [ ] AISStream WebSocket bridge running; observations from the last 30 minutes visible in the substrate.
- [ ] OpenSky snapshot from the last 5 minutes loaded.
- [ ] AEMET warnings refreshed within the last 30 minutes.
- [ ] Backup screenshots saved of every Workshop screen and every AIP prompt response, in a deck that mirrors the live arc minute by minute.
- [ ] Index card 1: the three AIP prompts verbatim, in order.
- [ ] Index card 2: the per-MMSI refusal prompt verbatim, so the presenter can request it from stage and the refusal lands cleanly.
- [ ] Index card 3: the framing-discipline paragraph from [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md), in case a question forces the presenter to read it aloud.
- [ ] Glass of water within reach; phone silenced; second laptop with the slide deck mirrored.

## Fallback narrative

If a stream fails live, switch to the latest pre-captured snapshot of the substrate and narrate the same arc. The screenshots are arranged to mirror the minute-by-minute table above; the narration does not change. Acknowledge the fallback once — *"the live AIS bridge is down; I am narrating over the latest snapshot, captured at HH:MM UTC"* — and continue. Do NOT attempt to debug live. Do NOT improvise an unrehearsed AIP prompt: the canonical decisions forbid it because an unrehearsed prompt can elicit an unrehearsed (and possibly off-framing) answer in front of the room. Do NOT name a vessel or aircraft on stage under any circumstance — counts per H3 cell only, per [`08_ontology_design.md`](08_ontology_design.md).

## Closing slide message (verbatim)

> *"What this would look like with operator data and proper crisis-management governance — v2."*

The slide carries that sentence and nothing else. The decision frame lives in [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md); the risks and ethics framing the presenter is implicitly defending live lives in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).

## Cross-links

- [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) — the framing the narration must reinforce.
- [`08_ontology_design.md`](08_ontology_design.md) — the `Event` interface and the absent `CriticalInfrastructure`.
- [`09_workshop_app_spec.md`](09_workshop_app_spec.md) — the screens visited in the arc.
- [`10_aip_agent_spec.md`](10_aip_agent_spec.md) — the three rehearsed prompts and the per-MMSI refusal.
- [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) — the credibility anchor the demo implicitly defends.
- [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) — the v2/stop decision frame closing the demo.
