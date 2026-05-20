# 05 — Geopolitical Ontology

> The **ontology model** is the central asset of Foundry and OpenFoundry. It defines the "things that matter" to the business, their properties, and how they relate. Here is the complete model for the geopolitical PoC, ready to load into `ontology-definition-service`.

---

## 🧱 Entities (object types)

| ID | Name | Description | Source dataset |
|---|---|---|---|
| `Actor` | Resolved actor (umbrella interface) | The output of the entity-resolution transform; one row per unique actor across all sources. | `curated.actor` |
| `Person` | Concrete person | A natural person — subclass / interface implementation of `Actor`. | `curated.actor` (filtered by `kind=PERSON`) |
| `Organization` | Concrete organization | A non-state organization (company, NGO, criminal network) — Actor subclass. | `curated.actor` (filtered by `kind=ORG`) |
| `ArmedGroup` | Non-state armed group | Faction in armed conflict (per ACLED actor schema) — Actor subclass. | `curated.actor` (filtered by `kind=ARMED_GROUP`) |
| `GovernmentBody` | State / government body | Ministry, agency, executive office — Actor subclass. | `curated.actor` (filtered by `kind=GOV`) |
| `Event` | Geopolitical event | A CAMEO/ACLED-typed event with location and actor links. | `curated.event` |
| `NewsArticle` | News source article | Per-article record (GDELT GKG). | `curated.news_article` |
| `Location` | Geo-location (city/region/coords) | | `curated.location` |
| `Country` | Country | ISO 3166-1 alpha-2 / alpha-3. | `curated.country` |
| `SanctionsEntry` | Sanctions list entry | One row per (program, listed entity, jurisdiction). | `curated.sanctions_entry` |
| `Watchlist` | Internal analyst watchlist | Created by analysts via the `add-to-watchlist` action. | `ontology.watchlist` |
| `InvestigationCase` | Case-management object | Created by the `open-investigation-case` action. | `ontology.investigation_case` |
| `ActorAlert` | Alert event raised by a workflow | Generated when a watchlisted Actor matches new activity. | `ontology.actor_alert` |
| `ActionLog` | Action submission audit | Materialized per Action Type submission. | `ontology.action_log` |

> `Actor` is exposed as an **interface** (in Foundry terms) implemented by `Person`, `Organization`, `ArmedGroup`, `GovernmentBody`. Workshop widgets bind to the `Actor` interface so analysts can pivot uniformly.

---

## 🔗 Relationships (link types)

| Relationship | From | To | Cardinality | Notes |
|---|---|---|---|---|
| `MENTIONED_IN` | `Actor` | `NewsArticle` | N—N | From GDELT GKG. |
| `INVOLVED_IN` | `Actor` | `Event` | N—N | From GDELT Actor1/2 + ACLED actor1/2 columns. |
| `OCCURRED_AT` | `Event` | `Location` | N—1 | |
| `LOCATED_IN` | `Location` | `Country` | N—1 | |
| `SANCTIONED_BY` | `Actor` | `SanctionsEntry` | N—N | From OFAC + EU + OpenSanctions, after ER. |
| `MEMBER_OF` | `Person` | `Organization` | N—N | Wikidata + OpenSanctions. |
| `AFFILIATED_WITH` | `Organization` | `Organization` | N—N | Parent/subsidiary, controlled-by, etc. |
| `CITIZEN_OF` | `Person` | `Country` | N—N | Wikidata P27. |
| `ASSOCIATED_WITH` | `Actor` | `Actor` | N—N | Generic relationship (co-mention pattern + sanctions linkage). |
| `ON_WATCHLIST` | `Watchlist` | `Actor` | N—N | Set by `add-to-watchlist` action. |
| `INVESTIGATES` | `InvestigationCase` | `Actor` | N—N | Set when a case opens. |
| `RAISED_FOR` | `ActorAlert` | `Actor` | N—1 | Set by the watchlist→alert workflow. |
| `EVIDENCE_OF` | `Event` | `InvestigationCase` | N—N | Analyst-curated evidence list. |

---

## 🧬 Properties per entity

