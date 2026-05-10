# Agent Automation — Full Capabilities Roadmap

> Goal: any AI agent (Copilot, internal verifier, third-party scripts)
> can introspect, verify and exercise the entire OpenFoundry stack —
> frontend, microservices, databases, infra — through a stable HTTP
> surface, without `kubectl`, without scraping code, and without
> opening a browser.

The roadmap is organised by **capability gaps** observed during the
PoC end-to-end verification (`tools/online-retail/verify_poc.py`).
Each section lists what exists today, the gap, and the concrete tasks
needed to close it. Tasks are grouped into 5 milestones; each
milestone is independently shippable and unblocks the next.

---

## Milestone M0 — Baseline (already in place ✅)

These exist today and are exercised by the verifier:

- `POST /api/v1/auth/login` → JWT (smoke user).
- Ontology read/write/execute under `/api/v1/ontology/*`.
- `GET /api/v1/apps/public/{slug}` for published Workshop apps.
- Per-service `/healthz` and `/metrics` (Prometheus) on `:8080`.
- Cassandra-backed object store, Postgres-backed schemas + outbox.
- Smoke verifier (`tools/online-retail/verify_poc.py`) demonstrating
  the full HTTP-only happy path.

Anything below assumes this baseline.

---

## Milestone M1 — Discovery & Health (the "what is alive" layer)

Without this an agent has to read source code to know which routes
exist, which version is deployed, and whether a dependency is healthy.

### M1.1 Capability catalog

- [x] New library `libs/capabilities`: `Capability{ ID, Service,
      Method, Path, Stable, RequiresAuth, ProtoMessage }`. Each
      handler registers itself at chi-router wiring time.
      → `libs/capabilities/{capability,registry}.go` + tests.
- [x] New endpoint per service `GET /_meta/capabilities` returning the
      service's local catalog (JSON). → `Registry.Mount(r)` wires it.
- [x] Aggregator endpoint on the gateway:
      `GET /api/v1/_meta/capabilities` — fans out to every registered
      service, caches for 30s, returns `{ service: [...] }`.
      → `services/edge-gateway-service/internal/meta/aggregator.go`
      (mounted in `internal/server/server.go` outside the proxy chain).
- [x] Drift CI job: regenerate the catalog snapshot on PR and fail if
      a `Stable: true` capability disappeared without an ADR.
      → `tools/capabilities-snapshot/` (AST-based, no runtime deps)
      writes `docs/agent-automation/stable-capabilities.json`; the
      `capabilities` job in `.github/workflows/openfoundry-go.yml`
      runs `go run ./tools/capabilities-snapshot -check` and fails on
      drift. Local: `make capabilities-snapshot`.

### M1.2 Aggregated health

- [x] Gateway endpoint `GET /api/v1/_meta/health` returning:
      `{ services: [{name, status, payload, error?}], generated_at }`.
      Per-service payload is the upstream `/_meta/health` envelope
      (status `ok`/`degraded`, dependency probe results).
      → `services/edge-gateway-service/internal/meta/aggregator.go`
      (`HealthHandler`); cached for 30s alongside the capability
      and version aggregations.
- [x] Each service implements `GET /_meta/health` and `GET /_meta/deps`
      via `libs/capabilities` (auto-mounted by `Registry.Mount`).
      Probes are registered with `caps.RegisterDependency(...)`; with
      no probes the service still reports `status: ok` and an empty
      dependency list, so the surface is uniform across the fleet.
- [ ] Verifier helper `agent.health()` (Python) that calls
      `_meta/health` and asserts everything is `serving`.

### M1.3 Versions & build provenance

- [x] `GET /_meta/version` per service: `{schema_version, service,
      version, git_sha, git_dirty, built_at, go_version, os, arch}`.
      Auto-mounted by `Registry.Mount`; sources commit/build info
      from `runtime/debug.ReadBuildInfo` so no service needs custom
      ldflags.
- [x] Aggregator `GET /api/v1/_meta/versions` for one-shot drift
      checks. Same fan-out + 30s cache as the capability aggregator.

**Exit criteria:** an agent given only a gateway URL and a JWT can
enumerate every reachable endpoint, the running version of every
service, and the health of every backing store, in 3 HTTP calls.

---

## Milestone M2 — Generic Verification Runner

Today every PoC ships its own bespoke `verify_*.py`. This milestone
turns the verifier into a first-class capability the agent can drive
declaratively.

### M2.1 Scenario DSL

- [ ] Define a JSON/YAML DSL `Scenario v1` with primitives:
      `login`, `http`, `assert.status`, `assert.jsonpath`,
      `assert.count`, `await.condition`, `cleanup`.
