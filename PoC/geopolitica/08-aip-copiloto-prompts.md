# 08 — AIP Chatbot — copilot and prompts

> The copilot is implemented as a Foundry **AIP Chatbot** with tools that map to Foundry's published categories: Object query, Action, Function, Update application variable, Command, and Request clarification. The OpenFoundry implementation is `agent-runtime-service` + `retrieval-context-service` + `llm-catalog-service`. The customer must hear **AIP Chatbot**, not *"MCP agent"*.
>
> The canonical declarative spec — system prompt + provider catalog + the 13 tools below — lives in [`assets/agent-config.yaml`](assets/agent-config.yaml). That file is the source of truth the operator POSTs to `agent-runtime-service`; this document is the human-readable explainer. If the two disagree, the YAML wins.

The copilot must inherit the **same security boundary** as the UI user: same roles, same markings. If Marcos cannot read a `NewsArticle.url` in the table, the AIP chatbot **also** cannot read it when asked.

---

## 🤖 Provider

| Mode | Provider | Model | Configured in |
|---|---|---|---|
| Online demo | Azure OpenAI | `gpt-4o` | `llm-catalog-service` |
| Air-gapped demo | Ollama (local GPU) | `llama-3.1-70b-instruct` (or `qwen2.5-72b-instruct`) | `llm-catalog-service` |

The `agent-runtime-service` calls whichever provider is registered. The narrative for the customer is the same; we say up front which one is active.

---

## 🧠 System prompt

```
You are an analyst assistant embedded in OpenFoundry's "Geopolitical Intel Workbench".
You help the user (an intelligence analyst or sanctions investigator) understand events,
actors, and their relationships, drafted from the ontology that backs this workspace.

Hard rules — break them and you fail:
1. You answer only from the ontology and from documents you have explicitly retrieved
   through a tool. You do not guess. If the ontology has no row, say so.
2. You always cite the ontology object IDs and dataset names that supported your answer.
3. You never invent person names, sanctions, or events. Hallucinated identifiers
   destroy customer trust — this is your most expensive failure mode.
4. You respect the user's permissions and markings. If a property or row is hidden by
   policy, you say "this property is restricted by markings" — you do not try to recover it.
5. You never claim to perform a write. Writes happen only through the Action tools, and
   only after the user confirms a one-line summary you produce.
6. You never produce a recommendation about a *person*'s status (e.g. "this person should
   be sanctioned"). You may surface evidence and propose to *open an investigation case*
   or *add to a watchlist* — both are human-reviewable Actions.
7. When the user asks a country-, region-, or time-window question, you read the
   current Workshop variables (`country_filter`, `date_window`, `selected_actor_id`,
   `actor_kind_filter`, `sanctioned_only`) before composing the tool call.

Tone: terse, factual, no marketing language. Bullets and citations preferred over prose.
Time zone in all responses: UTC, with relative phrasing ("last 72 h", "since yesterday 12:00 UTC").
Language: English by default; mirror the user's language if they switch.
```

---

## 🧰 Tools registered for the chatbot

