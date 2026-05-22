# 🏗️ Architecture Evaluation Checklist — Monorepo with Microservices

Evaluate the current project exhaustively, going through each section. For each item, answer with:
- ✅ Meets
- ⚠️ Partially meets (explain what is missing)
- ❌ Does not meet (explain the impact and suggest an improvement)
- 🔘 Not applicable

---

## 1. MONOREPO STRUCTURE

### 1.1 Root organization
- [ ] Does the monorepo root have a clear and documented structure?
- [ ] Is there an obvious separation between services, shared libraries, configuration, and infrastructure?
- [ ] Is a consistent naming convention followed for folders and packages?
- [ ] Does the structure allow services and libraries to be discovered without additional documentation?

Expected structure (example):
```
monorepo/
├── services/           # Microservicios
│   ├── auth/
│   ├── billing/
│   ├── notifications/
│   └── users/
├── packages/           # Librerías compartidas
│   ├── shared-types/
│   ├── logger/
│   ├── db-client/
│   └── event-bus/
├── infra/              # IaC, Dockerfiles, Helm charts
├── tools/              # Scripts, generadores, CLI internos
├── docs/               # Documentación global, ADRs
├── .github/            # CI/CD workflows
├── turbo.json / nx.json / pnpm-workspace.yaml
└── README.md
```

### 1.2 Monorepo management tool
- [ ] Is a monorepo tool used (Nx, Turborepo, Bazel, Lerna, Rush)?
- [ ] Is dependency resolution between packages configured correctly?
- [ ] Is build caching configured (local and/or remote)?
- [ ] Are the monorepo commands documented in the root README?
- [ ] Can tasks be executed selectively for the affected service/package?

### 1.3 Dependency management
- [ ] Is there a single, consistent lockfile at the root?
- [ ] Is controlled dependency hoisting used (no phantom dependencies)?
- [ ] Are shared dependency versions aligned across services?
- [ ] Is there a clear policy on when a dependency should be shared vs. local?
- [ ] Are native workspaces used (pnpm/yarn/npm workspaces, Go workspaces)?

---

## 2. MICROSERVICES ARCHITECTURE

### 2.1 Boundaries and responsibilities
- [ ] Does each microservice have a clearly defined business domain (Bounded Context)?
- [ ] Are services independently deployable?
- [ ] Does each service have its own database / schema (Database per Service)?
- [ ] Is there no direct access to another service's DB?
- [ ] Is the size of each service justifiable? (neither nano-services nor disguised monoliths)
- [ ] Can the responsibility of each service be explained in one sentence?
- [ ] Is there a service map / context diagram documented?

### 2.2 Inter-service communication
- [ ] Is it clearly defined which communication is synchronous and which is asynchronous?
- [ ] Does synchronous communication use well-defined protocols (REST with OpenAPI, gRPC with .proto)?
- [ ] Does asynchronous communication use a message broker (Kafka, RabbitMQ, NATS, SQS)?
- [ ] Do events/messages have versioned and validated schemas?
- [ ] Are long chains of synchronous calls between services (excessive orchestration) avoided?
- [ ] Is there a defined pattern for sagas / distributed transactions where applicable?
- [ ] Are inter-service contracts defined and tested (Contract Testing)?
- [ ] Is an API Gateway or BFF (Backend for Frontend) used where appropriate?

### 2.3 Consistency and data
- [ ] Is eventual consistency explicitly accepted and handled?
- [ ] Is there a strategy for resolving data conflicts between services?
- [ ] Do domain events have clear semantics (Event Carried State Transfer, Event Notification)?
- [ ] Is there idempotency in message/event consumers?
- [ ] Is event ordering handled correctly where it matters?
- [ ] Is there a dead letter queue (DLQ) for failed messages?

---

## 3. LIBRARIES AND SHARED CODE

### 3.1 Shared packages
- [ ] Are shared libraries in packages/ (or equivalent) with their own package.json/go.mod?
- [ ] Does each shared library have a single, clear responsibility?
- [ ] Does each shared library have its own README with a documented API?
- [ ] Do changes to shared libraries trigger tests in the services that consume them?
- [ ] Is excessive "shared kernel" that couples all services avoided?

### 3.2 Shared types and contracts
- [ ] Are DTOs / types shared between services centralized in a types package?
- [ ] Are event schemas defined in a shared package with versioning?
- [ ] Is there automatic type generation from schemas (protobuf, OpenAPI, JSON Schema)?
- [ ] Are shared types data-only (no business logic)?