### `Actor` (interface) — common properties on `Person` / `Organization` / `ArmedGroup` / `GovernmentBody`
| Property | Type | PII | Notes |
|---|---|---|---|
| `actor_id` (PK) | string | no | Stable ID produced by ER. |
| `display_name` | string | no | Canonical name. |
| `aliases` | list<string> | no | Cross-source alt names. |
| `kind` | enum | no | PERSON / ORG / ARMED_GROUP / GOV |
| `wikidata_qid` | string nullable | no | If resolved to Wikidata. |
| `country_iso2` | string nullable | no | Primary country. |
| `is_sanctioned` | bool | no | Computed from `SANCTIONED_BY`. |
| `last_seen_at_utc` | timestamp nullable | no | From newest `INVOLVED_IN`. |
| `event_count_30d` | int | no | Rolling window count. |
| `reliability_score` | float [0,1] nullable | no | From synthetic enrichment (analyst tradecraft). |
| `tradecraft_tags` | list<string> | no | From synthetic enrichment. |
| `source_ids` | map<string, string> | no | Lineage to source-row IDs (ER provenance). |

### `Person` (extra)
`date_of_birth` (date nullable), `place_of_birth` (string nullable), `position_held` (list<string>), `pep_class` (enum nullable: HEAD_OF_STATE / MINISTER / JUDICIAL / SOE_EXEC / FAMILY / ASSOCIATE)

### `Organization` (extra)
`founded_year` (int nullable), `industry_codes` (list<string>), `parent_organization_id` (string nullable), `headquarters_location_id` (string nullable)

### `Event`
| Property | Type | Notes |
|---|---|---|
| `event_id` (PK) | string | "GDELT-<global_event_id>" or "ACLED-<data_id>" |
| `source` | enum | GDELT / ACLED / SYNTH |
| `event_datetime_utc` | timestamp | |
| `cameo_event_code` | string nullable | GDELT only |
| `cameo_quad_class` | enum nullable | VERBAL_COOP / MATERIAL_COOP / VERBAL_CONF / MATERIAL_CONF |
| `acled_event_type` | string nullable | ACLED only |
| `acled_sub_event_type` | string nullable | |
| `fatalities` | int nullable | ACLED only |
| `tone` | float nullable | GDELT only |
| `goldstein_scale` | float nullable | GDELT only |
| `actor1_id` | string | FK → `Actor.actor_id` |
| `actor2_id` | string nullable | FK |
| `location_id` | string nullable | FK |
| `country_iso2` | string nullable | FK |
| `source_url` | string nullable | **Marking: `OPEN-SOURCE` + `ANALYST-CORE`** — redacted for `COMPLIANCE-CORE` users. |

### `NewsArticle`
`article_id` (PK), `url`, `publish_datetime_utc`, `language`, `domain`, `title`, `outlet`, `themes` (list<string>), `tone` (float), `actors_mentioned` (list<string>).

### `Location`
`location_id` (PK), `name`, `lat`, `lon`, `country_iso2`, `admin1_name`, `admin2_name`, `precision` (enum: COUNTRY / ADMIN1 / CITY / GEOPOINT)

### `Country`
`iso2` (PK), `iso3`, `name`, `region`, `subregion`

### `SanctionsEntry`
| Property | Type | Notes |
|---|---|---|
| `entry_id` (PK) | string | |
| `program` | string | "SDGT", "UKRAINE-EO13662", "EU-CFSP-2014/145", etc. |
| `jurisdiction` | enum | US / EU / UK / UN / OTHER |
| `listed_entity_name` | string | as-published |
| `listed_at` | date | |
| `delisted_at` | date nullable | |
| `source_dataset` | enum | OFAC / EU / OPENSANCTIONS |
| `resolved_actor_id` | string nullable | FK → `Actor.actor_id` (after ER) |

### `Watchlist`
`watchlist_id` (PK), `name`, `description`, `created_by_user_id`, `created_at_utc`, `priority` (enum), `member_count` (computed).

### `InvestigationCase`
`case_id` (PK), `title`, `status` (OPEN/IN_REVIEW/CLOSED_NO_ACTION/ESCALATED), `priority`, `opened_by_user_id`, `assigned_to_user_id`, `opened_at_utc`, `closed_at_utc` (nullable), `summary` (string, edited by analyst), `subject_actor_ids` (list<string>).

### `ActorAlert`
`alert_id` (PK), `watchlist_id` (FK), `subject_actor_id` (FK), `triggering_event_id` (FK), `raised_at_utc`, `acknowledged_at_utc` (nullable), `acknowledged_by_user_id` (nullable).

### `ActionLog`
`log_id` (PK), `action_type_id`, `actor_user_id`, `submitted_at_utc`, `target_object_type`, `target_object_id`, `parameters` (json), `outcome` (enum: SUCCESS / VALIDATION_REJECT / POLICY_REJECT / SIDE_EFFECT_FAIL), `produced_edits` (list of object refs).

