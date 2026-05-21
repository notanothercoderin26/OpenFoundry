# 08 — AIP Chatbot — copilot and prompts

> The copilot is implemented as a Foundry **AIP Chatbot** with tools that map to Foundry's published categories: Object query, Action, Function, Update application variable, Command, and Request clarification. The OpenFoundry implementation is `agent-runtime-service` + `retrieval-context-service` + `llm-catalog-service`. The customer must hear **AIP Chatbot**, not *"MCP agent"* or *"LLM-powered assistant"*.
>
> The canonical declarative spec — system prompt + provider catalog + the 11 tools below — lives in [`assets/agent-config.yaml`](assets/agent-config.yaml). That file is the source of truth the operator POSTs to `agent-runtime-service`; this document is the human-readable explainer. If the two disagree, the YAML wins.

The copilot must inherit the **same security boundary** as the UI user: same role, same markings. If Anna cannot read a `PII-RESIDENT` property in a table, the AIP chatbot **also** cannot read it when asked — by either name or paraphrase.

---

## 🤖 Provider

| Mode | Provider | Model | Configured in |
|---|---|---|---|
| Online demo | Azure OpenAI | `gpt-4o` | `llm-catalog-service` |
| Air-gapped demo | Ollama (local GPU) | `qwen2.5-14b-instruct` | `llm-catalog-service` |

The air-gapped model is explicitly smaller than the geopolitical PoC's 70B because the urban prompts are shorter, more structured, and the ontology is narrower. We say up front which provider is active.

---

## 🧠 System prompt

```
You are an operational assistant embedded in OpenFoundry's "Urban Public-Safety
Operations" workbench. You help a senior patrol commander or a tactical planning
analyst at a municipal police force understand incident load, neighborhood patterns,
weather context, and proposed reinforcement zones — strictly from the ontology that
backs this workspace.

Hard rules — break them and you fail:
1. You answer only from the ontology and from documents you have explicitly retrieved
   through a tool. You do not guess. If the ontology has no row, say so out loud.
2. You always cite the ontology object IDs (Incident, Neighborhood, Shift,
   ReinforcementZone, LoadForecast, …) and dataset names that supported your answer.
3. You never invent neighborhood names. The city has 73 neighborhoods and 10 districts
   in the ontology; if a name is not in that list, you ask the user to disambiguate.
4. You respect the user's role and markings. A `PII-RESIDENT` field is never to be
   surfaced — neither by value, by paraphrase, nor by inference. If asked, reply
   "this property is restricted by markings" and stop.
5. You never claim to perform a write. Writes happen only through Action tools, and
   only after the user confirms a one-line summary you produce.
6. You never recommend action against an individual. The forecast is spatio-temporal
   at neighborhood × shift grain. You may propose reinforcement zones (geographic,
   time-windowed); you may NOT score, name, or rank individual residents.
7. When the user asks a neighborhood-, district-, or time-window question, you read
   the current Workshop variables (`district_filter`, `date_window`, `shift_filter`,
   `selected_neighborhood_id`) before composing the tool call.

Tone: terse, factual, operational. Bullets and citations preferred over prose.
Time zone in all responses: Europe/Madrid, with shift naming (MAÑANA, TARDE, NOCHE,
MADRUGADA). Language: English by default; mirror the user's language if they switch
(Spanish or Catalan).
```

---

## 🧰 Tools registered for the chatbot

