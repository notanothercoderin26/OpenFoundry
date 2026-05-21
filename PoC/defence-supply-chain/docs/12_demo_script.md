# Demo Script — 15-Minute Live Runbook

This file is the operational runbook for the live demo. It is read aloud — minute by minute — by the presenter. Every block has a verbatim narration line and an explicit fallback if the live tenancy wobbles. The arc never changes: problem, architecture, console, alerts, agent, honest limits, decision.

> ⚖️ ETHICS: On stage, do not name any supplier as "high risk", "suspicious", or "linked to" anything. The only sanctioned language is *candidate match*, *confirmed match*, *registered in*, *consortium member*. This rule is non-negotiable and applies to every minute below.

## The timed spine

| Min | Action | Narration | Fallback if live fails |
|---|---|---|---|
| 00–02 | Open with the title slide; state the problem and cite the EU FDI Screening Regulation (EU 2019/452). | "Defence procurement in the EU is reported through TED and the EDF; the data exists, but no single screen joins it. The FDI Screening Regulation raised the question — who is actually in this supply chain — to a policy obligation. This PoC builds that screen, on open data only, inside Foundry." | Stay on the slide; no Foundry surface needed yet. |
| 02–04 | Switch to a one-line architecture diagram, then open the Ontology Manager and show the five object types: `Supplier`, `Contract`, `Project`, `SanctionsTarget`, `Jurisdiction`. | "The architecture is a layer cake: open sources land as datasets, a pipeline normalizes them, the Ontology models the world, Workshop and the AIP Agent sit on top. Five object types — these — joined by link types that the entity-resolution stage builds." | Use the backup screenshot of the Ontology Manager view; the narration is identical. |
| 04–07 | Open the Workshop console — Landing screen first (KPIs and dataset versions), then Supplier Explorer; drill into one supplier card. | "The console opens on KPIs over the demo window: unique suppliers, total awarded value, candidate matches outstanding. From here the analyst pivots to the supplier explorer and drills into one entity — contracts won, jurisdiction, EDF consortium participation, any candidate sanctions matches." | Switch to the pre-captured screenshot set for Landing → Explorer → Supplier card. Narrate the same drill-down. |
| 07–10 | Move to the Sanctions Alerts Queue; pick the rehearsed candidate; confirm one match live using the `confirm_sanctions_match` action. | "Every candidate match goes through human review. Nothing is auto-flagged. This is the rehearsed one — the analyst reads the evidence, confirms it, and the object is promoted from `candidate_match` to `confirmed_match`. That is the only point at which the PoC says: this is a finding." | Show the screenshot before-and-after; explain that the action would be submitted from this screen and that Foundry logs it to the audit trail. |
| 10–12 | Open the AIP Agent panel; run the three rehearsed prompts in order (the verbatim three from [`10_aip_agent_spec.md`](10_aip_agent_spec.md)). | "The agent is bounded — it queries the ontology through registered tools and refuses out-of-scope questions. Three prompts: an aggregate, a drill-down, an out-of-scope refusal. Watch the third one — that refusal is the feature, not a bug." | Read the prompts and the rehearsed answers from the index card. Say explicitly: this is the rehearsed transcript; the agent behaviour is the same. |
| 12–14 | Switch to the Honest Limits slide; show one false-positive entity-resolution case from the dataset; remind the room about UBO and the CJEU 2022 ruling. | "Entity resolution on free-text supplier names produces both false positives and false negatives. Here is one false positive — common name, two different companies. The PoC catches this through the human-in-the-loop step. And we do not do UBO discovery — open sources cannot since 2022." | The screenshot of the false-positive case is in the deck; narrate it identically. |
| 14–15 | Close on the decision slide. | "What this PoC asks is a decision: fund a v2 with paid sources and a DPIA, or stop and treat this as the teaching artefact. Either is defensible. The documentation set explains both." | Same slide; no tenancy dependency. Close with the verbatim message below. |

**Closing slide message (verbatim):** *"What this would look like with proper internal data and a v2 budget."*

## Rehearsal checklist

- [ ] Foundry branch snapshot taken; rollback rehearsed and timed
- [ ] AIP Agent warm (no cold-start latency on the first prompt — open the panel five minutes before the demo and send a throwaway query)
- [ ] A sample supplier with a **confirmed** sanctions match identified in advance and pre-positioned on the Supplier Explorer screen
- [ ] A second sample with a **candidate** match also pre-positioned for the live confirmation block (minute 07–10)
- [ ] The Workshop alerts queue pre-filtered to the demo time window so the rehearsed candidate is the top row
- [ ] Backup screenshots of every Workshop screen captured at the latest dataset version, in case the live tenancy wobbles
- [ ] Index card with the three AIP prompts verbatim, plus the expected one-line answers
- [ ] Dataset version (Foundry transaction id or branch name) visible on the Landing KPIs — the room must see we know which data we are on
- [ ] One false-positive entity-resolution case prepared (the one shown at minute 12)
- [ ] Title and Closing slides pre-loaded in the deck, not improvised

## Fallback principle

If anything wedges live — the tenancy stalls, the agent times out, a widget will not load — **do not improvise**. Switch to the screenshot deck, narrate the same arc, and pivot deliberately into the honest-limits and decision-asked sections. Never apologize for a public-data PoC. The demo is the documentation walked through with a live surface attached; if the surface is unavailable, the documentation still stands.

See [`09_workshop_app_spec.md`](09_workshop_app_spec.md) for the screen inventory, [`10_aip_agent_spec.md`](10_aip_agent_spec.md) for the three prompts, [`11_quiver_analyses.md`](11_quiver_analyses.md) for backup analyses if a question runs long, [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) for the framing the closing must reinforce, and [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) for the v2 / v3 conversation the closing slide invites.