---

## ⚡ Actions (action types) registered in `ontology-actions-service`

> An **action** is a write operation on the ontology, with permissions, validation, audit, and possible workflow triggering.

| Action ID | On | Parameters | Effect | Required permission |
|---|---|---|---|---|
| `add-to-watchlist` | `Watchlist` (or new) | `watchlist_id: string?`, `actor_id: string`, `reason: string` | adds `ON_WATCHLIST` link; if `watchlist_id` is null, creates a new `Watchlist` | `role:analyst` |
| `remove-from-watchlist` | `Watchlist` | `actor_id: string`, `reason: string` | removes link | `role:analyst` |
| `flag-actor` | `Actor` | `severity: enum`, `reason: string` | sets `flagged=true`; raises an `ActorAlert` if any active watchlist contains it | `role:analyst` |
| `open-investigation-case` | `Actor` (subject) | `title: string`, `priority: enum`, `assigned_to: user_id`, `summary: string?` | creates an `InvestigationCase`, links `INVESTIGATES`, triggers `case-opened` workflow (Marcos notified) | `role:compliance` |
| `acknowledge-alert` | `ActorAlert` | `note: string?` | sets `acknowledged_at_utc` and `acknowledged_by_user_id` | `role:analyst` or `role:compliance` |
| `attach-evidence-to-case` | `InvestigationCase` | `event_ids: list<string>` | creates `EVIDENCE_OF` links | `role:compliance` |
| `close-case` | `InvestigationCase` | `outcome: enum`, `closing_summary: string` | sets `status=CLOSED_NO_ACTION` or `ESCALATED`; freezes the case | `role:compliance` + `approval:senior-compliance` |
| `propose-sanctions-extension` | `Watchlist` (or set of actors) | `actor_ids: list<string>`, `rationale: string` | **branch-only** — adds `SanctionsEntry` rows on the branch dataset, previews impact in Workshop. Merge requires senior approval. | `role:compliance` + `branch-context` |

> These actions are executed from the UI **and** can be invoked by the AIP copilot — always with audit and, when applicable, with human confirmation. `propose-sanctions-extension` is **only** executable inside a Global Branch context — this is the UC-6 demo and a Foundry-native pattern.

---

## 📥 Loading the ontology into `ontology-definition-service`

The service accepts a **declarative** YAML/JSON definition. Template (excerpt — full file to be materialized at execution time):

