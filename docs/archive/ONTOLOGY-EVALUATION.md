# Evaluación de la Ontología de OpenFoundry vs Palantir Foundry / Gotham

> **ARCHIVED — superseded by**
> [`docs/architecture/adr/ADR-0044-ontology-parity-scope-osv2-baseline.md`](../architecture/adr/ADR-0044-ontology-parity-scope-osv2-baseline.md),
> which captures the parity scope decision (OSv2 baseline, committed vs
> deferred dimensions). The per-dimension matrix below remains the
> authoritative scoreboard; promotions/demotions between committed and
> deferred require an amending ADR rather than silent edits here.
>
> Fecha de la evaluación: 2026-05-08
> Alcance auditado: `libs/ontology-kernel/**`, `services/ontology-*`, `services/object-database-service`, `services/lineage-service`, `services/entity-resolution-service`, `services/iceberg-catalog-service`, `libs/{cassandra-kernel, search-abstraction, storage-abstraction, authz-cedar-go, auth-middleware, audit-trail, outbox, saga, idempotency, vector-store, query-engine, geospatial-core, observability}`, `proto/**`.

---

## 🎯 Puntuación final: **6 / 10**

OpenFoundry implementa un clon **funcional y técnicamente serio** de la ontología de Palantir, con un ~60–65% de cobertura de las capacidades críticas de Foundry/Gotham. Está muy por encima del nivel de un proyecto académico (un universitario raramente pasaría de 2–3), pero queda lejos del producto Palantir, que tiene una década de pulido en polimorfismo, geo-temporalidad, OQL, marking propagation, materializations, Object Security Policies, Value Types, Virtual Tables zero-copy, MCP/OMCP y la integración con AIP.

> **Nota:** la comparativa toma como baseline únicamente **OSv2** (Object Storage V2) — el sistema legacy OSv1 / Phonograph queda fuera del scope porque Palantir lo retira el 30/06/2026.

### Desglose por dimensión