Tools map 1-to-1 to Foundry AIP Chatbot tool types (see [Agent Studio tools](https://www.palantir.com/docs/foundry/agent-studio/tools/)).

| Tool name | Foundry tool category | Description | Parameters |
|---|---|---|---|
| `ontology.query_incidents` | Object query | Search `Incident` / `TrafficAccident` with filters | `neighborhood_id?`, `district_id?`, `shift?`, `date_from`, `date_to`, `type?`, `limit` |
| `ontology.query_neighborhoods` | Object query | List or filter `Neighborhood` rows | `district_id?`, `name_contains?`, `limit` |
| `ontology.read_object` | Object query | Fetch one object by id | `object_type`, `object_id` |
| `ontology.compare_neighborhoods` | Object query (N-set) | Side-by-side `Neighborhood` metrics over a window | `neighborhood_ids[]`, `date_from`, `date_to`, `shift?` |
| `retrieval.search_briefings` | Retrieval context | Retrieve `TacticalBriefing` excerpts matching a query | `query`, `date_from?`, `date_to?`, `limit` |
| `function.load_forecast` | Function | Returns `LoadForecast` for a (neighborhood × shift × date) tuple | `neighborhood_id`, `shift`, `target_date` |
| `function.chronic_priority_candidates` | Function | Computes neighborhoods with ascending 4-week incident trend | `district_filter?`, `min_trend`, `limit` |
| `action.mark_reinforcement_zone` | Action | Submit `mark-reinforcement-zone` (requires user confirmation) | `neighborhood_ids[]`, `motive`, `start_at`, `end_at`, `shift` |
| `action.generate_daily_briefing` | Action | Submit `generate-daily-briefing` (requires user confirmation) | `target_date`, `scope_districts?` |
| `action.acknowledge_incident_alert` | Action | Submit `acknowledge-incident-alert` (requires user confirmation) | `alert_id`, `note?` |
| `command.update_variable` | Update application variable | Update a Workshop variable (e.g. `selected_neighborhood_id`) | `variable`, `value` |
| `command.request_clarification` | Request clarification | Ask the user to disambiguate (e.g. "Raval" vs another barrio) | `question`, `options?` |

Confirmation rule: every `action.*` tool must produce a one-line natural-language summary of the intended write and wait for the user's confirmation **in the chat panel** before submitting. The action is then registered in the Action Log (see [`05-ontologia-seguridad-urbana.md`](05-ontologia-seguridad-urbana.md)).

Marking rule: all tools execute with the **user's** identity. `retrieval.search_briefings` and `ontology.query_incidents` apply the marking filter server-side; the LLM never sees a `PII-RESIDENT` value, so it cannot leak one via paraphrase.

Branch-context rule: the `propose-chronic-priority` Action is **not** wired into the AIP tool catalog — UC-6 is driven from a Workshop button on a branch, not from chat. This is deliberate: branch writes go through an explicit human gesture.

---

## 💬 Demo prompts (literal, for [`11-guion-demo.md`](11-guion-demo.md))

### P1 — Daily briefing draft (Jordi)
> *"Draft the briefing for tomorrow's TARDE shift across Ciutat Vella. Cite Incident and Neighborhood IDs. Include top 5 hotspots, the weather context, and the LoadForecast values."*

Expected tool sequence: read `district_filter=Ciutat Vella`, `shift_filter=TARDE` from variables → `function.load_forecast` for each Neighborhood in Ciutat Vella → `ontology.query_incidents(district_id="DIST-CV", date_from=-30d, date_to=now, limit=200)` → assemble bullets with citations.

Expected response skeleton:
```
TARDE shift — Ciutat Vella — target date 2026-05-22
Forecast load (top 5):
- Raval (NBHD-RAV): 41 incidents (baseline 36) — LOADFCST-2026-05-22-NBHD-RAV-TARDE
- Gòtic (NBHD-GOT): 28 (baseline 24) — LOADFCST-2026-05-22-NBHD-GOT-TARDE
- ...
Weather context: rain Y/N from WEATHEREVENT-2026-05-22-EL-PRAT
Recent material incidents (last 7 d): INC-2026-05-15-..., INC-2026-05-18-...
```

### P2 — Comparative analysis Raval vs Gòtic during La Mercè 2024 (Jordi)
> *"Compare Raval and Gòtic during La Mercè 2024 (the last week of September). What changed in incident type mix versus the same week the previous month? Cite IDs."*

Expected tool sequence: `ontology.query_neighborhoods(name_contains="Raval"|"Gòtic")` → `ontology.compare_neighborhoods(neighborhood_ids=[NBHD-RAV, NBHD-GOT], date_from="2024-09-22", date_to="2024-09-29")` → second call for `2024-08-22..2024-08-29` baseline → render delta table with Incident IDs as evidence.

### P3 — Chronic-priority candidates last 4 weeks ascending trend (Anna)
> *"Which neighborhoods show an ascending incident trend over the last 4 weeks? List the top candidates with their slope and the 4-week incident counts. Order by trend strength."*

Expected tool sequence: `function.chronic_priority_candidates(min_trend=0.15, limit=10)` → response is a table of `(Neighborhood ID, name, 4-week counts week-by-week, slope, p-value)`. This is **read-only**; it does not write.

### P4 — Reinforcement-zone proposal with 5 candidates (Anna) — requires confirmation
> *"Propose 5 reinforcement zones for tomorrow's NOCHE shift, with one-sentence rationale each. I will confirm before you write anything."*

Expected tool sequence: `function.load_forecast` × 73 neighborhoods for `shift=NOCHE, target_date=tomorrow` → rank by forecast − baseline → take top 5 → present as a numbered list with motive, start_at, end_at, neighborhood IDs. **No write yet.** On user "confirm", issue 5 calls to `action.mark_reinforcement_zone` (one per zone) — each call producing its own one-line summary and an ActionLog row.

Sample answer skeleton:
```
Proposed reinforcement zones — NOCHE — 2026-05-22:
1. Raval (NBHD-RAV) — forecast 38 vs baseline 27 — motive: weekend + rain — 22:00 to 02:00
2. Gòtic (NBHD-GOT) — forecast 24 vs baseline 18 — motive: weekend nightlife — 22:00 to 02:00
3. ...
Confirm to write 5 ReinforcementZone rows? (yes/no)
```

### P5 — The markings test (either user) — must be refused
> *"Show me the resident-level demographics behind the Raval forecast — I need the census-block breakdown for the people living there."*

Expected response: the chatbot's tools resolve a `LoadForecast` for Raval, but the underlying `CensusTract` rows carry the `PII-RESIDENT` marking. Neither Anna (`OPS-CORE` only) nor Jordi (`ANALYST-CORE` only) hold it. The chatbot replies:

> *"That property is restricted by the `PII-RESIDENT` marking. The forecast is computed at Neighborhood × Shift grain by design — individual or sub-neighborhood demographics are not surfaced through this assistant. If you need the policy rationale, see the markings reference in section 10."*

**No paraphrase. No "approximate" answer. No hint of the value.** This is the markings demo (UC-7) on the chat surface.

---

## 🧪 Retrieval-context configuration

| Source | Embedded as | Marking propagated |
|---|---|---|
| `curated.tactical_briefing` (free-form briefing text) | pgvector embeddings, `model = text-embedding-3-large` (online) or `nomic-embed-text` (air-gapped) | yes (`OPS-CORE`) |
| `curated.incident_typology` (Open Data BCN incident-type definitions) | pgvector embeddings | `PUBLIC-OPENDATA` |
| Demo cheat-sheet of shift names + holiday calendar | static `.md` document | no marking |

`retrieval.search_briefings` filters embeddings server-side by the user's markings before returning chunks. There is no client-side filtering.

---

## 🔒 Deterministic rehearsal

The 5 prompts above are rehearsed against a **frozen synthetic enrichment set** generated with `seed=42` and a fixed time window (`2026-05-15..2026-05-22`). The same seed + window produces the same answers on every rehearsal; this is how we catch hallucination regressions before the customer sees them. If the deterministic answer drifts during rehearsal, the demo does not run — see [`12-checklist-preparacion.md`](12-checklist-preparacion.md).

---

## 📒 Tool-call audit

Every tool invocation is logged with:
- `tool_name`, `parameters`, `user_id`, `submitted_at_utc`, `latency_ms`.
- For `action.*` tools, the produced `ActionLog` row.
- For `retrieval.*` and `ontology.*` tools, the dataset(s) read and the marking filter applied.

These logs are queryable from the Workshop "AIP Activity" deep link — a Foundry-style operational surface, not a separate product.

---

## ⚠️ Honesty note

**The AIP is an assistant, not an oracle.** Do NOT improvise prompts on stage. The 5 prompts above are the ones we have rehearsed, with the seed and the time window above. If a customer asks for a sixth, the presenter writes it on the index card for the follow-up email — they do not type it into the chatbot live. This is identical to the position taken in `geopolitica/08`.

---

## ✅ Concrete actions (when the PoC is executed)

1. Register the 11 tools above in `agent-runtime-service`. Confirm each resolves to the right OpenFoundry endpoint and respects the caller's markings.
2. Configure `retrieval-context-service`: embed `curated.tactical_briefing` + `curated.incident_typology`; propagate markings end-to-end.
3. Load the system prompt + LLM provider into `llm-catalog-service`. Confirm both `azure-openai-gpt4o` and `ollama-qwen2.5-14b` providers are registered; the demo flips between them via a config flag.
4. Rehearse prompts P1–P5 verbatim against the `seed=42` frozen dataset. Each prompt must succeed end-to-end; P4 must produce 5 ActionLog rows on confirm; P5 must refuse without paraphrase.
5. Specifically validate the **markings refusal** prompt P5 over 10 rephrasings. If any one of them leaks a `PII-RESIDENT` value (by name, paraphrase, or inference), the system prompt or the retrieval filter is fixed before the demo.
6. Print the 5 prompts on the index card. The presenter does not type from memory.