### 3.3 Coupling prevention
- [ ] Are there rules that prevent direct imports between services?
- [ ] Is a tool used to validate boundaries (Nx module boundaries, eslint-plugin-boundaries, ArchUnit)?
- [ ] Does changing one service NOT require changing another service simultaneously?
- [ ] Is the fan-in/fan-out of each shared package measured?

---

## 4. INTERNAL STRUCTURE OF EACH MICROSERVICE

### 4.1 Internal architecture
- [ ] Does each service follow a consistent internal architecture (Clean, Hexagonal, Vertical Slices)?
- [ ] Do all services follow the SAME internal structure? (or is there a justification for the differences)
- [ ] Is there a separation between domain, application, and infrastructure inside each service?

Expected internal structure per service:
```
services/users/
├── src/
│   ├── domain/          # Entidades, Value Objects, interfaces de repositorio
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── events/
│   │   └── ports/       # Interfaces (repository, event publisher)
│   ├── application/     # Use Cases / Commands / Queries
│   │   ├── commands/
│   │   ├── queries/
│   │   └── handlers/
│   ├── infrastructure/  # Implementaciones concretas
│   │   ├── database/
│   │   ├── messaging/
│   │   ├── http-client/
│   │   └── adapters/
│   └── interface/       # Puntos de entrada
│       ├── http/        # Controllers / Routes
│       ├── grpc/
│       └── consumers/   # Event consumers
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

### 4.2 SOLID principles
- [ ] **S** — Do classes/modules inside each service have a single responsibility?
- [ ] **O** — Can behavior be extended without modifying existing code?
- [ ] **L** — Are implementations substitutable for their abstractions?
- [ ] **I** — Are interfaces small and specific?
- [ ] **D** — Does the domain depend on abstractions, not on concrete implementations?
- [ ] Is DRY applied within each service without premature abstractions?
- [ ] Is KISS applied? Is there visible over-engineering?

### 4.3 Per-service state and data management
- [ ] Is each service the exclusive owner of its data?
- [ ] Is there a clear data access layer (Repository pattern)?
- [ ] Are migrations versioned and reversible?
- [ ] Are domain models separated from persistence and API models?
- [ ] Is shared mutable state avoided inside the service?
- [ ] Is there data validation in the domain layer?

---

## 5. TESTABILITY

### 5.1 Per-service tests
- [ ] Does each service have unit tests for its domain logic?
- [ ] Does each service have integration tests for adapters (DB, messaging)?
- [ ] Do unit tests run without external infrastructure?
- [ ] Do integration tests use containers (Testcontainers, docker-compose)?
- [ ] Can business logic be tested without complex mocks?
- [ ] Is there a minimum test coverage defined and enforced in CI?

### 5.2 Inter-service tests
- [ ] Are there Contract Tests between services (Pact, Schema Registry)?
- [ ] Are there end-to-end tests for the critical flows that span services?
- [ ] Can a subset of services be brought up locally for testing?
- [ ] Are E2E tests neither flaky nor slow?
- [ ] Are there post-deploy smoke tests?

### 5.3 Shared library tests
- [ ] Do shared libraries have their own test suite?
- [ ] Does a change in a library automatically trigger the tests of its consumers?

---

## 6. ERROR HANDLING AND RESILIENCE

### 6.1 Errors inside each service
- [ ] Is there a consistent per-service error handling strategy?
- [ ] Are domain error types used (not just generic exceptions)?
- [ ] Are errors propagated correctly between internal layers?
- [ ] Are empty catches / silent swallowing avoided?
- [ ] Are error messages useful for debugging?

### 6.2 Inter-service resilience
- [ ] Are there circuit breakers for calls to other services?
- [ ] Is there retry with exponential backoff for recoverable operations?
- [ ] Are timeouts configured on all external calls (HTTP, gRPC, DB)?
- [ ] Are there bulkheads to isolate failures (one service going down does not take everything else down)?
- [ ] Are there fallbacks / graceful degradation when a service is unavailable?
- [ ] Is backpressure handled correctly in queues?
- [ ] Does the system recover automatically when a service comes back up?

### 6.3 Distributed resilience patterns
- [ ] Is idempotency implemented in all operations that require it?
- [ ] Is there compensation / rollback for sagas/distributed transactions?
- [ ] Is the case of duplicate messages handled?
- [ ] Is the case of out-of-order messages handled?

---

## 7. OBSERVABILITY

### 7.1 Logging
- [ ] Is there structured logging (JSON) that is consistent across all services?
- [ ] Is a shared logging library (internal package) used?
- [ ] Do logs use appropriate and consistent levels?
- [ ] Is logging of sensitive information (PII, tokens, passwords) avoided?
- [ ] Are logs centralized in a platform (ELK, Loki, CloudWatch)?

### 7.2 Distributed Tracing
- [ ] Is distributed tracing implemented (OpenTelemetry, Jaeger, Zipkin)?
- [ ] Does each request have a correlation ID / trace ID that crosses services?
- [ ] Is the trace ID propagated in both synchronous and asynchronous calls?
- [ ] Can full traces of a multi-service flow be visualized?
- [ ] Do spans have useful attributes (user_id, order_id, etc.)?

### 7.3 Metrics and alerts
- [ ] Does each service expose metrics (Prometheus, StatsD)?
- [ ] Are the 4 Golden Signals measured (latency, traffic, errors, saturation)?
- [ ] Are there health checks (liveness + readiness) in each service?
- [ ] Are there per-service dashboards and a global system dashboard?
- [ ] Are there alerts configured for critical failures?
- [ ] Are P50, P95, P99 latencies measured for each service?

---

## 8. CI/CD AND BUILD

### 8.1 Pipeline
- [ ] Are CI/CD pipelines defined and functional?
- [ ] Are builds incremental (only what is affected by the change is built)?
- [ ] Is the monorepo dependency graph used to determine what to test/deploy?
- [ ] Is there effective caching in CI (dependencies, previous builds, Docker layers)?
- [ ] Is the pipeline of an individual service fast (<10 min ideally)?
- [ ] Are tests and builds parallelized in CI?

### 8.2 Deploy
- [ ] Can each service be deployed independently?
- [ ] Is there automated deploy to staging/production?
- [ ] Is semantic or commit-based versioning used for each service?
- [ ] Is there an automated rollback strategy?
- [ ] Are rolling deployments, blue/green or canary used?
- [ ] Are there feature flags to deploy inactive code safely?

### 8.3 Code quality
- [ ] Is there a shared linter/formatter applied consistently?
- [ ] Is there strict type checking?
- [ ] Are lint rules the same across all services?
- [ ] Are there pre-commit hooks or CI checks that prevent non-compliant code?
- [ ] Is there static security analysis (SAST) in the pipeline?

---

## 9. INFRASTRUCTURE AND CONTAINERIZATION

### 9.1 Docker
- [ ] Does each service have an optimized Dockerfile (multi-stage, cacheable layers)?
- [ ] Are base images consistent across services?
- [ ] Are images lightweight (Alpine, distroless)?
- [ ] Do Dockerfiles avoid copying the entire monorepo into the build context?
- [ ] Is there a docker-compose to bring up the full local stack?
- [ ] Can a subset of services be brought up together with their dependencies?

### 9.2 Orchestration
- [ ] Is IaC defined (Terraform, Pulumi, CDK, Helm charts)?
- [ ] Is IaC versioned in the same monorepo?
- [ ] Does each service define its required infra resources?
- [ ] Is infra separated per environment (dev, staging, prod)?
- [ ] Are namespaces or logical isolation between services used in the orchestrator?

### 9.3 Service Mesh / Networking
- [ ] Is service discovery configured (internal DNS, Consul, Kubernetes services)?
- [ ] Is mTLS or some authentication mechanism used between services?
- [ ] Is there rate limiting between services?
- [ ] Is inter-service traffic observable?

---

## 10. SECURITY

### 10.1 Per-service security
- [ ] Does input validation happen at each service's interface layer?
- [ ] Is data sanitized before persisting?
- [ ] Do endpoints have authentication and authorization?
- [ ] Is there protection against injections (SQL, NoSQL, XSS)?
- [ ] Are each service's dependencies free of known CVEs?

### 10.2 Inter-service security
- [ ] Are inter-service calls authenticated (internal tokens, mTLS)?
- [ ] Are internal requests not blindly trusted (zero trust)?
- [ ] Is there a centralized auth service or are tokens propagated correctly?
- [ ] Are permissions/roles validated in each service (not just at the gateway)?

### 10.3 Secrets and configuration
- [ ] Are secrets stored in a vault (Vault, AWS Secrets Manager, GCP Secret Manager)?
- [ ] Are secrets NEVER in code, repo environment variables, or committed config files?
- [ ] Is there automated secret rotation?
- [ ] Does each service have access only to the secrets it needs (least privilege)?

---

## 11. CONFIGURATION AND ENVIRONMENT

- [ ] Is each service's configuration separated from the code?
- [ ] Is configuration validated when each service starts?
- [ ] Are there well-defined per-environment configurations?
- [ ] Is there documentation of all environment variables required per service?
- [ ] Are there sensible default values for local development?
- [ ] Is shared configuration (service URLs, etc.) managed centrally?

---

## 12. DOCUMENTATION

### 12.1 Global documentation
- [ ] Does the root README explain the overall architecture, how to bring everything up, and how to contribute?
- [ ] Is there an up-to-date architecture diagram of the entire system?
- [ ] Are there ADRs (Architecture Decision Records) for key decisions?
- [ ] Is there a service map with their responsibilities and dependencies?
- [ ] Is there a runbook / playbook for common incidents?
- [ ] Is there a "how to create a new microservice" guide (template/scaffold)?

### 12.2 Per-service documentation
- [ ] Does each service have its own README with setup, API, and local decisions?
- [ ] Is each service's API documented (OpenAPI, gRPC docs, AsyncAPI)?
- [ ] Are the events each service publishes/consumes documented?
- [ ] Is there documentation of business flows that span services?

### 12.3 Onboarding
- [ ] Can a new developer bring up the project in <30 minutes?
- [ ] Is there a single script/command for initial setup?
- [ ] Is the onboarding documentation tested and up to date?

---

## 13. PERFORMANCE AND SCALABILITY

- [ ] Can each service scale horizontally independently?
- [ ] Is auto-scaling configured based on metrics?
- [ ] Are high-load services separated from low-load ones?
- [ ] Is distributed caching used where appropriate (Redis, Memcached)?
- [ ] Are DB queries optimized (indexes, pagination, projections)?
- [ ] Is there connection pooling for DB and external services?
- [ ] Can event consumers parallelize processing?
- [ ] Is there load testing / benchmarks of the critical flows?
- [ ] Are traffic spikes handled correctly?

---

## 14. DEVELOPER EXPERIENCE (DX)

- [ ] Are local build times reasonable (<2 min per service)?
- [ ] Is there hot-reload / watch mode for local development?
- [ ] Can an individual service be debugged easily?
- [ ] Are there generators/templates for creating new services, endpoints, events?
- [ ] Are build errors clear and actionable?
- [ ] Is there adequate IDE support (imports, autocompletion across packages)?
- [ ] Do PRs run only the checks relevant to the change?
- [ ] Is there seed data / fixtures for local development?

---

## 📊 EXECUTIVE SUMMARY

When finished, produce:

1. **Per-section score** (0-10) and weighted overall score
2. **Per-service maturity map** — a table comparing the maturity of each service

| Service  | Tests | Docs | Observability | Resilience | Security  | Score |
|----------|-------|------|---------------|------------|-----------|-------|
| auth     | 8/10  | 7/10 | 9/10          | 8/10       | 9/10      | 8.2   |
| billing  | 5/10  | 3/10 | 4/10          | 6/10       | 7/10      | 5.0   |
| ...      |       |      |               |            |           |       |

3. **Top 5 strengths** of the current architecture
4. **Top 5 critical weaknesses** ordered by impact in production
5. **Top 5 risks** — problems that have not yet blown up but will
6. **Technical debt** categorized as:
   - 🔴 Critical (blocks scalability or causes incidents)
   - 🟡 Medium (slows down development)
   - 🟢 Low (nice to have)
7. **Prioritized action plan**:
   - Quick wins (< 1 week)
   - Short-term improvements (1-4 weeks)
   - Strategic investments (1-3 months)
8. **Diagram of the current architecture** vs. **recommended ideal architecture**
9. **Services that are candidates for merging** (if there are unnecessary nano-services)
10. **Services that are candidates for splitting** (if there are disguised monoliths)

---

### Instructions for Claude Code:
- Walk through the ENTIRE codebase before answering: root, each service, each shared package
- Verify the monorepo tool and its configuration (turbo.json, nx.json, etc.)
- Read the Dockerfiles, docker-compose, Helm charts, and CI/CD workflows
- Inspect event/message schemas and inter-service contracts
- Check imports between services to detect illegal coupling
- Review each service's DB migrations
- Do not assume; verify each item by reading the code
- Give concrete examples of files/lines when you find problems
- If an item does not apply, mark it as 🔘 and explain why
- Be honest and direct: usefulness depends on accuracy