| Dimensión                                  | Score   | Comentario clave                                                                                          |
|--------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------|
| Dimensión                                  | Score   | Comentario clave                                                                                          |
|--------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------|
| Type system & primitivas                   | **6.0** | 14 tipos vs ~22 en Palantir (faltan Cipher, Marking, Geoshape vs Geopoint, Time Series con GTSS, MediaReference real, Attachment); sin enum/union/genéricos, sin composite PKs |
| Value Types (semantic wrappers)            | **0.5** | No existen — Palantir tiene email/url/uuid/enum/SSN como tipos derivados con validación reutilizable      |
| Polimorfismo & composición                 | **4.5** | Interfaces sí, pero sin `extends_interfaces`, sin polymorphic links, sin link-props, sin function-backed properties |
| Geo & temporal                             | **2.0** | `geo_point` sí, pero geospatial-core vacío, sin Geoshape, sin Geotime/GTSS, sin time-travel real          |
| Derived properties                         | **1.0** | No existen — Palantir soporta derivadas hasta 3 hops de links con agregaciones                            |
| Validación de datos                        | **6.5** | Validación per-tipo + required + unique, pero sin check constraints, FKs ni cardinality enforcement       |
| Domain modeling                            | **6.5** | Bindings multi-datasource bien, branching/proposals avanzado, falta type hierarchy y semantic types       |
| Query & analytics                          | **5.0** | ObjectSets con traversal+join, pero **sin OQL** y sin álgebra (union/intersect/difference); sin Object Sets temporales/permanentes diferenciados |
| Access control                             | **6.0** | Cedar + markings + RBAC + submission criteria; falta RLS por fila/celda, marking hierarchies, ABAC cableado, **Object Security Policies paramétricas** |
| Automation & rules                         | **6.0** | Triggers + effects + machinery queue; pero el `ApplyRuleEffect` es parcial, sin compensation/rollback     |
| Data binding & ETL                         | **5.5** | 3 sync modes, pero sin **MDOs (multi-datasource para column-level security)**, sin **Virtual Tables zero-copy** (Snowflake/Databricks/Iceberg), sin streaming de baja latencia |
| Actions & operations                       | **6.0** | FormSchema + auth policy + simulación; pero what-if cosméticas, sin async, sin templates, sin **applyBatch**/**validate** API completa, sin **function-backed actions** |
| Branching & versioning                     | **5.5** | Feature branches y proposals existen, pero sin **Global Branching** unificado data+ontología, sin migration de ediciones tras schema change |
| Functions & extensibility                  | **4.5** | Packages + capabilities + metrics; TS inline, Python requiere sidecar; sin **OntologyEditFunction** decorador, sin OSDK auto-regenerado tipado |
| Observability & audit                      | **7.5** | Outbox + Debezium + Iceberg audit + Prometheus + OTLP + action metrics: sólido                            |
| Storage core                               | **7.0** | Cassandra LWT + PG fallback + in-memory + Iceberg; falta segregación clara OMS/OSS/Funnel/ObjectDB como microservicios diferenciados, sin streaming datasource indexing |
| Search                                     | **6.5** | Vespa híbrido (BM25 + ANN) + OpenSearch; falta phonetic, fuzzy, geo, **Search Around** (search por links N-hop), facetting avanzado |
| Operaciones distribuidas                   | **8.0** | Outbox + Saga (compensación LIFO) + Idempotency (PG/Cass/mem) + consistency hints                          |
| Vector / semántica                         | **5.0** | Embedding storage + Vespa ANN + cosine in-memory; falta embedding pipeline, reranking, pgvector real      |
| Streaming / CDC                            | **5.5** | Debezium PG + Kafka pubsub; falta Flink/Beam, Kafka Streams DSL, DLQ automático, CDC desde Cassandra y desde virtual tables |
| Privacy / DLP                              | **0.5** | Sin differential privacy, sin k-anonymity, sin PII auto-classification, sin redaction, sin Cipher type    |
| Lineage                                    | **6.5** | `lineage-service` operativo a nivel dataset/columna; falta lineage de cambios y de markings end-to-end    |
| MCP / Agent integration                    | **1.0** | Sin **OMCP** (Ontology MCP) — ontología no expuesta como tools MCP a agentes externos                     |
| AIP integration                            | **2.0** | Hay `ai-evaluation-service`, pero sin AIP Logic equivalente (no-code LLM functions sobre ontología) ni Chatbot Studio |
| Virtual Tables / zero-copy                 | **1.0** | Iceberg catalog existe, pero no hay object types respaldados por tablas en Snowflake/Databricks/BigQuery sin copia |

**Promedio ponderado:** ~5.7/10 → redondeado a **6/10** por el peso del control-plane robusto, outbox/saga y branching/proposals.

---

## 🏗️ Marco de referencia: la Ontología de Palantir (OSv2)

> Esta sección fija el **target** contra el que se compara. Todas las tareas de la sección final están escritas para alcanzar paridad con este modelo, no con OSv1/Phonograph.

### Microservicios que componen la ontología en Palantir

| Microservicio Palantir | Responsabilidad | Equivalente actual en OpenFoundry |
|---|---|---|
| **OMS** (Ontology Metadata Service) | Source of truth del schema (object types, link types, action types, interfaces, shared properties) | `ontology-definition-service` (parcial: solo Object Types) |
| **Object Databases (OSv2)** | Almacén indexado de instancias, decenas de miles de millones de objetos por type | `object-database-service` + Cassandra (sin separación OMS/ObjDB clara) |
| **OSS** (Object Set Service) | Lecturas: búsqueda, filtrado, agregación, carga; gestión de Object Sets (estáticos/dinámicos/temporales/permanentes) | `ontology-query-service` + handlers de objectsets (parcial; sin tipología completa de object sets) |
| **Object Data Funnel** | Orquesta TODAS las escrituras: lee datasources, lee ediciones del Actions Service, indexa, hace CDC | Funnel handler en kernel (parcial; no hay servicio Funnel dedicado) |
| **Actions Service** | Aplica ediciones de usuario; mantiene log histórico de decisiones; expone `apply` / `applyBatch` / `validate` | `ontology-actions-service` (sin `applyBatch`/`validate` formal, sin log histórico para análisis) |
| **Functions Service** | Ejecuta lógica server-side aislada (TS v1, TS v2, Python); soporta `@OntologyEditFunction` y OSDK | Function runtime en kernel (TS sí, Python opcional, sin OSDK) |
| **Ontology Manager (OMA)** | UI de modelado y administración de la ontología | ❌ No existe |
| **OSDK generator** | Genera SDKs tipados (TS/Python/Java/OpenAPI) auto-regenerables al cambiar schema | `sdk-generation-service` (no auto-regenerado por schema change) |
| **AIP Logic** | Funciones no-code respaldadas por LLM que operan sobre ontología | ❌ No existe (`ai-evaluation-service` es de evaluación, no authoring) |
| **AIP Chatbot/Agent Studio** | Workflows agentic sobre ontología | ❌ No existe |
| **OMCP** (Ontology MCP) | Expone object types / action types / query functions como herramientas MCP a agentes externos | ❌ No existe |

### Tipología completa de **Base Types** en OSv2

OpenFoundry tiene 14; Palantir tiene ~22. Faltan los marcados con ❌:

| Base Type Palantir | Soportado en OpenFoundry | Notas Palantir |
|---|---|---|
| `String` | ✅ | PK recomendada, title válido |
| `Integer` / `Short` | ✅ | PK válida |
| `Long` | ✅ (parcial) | ⚠️ Desaconsejado como PK por representación JS > 1e15 |
| `Byte` | ❌ | Solo asignable via parámetro `Integer` en Actions |
| `Float` / `Double` | ✅ | No PK válida |
| `Decimal` | ❌ | Para finanzas/precisión exacta |
| `Boolean` | ✅ | ⚠️ Limita type a 2 instancias si es PK |
| `Date` / `Timestamp` | ✅ | Strings JSON; en Palantir son tipos nativos |
| `Geopoint` | ✅ | Formato Palantir: `'{lat},{lon}'` con `-90≤lat≤90`, `-180≤lon≤180` |
| `Geoshape` | ❌ | **Distinto de Geopoint** — geo-spatial search indexado |
| `Array<T>` | ✅ | ❌ Sin nested arrays en OSv2 (igual que Palantir) |
| `Struct` | ✅ | Palantir limita campos a primitivos (no nesting, no array fields) |
| `Vector` | ✅ | Para semantic search; no en arrays |
| `Time Series` | ❌ | Backed por **GTSS (Geotemporal Series Sync)**, indexa en TSDB de Foundry |
| `Attachment` | ❌ | Para archivos en funciones |
| `Media Reference` | ✅ (parcial) | Referencia a media sets (imagen/vídeo/audio/documento) |
| `Marking` | ❌ | Como **base type**, no solo como tag — para marcado de clasificación dentro del payload |
| `Cipher` | ❌ | String codificado con Cipher (cifrado específico Palantir) |

### **Value Types** (capa que falta enteramente en OpenFoundry)

Un Value Type es un wrapper semántico sobre un base type, con metadatos y validación reutilizable:
- Email addresses, URLs, UUIDs, enums, SSN, IBAN, currency-codes...
- Pueden crearse dinámicamente dentro de un workspace
- A diferencia de los base types (estáticos), los value types son extensibles por usuarios
- Aportan **type-safety semántica** al modelo

### Modelo de **Object Sets** en Palantir

Cuatro tipologías que OpenFoundry no diferencia:

1. **Estáticos** — lista de PKs guardada; no cambia aunque cambien los datos
2. **Dinámicos** — representación de filtros; se actualizan al llegar nuevos datos
3. **Temporales** — TTL 24h; usados internamente entre servicios; RID forma `ri.object-set.main.temporary-object-set.{uuid}`
4. **Permanentes** — almacenados para uso plataforma-wide

### **Multi-Datasource Object Types (MDOs)**

Un mismo object type puede mapearse a múltiples datasources, con propiedades distintas viniendo de cada uno. Esto habilita **column-level security**: usuario con acceso al datasource A ve solo las propiedades mapeadas desde A; usuario con acceso a A+B las ve todas. OpenFoundry hoy soporta múltiples bindings por type, pero **sin la semántica de que cada propiedad pertenezca a un datasource concreto** ni el enforcement de permisos derivado.

### **Virtual Tables** (zero-copy)

Object types respaldados directamente por tablas en sistemas externos sin copia: Snowflake, Databricks, BigQuery, S3 (Avro/Parquet/Delta/Iceberg), Azure Data Lake, GCS. La integración con Unity Catalog (Databricks) y SAP Business Data Cloud está formalizada desde 2025. OpenFoundry tiene `iceberg-catalog-service` pero no expone object types respaldados por tablas externas.

### **Object Security Policies (OSP)**

Mecanismo recomendado sobre Restricted Views:
- **Cell-level security unificada** (fila + columna + valor)
- Basadas en propiedades del objeto, no columnas del dataset
- **Paramétricas en runtime** con funciones `current_user()`, `current_groups()`
- Permiten reglas declarativas tipo "Empleado solo ve empleados de su mismo departamento"

### **Global Branching**

Sistema actual de Palantir (sustituye al legacy Ontology Proposals):
- Una rama combina cambios de **ontología + datos + pipelines** en flujo unificado
- Workflow: branch → cambios → testing downstream en aplicaciones soportadas → rebase con `Main` → resolución de conflictos → merge
- OpenFoundry tiene branches y proposals pero **no une cambios de datos y pipelines** en la misma rama.

### Límites operativos OSv2 (cifras de referencia)

| Capacidad | OSv2 |
|---|---|
| Throughput de indexación | Decenas de miles de millones de objetos por object type |
| Edits por Action | Hasta **10 000** objetos en una sola Action (ampliable) |
| Propiedades por object type | Máximo **2 000** |
| Search Around limit | **100 000** objetos por defecto (ampliable) |
| Streaming datasources | ✅ Indexación de baja latencia |
| Schema change migration | ✅ Migración automática de ediciones tras cambio de schema |
| Latencia edición→visibilidad | Inmediata (tras completar Action) |

### **MCP / OMCP** — la pieza que cambia el juego

**Ontology MCP** expone los recursos de la ontología como herramientas MCP que agentes externos (Claude, GPT, Vercel, LangChain, CrewAI) pueden invocar:
- Leer objetos con las garantías de seguridad de la ontología
- Ejecutar acciones predefinidas (solo las que el scope del MCP server permita)
- Consultar via query functions

OpenFoundry no tiene nada equivalente. Es una de las brechas más grandes para alcanzar paridad funcional moderna.

---

## 📊 Resumen ejecutivo

### Fortalezas reales

1. **Control-plane metadata sólido**: ObjectType, Property, LinkType, Interface, SharedPropertyType, Binding, ActionType, ObjectSet, Rule, Funnel, Quiver, FunctionPackage, Project están modelados con `models/*.go` claros y persistidos en Postgres.
2. **Branching/Proposals**: `OntologyProjectBranch` + `OntologyProjectProposal` con `ConflictResolutions` y `Tasks`/`Comments` — esto es **inusual** en clones de Foundry.
3. **Bindings ricas**: 3 modos de sync (snapshot / incremental / view), branch + version del dataset, default marking, materialization tracking con health.
4. **Action model rico**: `FormSchema` con secciones y overrides condicionales, `AuthorizationPolicy` (clearance, attribute_equals, deny_guest_sessions), simulación via `ActionWhatIfBranch`, plantillas para upload de media.
5. **Submission criteria AST**: 14 operadores, 4 tipos de operandos, evaluador exhaustivo y purísimo en `submission_eval.go`.
6. **Rules + Machinery queue**: triggers tipados, scheduled effects con priority/capability, alertas con severidad, recomendación de cola con scoring.
7. **Object Sets composables**: filtros, traversals (1-4 hops), joins (inner/left), proyecciones, materialization, policies con `restricted_view_id`.
8. **Storage robusto**: Cassandra con LWT optimista (`INSERT IF NOT EXISTS`, `UPDATE IF revision_number=?`), PG fallback, ConsistencyHints, RepoError tipado.
9. **Outbox + Saga + Idempotency**: ADR-0022 cumplido, compensación LIFO, dual-store de idempotencia (PG ON CONFLICT, Cassandra LWT), inyección de OpenLineage headers.
10. **Cedar policy engine** integrado con hot-reload via NATS y audit a Kafka `audit.authz.v1`.
11. **Búsqueda híbrida**: Vespa (lexical BM25 + ANN/HNSW) + OpenSearch + in-memory; phased ranking nativo.
12. **Auditoría end-to-end**: outbox PG → Debezium → Kafka → Iceberg `of_audit.events`.
13. **Lineage operacional** a nivel dataset y columna, con `impact analysis`.
14. **Entity Resolution**: deduplicación, merge strategies, golden records, review queue.
15. **Writeback transaccional** con outbox + version conflict detection y errores tipados (`Primary`, `CommitAfterPrimary`, `OpenTxAfterPrimary`, `VersionConflict`).

### Debilidades críticas (las que más pesan en el score)

1. **Sin OQL** — no hay un lenguaje de consulta declarativo, todo es CRUD + traversal programático.
2. **Sin álgebra de Object Sets** — falta union / intersect / difference / aggregate; sin tipología (estáticos / dinámicos / temporales con TTL 24h / permanentes).
3. **Sin time-travel** — no hay snapshots históricos ni versionado temporal de objetos; sólo `version` monotónico.
4. **Polimorfismo nulo** — `LinkType` exige `SourceTypeID` y `TargetTypeID` exactos; no hay union types ni link-properties; las interfaces no soportan `extends_interfaces`.
5. **Property-level markings ausentes** — markings son object-level únicamente; no hay enmascarado por columna.
6. **Sin marking hierarchies / propagación automática** — `MarkingSource::InheritedFromUpstream` está, pero la propagación es manual.
7. **Geospatial vacío** — `geospatial-core` es placeholder; sin PostGIS/H3/S2/Geotime, sin distinción Geopoint vs Geoshape.
8. **Privacy nula** — sin differential privacy, sin k-anonymity, sin DLP/PII auto-classification, sin tipo Cipher.
9. **Cardinality y type validation no se enforcen en links** — `composition.go::CreateLink` no valida `cardinality` ni que `from` sea de `source_type_id`.
10. **What-if branches cosméticas** — `ActionWhatIfBranch` se persiste pero no afecta la evaluación real ni hay merge logic.
11. **Python runtime opcional** — `function_runtime.go` retorna `ErrPythonRuntimeNotWired` salvo que se inyecte el sidecar.
12. **Sin SDKs oficiales** generados/publicados (Python/TS/Go) listos para usuarios externos; **sin auto-regeneración** al cambiar el schema.
13. **Sin streaming subscriptions / WebSockets** para clientes.
14. **`exploratory-analysis-service` no monta el dominio** (substrate-only en producción).
15. **Materialization service no centralizado** — cada handler self-materializa, sin scheduler de refresh.
16. **Sin Value Types** — capa entera ausente; no hay `Email`, `URL`, `UUID`, `IBAN`, `SSN` como tipos derivados con validación reutilizable.
17. **Sin Object Security Policies (OSP)** paramétricas en runtime con `current_user()` / `current_groups()`.
18. **Sin MDOs reales** — múltiples bindings sí, pero sin la semántica "cada propiedad pertenece a un datasource concreto" ni column-level security derivada de eso.
19. **Sin Virtual Tables zero-copy** — no se pueden definir object types respaldados por tablas en Snowflake/Databricks/BigQuery/Iceberg externo sin copia.
20. **Sin `applyBatch` ni `validate` formales** en la API de Actions; sin **function-backed actions** (action que usa una function como ejecutor).
21. **Sin `OntologyEditFunction` decorator pattern** — no hay forma idiomática y tipada de declarar funciones que editan la ontología (TS v1/TS v2/Python).
22. **Sin OMCP** — la ontología no se expone como herramientas MCP a agentes externos.
23. **Sin AIP Logic equivalente** — no hay authoring no-code de funciones LLM sobre la ontología.
24. **Sin GTSS (Geotemporal Series Sync)** — no se pueden definir propiedades Time Series indexadas en una TSDB para tracking geo-temporal.
25. **Sin Object Type Groups** — no hay clasificación organizativa para discoverability en UI.
26. **Sin Global Branching unificado** — branches existen, pero no combinan cambios de ontología + datos + pipelines.
27. **Sin schema-change migration** — no hay migración automática de ediciones cuando cambia el schema de un object type.
28. **Sin Search Around** — operación N-hop "encuentra objetos relacionados a éste" con límite 100k.
29. **Sin streaming datasources de baja latencia** — los bindings actuales son snapshot/incremental/view, sin ingest streaming en vivo.
30. **Cross-Ontology links** — Palantir tampoco los soporta hoy, así que no es un gap real, pero conviene anotarlo para futuro.

---

## ✅ Plan exhaustivo para llegar a 10 / 10

> Las tareas están agrupadas por categoría y priorizadas. No es necesario respetar el orden, pero las primeras categorías son las que más mueven el score. Cada tarea está pensada para ser un PR/épica concreta.

### A. Type system y modelado de objetos

- [ ] **A1.** Añadir `Status` (`ACTIVE | DEPRECATED | EXPERIMENTAL | RETIRED`) y `LifecycleStage` a `models/object_type.go`, `link_type.go`, `property.go`, `interface.go`, `shared_property.go`, `action_type.go`, `function_package.go`, con migrations PG y enforcement en handlers.
- [ ] **A2.** Soportar **composite primary keys**: cambiar `PrimaryKeyProperty string` por `PrimaryKey []string` en `ObjectType`, propagar a `Binding.PrimaryKeyColumns`, ajustar `pg_repository.go` y `cassandra-kernel/object_store.go` (clustering keys).
- [ ] **A3.** Añadir tipos primitivos faltantes al `type_system.go` para alcanzar paridad con OSv2:
    - `byte` (con asignación vía parámetro `Integer` en Actions, como Palantir)
    - `decimal` (con precision/scale, valor PK no permitido pero título sí)
    - `enum` (con `allowed_values []string`)
    - `union` / `oneof` (con `member_types []PropertyType`)
    - `duration`, `interval`, `date_range`, `time_range`
    - `currency` (con código ISO 4217 y `Money{amount, currency}` struct)
    - `geoshape` como tipo separado de `geo_point` (geo-spatial search indexado)
    - `geo_polygon`, `geo_line`, `geo_box`, `h3_cell`
    - `time_series` con `GeotemporalSeriesSync` reference (ver tarea K5)
    - `attachment` (binary blob para functions)
    - `marking` como **base type** dentro del payload (no solo tag de objeto) — para casos en que el propio campo lleva un marking
    - `cipher` (string codificado con cifrado de campo, equivalente al Cipher de Palantir)
    - `ip_address`, `email`, `phone_e164`, `url` (estos pasarán a ser Value Types — ver sección W)
    - `binary` (con MIME type y tamaño máximo)
- [ ] **A3b.** **Geopoint format alignment**: aceptar el formato Palantir `'{lat},{lon}'` con validación `-90≤lat≤90` y `-180≤lon≤180` además del shape `{lat, lon}` actual.
- [ ] **A3c.** Documentar el límite **2 000 propiedades por ObjectType** y enforcement en `pg_repository.go` y schema validators.
- [ ] **A3d.** **Long PK warning**: emitir warning al definir Long como PK por riesgo de representación JS > 1e15 (igual que Palantir).
- [ ] **A3e.** **Boolean/Date/Timestamp PK warning**: marcar como desaconsejados (igual que Palantir).
- [ ] **A4.** Sistema de **unidades y dimensiones**: librería `libs/units` con conversiones (kg↔lb, m↔ft, USD↔EUR con tipo de cambio); `Property.Unit string` opcional.
- [ ] **A5.** **Tipos paramétricos / genéricos**: soportar `List<T>`, `Map<K,V>`, `Optional<T>` con validación recursiva en `schema.go`.
- [ ] **A6.** **Type hierarchy**: añadir `ObjectType.Extends *string` y `Interface.Extends []string`; resolución transitiva en `domain/schema.go::EffectiveProperties`.
- [ ] **A7.** **Polymorphic links**: cambiar `LinkType.SourceTypeID/TargetTypeID` a `[]string` (union types); validar en `composition.go::CreateLink`.
- [ ] **A8.** **Link properties**: añadir `Properties []PropertyDefinition` a `LinkType` y `payload jsonb` validado en `LinkInstance`.
- [ ] **A9.** **Derived / computed properties** alineadas con Palantir (hasta **3 hops** de links): nuevo módulo `libs/ontology-kernel/expressions` con un mini-DSL (parser + evaluador) y `Property.ComputedExpression *string`. Soportar:
    - Aritmética y string ops sobre otras props
    - `now()`, `today()`, ventanas temporales
    - Agregación cross-link (`count(links_outgoing[type=X])`, `avg(linked.salary)`, `max(linked.linked.amount)`)
    - Recuperación single-link (`linked.lead_engineer.name`)
    - Lista cross-link (`linked.products.map(p -> p.name)`)
    - Detección de ciclos y validación estática del path
    - Cache invalidation reactivo cuando cambia un objeto upstream del path
- [ ] **A10.** **Encryptable / Sensitive flags** a nivel propiedad (`Property.Sensitivity`: `Public | Internal | Confidential | Restricted | Secret`) con cifrado en reposo via envelope encryption (KMS).
- [ ] **A11.** **Property-level markings**: marcar propiedades individuales con markings; en `ObjectStore.Get` y `search`, filtrar/redactar campos por marking del caller.
- [ ] **A12.** **Semantic types / tagging**: campo `Property.SemanticTags []string` (`pii.email`, `gdpr.subject`, `hipaa.phi`, `pci.pan`) con DLP hooks.
- [ ] **A13.** **Auto-detección de PII** en ingest: integrar Microsoft Presidio o equivalente Go, marcando propiedades con `Sensitivity` automática y emitiendo evento `ontology.dlp.detected.v1`.
- [ ] **A14.** **Schema versioning**: tabla `ontology_schema_versions` con `(object_type_id, version, schema_jsonb, created_at)`; migrations automáticas con `up`/`down` SQL.
- [ ] **A15.** **Recursive types**: soportar referencias a sí mismo (árboles, grafos jerárquicos) con detección de ciclos.
- [ ] **A16.** **Schema-change migration de ediciones** (Palantir parity): cuando una propiedad cambia de tipo o se renombra, migrar automáticamente las ediciones pendientes/almacenadas; tabla `ontology_schema_migrations` con `(from_version, to_version, plan_jsonb, status)` y `dry_run` API.
- [ ] **A17.** **Object Type Groups**: nuevo modelo `OntologyObjectTypeGroup{id, name, description, members[]}` con CRUD y filtrado por grupo en `ontology-query-service` para discoverability/UI.
- [ ] **A18.** **Title property** explícito (separado de `display_name`): `ObjectType.TitleProperty *string`; usado en list views y autocompletes.
- [ ] **A19.** **Interface inheritance**: añadir `Interface.ExtendsInterfaces []string` con resolución transitiva de propiedades (Palantir lo soporta nativamente).
- [ ] **A20.** **Polymorfismo en queries**: API para listar todos los object types que implementan una interface (`GET /interfaces/{id}/implementors`) y queries que devuelvan tipos heterogéneos (`SELECT * FROM <Interface>`).

### B. Validación y enforcement

- [ ] **B1.** Validar **cardinality** en `composition.go::CreateLink`: rechazar si `1:1` y ya existe link, etc.
- [ ] **B2.** Validar que `from`/`to` de un link sean del tipo declarado en el `LinkType`.
- [ ] **B3.** **Check constraints** declarativos en `Property.ValidationRules` con DSL evaluable (no `json.RawMessage` opaco): `min`, `max`, `regex`, `length`, `oneOf`, `dependsOn`.
- [ ] **B4.** **Foreign-key references**: tipo `reference` debe validar existencia y permisos del objeto referenciado.
- [ ] **B5.** **Cascade rules**: `LinkType.OnDelete` (`cascade | restrict | set_null`).
- [ ] **B6.** **Schema migration framework**: cuando una property cambia de tipo, generar plan de migración con `dryRun`/`apply`.

### C. Query language (OQL) y álgebra de Object Sets

- [ ] **C1.** Diseñar e implementar **OQL** (Ontology Query Language) — parser ANTLR/PEG, AST, planner, optimizer, ejecutor sobre `libs/query-engine`. Sintaxis tipo:
    ```
    SELECT name, age FROM Person
    WHERE age > 18 AND department.name = "Eng"
    TRAVERSE manages MAX 3 HOPS
    ORDER BY hire_date DESC
    LIMIT 100
    ```
- [ ] **C2.** **Álgebra de Object Sets** completa en `domain/object_sets.go`:
    - `Union(a, b)` / `Intersect(a, b)` / `Difference(a, b)` / `SymmetricDifference(a, b)`
    - `Map(set, projection)` / `Filter(set, pred)` / `FlatMap`
    - `GroupBy(set, key) -> AggregatedSet`
    - `OrderBy(set, key, dir)` / `Limit(set, n)` / `Sample(set, n)`
- [ ] **C3.** **Funciones de agregación**: `count`, `sum`, `avg`, `min`, `max`, `percentile`, `histogram`, `count_distinct`, `approx_count_distinct (HyperLogLog)`.
- [ ] **C4.** **Window functions**: `LAG`, `LEAD`, `ROW_NUMBER`, `RANK`, `PERCENT_RANK`, `CUMULATIVE_SUM`.
- [ ] **C5.** **Time-series aggregations**: `tumbling`, `sliding`, `hopping` windows; resampling, gap-filling.
- [ ] **C6.** **Join algebra completa**: `inner`, `left`, `right`, `full outer`, `cross`, `semi`, `anti`.
- [ ] **C7.** **Subqueries y CTEs** en OQL.
- [ ] **C8.** **Query planner** con cost-based optimization: estadísticas en `pg_stats`-like sobre Cassandra/PG, join reorder, predicate pushdown a Vespa/OpenSearch.
- [ ] **C9.** **Tipología completa de Object Sets** (Palantir parity): añadir a `models/object_set.go` el campo `ObjectSet.Kind` con `static | dynamic | temporary | permanent`:
    - **static**: lista de PKs guardada (snapshot literal).
    - **dynamic**: definición de filtros guardada; se reevalúa en cada read.
    - **temporary**: TTL 24h, RID con prefijo `ri.object-set.{tenant}.temporary-object-set.{uuid}`; usado para pasar object sets entre servicios.
    - **permanent**: como dynamic pero con metadata de "promovido" para uso plataforma-wide.
    Limpiar el `temporary` por job programado en `scheduling-cron`.
- [ ] **C10.** **Search Around** (operación N-hop signature de Palantir): `POST /object-sets/{id}/search-around { link_type_id, depth }` con default 100k objetos resultado, ampliable. Reusable por functions/actions.
- [ ] **C11.** **Object Set ↔ OSDK** integration: el OSDK auto-generado debe permitir a developers externos construir, guardar, cargar y operar sobre object sets con la misma álgebra que el backend.

### D. Time-travel, versionado e historia

- [ ] **D1.** **Bitemporal storage**: añadir `valid_from`, `valid_to`, `transaction_time` a cada `ObjectInstance`; tabla `objects_history` en PG / `objects_by_id_history` en Cassandra.
- [ ] **D2.** **API time-travel**: `GET /objects/{id}?as_of=2025-12-01T00:00:00Z` y `?between=...,...`.
- [ ] **D3.** **OQL time-travel**: `SELECT * FROM Person AS OF 2025-12-01 ...`.
- [ ] **D4.** **Diff API**: `GET /objects/{id}/diff?from=v1&to=v2` con patches RFC 6902.
- [ ] **D5.** **Audit trail por campo**: registrar `changed_by`, `changed_at`, `previous_value`, `new_value`, `reason` en cada update; cero perdida.
- [ ] **D6.** **Retention policies** por ObjectType (e.g., 7 años para finance, 1 año para logs).
- [ ] **D7.** **Soft-delete con tombstones reversibles** y compactación programada.

### E. Markings, ACL y privacidad

- [ ] **E1.** **Marking hierarchy**: `Marking.Parents []MarkingID`; closure transitiva precomputada en `ontology_marking_closure`.
- [ ] **E2.** **Marking categories**: agrupar markings (Compartmented, Need-to-Know, Releasability, Handling Caveat).
- [ ] **E3.** **Auto-propagación de markings**: cuando un objeto se crea por una rule/action a partir de upstream marcados, heredar markings y registrarlo como `MarkingSource::InheritedFromUpstream(ridList)`.
- [ ] **E4.** **Property-level markings enforcement** en `ObjectStore.Get`, `Search`, `OQL` y `Traversal`: redactar campos cuyo marking exceda la clearance del caller.
- [ ] **E5.** **Row-level security predicates**: añadir `RLSPolicy` a ObjectType con expresión Cedar evaluada por fila (`resource.owner == principal.id`).
- [ ] **E6.** **Time-scoped markings**: `Marking.ValidFrom`, `Marking.ValidTo`, `Marking.RevokedAt`.
- [ ] **E7.** **Cedar cableado en handlers**: hoy `authz-cedar-go` no se invoca en cada handler; cablear `IsAuthorized` en `objects/handlers.go`, `actions/`, `links/`, `objectsets/`, `search/`.
- [ ] **E8.** **Differential privacy**: integrar Google DP / OpenDP para queries de agregación; presupuesto epsilon por usuario/query.
- [ ] **E9.** **k-anonymity / l-diversity**: en queries de agregación, requerir `k>=N` para resultados.
- [ ] **E10.** **Field-level encryption (envelope)**: KMS-backed; rotación de DEK; audit de accesos.
- [ ] **E11.** **DLP scanner** integrado al ingest pipeline.
- [ ] **E12.** **Right-to-be-forgotten** (GDPR): API `DELETE /subjects/{id}/forget` que tachoniza por todo el lineage.
- [ ] **E13.** **Object Security Policies (OSP) paramétricas** (Palantir parity): reemplazar `ObjectSet.Policy` y `Action.AuthorizationPolicy` por un modelo unificado de OSP con expresiones runtime que invocan funciones builtin `current_user()`, `current_groups()`, `current_org()`, `now()`. Ejemplo: `current_user().department == resource.department AND now() < resource.access_until`. Cell-level (fila + columna + valor) en una sola expresión.
- [ ] **E14.** **OSP DSL** evaluable y compilable a Cedar para reaprovechar `authz-cedar-go`; UI para autoría de OSPs sobre cada ObjectType.
- [ ] **E15.** **Silent empty traversal** (igual que Palantir): cuando el caller no tiene permisos sobre el target de un link, el traversal devuelve **lista vacía** sin error y sin filtrar metadatos del link. Hoy `composition.go` no tiene esa semántica explícita.
- [ ] **E16.** **Group-based ACL inheritance** desde el dataset/binding hacia el ObjectType: si el usuario es Viewer del dataset, automáticamente puede leer las instancias del object type respaldado.

### F. Actions, simulación y branching

- [ ] **F1.** **What-if branches reales**: hoy son cosméticas. Implementar copy-on-write sobre ObjectStore (overlay Cassandra), evaluación de rules/actions en branch, merge con resolución de conflictos.
- [ ] **F2.** **Approval workflow**: `Action.RequiresApproval`, `Action.Approvers`, estado `PENDING_APPROVAL → APPROVED → APPLIED`, integración con notification-alerting-service.
- [ ] **F3.** **Async / long-running actions** vía Temporal o `workflow-automation-service`: estado persistente, retries, deadlines, cancel.
- [ ] **F4.** **Action templates**: librería de actions reutilizables con parámetros tipados; `ActionTemplate` y `ActionInstance`.
- [ ] **F5.** **Action composition / sub-actions**: una action puede invocar otras como `sub_action_1, sub_action_2` con manejo transaccional saga.
- [ ] **F6.** **Compensation handlers** explícitos por action.
- [ ] **F7.** **Action scheduling**: `ScheduleAction(action, cron, args)` con `scheduling-cron`.
- [ ] **F8.** **Side-effect declaration**: `Action.SideEffects []SideEffectDescriptor` (writes, deletes, external_calls, notifications) para análisis de impacto pre-commit.
- [ ] **F9.** **Action preview con dry-run completo**: hoy hay simulación parcial; ampliar para mostrar diff exacto, rules disparadas, alertas que se emitirían.
- [ ] **F10.** **API completa Palantir-aligned**: exponer formal y separadamente `apply`, `applyBatch` (lote, hasta **10 000 objetos** por action) y `validate` (valida parámetros sin ejecutar).
- [ ] **F11.** **Function-backed actions**: permitir `ActionType.BackingFunctionID *string` que delega la lógica a una `FunctionPackage` (TS/Python). El runtime invoca la función con los parámetros, recibe `OntologyEdits[]` y los aplica transaccionalmente.
- [ ] **F12.** **Action history log para análisis**: tabla append-only `action_decisions_log{tenant, action_id, actor, params, result, timestamp}` consultable para flujos de mejora continua y auditoría de decisiones (Palantir lo expone como log histórico de decisiones de usuario).
- [ ] **F13.** **Edits inmediatamente visibles**: garantizar que tras `apply` retorne 2xx, los reads del objeto reflejan ya las ediciones (write-read consistency post-action). Hoy es eventually consistent en algunos paths.
- [ ] **F14.** **Side-effects declarativos**: además de `notify`/`webhook`, soportar `create_object`, `delete_object`, `create_link`, `delete_link`, `invoke_function`, `emit_event` con manejo unificado de fallos via saga.

### G. Rules engine

- [ ] **G1.** **Rule composition**: `RuleGroup`, `RuleSet`, importación entre proyectos.
- [ ] **G2.** **Rules con ApplyEffect realmente cableado**: hoy es parcial; añadir worker pool que consume `ontology_rule_schedules` y aplica `object_patch` con writeback transaccional.
- [ ] **G3.** **Rule simulation con branch**: ver qué objetos cambiarían sin aplicar.
- [ ] **G4.** **Bidirectional rules**: triggers no sólo por cambio sino por arrival de eventos externos (Kafka topic, webhook).
- [ ] **G5.** **Rule priority y conflict resolution**: si dos rules patchan el mismo campo, política de precedencia explícita.
- [ ] **G6.** **Async/long-running effects**: efecto `invoke_workflow` que dispara un workflow en `workflow-automation-service`.
- [ ] **G7.** **Rule lineage**: registrar qué rule mutó qué objeto y por qué; visible en object view timeline.

### H. Functions y código pluggable

- [ ] **H1.** **Python sidecar siempre cableado** (no `ErrPythonRuntimeNotWired`); container con isolation (gVisor/Firecracker), límites de CPU/RAM/disk, network egress allowlist.
- [ ] **H2.** **WebAssembly runtime** para functions deterministas (`wasmtime` Go) para casos donde Python/TS sea overkill.
- [ ] **H3.** **Function packages como artefactos versionados** en OCI registry; `FunctionPackage.OCIRef`, deploy via `model-deployment-service`.
- [ ] **H4.** **Dependency management** real: `requirements.txt` / `package.json` resueltos y cacheados; lockfiles.
- [ ] **H5.** **SDK oficiales** generados con `services/sdk-generation-service`:
    - Python (`openfoundry-sdk` con tipos generados desde la ontología)
    - TypeScript (`@openfoundry/sdk` con type-safe Object/Action accessors)
    - Go (`github.com/openfoundry/sdk-go`)
    - Java/Kotlin
- [ ] **H6.** **Function authoring UI**: editor con autocompletion de la ontología, type-checking en vivo, dry-run.
- [ ] **H7.** **Function cost tracking**: CPU·s, memory·s, network bytes, llamadas a LLM por invocación.
- [ ] **H8.** **Function tracing**: spans OTLP por invocación, logs persistidos por run.
- [ ] **H9.** **Function caching**: si la entrada es la misma y la función es marcada `pure`, devolver resultado cacheado.
- [ ] **H10.** **`@OntologyEditFunction` decorator pattern** (TS v1/v2 + Python): API idiomática y tipada para declarar funciones que editan la ontología. Ejemplo TS v1: `@OntologyEditFunction() @Edits([Person]) class CreatePerson { ... }`. En TS v2 / Python, retorno explícito `OntologyEdits[]`.
- [ ] **H11.** **Soporte de Interfaces en functions** (Palantir solo lo da en TS v2): permitir parámetros y retornos tipados como interfaces; resolución polimórfica en runtime.
- [ ] **H12.** **OSDK auto-regeneración** al cambiar el schema: hook en `OMS::PutObjectType/PutLinkType/PutActionType` que dispara `sdk-generation-service` para republicar `@openfoundry/sdk` (npm) y `openfoundry-sdk` (pip) con tipos actualizados. IntelliSense del IDE se actualiza inmediatamente.
- [ ] **H13.** **OSDK 2.0-style sintaxis simplificada**: API tipo `client.objects.Person.where(p => p.age > 18).take(100)` (alineada con OSDK 2.0 de Palantir, GA octubre 2024).
- [ ] **H14.** **Function isolation hardening**: Firecracker microVM o gVisor para Python; egress allowlist; no-network por defecto salvo `capabilities.allow_network=true`; cgroup limits.

### I. Search

- [ ] **I1.** **Phonograph / phonetic search**: integrar Soundex, Metaphone, Double Metaphone, BeiderMorse en Vespa (custom tokenizer) y OpenSearch (analyzer).
- [ ] **I2.** **Fuzzy / wildcard / proximity / phrase search** expuestos en la abstraction (`SearchQuery.Fuzzy`, `Wildcard`, `Proximity`).
- [ ] **I3.** **Geo search**: `geo_distance`, `geo_bbox`, `geo_polygon`, `geo_shape` predicates.
- [ ] **I4.** **Faceted navigation completa**: aggregations multi-valor, ranges, date histograms, nested facets.
- [ ] **I5.** **Typed search** con narrowing en query compilation (e.g., `kind:Person AND department:Eng`).
- [ ] **I6.** **Autocomplete / search-as-you-type** con n-grams o completion suggester.
- [ ] **I7.** **Custom analyzers** por property: stemming, synonyms, stop-words, multi-language.
- [ ] **I8.** **Search explain** expuesto en API para debugging de scoring.
- [ ] **I9.** **Learning-to-rank**: cross-encoder reranking (BGE-reranker, Cohere); pipeline de training con clicks/feedback.
- [ ] **I10.** **Highlighting** real (no sólo snippets), con tokens marcados por relevance.
- [ ] **I11.** **Search streaming** (cursor-based) para resultados grandes.
- [ ] **I12.** **Saved searches** y subscriptions a cambios en resultados.

### J. Vector / semantic / AI

- [ ] **J1.** **Embedding generation pipeline**: integraciones a OpenAI, Cohere, VoyageAI, modelos locales (BGE, E5); workers que rellenan embeddings al ingest.
- [ ] **J2.** **Embedding versioning**: `Embedding.ModelVersion`; reindex programado al cambiar modelo.
- [ ] **J3.** **pgvector backend** real (hoy es skeleton): `services/object-database-service` con extensión `pgvector`, índices `HNSW`/`IVFFlat`.
- [ ] **J4.** **Hybrid retrieval con RRF / RAG**: combinación BM25 + dense + sparse (SPLADE) con Reciprocal Rank Fusion configurable.
- [ ] **J5.** **Reranking** bi-encoder y cross-encoder.
- [ ] **J6.** **Semantic caching** de queries frecuentes con similitud vectorial.
- [ ] **J7.** **RAG evaluation harness**: BLEU, ROUGE, faithfulness, context relevance; integrado a `ai-evaluation-service`.
- [ ] **J8.** **AIP-style**: chat-with-ontology endpoint que combina OQL + RAG + tool-use sobre actions.

### K. Geospatial

- [ ] **K1.** **`libs/geospatial-core` real**: integrar `paulmach/orb`, `golang/geo`, `uber/h3-go`.
- [ ] **K2.** **PostGIS** en `services/object-database-service` (tabla con `GEOMETRY(...)`).
- [ ] **K3.** **Predicates geo en OQL y Object Sets**: `ST_Within`, `ST_Contains`, `ST_Distance`, `ST_DWithin`.
- [ ] **K4.** **H3 / S2 indexing** para queries de proximidad y heatmaps.
- [ ] **K5.** **Geotemporal Series Sync (GTSS)** (Palantir parity): nuevo recurso `GeotemporalSeriesSync{id, object_type_id, lat_property, lon_property, time_property, source_dataset}` que indexa la trayectoria de objetos a lo largo del tiempo en una TSDB (TimescaleDB / InfluxDB / Iceberg time-partitioned); habilita queries `trajectory(object_id, time_range)` y `objects_within(polygon, time_range)`.
- [ ] **K6.** **Geotime (Gotham-style)**: queries combinadas geo + temporal sobre GTSS; UI con timeline scrubber y mapa.
- [ ] **K7.** **MVT tile generation** en `geospatial-tiles` para mapas zoom-able.
- [ ] **K8.** **Reverse geocoding** y autocomplete de direcciones.
- [ ] **K9.** **Map layers** y heatmaps en `ontology-exploratory-analysis-service` cableados al router.
- [ ] **K10.** **Geopoint format compat**: aceptar formato Palantir `'{lat},{lon}'` como string además del shape estructurado actual (validación en `type_system.go`).

### L. Data binding, ETL e ingest

- [ ] **L1.** **Transform DSL** en `Binding.Transform`: expresiones (no sólo column→property mapping) con funciones `lower`, `upper`, `coalesce`, `parse_date`, `to_geo_point`, etc.
- [ ] **L2.** **CDC nativo** desde Cassandra (CDC table) y otros stores; conectores en `ingestion-replication-service`.
- [ ] **L3.** **Magritte-equivalent**: pipeline visual para definir bindings con preview en vivo del dataset.
- [ ] **L4.** **Bulk import API**: `POST /tenants/{t}/objects/_bulk` con NDJSON streaming, dedup, error reporting por línea.
- [ ] **L5.** **Streaming ingest**: Kafka topic → ObjectStore con transformación por evento.
- [ ] **L6.** **Schema inference** automática desde dataset.
- [ ] **L7.** **Data quality checks** integradas: not-null, unique, range, regex, referential integrity; resultado expuesto como `Funnel.HealthCheck`.
- [ ] **L8.** **Backfill / replay** programable cuando se cambia un binding.
- [ ] **L9.** **Multi-Datasource Object Types (MDOs) reales**: cambiar `Binding` para que cada **propiedad** declare de qué `Binding.ID` proviene (`Property.SourceBindingID *string`). El reader debe evaluar permisos del usuario sobre cada binding y filtrar/redactar propiedades en el resultado. Esto da column-level security real.
- [ ] **L10.** **Virtual Tables zero-copy**: nuevo modelo `VirtualTableSource{kind: snowflake|databricks|bigquery|s3_iceberg|s3_delta|s3_parquet|s3_avro|adls|gcs, connection_id, ref}`; `Binding.SourceKind` extendido para incluir virtual tables; consultas se proxean al sistema externo via Apache Arrow / Flight SQL sin importar datos a Cassandra. Conectores reutilizan `connector-management-service`.
- [ ] **L11.** **Iceberg como fuente directa** para object types (managed e externo): usar `iceberg-catalog-service` + `query-engine` para leer Parquet manifests sin materialización intermedia.
- [ ] **L12.** **Restricted Views** equivalentes: dataset con filtro RLS predefinido del que pueden colgar bindings; `RestrictedView{id, base_dataset, filter_expr, allowed_groups}`.
- [ ] **L13.** **Streaming datasources de baja latencia**: nuevo `Binding.SyncMode = "streaming"` que se suscribe a un topic Kafka y aplica deltas al ObjectStore con latencia < 1s; backed by `event-bus-data`.
- [ ] **L14.** **CDC desde virtual tables**: integrar Debezium connectors para Snowflake/Databricks/Postgres externos para mantener objetos sincronizados sin polling.
- [ ] **L15.** **Datasource health dashboard**: extender `Funnel.HealthResponse` para mostrar lag, error rate, throughput por binding, alineado con el modelo de "Funnel as orchestrator" de Palantir.

### M. Materializations y performance

- [ ] **M1.** **Materializations service centralizado**: `services/materializations-service` que ejecuta refresh schedules, compactación, tracking de cost.
- [ ] **M2.** **Incremental materializations** (delta) para Object Sets grandes.
- [ ] **M3.** **Cache layer** (Redis) para object reads y queries calientes.
- [ ] **M4.** **Query result caching** con invalidación basada en lineage de la query.
- [ ] **M5.** **Read replicas** Cassandra y PG para hot reads.
- [ ] **M6.** **Materialization cost metrics** y alerts.
- [ ] **M7.** **TTL automático** para materializations no consultadas.

### N. Branching, versionado y release management

- [ ] **N1.** **Ontology versioning** semántico (`v1.4.2`) con `release notes` autogenerados.
- [ ] **N2.** **Stable releases** con freeze de schema; rollback completo.
- [ ] **N3.** **Approval chains** en `OntologyProjectProposal` (multi-reviewer, secuencial o paralelo, requirements de roles).
- [ ] **N4.** **Diff visualizer** entre branches/versions: qué tipos cambiaron, qué propiedades, qué links.
- [ ] **N5.** **Migration plans** auto-generados al hacer merge de un branch (cómo migrar datos existentes).
- [ ] **N6.** **Configuration as Code**: DSL YAML/HCL para definir la ontología, con `terraform-style apply/plan`.
- [ ] **N7.** **GitOps**: sincronización con un repo Git canónico de la ontología.
- [ ] **N8.** **Promotion model**: `dev → staging → prod` con quality gates.

### O. Lineage end-to-end

- [ ] **O1.** **Lineage de objetos**: además de dataset/columna, lineage de cambios por objeto (qué action lo modificó, qué rule, qué pipeline).
- [ ] **O2.** **Lineage de markings** end-to-end: si redefino un upstream marking, qué objetos derivados lo heredan.
- [ ] **O3.** **Impact analysis bidireccional**: dado un objeto, qué dashboards/reports/functions se rompen si lo borro.
- [ ] **O4.** **OpenLineage compliance** completo (ya hay headers; expandir a todas las operaciones).
- [ ] **O5.** **Lineage UI** integrado en object views.

### P. Observability y operations

- [ ] **P1.** **W3C Trace Context propagation** entre servicios (hoy OTLP es básico).
- [ ] **P2.** **Multi-tenant observability isolation**: tenant labels propagados en traces/metrics.
- [ ] **P3.** **SLO / Error budget** por servicio con alerts.
- [ ] **P4.** **Saga real-time monitoring dashboard** con state de cada saga en vuelo.
- [ ] **P5.** **DLQ automático** en consumers Kafka.
- [ ] **P6.** **Backpressure** y rate-limiting dinámico.
- [ ] **P7.** **Exactly-once semantics** end-to-end (Kafka transactions + idempotency).
- [ ] **P8.** **Saga compensation timeouts** configurables.
- [ ] **P9.** **Circuit breakers** por dependencia.
- [ ] **P10.** **Chaos engineering harness** (failure injection en CI).
- [ ] **P11.** **Cost attribution** por tenant/project/action/function.
- [ ] **P12.** **Audit anomaly detection** (ML sobre `of_audit.events`).

### Q. APIs, SDKs y experiencia del cliente

- [ ] **Q1.** **gRPC + REST + GraphQL** todos vivos para la ontología.
- [ ] **Q2.** **Subscriptions / streaming** vía gRPC server-streaming o WebSockets para cambios de objetos en vivo.
- [ ] **Q3.** **OpenAPI 3.1 schema** completo y publicado.
- [ ] **Q4.** **SDKs oficiales** Python/TypeScript/Go/Java con type-generation desde ontología.
- [ ] **Q5.** **CLI oficial** `of` para administrar la ontología.
- [ ] **Q6.** **Webhook subscriptions** para eventos del control-plane (object created/updated, action applied, rule fired).

### R. Workflow / Funnel

- [ ] **R1.** **Visual workflow editor** integrado a Funnel.
- [ ] **R2.** **Approval gates** en workflow steps.
- [ ] **R3.** **Conditional branches** y loops.
- [ ] **R4.** **Funnel SLA tracking** con alertas de breach.
- [ ] **R5.** **Funnel templates / catalog** reutilizables.

### S. Front-end y UX

- [ ] **S1.** **Object Explorer** UI con search, filters, facets, graph view.
- [ ] **S2.** **Schema designer** UI (drag-and-drop ObjectTypes/Properties/Links).
- [ ] **S3.** **Action runner** UI con form generation desde `FormSchema`.
- [ ] **S4.** **Rules workbench** UI con simulator.
- [ ] **S5.** **Quiver UI** con time-series interactivos (zoom, brush, multi-axis).
- [ ] **S6.** **Map / Geotime UI** con timeline scrubber.
- [ ] **S7.** **Object views** UI configurables por tipo.

### T. Testing, calidad y documentación

- [ ] **T1.** **Contract tests** wire-format Rust↔Go bit a bit (existen algunos; expandir a 100% de los handlers).
- [ ] **T2.** **End-to-end tests** con `compose.yaml` real (Cassandra + Vespa + PG + Kafka + Cedar).
- [ ] **T3.** **Property-based testing** (Rapid) para validators y query engine.
- [ ] **T4.** **Performance benchmarks** continuos con regression alerts (ya hay `benchmarks/`; expandir).
- [ ] **T5.** **Fuzzing** de OQL parser y JSON validators.
- [ ] **T6.** **Security tests**: PII leak detection, marking bypass attempts, Cedar policy edge cases.
- [ ] **T7.** **Documentación de referencia** completa por módulo.
- [ ] **T8.** **Tutoriales** end-to-end (definir un ObjectType → bind dataset → action → rule → object set → query).
- [ ] **T9.** **Conformance suite** publicable para validar implementaciones.

### U. Multi-region, escala y disponibilidad

- [ ] **U1.** **Multi-region replication** Cassandra (NetworkTopologyStrategy) y Vespa (cross-region content clusters).
- [ ] **U2.** **Active-active** con conflict resolution determinista.
- [ ] **U3.** **Disaster recovery** con RPO/RTO targets explícitos.
- [ ] **U4.** **Tenant sharding** automatizado para escalar horizontalmente.
- [ ] **U5.** **Autoscaling** basado en queue depth y latency.

### V. Compliance y enterprise

- [ ] **V1.** **SOC2 / ISO27001** evidence collection automatizada.
- [ ] **V2.** **HIPAA / GDPR / CCPA** templates de policies y data residency controls.
- [ ] **V3.** **FIPS 140-2** crypto compliance.
- [ ] **V4.** **STIG** hardening de containers.
- [ ] **V5.** **Air-gapped deployment** support (no llamadas a internet).
- [ ] **V6.** **Bring-your-own KMS** para customer-managed keys.

### W. Value Types (capa semántica que falta entera)

- [ ] **W1.** Nuevo modelo `OntologyValueType{id, name, base_type, validation_expr, display_metadata, owner_id, status}` persistido en PG con CRUD vía `ontology-definition-service`.
- [ ] **W2.** Catálogo builtin: `Email`, `URL`, `UUID`, `IPv4`, `IPv6`, `PhoneE164`, `IBAN`, `SSN_US`, `CountryCodeISO2/3`, `CurrencyISO4217`, `LanguageBCP47`, `MimeType`, `Hostname`.
- [ ] **W3.** Soporte para **enums de usuario** como Value Type (`enum` con `allowed_values []` y `display_labels`).
- [ ] **W4.** **Property bindings con value types**: `Property.ValueTypeID *string` que sustituye o complementa `PropertyType`. La validación se delega al value type.
- [ ] **W5.** Value Types **paramétricos** (genéricos): `Range<T>`, `Optional<T>`, `WithUnit<T>`.
- [ ] **W6.** **Value Type registry** publicable: workspaces pueden compartir y heredar value types.
- [ ] **W7.** Value Types en OSDK: type-generation produce wrappers TS/Python con métodos de validación y formateo.

### X. Object Security Policies (cell-level paramétricas)

> Cubre las tareas E13–E14 con detalle de implementación.

- [ ] **X1.** Nuevo modelo `ObjectSecurityPolicy{id, object_type_id, expr, version, created_at}` con DSL evaluable.
- [ ] **X2.** **Funciones builtin** del DSL: `current_user()`, `current_user_id()`, `current_groups()`, `current_org()`, `now()`, `today()`, `principal.has_role(r)`, `resource.has_marking(m)`.
- [ ] **X3.** **Compilación a Cedar** para reaprovechar `authz-cedar-go` (con caching del policy set por tenant).
- [ ] **X4.** **Cell-level enforcement**: el evaluador trabaja a nivel `(row, column, value)`; resultado puede ser `allow`, `deny`, `redact (mask)`.
- [ ] **X5.** **OSP UI** en `ontology-exploratory-analysis-service` para autoría/test/dry-run.
- [ ] **X6.** **OSP simulation**: dado un policy y un usuario hipotético, mostrar qué objetos/celdas vería; útil para revisión pre-deploy.
- [ ] **X7.** **OSP migration** desde `ObjectSet.Policy` y `Action.AuthorizationPolicy` actuales.

### Y. MCP / OMCP (exposición agentic)

- [ ] **Y1.** Nuevo servicio `services/ontology-mcp-server/` que implementa el protocolo **MCP** (stdio + SSE/HTTP transports).
- [ ] **Y2.** **Auto-exposición de ObjectTypes como tools MCP**: un tool por type con shape `list_objects_<type>(filter, limit)`, `get_object_<type>(pk)`, `search_<type>(query)`.
- [ ] **Y3.** **Auto-exposición de ActionTypes como tools MCP**: un tool por action con los `InputSchema` traducidos a JSON Schema MCP, ejecución vía `apply`/`applyBatch`.
- [ ] **Y4.** **Auto-exposición de FunctionPackages** como tools MCP cuando sean `pure` o tengan `mcp_exposed=true`.
- [ ] **Y5.** **Scope-based MCP**: cada MCP server publica solo el subconjunto de la ontología configurado en su scope (ObjectTypes, ActionTypes, FunctionPackages permitidos).
- [ ] **Y6.** **MCP discoverability**: `tools/list` retorna metadata rica (descripción, ejemplos, OSPs aplicables).
- [ ] **Y7.** **Auth MCP**: OAuth 2.1 + DCR (Dynamic Client Registration) para que agentes externos (Claude, GPT, Vercel, LangChain, CrewAI, Microsoft Copilot) se conecten con identidades distintas.
- [ ] **Y8.** **MCP audit**: cada invocación se registra en `of_audit.events` con flag `via_mcp=true` y `mcp_client_id`.
- [ ] **Y9.** **OpenFoundry MCP** equivalente al "Palantir MCP": además de exponer ontología, permitir a AI IDEs (Claude Code, Cursor) **diseñar/editar** ontología (CRUD de ObjectTypes/ActionTypes via tools MCP).

### Z. AIP-equivalent (no-code LLM functions sobre ontología)

- [ ] **Z1.** Nuevo servicio `services/aip-logic-service/` (o ampliar `ai-evaluation-service`) con authoring no-code de funciones LLM.
- [ ] **Z2.** **AIP Logic functions**: input puede ser `ObjectType` instances o texto; output puede ser objetos, strings o **ediciones gobernadas** (vía `OntologyEdits[]`).
- [ ] **Z3.** **Model-agnostic**: soportar Anthropic, OpenAI, modelos locales (Ollama, vLLM); routing configurable por función.
- [ ] **Z4.** **AIP Chatbot Studio equivalente**: builder visual para agentes con tools MCP, prompts, memoria, fallback chains.
- [ ] **Z5.** **Citations / faithfulness**: cada respuesta del LLM trae las refs de objetos que usó (RIDs); UI de Workshop muestra "fuente".
- [ ] **Z6.** **Tool-use governed**: LLM solo puede invocar actions/functions del scope autorizado; OSPs aplican.
- [ ] **Z7.** **Eval harness**: BLEU/ROUGE/faithfulness/context-relevance integrado; runs como FunctionPackageRun.

### AA. Microservicios alineados con OSv2 (refactor opcional)

- [ ] **AA1.** Renombrar/segregar `ontology-definition-service` → `oms-service` (Ontology Metadata Service) con responsabilidad exclusiva de schema.
- [ ] **AA2.** Promocionar `ontology-query-service` a `object-set-service` (OSS) con la responsabilidad completa de lecturas + object sets.
- [ ] **AA3.** Crear `object-data-funnel-service` separado del kernel: orquestación dedicada de escrituras (datasource reads + edits + indexación + CDC).
- [ ] **AA4.** Crear `actions-service` puro (separado del kernel) con `apply`/`applyBatch`/`validate` y log histórico de decisiones.
- [ ] **AA5.** Crear `functions-service` puro con runtime sandbox aislado por function (Firecracker / gVisor).
- [ ] **AA6.** **Ontology Manager UI** (`apps/ontology-manager/`) — equivalente a OMA: modelado visual de object types, link types, action types, interfaces, value types, OSPs, GTSS, Object Type Groups, virtual tables.

### AB. Global Branching (data + ontología en una rama)

- [ ] **AB1.** Extender `OntologyProjectBranch` para incluir referencias a **datasource branches** (datasets, virtual tables, pipelines) además de las ontológicas.
- [ ] **AB2.** **Testing downstream**: en una rama, redirigir las apps de Workshop / dashboards / functions a leer de la rama, no de Main.
- [ ] **AB3.** **Rebase con Main**: incorporar cambios de Main a la rama con resolución de conflictos en datos + ontología.
- [ ] **AB4.** **Merge con downstream impact preview**: antes de merge, mostrar qué dashboards/functions/actions se rompen.
- [ ] **AB5.** **Branch-aware OSDK**: el SDK puede generarse contra una rama específica (`@openfoundry/sdk@branch-feature-x`).
- [ ] **AB6.** **CI gates** sobre branches: tests automáticos de schema migration y data quality antes de permitir merge.

### AC. Búsqueda Around / N-hop avanzada

- [ ] **AC1.** **Search Around** (Palantir parity): API formal `POST /search-around { object_id, link_types, depth, limit }` con default 100k, ampliable.
- [ ] **AC2.** **N-hop traversal con filtros por hop**: cada hop puede llevar un predicado (`hop1.status='active' AND hop2.amount > 1000`).
- [ ] **AC3.** **Path enumeration** (todos los caminos entre A y B con max-depth).
- [ ] **AC4.** **Saved traversals**: guardar definiciones N-hop como recursos reusables (`SavedTraversal`).

---

## 🧭 Roadmap sugerido (orden por impacto en score)

> El roadmap supone que cerrar tareas de tipo **bloqueante** vale más que cerrar tareas de **pulido**. Las épicas grandes se abordan completas (no half-done).

**Sprint 1–2 (mover de 6 → 7/10):**
A1, A2, A3, A3b, A6, A7, A8, A9, A17, A18, A19, B1, B2, C2, C9, F1, F10, F11, G2, H1, H10, E7, E13, L9.

**Sprint 3–4 (mover a 8/10):**
C1 (OQL básico), C10, D1–D4 (time-travel), E1–E5 (markings avanzados), E13–E16 (OSP), I1–I4, K1–K5 (geo + GTSS), W1–W4 (Value Types), L10–L11 (Virtual Tables), Y1–Y4 (OMCP MVP).

**Sprint 5–6 (mover a 9/10):**
C3–C8, C11, D5–D7, E8–E12, F2–F9, F12–F14, H11–H14, J1–J6, M1–M3, N1–N6, X1–X7 (OSP completo), AA1–AA5 (refactor microservicios).

**Sprint 7+ (cerrar a 10/10):**
Z1–Z7 (AIP completo), AB1–AB6 (Global Branching), AC1–AC4, U1–U5 (multi-region), V1–V6 (compliance), S1–S7 (UI completa), conformance suite, Ontology Manager UI (AA6), todo lo restante.

### Métricas de progreso

| Hito | Cobertura aprox. | Score esperado |
|---|---|---|
| Sprint 2 entregado | ~70% | 7.0 |
| Sprint 4 entregado | ~80% | 8.0 |
| Sprint 6 entregado | ~90% | 9.0 |
| Sprint 7+ entregado | ~98% | 9.5–10 |

> El **10/10 absoluto** exige paridad con todo el roadmap **+** conformance suite **+** documentación de referencia **+** SDKs publicados **+** evidencia operativa de los límites OSv2 (10k objs/Action, 2k props/type, 100k Search Around).

---

## 📌 Notas finales

- La arquitectura subyacente (Cassandra + PG + Vespa + Cedar + Outbox + Saga + Kafka + Iceberg) **es la correcta** y está al nivel de Foundry/OSv2. Lo que falta es **profundidad en las capacidades** (OSP, Value Types, MDOs reales, Virtual Tables, GTSS, MCP), **segregación de microservicios** (OMS / OSS / Funnel / Actions / Functions diferenciados), **Ontology Manager UI** y **cierre de stubs** (what-if, Python runtime, exploratory-analysis router, Cedar cableado en handlers, ApplyRuleEffect end-to-end).
- Hay muchos archivos `*_test.go` en `models/` y `domain/`, lo cual es excelente; mantener esa cultura al añadir las features de arriba.
- El branching/proposals está más avanzado que en otros clones: aprovecharlo para construir encima `what-if branches reales`, `approval chains`, `Global Branching` data+ontología y `migration plans` (gana mucho con poca duplicación).
- Recomendación operativa: NO atacar las 250+ tareas en orden lineal; agrupar por épicas (`OQL`, `Time-travel`, `Markings 2.0 + OSP`, `Geospatial + GTSS`, `Functions runtime + OSDK`, `Value Types`, `Virtual Tables`, `OMCP / AIP`) y entregar cada épica completa antes de pasar a la siguiente, para evitar half-finished features.
- **No invertir en OSv1 / Phonograph**: Palantir lo retira el 30/06/2026; tomar OSv2 como único target.
- **MCP / OMCP** es la apuesta estratégica que más diferencia hoy a una ontología "moderna" de una "legacy": exponer la ontología como tools MCP convierte a OpenFoundry en un cerebro consultable por cualquier agente Anthropic / OpenAI / LangChain / CrewAI. Priorizarlo en cuanto haya OSP cableado.

---

**Veredicto final:** OpenFoundry está en el percentil ~75 de los clones open-source de Palantir Foundry/Gotham que existen, con un control-plane robusto y una infraestructura distribuida (outbox + saga + idempotency + Cedar + Vespa) al nivel correcto. El camino de **6 → 10** es largo y exige las **~250 tareas** de arriba agrupadas en 27 épicas (A–AC). El esqueleto y la arquitectura son sólidos; el trabajo restante es **rellenar capacidades semánticas** (Value Types, OSP, GTSS, MDOs, Virtual Tables), **cerrar stubs** (Python runtime, what-if, ApplyRuleEffect), **separar microservicios** según OSv2 (OMS/OSS/Funnel/Actions/Functions) y **construir la capa agentic** (OMCP + AIP equivalente). No requiere rediseño.