```yaml
ontology:
  id: geopolitica-poc
  version: 1
  description: "Ontology for OpenFoundry Geopolitical PoC"

  interfaces:
    - id: Actor
      properties:
        - { id: actor_id,         type: string, required: true }
        - { id: display_name,     type: string, required: true }
        - { id: aliases,          type: list[string] }
        - { id: kind,             type: enum, values: [PERSON, ORG, ARMED_GROUP, GOV] }
        - { id: wikidata_qid,     type: string, nullable: true }
        - { id: country_iso2,     type: string, nullable: true }
        - { id: is_sanctioned,    type: bool, computed: true }
        - { id: last_seen_at_utc, type: timestamp, nullable: true, computed: true }
        - { id: event_count_30d,  type: int, computed: true }
        - { id: reliability_score, type: float, nullable: true }
        - { id: tradecraft_tags,  type: list[string] }
        - { id: source_ids,       type: map[string,string] }

  object_types:
    - id: Person
      implements: [Actor]
      primary_key: actor_id
      backed_by: { dataset: curated.actor, branch: main, where: "kind = 'PERSON'" }
      properties:
        - { id: date_of_birth,    type: date, nullable: true }
        - { id: place_of_birth,   type: string, nullable: true }
        - { id: position_held,    type: list[string] }
        - { id: pep_class,        type: enum, nullable: true,
            values: [HEAD_OF_STATE, MINISTER, JUDICIAL, SOE_EXEC, FAMILY, ASSOCIATE] }

    - id: Organization
      implements: [Actor]
      primary_key: actor_id
      backed_by: { dataset: curated.actor, branch: main, where: "kind = 'ORG'" }
      properties:
        - { id: founded_year,              type: int, nullable: true }
        - { id: industry_codes,            type: list[string] }
        - { id: parent_organization_id,    type: string, nullable: true }
        - { id: headquarters_location_id,  type: string, nullable: true }

    - id: Event
      primary_key: event_id
      backed_by: { dataset: curated.event, branch: main }
      properties:
        - { id: event_id,            type: string, required: true }
        - { id: source,              type: enum, values: [GDELT, ACLED, SYNTH] }
        - { id: event_datetime_utc,  type: timestamp }
        - { id: cameo_event_code,    type: string, nullable: true }
        - { id: cameo_quad_class,    type: enum, nullable: true,
            values: [VERBAL_COOP, MATERIAL_COOP, VERBAL_CONF, MATERIAL_CONF] }
        - { id: acled_event_type,    type: string, nullable: true }
        - { id: fatalities,          type: int,    nullable: true }
        - { id: tone,                type: float,  nullable: true }
        - { id: goldstein_scale,     type: float,  nullable: true }
        - { id: actor1_id,           type: string }
        - { id: actor2_id,           type: string, nullable: true }
        - { id: location_id,         type: string, nullable: true }
        - { id: country_iso2,        type: string, nullable: true }
        - { id: source_url,          type: string, nullable: true,
            markings: [OPEN-SOURCE, ANALYST-CORE] }

    # ... remaining: NewsArticle, Location, Country, SanctionsEntry,
    #     Watchlist, InvestigationCase, ActorAlert, ActionLog

  link_types:
    - { id: MENTIONED_IN,     from: Actor, to: NewsArticle,    cardinality: N-N }
    - { id: INVOLVED_IN,      from: Actor, to: Event,          cardinality: N-N }
    - { id: OCCURRED_AT,      from: Event, to: Location,       cardinality: N-1 }
    - { id: LOCATED_IN,       from: Location, to: Country,     cardinality: N-1 }
    - { id: SANCTIONED_BY,    from: Actor, to: SanctionsEntry, cardinality: N-N }
    - { id: MEMBER_OF,        from: Person, to: Organization,  cardinality: N-N }
    - { id: AFFILIATED_WITH,  from: Organization, to: Organization, cardinality: N-N }
    - { id: CITIZEN_OF,       from: Person, to: Country,       cardinality: N-N }
    - { id: ASSOCIATED_WITH,  from: Actor, to: Actor,          cardinality: N-N, computed: true }
    - { id: ON_WATCHLIST,     from: Watchlist, to: Actor,      cardinality: N-N }
    - { id: INVESTIGATES,     from: InvestigationCase, to: Actor, cardinality: N-N }
    - { id: RAISED_FOR,       from: ActorAlert, to: Actor,     cardinality: N-1 }
    - { id: EVIDENCE_OF,      from: Event, to: InvestigationCase, cardinality: N-N }

  action_types:
    - id: add-to-watchlist
      target: Watchlist
      params:
        - { id: watchlist_id, type: string, nullable: true }
        - { id: actor_id,     type: string, required: true }
        - { id: reason,       type: string, required: true }
      effect:
        - kind: create_or_update
          object: Watchlist
          when: "{{params.watchlist_id == null}}"
          fields:
            name: "Watchlist created by {{user}} at {{now()}}"
            created_by_user_id: "{{user}}"
            created_at_utc: "{{now()}}"
            priority: "MEDIUM"
        - kind: create_link
          link_type: ON_WATCHLIST
          from: "{{watchlist_id or last_created.watchlist_id}}"
          to:   "{{params.actor_id}}"
        - kind: trigger_workflow
          workflow: watchlist-membership-changed
      auth: { required_roles: [analyst] }
      audit: true

    - id: open-investigation-case
      target: Actor
      params:
        - { id: title,        type: string, required: true }
        - { id: priority,     type: enum, values: [LOW, MEDIUM, HIGH, CRITICAL] }
        - { id: assigned_to,  type: user_id, required: true }
        - { id: summary,      type: string, nullable: true }
      effect:
        - kind: create
          object: InvestigationCase
          fields:
            title:               "{{params.title}}"
            priority:            "{{params.priority}}"
            opened_by_user_id:   "{{user}}"
            assigned_to_user_id: "{{params.assigned_to}}"
            opened_at_utc:       "{{now()}}"
            status:              "OPEN"
            subject_actor_ids:   ["{{target.actor_id}}"]
            summary:             "{{params.summary}}"
        - kind: create_link
          link_type: INVESTIGATES
          from: "{{last_created.case_id}}"
          to:   "{{target.actor_id}}"
        - kind: trigger_workflow
          workflow: case-opened
      auth: { required_roles: [compliance] }
      audit: true

    - id: propose-sanctions-extension
      target: Watchlist
      params:
        - { id: actor_ids, type: list[string], required: true }
        - { id: rationale, type: string, required: true }
      effect:
        - kind: branch_only
        - kind: create
          object: SanctionsEntry
          for_each: "{{params.actor_ids}}"
          fields:
            entry_id:           "PROPOSED-{{uuid()}}"
            program:            "PROPOSED-EXTENSION"
            jurisdiction:       "US"
            listed_entity_name: "{{actor.display_name}}"
            listed_at:          "{{today()}}"
            source_dataset:     "OPENSANCTIONS"
            resolved_actor_id:  "{{actor_id}}"
        - kind: create_link
          link_type: SANCTIONED_BY
          for_each: "{{params.actor_ids}}"
      auth:
        required_roles: [compliance]
        required_context: branch
      audit: true

    # ... remaining: remove-from-watchlist, flag-actor, acknowledge-alert,
    #     attach-evidence-to-case, close-case
```