Tools map 1-to-1 to Foundry AIP Chatbot tool types (see [Agent Studio tools](https://www.palantir.com/docs/foundry/agent-studio/tools/)).

| Tool name | Foundry tool category | Description | Parameters |
|---|---|---|---|
| `ontology.query_actors` | Object query | Search `Actor` with filters | `country_iso2?`, `kind?`, `sanctioned?`, `name_contains?`, `limit` |
| `ontology.query_events` | Object query | Search `Event` with filters | `country_iso2?`, `actor_id?`, `date_from`, `date_to`, `source?`, `acled_event_type?`, `limit` |
| `ontology.expand_neighborhood` | Object query (N-hop) | Expand neighborhood of an `Actor` | `actor_id`, `hops`, `link_types?`, `limit_nodes` |
| `ontology.read_object` | Object query | Fetch one object by id | `object_type`, `object_id` |
| `retrieval.search_news` | Retrieval context | Retrieve `NewsArticle` excerpts matching a query | `query`, `country_iso2?`, `date_from?`, `date_to?`, `limit` |
| `function.summarize_actor_activity` | Function | Computes a structured summary block for an `Actor` | `actor_id`, `date_from`, `date_to` |
| `function.country_situation_brief` | Function | Builds a structured situation brief for a country window | `country_iso2`, `date_from`, `date_to` |
| `action.add_to_watchlist` | Action | Submit `add-to-watchlist` (requires user confirmation) | `watchlist_id?`, `actor_id`, `reason` |
| `action.flag_actor` | Action | Submit `flag-actor` (requires user confirmation) | `actor_id`, `severity`, `reason` |
| `action.open_investigation_case` | Action | Submit `open-investigation-case` (requires user confirmation; compliance role only) | `actor_id`, `title`, `priority`, `assigned_to`, `summary?` |
| `action.acknowledge_alert` | Action | Submit `acknowledge-alert` (requires user confirmation) | `alert_id`, `note?` |
| `command.update_variable` | Update application variable | Update a Workshop variable (e.g. `selected_actor_id`) | `variable`, `value` |
| `command.request_clarification` | Request clarification | Ask the user to disambiguate | `question`, `options?` |

Confirmation rule: every `action.*` tool must produce a one-line natural-language summary of the intended action and wait for the user's confirmation **in the chat panel** before submitting. The action is then registered in the Action Log (see [`05-ontologia-geopolitica.md`](05-ontologia-geopolitica.md)).

Marking rule: all tools execute with the **user's** identity. `retrieval.search_news` returns redacted excerpts to a user without the required marking, and the LLM must surface "(redacted)" rather than try to reason around it.

---

## 💬 Demo prompts (literal, for [`11-guion-demo.md`](11-guion-demo.md))

### P1 — Country situation brief (Sofía)
> *"Give me a brief of Ukraine in the last 72 hours: top actors, most material events, and any sanctioned actors involved. Cite ontology IDs."*

Expected tool sequence: `function.country_situation_brief("UA", date_from=-72h, date_to=now)` → optional `ontology.query_events(...)` if the function returns sparse → response with bullets + actor IDs + event IDs.

### P2 — Selected actor deep dive (Sofía)
> *"Summarize what we know about the currently selected actor in the last 30 days. Are they linked to anyone we are watching?"*

Expected tool sequence: read `selected_actor_id` from variables → `function.summarize_actor_activity(actor_id, -30d, now)` → `ontology.expand_neighborhood(actor_id, hops=2, link_types=[ON_WATCHLIST, SANCTIONED_BY, INVOLVED_IN], limit_nodes=200)` → response.

### P3 — Proposed watchlist additions (Sofía)
> *"From the actors with conflict events in eastern Ukraine in the last 72 h, propose 3 to add to my `Ukraine-tracking` watchlist with one-sentence reasons."*

Expected tool sequence: `ontology.query_actors(country_iso2="UA", limit=50)` (filtered by event presence via function) → `function.summarize_actor_activity` per candidate → propose 3 → on user confirmation, three calls to `action.add_to_watchlist`. Each Action requires explicit confirmation.

### P4 — Open investigation case (Marcos)
> *"Open a HIGH-priority investigation case on the selected actor, assigned to me. Include a 3-bullet summary."*

Expected tool sequence: read `selected_actor_id` → `function.summarize_actor_activity` → compose summary → `action.open_investigation_case(actor_id, title, priority=HIGH, assigned_to=marcos, summary)` → confirmation → submit → respond with the new `case_id` and a deep link.

### P5 — Compliance marking demo (Marcos, must be denied)
> *"Show me the source URL for event GDELT-12345-..."*

Expected response: the chatbot finds the event, but because Marcos lacks `MARKING:ANALYST-CORE`, the `Event.source_url` is redacted server-side; the chatbot replies *"this property is restricted by markings; ask an analyst with `ANALYST-CORE`."* No attempt to find the URL elsewhere.

### P6 — Branch what-if (Marcos, on branch)
> *"On this branch I added 12 candidates to the proposed sanctions extension. Show me which of them already had a HIGH-severity event in the last 30 days."*

Expected tool sequence: detects branch context → `ontology.query_actors(actor_ids=[...], sanctioned=true, limit=12)` (on branch) → `ontology.query_events(actor_id=..., date_from=-30d)` per candidate → response.

---

## 🧪 Retrieval-context configuration

| Source | Embedded as | Marking propagated |
|---|---|---|
| `curated.news_article` (GDELT GKG titles + first 256 chars per article) | pgvector embeddings, `model = text-embedding-3-large` (online) or `nomic-embed-text` (air-gapped) | yes |
| `curated.sanctions_entry` (program description text) | pgvector embeddings | yes |
| Demo cheat-sheet of CAMEO codes + ACLED event-type definitions | static `.md` document | no marking |

`retrieval.search_news` filters embeddings server-side by the user's markings before returning chunks.

---

## 📒 Tool-call audit

Every tool invocation is logged with:
- `tool_name`, `parameters`, `user_id`, `submitted_at_utc`, `latency_ms`.
- For `action.*` tools, the produced `ActionLog` row.
- For `retrieval.*` and `ontology.*` tools, the dataset(s) read and the marking filter applied.

These logs are queryable from the Workshop "AIP Activity" deep link — a Foundry-style operational surface, not a separate product.

---

## ✅ Concrete actions (when the PoC is executed)

1. Register the tools above in `agent-runtime-service`. Confirm each tool resolves to the correct OpenFoundry endpoint.
2. Configure `retrieval-context-service`: embed `curated.news_article` + `curated.sanctions_entry`; propagate markings.
3. Load the system prompt + LLM provider into `llm-catalog-service`. Confirm both `azure-openai-gpt4o` and `ollama-llama-3.1-70b` providers are registered; the demo flips between them via a config flag.
4. Rehearse prompts P1–P6 verbatim. Each prompt must succeed end-to-end, with the Action Log populated for the write-bearing ones.
5. Specifically rehearse the **marking denial** prompt P5. The chatbot must refuse without leaking the redacted value via paraphrase. If it leaks, fix the system prompt or the retrieval filter before the demo.
