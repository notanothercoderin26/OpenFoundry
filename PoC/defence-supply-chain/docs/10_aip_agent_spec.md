# AIP Agent Spec — Analyst Assistant

The PoC includes a single AIP Agent configured in Agent Studio. Its role is narrow on purpose: an analyst-side assistant that paraphrases questions over the ontology defined in [`08_ontology_design.md`](08_ontology_design.md), calls pre-built AIP Logic functions to fetch structured answers, and stays inside its lane. It is not a decision-maker, not a free-form chatbot, and not an investigator.

## Agent purpose and persona

The agent is positioned as an **analyst assistant bound to the ontology**. It answers bounded, factual questions about suppliers, contracts, projects, sanctions targets, countries, and jurisdictions, using the pre-built AIP Logic functions listed below. It refuses anything that is not expressible as a function call over those object types.

The persona makes three things explicit in every interaction:

- The unit of analysis is the **legal entity**. Natural-person questions are out of scope.
- Candidate sanctions matches are **candidates**, not findings. Confirmation is a human action, taken in the Workshop console described in [`09_workshop_app_spec.md`](09_workshop_app_spec.md), and never by the agent.
- The agent answers from the ontology; if a question requires data not in the ontology, it says so rather than guessing.

The agent is not a substitute for the Workshop console. It accelerates discovery — "where in the console should I look?" — and turns natural-language analyst questions into structured queries.

## Ontology objects the agent may query

The agent is allowed to read the following object types, via bound AIP Logic functions:

- `Supplier`
- `Contract`
- `Project`
- `SanctionsTarget`
- `Country`
- `Jurisdiction`

It is **not** allowed to query `Person` records or any natural-person attribute, anywhere in the ontology or any underlying dataset. This restriction follows directly from the scope frame in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).

> ⚠️ VERIFY: confirm the AIP Agent Studio tool-gating semantics on your tenancy; the intended behaviour is that the agent only sees the listed object types via bound functions and has no general-purpose query tool that could bypass the gate.

## Pre-built AIP Logic functions

The agent has access to a small set of AIP Logic functions. Each is a bound tool with a documented signature; the agent picks among them based on the prompt. No free SQL, no free Spark.

- `get_supplier_by_name(name_query: string) -> list<Supplier>` — fuzzy lookup over `Supplier.name_normalized` and known aliases, returning the top N candidates by similarity score. Used whenever the analyst names a supplier in free text.
- `get_top_suppliers_by_country(country_iso2: string, year: int, limit: int=10) -> list<Supplier>` — suppliers ranked by `total_award_value_eur` aggregated over the requested year, filtered to a country code. The default limit is ten.
- `get_sanctions_matches(supplier_id: string) -> list<SanctionsTarget>` — returns both candidate (`candidate_match`) and confirmed (`confirmed_match`) sanctions targets for the supplier, with the match score and reviewer status of each.
- `summarize_consortium(project_id: string) -> ConsortiumSummary` — returns the list of beneficiaries of an EDF `Project`, with each beneficiary's role (coordinator vs member), country, and any sanctions match flag.
- `get_contracts_for_supplier(supplier_id: string, year_min: int=null, year_max: int=null) -> list<Contract>` — contracts awarded to the supplier in an optional year window.
- `get_jurisdiction_for_supplier(supplier_id: string) -> Jurisdiction` — returns the supplier's registered jurisdiction with the jurisdiction risk tier as defined in [`08_ontology_design.md`](08_ontology_design.md).

Each function is implemented in AIP Logic and exposed to the agent as a tool. Tool selection is the agent's job; argument extraction is the agent's job; result paraphrasing is the agent's job. The agent does not invent data when a function returns an empty list — it says the result was empty.

## Tested demo prompts

Three prompts are rehearsed for the live demo. The expected behaviour is described in prose; no faked transcripts appear here, because the actual answers depend on the dataset version loaded at demo time.

1. *"Which suppliers received the largest defence contracts in 2023 from Germany?"* — the agent recognises this as a country-and-year ranked-supplier question, calls `get_top_suppliers_by_country` with `country_iso2='DE'` and `year=2023`, and paraphrases the returned ranked list. It cites the underlying ontology query and the dataset version (per the tip in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md) about surfacing dataset metadata).
2. *"Show me suppliers from non-EU jurisdictions that have won contracts and have an open sanctions candidate match."* — a combined query. The agent recognises it must filter on `Jurisdiction.eu_member = false` and join through the `candidate_match` link to `SanctionsTarget` with `reviewer_status = pending`. If this combination is not directly available as a single function, the agent decomposes the query, calls the closest function (for example, `get_top_suppliers_by_country` per non-EU country and `get_sanctions_matches` per result), and returns a synthesis with explicit caveats about completeness.
3. *"Summarize the consortium of EDF project [X]."* — the agent calls `summarize_consortium(project_id)`, lists the members with their roles and any match flags, and notes the coordinator separately.

> 💡 TIP: keep a small printed index card with these three prompts written verbatim, in the order they will be asked. Improvising prompts during a live demo is the single most common reason geopolitical-PoC rehearsals fail. The index card is the rehearsal model that worked in similar PoCs and is worth copying here.

## Refusal and escalation behaviour

The agent must refuse or escalate the following classes of request. The implementation is via system prompt plus tool-gating, but the intent is stated here:

- **Individual-level questions about natural persons** — for example *"who owns Acme GmbH?"* or *"who is the CEO of supplier X?"* — refused with a short explanation that the unit of analysis is the legal entity and that natural-person data is out of scope per the scope frame.
- **Predictive questions** — for example *"which suppliers are likely to be sanctioned next?"* or *"is this supplier likely to fail screening?"* — refused. The agent explains that the PoC produces deterministic, explainable signals and does not classify suppliers probabilistically.
- **Questions outside the ontology** — general OSINT, geopolitics commentary, unrelated procurement domains, or anything resembling operational military data — refused. The agent explains that it can only answer from the listed object types and suggests rephrasing.
- **Requests to auto-execute write-back actions** — for example *"confirm this sanctions match for me"* — escalated. The agent may **propose** a candidate match worth review, with a recommendation to open the Workshop alerts queue, but never calls `confirm_sanctions_match` or `dismiss_false_positive` itself. Action ownership stays with the human reviewer.

> ⚠️ VERIFY: confirm the refusal-pattern semantics on your AIP Agent Studio tenancy. The standard implementation is system-prompt-driven; tool-gating prevents the agent from calling actions even if the prompt is bypassed.

## Limits of LLMs over tabular data

The agent is wrapped around a language model, with all the failure modes language models bring to structured data. Two are worth surfacing for the demo audience:

- **Hallucination over names and numbers.** When asked for a supplier name, an LLM can produce a plausible-looking but invented string. The mitigation is that the agent never invents data — every entity name and number in its reply comes from a bound-function call. If `get_supplier_by_name` returns nothing, the agent says so.
- **Name-spelling variance.** TED records carry national legal-form suffixes, transliterations, and historical variants. The fuzzy lookup in `get_supplier_by_name` handles this; the agent must paraphrase the question rather than copy the user's spelling verbatim into its answer. This is the operational reason for using bound functions rather than free SQL — the function controls how matching is done.

For full context on entity-resolution failure modes see [`07_entity_resolution.md`](07_entity_resolution.md); for the broader ethical framing of LLM-mediated analyst tooling see [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).