### Load command
```bash
curl -X POST https://poc.openfoundry.dev/api/ontology/v1/definitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @PoC/geopolitica/assets/ontology-geopolitica.yaml
```

> Pending task: **create `PoC/geopolitica/assets/ontology-geopolitica.yaml`** with the complete YAML. **Do not create now** (decision: keep the template here in the `.md` and materialize it when implementation happens).

---

## 🔍 Sample queries the customer will see running

### 1) Actors with the most events in the last 30 days inside a country
```
ONTOLOGY MATCH (a:Actor)-[:INVOLVED_IN]->(e:Event)-[:OCCURRED_AT]->(:Location)-[:LOCATED_IN]->(c:Country {iso2:'UA'})
WHERE e.event_datetime_utc >= now() - INTERVAL '30 days'
RETURN a.display_name, a.kind, count(e) AS event_count
ORDER BY event_count DESC
LIMIT 25
```

### 2) Sanctioned actors with ≥1 ACLED conflict event in the last 72 h (UC-2)
```
ONTOLOGY MATCH (a:Actor {is_sanctioned: true})-[:INVOLVED_IN]->(e:Event {source:'ACLED'})
WHERE e.event_datetime_utc >= now() - INTERVAL '72 hours'
  AND e.acled_event_type IN ['Battles','Explosions/Remote violence','Violence against civilians']
RETURN a.display_name, a.kind, e.event_id, e.acled_sub_event_type, e.event_datetime_utc
ORDER BY e.event_datetime_utc DESC
```

### 3) 2-hop neighborhood of a designated person (UC-3, graph widget)
```
ONTOLOGY EXPAND (a:Person {actor_id:'ACTOR-1234'})
  ALONG [:MEMBER_OF | :AFFILIATED_WITH | :ASSOCIATED_WITH | :INVOLVED_IN | :SANCTIONED_BY]
  HOPS 2
  LIMIT_NODES 200
RETURN nodes, edges
```

### 4) Action Log entries by a specific user (governance)
```
ONTOLOGY MATCH (log:ActionLog)
WHERE log.actor_user_id = 'marcos@acme-intel.demo'
  AND log.submitted_at_utc >= now() - INTERVAL '24 hours'
RETURN log.action_type_id, log.target_object_type, log.target_object_id, log.outcome, log.submitted_at_utc
ORDER BY log.submitted_at_utc DESC
```

---

## ✅ Concrete actions (when the PoC is executed)

1. Materialize `PoC/geopolitica/assets/ontology-geopolitica.yaml` from the template.
2. Load it into `ontology-definition-service`.
3. Run the 4 queries above as a **smoke test**:
   - Q1 returns > 25 rows.
   - Q2 returns > 0 rows (use a country window known to be active that week).
   - Q3 returns nodes+edges with `len(nodes) ≥ 10`.
   - Q4 returns 0 rows initially (no audit yet); re-run after one Action to confirm > 0.
4. Assign permissions: `analyst` (Sofía) has `add-to-watchlist`, `flag-actor`, `acknowledge-alert`; `compliance` (Marcos) additionally has `open-investigation-case`, `attach-evidence-to-case`, `close-case`, `propose-sanctions-extension` (branch-only).
5. Validate that Sofía (analyst) **cannot** execute `open-investigation-case` (must return 403) and that Marcos (compliance) **cannot** execute `propose-sanctions-extension` outside a branch (must return 409 with "requires branch context").
6. Validate marking enforcement: Sofía sees `Event.source_url`; Marcos sees `[redacted]` and the AIP refuses to read the URL when asked by Marcos.