- [ ] Reference implementation in Go: `tools/of-cli scenario run
      <file>` — replaces the per-PoC Python verifiers.
- [ ] Port `verify_poc.py` to a `poc-anomaly-review.scenario.yaml`
      under `smoke/scenarios/` as the canonical example.

### M2.2 Server-side scenario runner (optional but powerful)

- [ ] New service `assertion-runner-service` (or extend
      `chaos-runner`): `POST /api/v1/_meta/scenarios/run` accepting a
      Scenario document, executing it against the in-cluster gateway,
      streaming results via SSE.
- [ ] RBAC: gated by a dedicated Cedar policy `agent:run_scenario` so
      only verifier identities can invoke it.

### M2.3 Reusable assertion library

- [ ] `libs/agent-assertions-go`: helpers for the most common checks
      (`AssertObjectCount`, `AssertActionExists`,
      `AssertOutboxDelivered`, `AssertWidgetRenders`).
- [ ] Same surface re-exported as `python/openfoundry_agent/` for
      Python-side callers.

**Exit criteria:** the agent submits a single YAML and gets back a
structured pass/fail report with per-step latencies — no bespoke
script needed per PoC.

---

## Milestone M3 — Frontend Introspection (the missing layer)

Today the verifier only checks the *published app definition*. It
cannot verify that a widget actually renders, that a static_filter
applied client-side matches what the backend serves, or that a
property_list shows the right value.

### M3.1 App definition validator

- [ ] `GET /api/v1/apps/public/{slug}/contract` returning the resolved
      widget tree with each widget's required properties, link
      bindings and variable references *projected against the live
      ontology*. Failures surface as
      `{widget_id, kind, error, suggested_fix}`.
- [ ] CLI: `of-cli app validate <slug>` wraps the same logic for
      pre-publish checks.

### M3.2 Headless render snapshot

- [ ] Sidecar `frontend-render-service` (Node + Playwright running
      `apps/web` headless against the gateway) exposing
      `POST /api/v1/_meta/render { slug, page_id, viewport }` →
      `{ html, screenshot_b64, console_errors, network_log }`.
- [ ] Auth: same JWT path; service runs as a tenant-scoped browser
      session.
- [ ] Backed by the WidgetRegistry we just landed — every widget
      declares `serializeForSnapshot()` so the snapshot can include a
      semantic JSON next to the rendered HTML.

### M3.3 Widget self-test hooks

- [ ] Each widget in `apps/web/src/widgets/*` exports
      `__agentSelfTest()` returning a pure JSON description (no DOM)
      of what it would render given the current props/data. The
      WidgetRegistry exposes `getSelfTest(widgetKind)` for the
      runner.
- [ ] `GET /api/v1/_meta/widgets` lists registered widgets + their
      self-test schemas — the agent learns the catalog the same way
      it learns API capabilities (M1.1).

**Exit criteria:** the agent can verify that the "Anomalies" page
renders, the property_list shows `transaction_id` (not `—`), and the
chart_xy data matches the ontology query — entirely over HTTP.

---

## Milestone M4 — Data Plane Introspection (read-only)

Today deep diagnostics require `kubectl exec` into PG/Cassandra.
This milestone adds *audited, read-only, RBAC-gated* views.

### M4.1 Object store admin views

- [ ] `GET /api/v1/_admin/objects/{type_id}/{object_id}?raw=1`
      returning the canonical Cassandra row (revision_number,
      markings, organization_id, indexes touched). Behind Cedar
      `admin:read_object_raw`.
- [ ] `GET /api/v1/_admin/objects/{type_id}/_indexes` returning
      `objects_by_type` row count, last_updated_at, dedup status —
      the same data we computed by hand to debug the property_list
      issue.

### M4.2 Outbox + saga inspection

- [ ] `GET /api/v1/_admin/outbox/events?since=...&kind=...` paginated
      view onto `outbox.events` with delivery status.
- [ ] `GET /api/v1/_admin/sagas/{id}` returning the saga state machine
      + step history. Already partially in `libs/saga`; expose it.

### M4.3 Migration & schema drift

- [ ] `GET /api/v1/_admin/schema/migrations` per Postgres-backed
      service: `{schema, applied:[...], pending:[...], drift:bool}`.
- [ ] `GET /api/v1/_admin/schema/grants?role=svc_xxx` — the missing
      GRANT we hit on `outbox.events` would have been one HTTP call
      to discover.

### M4.4 Cassandra introspection

- [ ] `GET /api/v1/_admin/cassandra/keyspaces` listing tables and
      replication factor.
- [ ] `GET /api/v1/_admin/cassandra/repairs` summary of last
      Reaper-driven repair per table.

**Exit criteria:** every bug we hit during this PoC session
(missing GRANT, wrong keyspace, dedup needed in `objects_by_type`)
becomes diagnosable by an agent in one HTTP call instead of
`kubectl exec` + `psql`/`cqlsh`.

---

## Milestone M5 — Agent Identity & Audit

Once agents can do all of the above, we need first-class identities,
quotas and audit trails for them.

### M5.1 Agent principals

- [ ] New principal kind `agent` in `identity-federation-service`
      with: `agent_id, owner_user, scopes[], rate_limit_tier,
      ttl_default`.
- [ ] `POST /api/v1/auth/agents` to mint short-lived agent JWTs (no
      password flow).

### M5.2 Cedar policies for agents

- [ ] Policy bundle `agent-readonly`, `agent-poc-verifier`,
      `agent-platform-admin`. Each capability above declares the
      minimum policy required.
- [ ] CI test: every `_admin/*` route MUST have an explicit Cedar
      action mapping.

### M5.3 Audit + replay

- [ ] Every agent-issued request is tagged `actor.kind=agent` in the
      audit trail and `audit-trail` exposes
      `GET /api/v1/_admin/audit?actor=agent:xxx&since=...`.
- [ ] Replay tool: `of-cli audit replay <trace_id>` reconstructs the
      sequence of HTTP calls the agent made, useful for postmortems.

### M5.4 Rate limiting & circuit breakers

- [ ] Edge-gateway rate-limit tier `agent` with per-agent token bucket
      (today the smoke seeder hit 429s with a 0.01s sleep — this
      formalises it).
- [ ] Circuit breaker: an agent that triggers >N validation failures
      gets paused and notifies its owner.

**Exit criteria:** running `of-cli audit replay` reproduces any agent
session deterministically; an agent cannot exceed its declared scope
or burst budget.

---

## Cross-cutting concerns

These apply to every milestone above.

### Documentation

- [ ] Update `docs/architecture/index.md` with an "Agent surface"
      section linking `_meta/*` and `_admin/*` routes.
- [ ] Add an ADR per milestone (M1..M5) under
      `docs/architecture/adr/`. M1 should be the first one filed.
- [ ] Auto-generate `docs/api/agent-surface.md` from the
      `_meta/capabilities` snapshot — single source of truth.

### Testing

- [ ] Every new `_meta/*` and `_admin/*` route ships with an
      integration test under the `integration` build tag.
- [ ] Smoke scenario `smoke/scenarios/agent-surface.yaml` exercises
      the full M1+M2 surface on every PR.

### Security

- [ ] Threat model: enumerate misuse scenarios for each `_admin/*`
      route (data exfiltration, schema scraping, audit blinding) and
      add a section to `SECURITY.md`.
- [ ] Default-deny: `_admin/*` is unreachable without an explicit
      Cedar grant; CI guard fails the build if a route lacks one.

### Observability

- [ ] OTel attribute `agent.id` propagates from gateway to every
      downstream span when the caller is an agent principal.
- [ ] Grafana dashboard "Agent surface" with: req/s per
      `_meta` route, p95 latency, error rate, top agents.

---

## Suggested execution order

1. **M1.1 + M1.2** (capability catalog + aggregated health) — single
   sprint, unblocks every other milestone and removes most "where do
   I look?" friction.
2. **M2.1 + M2.3** (scenario DSL + Go assertion lib) — turns
   `verify_poc.py` into reusable infra; M2.2 (server-side runner) can
   wait until there is a second PoC.
3. **M4.1 + M4.3** (object raw view + schema/grants introspection) —
   the highest-leverage admin views; the bugs we hit this session
   would all have been one HTTP call.
4. **M3.1 + M3.3** (app contract validator + widget self-tests) —
   landed naturally on top of the new WidgetRegistry. Defer M3.2
   (Playwright sidecar) until visual regressions actually bite.
5. **M5** last — only meaningful once M1–M4 give agents real power.

---

## Definition of "full capabilities"

The roadmap is **complete** when:

1. `verify_poc.py` is replaced by `of-cli scenario run` invoked by an
   agent JWT, and the agent does **not** need any local state.
2. Any deep diagnostic we performed manually this session
   (`kubectl exec` into PG, `cqlsh`, `kubectl set env`) is reachable
   via an `_admin/*` HTTP route gated by Cedar.
3. The frontend is verifiable headlessly: the agent can assert that
   any widget on any published app renders the data the ontology
   contains.
4. Every agent-issued request is auditable, rate-limited, and
   policy-checked — running an agent feels exactly like running a
   human user, only faster.
