# PoC Online Retail II — Roadmap restante

> **Audiencia:** un agente de IA que retoma el trabajo en frío. Este
> documento tiene contexto operacional, decisiones ya tomadas, gotchas
> reales encontrados, comandos verbatim, y verificaciones por tarea.
> No es un resumen — es un manual.
>
> **Última actualización:** 2026-05-10
> **Commit base:** `fa60eef9` (`feat(poc,services): runtime read-path for Workshop dashboard`)
> **Companion docs:** [README.md](README.md), [PLAN.md](PLAN.md), [RUNTIME-INDEXER.md](RUNTIME-INDEXER.md)

---

## 0 · Estado actual del PoC (qué funciona, qué no)

### ✅ Verificado vía curl / kubectl

- Pipeline Spark materializa **4 tablas Iceberg** en Ceph RGW vía Lakekeeper REST:
  - `lakekeeper.default.online_retail_raw` (1M rows del CSV)
  - `lakekeeper.default.online_retail_clean` (filtradas, qty>0, price>0)
  - `lakekeeper.default.online_retail_anomalies` (flagged needs_review)
  - `lakekeeper.default.online_retail_top_customers` (rank por revenue)
- Bridge HTTP `/api/v1/ontology/types/{id}/objects` (List/Get/Create/**Patch**) en
  [services/object-database-service/internal/handlers/objects_bridge.go](../../services/object-database-service/internal/handlers/objects_bridge.go)
  responde con la wire shape `ObjectInstance` que la SPA espera. PATCH soporta
  `{properties, replace, marking}` — el contrato exacto que `lib/api/ontology.ts:updateObject()`
  llama, y que las acciones del Workshop usan para mutar objetos.
- App Builder CRUD `/api/v1/apps` (incluye publish + public/{slug}) en
  [services/application-composition-service/internal/handlers/apps.go](../../services/application-composition-service/internal/handlers/apps.go).
- Ontology properties + link types HTTP routes en
  [services/ontology-definition-service/internal/handlers/properties_links.go](../../services/ontology-definition-service/internal/handlers/properties_links.go).
- App `PoC — Anomaly Review` (slug `poc-anomaly-review`) creada y publicada (versión 1).
- Seeder Python carga **496 transactions / 351 products / 29 customers** al ObjectStore en stub-mode.

### 🟡 Parcialmente verificado en browser (pase iniciado)

Hay un browser pass en curso que ya descubrió y parcheó varias cosas — los archivos
`apps/web/src/routes/apps/WorkshopEditorPage.tsx` y
`tools/online-retail/dashboard-app-definition.json` están modificados, sin commit todavía:

- **PATCH del bridge añadido** ([objects_bridge.go:138](../../services/object-database-service/internal/handlers/objects_bridge.go#L138)) —
  hace merge de `properties` sobre el payload existente y bumpea version con
  `expected_version` (LWT-style). Es lo que la SPA `updateObject()` espera.
- **Hook order del editor arreglado** — el early return `if (!app || !activePage)`
  estaba antes de un `useEffect`, rompiendo las reglas de React. Movido después.
- **Nav de páginas en preview** — el editor solo mostraba la primera página.
  Añadido un tablist que permite navegar entre las 3 páginas del fixture.
- **Filtrado client-side de variables** — el WorkshopEditor ahora soporta
  `static_filter` / `static_filters` en las variables (`var_anomalies` filtra
  por `review_status=needs_review` directamente en el cliente), porque no
  existe pushdown server-side todavía. Ver [WorkshopEditorPage.tsx:438](../../apps/web/src/routes/apps/WorkshopEditorPage.tsx#L438) (`applyStaticFilters`).
- **Defaults defensivos** — `ObjectSetTitleWidgetView` recibía `variables`/`objectTypes`
  undefined cuando la app cargaba en preview con datos parciales; ahora default a `[]`.
- **`per_page=200` → `5000`** en widgets que cuentan elementos — con el filter
  client-side hay que tener el set entero para no contar parcialmente.
- **Fixture `var_anomalies` con `static_filter` directo** — ya no depende
  de un widget filter aparte. El `static_filter` JSON es:
  ```json
  { "property_name": "review_status", "operator": "equals", "value": "needs_review" }
  ```

> **Implicación arquitectónica importante:** filtrar 5000 rows en el cliente
> escala hasta ~10⁴. A 10⁵ rompe. El siguiente paso es exponer
> `POST /api/v1/ontology/types/{id}/objects/query` en el bridge con un
> filter-spec push-down al ObjectStore. Cassandra-kernel ya soporta queries
> por owner/marking — extender a property-equals es razonable.

### ⚠️ Pendiente / stubbed

- `object-database-service` corre en `OF_DEV_STUB_MODE=true` (in-memory). **Datos se pierden al reiniciar el pod.**
- El "indexer" hoy es un script Python (`tools/online-retail/seed_object_database.py`) que lee del CSV — no de Iceberg.
- **No se ha verificado en browser** que el WorkshopEditor renderiza el dashboard. Solo la wire del bridge vía curl.
- Writeback de acciones a Iceberg audit log no implementado.
- Bridge devuelve `total = len(items)`, no la cardinalidad real (mentira aceptable cuando se pide `per_page=5000`).

---

## 1 · Entorno operacional

### 1.1 Cluster Lima k3s

```
NAME          CPUS    MEMORY    DISK     ARCH        ROLE
k3s-master    2       8GiB      20GiB    aarch64     control-plane
k3s-node1     4       8GiB      40GiB    aarch64     worker (+ 30GiB virtio disk para Ceph OSD)
k3s-node2     4       8GiB      40GiB    aarch64     worker (+ 30GiB virtio disk para Ceph OSD)
```

- **kube context:** `default` (es el único; no existe `lima-of-cluster`).
- **Memoria muy ajustada.** Servicios escalados a 0 para dejar headroom a Spark drivers (1.5GiB+ cada uno).
- **arquitectura:** `arm64` / `aarch64` — todas las imágenes deben buildearse `--platform linux/arm64`.

### 1.2 Registry interno

```
in-cluster:  registry.registry.svc.cluster.local:5000
host:        localhost:30501  (NodePort)
```

Patrón estándar para buildear/publicar:

```sh
docker buildx build \
  --platform linux/arm64 \
  --build-arg SERVICE_NAME=<svc> \
  --build-arg TARGETOS=linux \
  --build-arg TARGETARCH=arm64 \
  --build-arg VERSION=<x.y.z> \
  -f services/<svc>/Dockerfile \
  -t localhost:30501/<svc>:<tag> \
  --push \
  .
```

### 1.3 Convención de deployment

> ⚠️ **CRÍTICO:** el `name` del container en los Deployments es siempre
> `app`, NO el nombre del servicio. Por eso `kubectl set image` requiere:
>
> ```sh
> kubectl -n openfoundry set image deploy/<svc> app=registry.registry.svc.cluster.local:5000/<svc>:<tag>
> ```
>
> Pasar `<svc>=<image>` falla con "container not found".

### 1.4 Port-forwards habituales

```sh
# Gateway (necesario para todos los API calls externos)
kubectl -n openfoundry port-forward svc/edge-gateway-service 18080:8080 &

# Object database directo (necesario para bulk seed: el gateway tiene rate-limit)
kubectl -n openfoundry port-forward svc/object-database-service 18081:8080 &

# Identity (sólo si vas a usar la SPA en dev mode con su proxy custom)
kubectl -n openfoundry port-forward svc/identity-federation-service 50088:8080 &
```

### 1.5 Credenciales PoC

Usuario creado vía `/api/v1/auth/register`:

| | |
|---|---|
| email | `smoke@openfoundry.local` |
| password | `openfoundry-smoke-password` |
| user UUID | `019e0f20-0297-7afd-bce5-daaa56a339bc` |

Mintar JWT:

```sh
TOKEN=$(curl -s -X POST http://localhost:18080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@openfoundry.local","password":"openfoundry-smoke-password"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
echo "$TOKEN" > /tmp/of-jwt
```

### 1.6 IDs del modelo PoC

| Recurso | UUID |
|---|---|
| `transaction` (object type) | `678b55fe-db5f-4d3a-bbf2-8cb643af8d32` |
| `product` (object type) | `616c7a42-6522-4f94-b696-ddb056cf9b11` |
| `customer` (object type) | `46e2598c-0d11-4ab2-a4aa-301f3e8fb5a7` |
| `review_anomaly` (action type) | `019e0f02-7d9f-79ca-89c6-8bf7d71b6e22` |
| `mark_resolved` (action type) | `019e0f02-7dac-76c5-b3ea-3accd44b0639` |
| App `poc-anomaly-review` | obtener vía `GET /api/v1/apps` |

### 1.7 Layout per-servicio (uniforme)

```
services/<svc>/
  cmd/<svc>/main.go                  ← entrypoint
  internal/server/server.go          ← chi router
  internal/handlers/                 ← HTTP handlers
  internal/repo/repo.go              ← data access (pgx)
  internal/repo/migrations/*.sql     ← goose-style
  internal/models/                   ← wire types
  internal/config/                   ← koanf
  Dockerfile                         ← multi-stage Go → distroless
```

Para crear un servicio nuevo: copiar [services/template/](../../services/template/) entero, hacer rename, registrar en:
- [infra/helm/apps/](../../infra/helm/apps/) (chart Helm)
- [services/edge-gateway-service/internal/proxy/router_table.go](../../services/edge-gateway-service/internal/proxy/router_table.go) (si recibe tráfico externo)
- [infra/argocd/apps/](../../infra/argocd/apps/) (GitOps)

### 1.8 Gotchas conocidos (no perder tiempo descubriéndolos otra vez)

1. **Apache Arrow + arm64 + JDK17 → SIGSEGV** en el native vectorized parquet reader. Mitigado con:
   ```
   spark.sql.parquet.enableVectorizedReader=false
   spark.sql.iceberg.vectorization.enabled=false
   ```
   El fix real es subir Iceberg a 1.6+ (ver Tarea 4.4).

2. **Lima `additionalDisks` se auto-formatean** y rompen Ceph OSDs. Hay que poner `format: false` en `lima.yaml` para los discos virtio destinados a OSD.

3. **Rook v1.19+ requiere Ceph v19.2+ ("squid").** `v18.2.x` falla los health checks con un mensaje cripto.

4. **Spark Operator pasa `driver` como primer arg al container.** Por eso `services/pipeline-runner/Dockerfile` NO tiene `ENTRYPOINT` — la imagen base de `apache/spark` toma el control. Si añades ENTRYPOINT, los pods driver crashloopearán con "unknown command".

5. **Mock OAuth2 server** (`navikt/mock-oauth2-server`) necesita `requestMappings` con `aud=lakekeeper` + `sub=lakekeeper-operator` en su `JSON_CONFIG`. Sin eso, Lakekeeper rechaza con `InvalidAudience`.

6. **Auth-middleware Claims schema:** `sub` y `jti` son `uuid.UUID` (no string). Si fabricas un JWT a mano, ambos campos deben ser UUIDs válidos.

7. **Gateway tiene rate-limit** que dispara HTTP 429 con bursts (~50 req en 1s). Para bulk seeds usa el port-forward directo a `object-database-service:18081`, no el gateway.

8. **Vite dev server** corre en `5174`, no `5173`. Su proxy enviá:
   - `/api/v1/auth` → `127.0.0.1:50088` (identity-federation-service)
   - `/api/v1/users/me` → `127.0.0.1:50088`
   - `/api/v1/data-connection/...` → `127.0.0.1:50088 / 50119`
   - **catch-all `/api`** → `127.0.0.1:8080` (gateway esperado en 8080)

   Entonces para que la SPA funcione hay que tener el gateway port-forwarded a `8080` (no `18080`) **y** el identity service en `50088`.

---

## 2 · Tarea 0 — Browser pass del dashboard

> **Estado actual:** parcialmente hecho. Los archivos `WorkshopEditorPage.tsx`,
> `dashboard-app-definition.json`, `objects_bridge.go` y `server.go` ya tienen
> parches sin commitear. Lo que queda es:
> 1. Cerrar el ciclo: terminar el browser pass con los parches aplicados.
> 2. Validar que "Mark resolved" hace el round-trip completo (PATCH → bridge → re-render del filtro).
> 3. Commitear los parches.
>
> Esto sigue siendo la prioridad más alta — no se ha confirmado todavía que
> los 4 widgets renderizan datos correctos end-to-end.

### 2.1 Objetivo

Confirmar que `/apps/poc-anomaly-review/preview` renderiza los 4 widgets
(KPIs, chart_pie, chart_xy, object_table) con las **496 transactions /
181 needs_review / 29 customers** que ya están en el ObjectStore.

### 2.2 Pre-requisitos

```sh
# A · Levantar port-forwards en los puertos que la SPA espera (NO 18080)
kubectl -n openfoundry port-forward svc/edge-gateway-service 8080:8080 &
kubectl -n openfoundry port-forward svc/identity-federation-service 50088:8080 &
kubectl -n openfoundry port-forward svc/object-database-service 18081:8080 &

# B · Verificar object-database-service vivo en stub mode con datos
kubectl -n openfoundry get deploy object-database-service \
  -o jsonpath='{.spec.replicas}{"\n"}'
# debe ser 1; si 0 → kubectl scale deploy/object-database-service --replicas=1

# C · Verificar el seeded data
curl -s "http://localhost:18081/api/v1/ontology/types/678b55fe-db5f-4d3a-bbf2-8cb643af8d32/objects?per_page=5000" \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print("transactions:",d["total"])'
# Esperar 496. Si 0:
#   GATEWAY=http://localhost:18081 TOKEN=skip \
#     python3 tools/online-retail/seed_object_database.py --limit 500
```

### 2.3 Levantar la SPA

```sh
pnpm --filter @open-foundry/web dev
# → http://localhost:5174
```

### 2.4 Login

- Abrir `http://localhost:5174/login`
- Credenciales: `smoke@openfoundry.local` / `openfoundry-smoke-password`
- Si la página de login falla con un 502, el port-forward a `identity-federation-service:50088` no está activo.

### 2.5 Abrir el dashboard

Encontrar el ID de la app:

```sh
curl -s http://localhost:8080/api/v1/apps -H "Authorization: Bearer $(cat /tmp/of-jwt)" \
  | python3 -m json.tool
```

Navegar a:
- `/apps/<app-id>/preview` (modo editor con preview)
- o `/apps/poc-anomaly-review` (modo runtime — usa GET `/apps/public/{slug}`)

### 2.6 Qué verificar — widget por widget

El fixture vive en
[tools/online-retail/dashboard-app-definition.json](../../tools/online-retail/dashboard-app-definition.json).
Tiene 3 páginas:

#### Página `Overview`
- **Section "KPIs"**: `kpi_title` con `source_variable_id=var_anomalies` debería mostrar el **count de transactions con `review_status=needs_review`** (esperado: 181).
- **chart_pie** bound a `transaction.country` → distribución por país (mayoría United Kingdom).
- **chart_xy** bound a `transaction.invoice_date` × `line_total` → revenue temporal.

#### Página `Anomalies`
- **filter_list** sobre `transaction` filtrando `review_status=needs_review`.
- **object_table** con columnas `invoice`, `quantity`, `unit_price`, `customer_id`, `country` — debe mostrar 181 filas.

#### Página `Customer drilldown`
- **property_list** con propiedades del customer seleccionado.
- **button_group** con dos botones que invocan los action types:
  - `review_anomaly` → `019e0f02-7d9f-79ca-89c6-8bf7d71b6e22`
  - `mark_resolved` → `019e0f02-7dac-76c5-b3ea-3accd44b0639`
- **object_table** secundario bound a `customer` (29 rows).

### 2.7 Acción "Mark resolved"

> **Nota:** el bridge ahora expone `PATCH /api/v1/ontology/types/{id}/objects/{object_id}`
> que mergea `{properties}` sobre el payload existente y bumpea la versión
> con `expected_version` (LWT-style). Este es el endpoint que la SPA invoca.
> Si `ontology-actions-service` está scaled to 0, también se puede testear
> el round-trip directo:
>
> ```sh
> # PATCH directo al bridge (sin pasar por ontology-actions-service)
> curl -s -X PATCH \
>   "http://localhost:18081/api/v1/ontology/types/678b55fe-db5f-4d3a-bbf2-8cb643af8d32/objects/<object_id>" \
>   -H "Content-Type: application/json" \
>   -d '{"properties":{"review_status":"resolved"}}'
> ```

1. Click en una fila de la `object_table` de Anomalies → drill-down.
2. Click "Mark resolved" en el button_group.
3. Verificar via curl que la fila se actualiza:
   ```sh
   curl -s "http://localhost:8080/api/v1/ontology/types/678b55fe-db5f-4d3a-bbf2-8cb643af8d32/objects?per_page=5000" \
     -H "Authorization: Bearer $(cat /tmp/of-jwt)" \
     | python3 -c '
   import json, sys
   from collections import Counter
   d = json.load(sys.stdin)
   c = Counter(r["properties"].get("review_status") for r in d["data"])
   print(dict(c))'
   ```
   El count de `needs_review` debería bajar en 1, y aparecer `resolved` con +1.

### 2.8 Debug si los widgets están vacíos

1. **DevTools → Network** mientras se carga la página. Buscar requests a `/api/v1/ontology/types/.../objects`. Verificar status 200 y payload.
2. Si la respuesta tiene datos pero el widget no los pinta:
   - Comparar la wire shape del bridge (en
     [objects_bridge.go:30](../../services/object-database-service/internal/handlers/objects_bridge.go#L30))
     contra `ObjectInstance` en
     [apps/web/src/lib/api/ontology.ts:67](../../apps/web/src/lib/api/ontology.ts#L67).
     Campos posiblemente faltantes: `marking`, `created_by`.
   - El binding del widget en el fixture puede esperar un `path` o `field` que no existe en la properties bag.
3. Si `ontology-actions-service` 404 al ejecutar la acción:
   ```sh
   kubectl -n openfoundry scale deploy/ontology-actions-service --replicas=1
   ```
4. Si todo está bien pero `Mark resolved` no muta el objeto: verificar que el handler de Execute realmente llama a `object-database-service` (puede haber un stub que no propaga). Logs:
   ```sh
   kubectl -n openfoundry logs deploy/ontology-actions-service -f
   ```

### 2.9 Criterio de éxito

| Check | Resultado esperado |
|---|---|
| Widgets renderizan con datos > 0 | ✅ |
| Counts en KPIs concuerdan con curl | 181 needs_review / 496 total |
| chart_pie dominado por UK | UK > 80% |
| Click "Mark resolved" → fila desaparece de Anomalies tras refresh | ✅ |

---

## 3 · Tarea 1 — Indexer real Iceberg → ObjectStore

> **Prioridad:** alta. Sustituye al seeder Python — la pieza operacional
> que falta. Diseño completo en [RUNTIME-INDEXER.md](RUNTIME-INDEXER.md).

### 3.1 Arquitectura

```
        ┌──────────────────────────┐
        │ iceberg-indexer-service  │  Go control plane
        │  POST /runs              │  pg-runtime-config (runs)
        │  GET  /runs[/{id}]       │
        └─────────┬────────────────┘
                  │ aplica SparkApplication CR
                  ▼
        ┌──────────────────────────┐
        │ Spark Operator           │
        └─────────┬────────────────┘
                  │ ejecuta
                  ▼
        ┌──────────────────────────┐
        │ pipeline-runner-spark    │  fat JAR (existente)
        │  IcebergToObjectStore    │  + nueva main class
        │  Indexer                 │
        │                          │
        │  read Iceberg            │  (Lakekeeper REST + Ceph s3a)
        │  foreachPartition row→   │
        │    HTTP PUT object-db    │
        └─────────┬────────────────┘
                  │ HTTP PUT
                  ▼
        ┌──────────────────────────┐
        │ object-database-service  │
        └──────────────────────────┘
```

### 3.2 Subtarea 1.1 — Crear servicio Go `iceberg-indexer-service`

Copiar template:

```sh
cp -r services/template services/iceberg-indexer-service
cd services/iceberg-indexer-service
# Renombrar paths cmd/template → cmd/iceberg-indexer-service
mv cmd/template cmd/iceberg-indexer-service
# Buscar/reemplazar `template` → `iceberg-indexer-service` en go files
find . -name "*.go" -exec sed -i '' 's|services/template|services/iceberg-indexer-service|g' {} \;
```

#### DDL — añadir migration

Archivo: `services/iceberg-indexer-service/internal/repo/migrations/20260601000000_indexer_runs_foundation.sql`

```sql
CREATE TABLE IF NOT EXISTS iceberg_indexer_runs (
    id                UUID PRIMARY KEY,
    table_ref         TEXT NOT NULL,                    -- e.g. lakekeeper.default.online_retail_clean
    target_tenant     TEXT NOT NULL,
    target_type_id    UUID NOT NULL,
    id_column         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'queued',   -- queued|running|completed|failed
    snapshot_id_low   BIGINT,                           -- watermark de snapshot inicial (NULL = full scan)
    snapshot_id_high  BIGINT,                           -- snapshot final consumido (rellenado al complete)
    rows_processed    BIGINT NOT NULL DEFAULT 0,
    spark_app_name    TEXT,                             -- name del SparkApplication CR
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_indexer_runs_table_status
  ON iceberg_indexer_runs(table_ref, status);
CREATE INDEX IF NOT EXISTS idx_indexer_runs_started
  ON iceberg_indexer_runs(started_at DESC);
```

Aplicar via Postgres CNPG existente (`pg-runtime-config`).

#### Wire types

Archivo: `services/iceberg-indexer-service/internal/models/run.go`

```go
package models

import (
    "time"
    "github.com/google/uuid"
)

type Run struct {
    ID              uuid.UUID  `json:"id"`
    TableRef        string     `json:"table_ref"`
    TargetTenant    string     `json:"target_tenant"`
    TargetTypeID    uuid.UUID  `json:"target_type_id"`
    IDColumn        string     `json:"id_column"`
    Status          string     `json:"status"`
    SnapshotIDLow   *int64     `json:"snapshot_id_low,omitempty"`
    SnapshotIDHigh  *int64     `json:"snapshot_id_high,omitempty"`
    RowsProcessed   int64      `json:"rows_processed"`
    SparkAppName    *string    `json:"spark_app_name,omitempty"`
    StartedAt       time.Time  `json:"started_at"`
    CompletedAt     *time.Time `json:"completed_at,omitempty"`
    Error           *string    `json:"error,omitempty"`
}

type CreateRunRequest struct {
    TableRef       string    `json:"table_ref"`
    TargetTenant   string    `json:"target_tenant"`
    TargetTypeID   uuid.UUID `json:"target_type_id"`
    IDColumn       string    `json:"id_column"`
    SinceSnapshot  *int64    `json:"since_snapshot,omitempty"`
}

type CompleteRunRequest struct {
    RowsProcessed   int64   `json:"rows_processed"`
    SnapshotIDHigh  int64   `json:"snapshot_id_high"`
    Error           *string `json:"error,omitempty"`
}
```

#### HTTP handlers

```
POST /api/v1/iceberg-indexer/runs               → crea run + dispatcha SparkApplication, returns 202
GET  /api/v1/iceberg-indexer/runs               → list (paginado por updated_at desc)
GET  /api/v1/iceberg-indexer/runs/{id}          → detalle
POST /api/v1/iceberg-indexer/runs/{id}/complete → callback desde el job Spark (auth: internal token)
```

`POST /runs`:
1. INSERT en `iceberg_indexer_runs` con status='queued'.
2. Si `since_snapshot` es null, leer `snapshot_id_high` del último run completed para esa `table_ref` (incremental por defecto).
3. Render del SparkApplication CR (template a continuación) y aplicarlo via `k8s.io/client-go`.
4. UPDATE status='running' + spark_app_name.

#### Dispatcher de SparkApplication

Usar [k8s.io/client-go](https://github.com/kubernetes/client-go) con `dynamic.Interface` para no depender del CRD type.

```go
gvr := schema.GroupVersionResource{
    Group: "sparkoperator.k8s.io", Version: "v1beta2", Resource: "sparkapplications",
}
unstructured := buildSparkApp(run)  // ver template
_, err := dynClient.Resource(gvr).Namespace("openfoundry").
    Create(ctx, unstructured, metav1.CreateOptions{})
```

Para una referencia del CR concreto, ver:
[infra/helm/infra/spark-jobs/templates/_pipeline-run-template.yaml](../../infra/helm/infra/spark-jobs/templates/_pipeline-run-template.yaml).

### 3.3 Subtarea 1.2 — Scala main `IcebergToObjectStoreIndexer`

Archivo: `services/pipeline-runner-spark/src/main/scala/com/openfoundry/indexer/IcebergToObjectStoreIndexer.scala`

```scala
package com.openfoundry.indexer

import org.apache.http.client.methods.HttpPut
import org.apache.http.entity.StringEntity
import org.apache.http.impl.client.HttpClients
import org.apache.spark.sql.{Row, SparkSession}
import scopt.OParser

import scala.util.Try

final case class IndexerArgs(
  sourceTable:       String  = "",
  targetTenant:      String  = "default",
  targetTypeId:      String  = "",
  idColumn:          String  = "",
  objectDatabaseUrl: String  = "http://object-database-service.openfoundry.svc:8080",
  callbackUrl:       String  = "",
  runId:             String  = "",
  sinceSnapshot:     Option[Long] = None,
  internalToken:     String  = "",
  catalog:           String  = "lakekeeper",
  catalogUri:        String  = "",
)

object IcebergToObjectStoreIndexer {
  private val parser = {
    val b = OParser.builder[IndexerArgs]
    import b._
    OParser.sequence(
      programName("iceberg-to-objectstore-indexer"),
      opt[String]("source-table").required().action((v,a) => a.copy(sourceTable = v)),
      opt[String]("target-tenant").action((v,a) => a.copy(targetTenant = v)),
      opt[String]("target-type-id").required().action((v,a) => a.copy(targetTypeId = v)),
      opt[String]("id-column").required().action((v,a) => a.copy(idColumn = v)),
      opt[String]("object-database-url").action((v,a) => a.copy(objectDatabaseUrl = v)),
      opt[String]("callback-url").required().action((v,a) => a.copy(callbackUrl = v)),
      opt[String]("run-id").required().action((v,a) => a.copy(runId = v)),
      opt[Long]("since-snapshot").optional().action((v,a) => a.copy(sinceSnapshot = Some(v))),
      opt[String]("internal-token").action((v,a) => a.copy(internalToken = v)),
      opt[String]("catalog").action((v,a) => a.copy(catalog = v)),
      opt[String]("catalog-uri").action((v,a) => a.copy(catalogUri = v)),
    )
  }

  def main(rawArgs: Array[String]): Unit = {
    val args = OParser.parse(parser, rawArgs, IndexerArgs()).getOrElse {
      System.err.println("[indexer] failed to parse args"); sys.exit(2)
    }
    val spark = buildSession(args)
    try {
      val df = readSource(spark, args)
      val rowsProcessed = df.count()
      // Mantén foreachPartition: HTTP client por partition para no abrir/cerrar.
      df.foreachPartition { rows: Iterator[Row] =>
        val client = HttpClients.createDefault()
        rows.foreach { row =>
          val id = row.getAs[Any](args.idColumn).toString
          val payload = rowToJson(row, exclude = Set(args.idColumn))
          val body = s"""{"type_id":"${args.targetTypeId}","version":${snapshotIdOrEpoch(args)},"payload":$payload,"updated_at_ms":${System.currentTimeMillis()}}"""
          val put = new HttpPut(s"${args.objectDatabaseUrl}/api/v1/object-database/objects/${args.targetTenant}/$id")
          put.setHeader("Content-Type", "application/json")
          if (args.internalToken.nonEmpty) put.setHeader("X-Internal-Token", args.internalToken)
          put.setEntity(new StringEntity(body, "UTF-8"))
          client.execute(put).close()
        }
        client.close()
      }
      callback(args, rowsProcessed, snapshotIdOrEpoch(args), None)
    } catch { case t: Throwable =>
      callback(args, 0L, 0L, Some(t.getMessage))
      throw t
    } finally spark.stop()
  }

  private def buildSession(args: IndexerArgs): SparkSession = {
    val b = SparkSession.builder()
      .appName(s"indexer-${args.runId}")
      .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
      .config(s"spark.sql.catalog.${args.catalog}", "org.apache.iceberg.spark.SparkCatalog")
      .config(s"spark.sql.catalog.${args.catalog}.type", "rest")
      // workaround Apache Arrow + arm64 + JDK17:
      .config("spark.sql.parquet.enableVectorizedReader", "false")
      .config("spark.sql.iceberg.vectorization.enabled", "false")
    if (args.catalogUri.nonEmpty) b.config(s"spark.sql.catalog.${args.catalog}.uri", args.catalogUri)
    b.getOrCreate()
  }

  private def readSource(spark: SparkSession, args: IndexerArgs) = {
    args.sinceSnapshot match {
      case Some(snap) => spark.read.option("start-snapshot-id", snap.toString).table(args.sourceTable)
      case None       => spark.read.table(args.sourceTable)
    }
  }

  private def rowToJson(row: Row, exclude: Set[String]): String = {
    // Implementación trivial: usa row.json (Spark Row tiene un método .json no-op,
    // mejor construirlo manual con DataFrame.toJSON antes del foreachPartition).
    // ALTERNATIVA: convertir df → df.toJSON (Dataset[String]) y procesar strings.
    ???
  }
  // ... callback() + snapshotIdOrEpoch() ...
}
```

> **Refactor recomendado:** en lugar de iterar `Row`s con conversión manual a JSON,
> hacer `df.toJSON.foreachPartition { jsonStrings => ... }`. Spark serializa cada fila
> a JSON y tu código solo arma el envelope `{type_id, version, payload, ...}`.

### 3.4 Subtarea 1.3 — Build & registrar la nueva main class

`services/pipeline-runner-spark/build.sbt` no necesita cambio para añadir
una segunda main class — Spark-submit recibe `--class
com.openfoundry.indexer.IcebergToObjectStoreIndexer` y la clase está
dentro del fat JAR.

Build:

```sh
cd services/pipeline-runner-spark
sbt assembly
ls target/scala-2.12/pipeline-runner-spark-dev.jar  # verificar
```

Despues, build de la imagen base de pipeline-runner que ya copia el JAR:

```sh
docker buildx build --platform linux/arm64 \
  --build-arg VERSION=indexer-dev \
  -f services/pipeline-runner/Dockerfile \
  -t localhost:30501/pipeline-runner:indexer-dev --push .
```

### 3.5 Subtarea 1.4 — SparkApplication CR template

Archivo: `infra/helm/infra/spark-jobs/templates/_indexer-run-template.yaml`

Copiar el `_pipeline-run-template.yaml` existente y cambiar:
- `mainClass` → `com.openfoundry.indexer.IcebergToObjectStoreIndexer`
- `arguments` → los flags del CLI nuevo (incluyendo `--callback-url` apuntando a `iceberg-indexer-service.openfoundry.svc:8080/api/v1/iceberg-indexer/runs/{id}/complete`).
- `serviceAccount: spark` (el RBAC ya está aplicado por `spark-rbac.yaml`).

### 3.6 Subtarea 1.5 — Auto-trigger desde pipeline-build-service

Decisión a tomar: **el `target_object_type_id` se configura en el dataset (metadata) o en el pipeline (config)?**

Recomendación: **en el dataset** (`datasets-service`). Es la propiedad natural del output, no del proceso.

```sql
-- migration en datasets-service
ALTER TABLE datasets ADD COLUMN target_object_type_id UUID;
ALTER TABLE datasets ADD COLUMN target_id_column TEXT;
```

Cuando el pipeline-build-service detecta que un pipeline run completó, mirar el dataset output:
- Si tiene `target_object_type_id` set → POST `/api/v1/iceberg-indexer/runs` con esos datos.

### 3.7 Verificación

```sh
# Trigger manual de un run
curl -s -X POST http://localhost:8080/api/v1/iceberg-indexer/runs \
  -H "Authorization: Bearer $(cat /tmp/of-jwt)" \
  -H "Content-Type: application/json" \
  -d '{
    "table_ref":      "lakekeeper.default.online_retail_clean",
    "target_tenant":  "default",
    "target_type_id": "678b55fe-db5f-4d3a-bbf2-8cb643af8d32",
    "id_column":      "transaction_id"
  }'

# Watch SparkApplication
kubectl -n openfoundry get sparkapplications.sparkoperator.k8s.io -w

# Cuando completa
curl -s "http://localhost:18081/api/v1/ontology/types/678b55fe-db5f-4d3a-bbf2-8cb643af8d32/objects?per_page=5"
```

### 3.8 Gotchas Tarea 1

- **HTTP PUT serial dentro de `foreachPartition` es lento** (~5K rows/min). Para escala real: implementar un endpoint nuevo `POST /api/v1/object-database/objects/bulk` en `object-database-service` que acepta un array.
- **`df.foreachPartition` no devuelve el count.** Materializar `df.count()` ANTES (caching el DF).
- **El callback debe ser idempotent** — Spark puede reintentar el job. Usar `run_id` como dedup key en el handler de complete.
- **Mientras `object-database-service` esté en stub mode, los datos se pierden al restart.** Para tests reales completar primero la Tarea 3 (Cassandra).
- **`since-snapshot=null` significa full re-scan.** Si la tabla tiene 100M rows, vas a saturar. Aceptar `--limit-rows` opcional para PoC.

---

## 4 · Tarea 2 — Writeback Iceberg para audit log

> **Prioridad:** media. La decisión arquitectónica está tomada
> ([RUNTIME-INDEXER.md § P4](RUNTIME-INDEXER.md#p4--writeback-decision-hybrid-cassandra-canonical--iceberg-audit-log)):
> Cassandra es canonical para el estado del objeto; Iceberg es canonical
> para el log inmutable de acciones (audit + time-travel).

### 4.1 Producer en `ontology-actions-service`

Archivo: `services/ontology-actions-service/internal/handlers/execute.go` (verificar el path real con `find services/ontology-actions-service -name "*.go" | xargs grep -l "Execute"`).

Después de un Execute exitoso (mutó el objeto y devolvió 200), publicar a Kafka:

```go
type ActionAppliedEvent struct {
    EventID       uuid.UUID `json:"event_id"`
    ActionTypeID  uuid.UUID `json:"action_type_id"`
    ActionName    string    `json:"action_name"`
    ObjectTypeID  uuid.UUID `json:"object_type_id"`
    ObjectID      string    `json:"object_id"`
    Tenant        string    `json:"tenant"`
    ActorSub      uuid.UUID `json:"actor_sub"`
    ActorEmail    string    `json:"actor_email"`
    PreviousState json.RawMessage `json:"previous_state"`
    NewState      json.RawMessage `json:"new_state"`
    AppliedAtMs   int64     `json:"applied_at_ms"`
}

evt := ActionAppliedEvent{ EventID: uuid.New(), ... }
data, _ := json.Marshal(evt)
h.KafkaProducer.WriteMessage(ctx, "ontology.actions.applied.v1", []byte(evt.ObjectID), data)
```

Buscar el patrón existente:
```sh
grep -rn "kafka.WriteMessage\|kafka-go\|sarama" services/ libs/event-bus/ 2>/dev/null
```

#### Crear el topic

```sh
kubectl -n kafka exec -it openfoundry-kafka-0 -- bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --topic ontology.actions.applied.v1 \
  --partitions 12 --replication-factor 1
```

### 4.2 Consumer Spark Structured Streaming

Decisión: el consumer es un SparkApplication permanente (mode=streaming), no un job batch.

Archivo: `services/pipeline-runner-spark/src/main/scala/com/openfoundry/audit/ActionLogStreamSink.scala`

```scala
package com.openfoundry.audit

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions.{col, from_json}
import org.apache.spark.sql.types._

object ActionLogStreamSink {
  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("action-log-sink")
      .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
      .config("spark.sql.catalog.lakekeeper", "org.apache.iceberg.spark.SparkCatalog")
      .config("spark.sql.catalog.lakekeeper.type", "rest")
      .getOrCreate()

    val schema = StructType(Seq(
      StructField("event_id", StringType, nullable = false),
      StructField("action_type_id", StringType, nullable = false),
      StructField("action_name", StringType, nullable = false),
      StructField("object_type_id", StringType, nullable = false),
      StructField("object_id", StringType, nullable = false),
      StructField("tenant", StringType, nullable = false),
      StructField("actor_sub", StringType, nullable = false),
      StructField("actor_email", StringType, nullable = true),
      StructField("previous_state", StringType, nullable = true),
      StructField("new_state", StringType, nullable = true),
      StructField("applied_at_ms", LongType, nullable = false),
    ))

    val df = spark.readStream.format("kafka")
      .option("kafka.bootstrap.servers", "openfoundry-kafka-bootstrap.kafka.svc:9092")
      .option("subscribe", "ontology.actions.applied.v1")
      .option("startingOffsets", "earliest")
      .load()
      .selectExpr("CAST(value AS STRING) AS json", "timestamp AS kafka_ts")
      .select(from_json(col("json"), schema).as("evt"), col("kafka_ts"))
      .select("evt.*", "kafka_ts")

    df.writeStream.format("iceberg")
      .outputMode("append")
      .option("checkpointLocation", "s3a://openfoundry-iceberg/_checkpoints/action_log")
      .trigger(org.apache.spark.sql.streaming.Trigger.ProcessingTime("30 seconds"))
      .toTable("lakekeeper.default.action_log")
      .awaitTermination()
  }
}
```

#### Crear la tabla

```sql
-- via Spark SQL contra lakekeeper:
CREATE TABLE IF NOT EXISTS lakekeeper.default.action_log (
  event_id        STRING,
  action_type_id  STRING,
  action_name     STRING,
  object_type_id  STRING,
  object_id       STRING,
  tenant          STRING,
  actor_sub       STRING,
  actor_email     STRING,
  previous_state  STRING,
  new_state       STRING,
  applied_at_ms   BIGINT,
  kafka_ts        TIMESTAMP
)
USING iceberg
PARTITIONED BY (days(from_unixtime(applied_at_ms / 1000)));
```

### 4.3 Verificación

```sh
# 1. Consume Kafka topic mientras se hace una acción desde el dashboard
kubectl -n kafka exec -it openfoundry-kafka-0 -- bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic ontology.actions.applied.v1 \
  --from-beginning --max-messages 5

# 2. Time-travel sobre la tabla audit
# (se puede via spark-submit con SQL inline)
spark-submit --class com.openfoundry.pipeline.PipelineRunner \
  ... \
  --inline-sql "SELECT * FROM lakekeeper.default.action_log VERSION AS OF 0 LIMIT 10"
```

### 4.4 Gotchas Tarea 2

- **Consumer debe ser idempotent.** Kafka es at-least-once; usar `event_id` como dedup en un `WHERE NOT EXISTS` o `MERGE INTO`.
- **Iceberg streaming write requiere snapshot expiry.** Sin un cron `expire_snapshots()` semanal, las metadatas crecen sin parar. Añadir un SparkApplication tipo CronJob.
- **Si Kafka topic no existe, fail loud.** `ontology-actions-service` debe rechazar el Execute si el publish falla — sin audit log las acciones son no-trazables.
- **Schema evolution:** el JSON del evento puede crecer. Usar `from_json` con un schema explícito y campos nuevos como nullable; nunca cambiar tipos.

---

## 5 · Tarea 3 — Cassandra real (eliminar stub mode)

### 5.1 Objetivo

Sustituir `OF_DEV_STUB_MODE=true` por un cluster Cassandra que persista entre reinicios.

### 5.2 Pasos

#### 5.2.1 Deploy con K8ssandra-Operator (recomendado) o Bitnami chart

```sh
# Opción rápida: Bitnami
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install cassandra bitnami/cassandra \
  --namespace cassandra --create-namespace \
  --set cluster.replicaCount=1 \
  --set cluster.datacenter=dc1 \
  --set persistence.size=10Gi \
  --set jvm.maxHeapSize=2G \
  --set jvm.newHeapSize=512M \
  --set image.tag=4.1
```

> ⚠️ **Memoria:** Cassandra default heap es 3Gi. En Lima de 8Gi por VM
> ya estás cerca del límite con todo lo demás. Override a 2G heap es
> esencial.

#### 5.2.2 Schema

`object-database-service` usa `libs/cassandra-kernel`. Encontrar las DDL:

```sh
find services/object-database-service/cql -type f
find libs/cassandra-kernel -name "*.cql"
```

Aplicar:

```sh
kubectl -n cassandra exec -it cassandra-0 -- cqlsh -f /tmp/schema.cql
```

#### 5.2.3 Configurar el servicio

```sh
kubectl -n openfoundry set env deploy/object-database-service \
  CASSANDRA_CONTACT_POINTS=cassandra.cassandra.svc:9042 \
  CASSANDRA_KEYSPACE_OBJECTS=ontology_objects \
  CASSANDRA_KEYSPACE_LINKS=ontology_links \
  CASSANDRA_LOCAL_DC=dc1

# Quitar el stub mode
kubectl -n openfoundry set env deploy/object-database-service OF_DEV_STUB_MODE-
kubectl -n openfoundry set env deploy/object-database-service OBJECT_DATABASE_BACKEND-

kubectl -n openfoundry rollout restart deploy/object-database-service
```

#### 5.2.4 Re-seed

Los datos del stub se perdieron — re-correr el seeder o trigger el indexer Tarea 1.

### 5.3 Gotchas Tarea 3

- **Cassandra arm64:** Bitnami publica multi-arch desde 4.1. Si usas un tag anterior, falla con `exec format error`.
- **Replication factor 1 en dev:** asegurar que el keyspace usa `NetworkTopologyStrategy` con `dc1: 1`. La impl Rust original lo expecta.
- **Cassandra start time:** ~60s. El readinessProbe del object-database-service debe esperarlo (sino crashlooping forever).
- **Memory:** si Lima OOMkillea Cassandra, bajar heap a 1G y aceptar latencia.

---

## 6 · Tarea 4 — Calidad / operacional

### 6.1 ObjectStore.Count

#### Por qué
El bridge en
[objects_bridge.go:115](../../services/object-database-service/internal/handlers/objects_bridge.go#L115)
devuelve `total = len(items)`. Si pides `per_page=10` con 500 rows reales,
`total=10` — mentira. Los KPIs del dashboard usan `total`, así que vemos números falsos.

#### Cambios

[storage/types.go:127](../../services/object-database-service/internal/storage/types.go#L127):

```go
type ObjectStore interface {
    // ... existentes ...
    Count(ctx context.Context, tenant TenantId, typeID TypeId) (uint64, error)
}
```

Implementaciones:
- **InMemory:** trivial, recorrer la slice.
- **Cassandra:** `SELECT COUNT(*) FROM objects_by_type WHERE tenant=? AND type_id=?` — caro a escala. Alternativa: mantener un counter denormalizado en una tabla `object_counts(tenant, type_id, count)` actualizado por triggers / batch.

Bridge:
```go
total, err := h.Objects.Count(r.Context(), tenant, typeID)
// usar `total` en el response, no len(items)
```

### 6.2 Tokens de paginación reales

#### Por qué
[objects_bridge.go:96](../../services/object-database-service/internal/handlers/objects_bridge.go#L96)
descarta `next_token`. La in-memory store ya soporta paginación pero el handler no la expone.

#### Cambios

```go
// leer cursor de query string
cursor := r.URL.Query().Get("cursor")
var token *string
if cursor != "" { token = &cursor }

res, err := h.Objects.ListByType(r.Context(), tenant, typeID,
    storage.Page{Size: perPage, Token: token}, ...)

// devolver next_cursor
writeJSON(w, http.StatusOK, map[string]any{
    "data":        items,
    "total":       total,
    "next_cursor": res.NextToken,
    "page":        page,
    "per_page":    perPage,
})
```

Frontend en
[apps/web/src/lib/api/ontology.ts:268](../../apps/web/src/lib/api/ontology.ts#L268)
ya espera `{data,total,page,per_page}` — añadir `next_cursor` no rompe nada.

### 6.3 Auth service-to-service

#### Por qué
[server.go:1-9](../../services/object-database-service/internal/server/server.go#L1-9)
explícitamente dice "no JWT auth — confía en gateway". Si un pod descubre el ClusterIP `10.43.155.122:8080`, salta el gateway.

#### Fix recomendado (b)

Añadir middleware que valida `X-Internal-Token` cuando `OF_INTERNAL_TOKEN` está set:

```go
func internalTokenMiddleware(token string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if token == "" {
                next.ServeHTTP(w, r)  // dev mode: no auth
                return
            }
            if r.Header.Get("X-Internal-Token") != token {
                http.Error(w, "forbidden", http.StatusForbidden)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

Aplicar al router. Configurar gateway para inyectar el header en sus calls.

#### Fix alternativo (a) — mTLS

Más correcto pero requiere Istio o Linkerd. Para PoC overkill.

### 6.4 Apache Arrow upgrade

#### Hoy
`services/pipeline-runner-spark/build.sbt`:
```scala
"org.apache.iceberg" % "iceberg-spark-runtime-3.5_2.12" % "1.5.2" % Provided,
"org.apache.iceberg" % "iceberg-aws-bundle"            % "1.5.2" % Provided,
```

Y el workaround:
```
spark.sql.parquet.enableVectorizedReader=false
spark.sql.iceberg.vectorization.enabled=false
```

#### Fix
1. Bump a Iceberg `1.6.x` o `1.7.x` (verificar compatibilidad con Spark 3.5.4).
2. Re-build el JAR.
3. Re-build la imagen `pipeline-runner` y re-deploy.
4. Quitar el workaround de `infra/dev/poc-pipeline-nodes.yaml` y de cualquier SparkApplication CR que lo tenga.
5. Smoke-test con `infra/dev/spark-smoke.yaml`.

#### Riesgo
Iceberg APIs pueden cambiar entre minor versions. Tener un branch de prueba antes de mergear a main.

### 6.5 Re-escalar servicios apagados

Para que el dashboard tenga lineage, action types, etc., levantar:

```sh
for svc in lineage-service ai-evaluation-service ontology-actions-service notebook-runtime-service; do
  kubectl -n openfoundry scale deploy/$svc --replicas=1
done
```

Vigilar memoria:

```sh
kubectl top nodes
kubectl -n openfoundry top pods --sort-by=memory
```

Si pasa de 90% en un nodo, scale-down algún servicio menos crítico (ej. `agent-runtime-service`).

---

## 7 · Tarea 5 — Polish

### 7.1 ADR formal

Migrar la sección P4 de `RUNTIME-INDEXER.md` a un ADR numerado.

#### Pasos

```sh
# 1. Encontrar el último número usado
ls docs/architecture/adr/ | sort -n | tail -5

# 2. Crear el archivo
cp docs/architecture/adr/0001-*.md docs/architecture/adr/NNNN-objectstore-canonical-iceberg-audit.md
```

Plantilla mínima:

```md
# NNNN. ObjectStore canónico, Iceberg como log de auditoría

Date: 2026-05-10
Status: Accepted

## Context
[transcribir desde RUNTIME-INDEXER.md § P4]

## Decision
Cassandra es la fuente canónica para estado mutable de objetos.
Iceberg es la fuente canónica para el log inmutable de acciones.

## Consequences
- (+) Latencia de acciones < 100ms (Cassandra LWT).
- (+) Auditabilidad y time-travel sin sacrificar latencia hot-path.
- (-) Dos sistemas que mantener; consistencia es eventual entre Kafka → Iceberg.
- (-) Snapshot expiry job nuevo a operar.
```

### 7.2 Tests unitarios

Patrón a seguir: [ontology-definition-service/internal/handlers/handlers_test.go](../../services/ontology-definition-service/internal/handlers/handlers_test.go).

#### 7.2.1 `application-composition-service/internal/handlers/apps_test.go`

```go
package handlers_test

func TestCreateAppRequiresName(t *testing.T) {
    h := newTestHandlers(t)
    req := httptest.NewRequest("POST", "/api/v1/apps",
        strings.NewReader(`{}`))
    req = withAuthClaims(req, testUserUUID)
    rec := httptest.NewRecorder()
    h.CreateApp(rec, req)
    require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestPublishAppCreatesV1(t *testing.T) { ... }
func TestGetPublishedAppByPublicSlug(t *testing.T) { ... }
```

Mock del Repo:
```go
type mockRepo struct{ apps map[uuid.UUID]*models.App }
func (m *mockRepo) GetApp(...) (*models.App, error) { ... }
// ... resto de métodos
```

#### 7.2.2 `object-database-service/internal/handlers/objects_bridge_test.go`

Casos críticos:
- `toOntologyObject` mapea `created_at_ms` → RFC3339 UTC correcto.
- Markings vacíos no aparecen en el JSON (`omitempty`).
- `per_page > 5000` se cap a 5000.
- `x-of-tenant` header sobrescribe el default tenant.
- `properties` vacío cuando payload es `null` o malformed.

#### 7.2.3 `ontology-definition-service/internal/handlers/properties_links_test.go`

Casos:
- `ListProperties`: 401 sin auth, 400 con type_id no-uuid.
- `CreateProperty`: 400 sin name o sin property_type, 201 con valid body.
- `ListLinkTypes` con `?object_type_id=` filter aplica el WHERE.
- `CreateLinkType`: 400 si source_type_id o target_type_id faltan.

### 7.3 README PoC update

Append en `docs/poc-online-retail/README.md`:

```md
## Próximos pasos

Ver [NEXT-STEPS.md](NEXT-STEPS.md) para el roadmap detallado.

El bridge runtime hoy está implementado en
[`services/object-database-service/internal/handlers/objects_bridge.go`](../../services/object-database-service/internal/handlers/objects_bridge.go).
El indexer real (vs el seeder Python que usamos hoy) está descrito en
[RUNTIME-INDEXER.md](RUNTIME-INDEXER.md).
```

---

## 8 · Cheatsheet de comandos

### 8.1 Build & deploy de un servicio Go

```sh
SVC=application-composition-service
TAG=$(date +%Y%m%d-%H%M%S)

docker buildx build --platform linux/arm64 \
  --build-arg SERVICE_NAME=$SVC \
  --build-arg TARGETOS=linux \
  --build-arg TARGETARCH=arm64 \
  --build-arg VERSION=$TAG \
  -f services/$SVC/Dockerfile \
  -t localhost:30501/$SVC:$TAG --push .

kubectl -n openfoundry set image deploy/$SVC \
  app=registry.registry.svc.cluster.local:5000/$SVC:$TAG
kubectl -n openfoundry rollout status deploy/$SVC --timeout=120s
kubectl -n openfoundry logs deploy/$SVC --tail=20
```

### 8.2 Build del JAR de Spark

```sh
cd services/pipeline-runner-spark
sbt clean assembly
ls target/scala-2.12/*.jar
cd ../..

# Re-build de la imagen pipeline-runner que copia el JAR
docker buildx build --platform linux/arm64 \
  --build-arg VERSION=$(date +%Y%m%d-%H%M%S) \
  -f services/pipeline-runner/Dockerfile \
  -t localhost:30501/pipeline-runner:dev --push .
```

### 8.3 Aplicar SparkApplication manual

```sh
kubectl -n openfoundry apply -f infra/dev/spark-smoke.yaml
kubectl -n openfoundry get sparkapplications -w
kubectl -n openfoundry logs <driver-pod-name> -f
```

### 8.4 Debug

```sh
# Logs de un servicio
kubectl -n openfoundry logs deploy/<svc> -f --tail=50

# Memoria de los nodos
kubectl top nodes
kubectl -n openfoundry top pods --sort-by=memory

# Describe de un pod en CrashLoop
kubectl -n openfoundry describe pod <pod>

# Re-mintar JWT (si /tmp/of-jwt expiró)
TOKEN=$(curl -s -X POST http://localhost:18080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@openfoundry.local","password":"openfoundry-smoke-password"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
echo "$TOKEN" > /tmp/of-jwt
```

### 8.5 Smoke vía gateway

```sh
TOKEN=$(cat /tmp/of-jwt)
TX=678b55fe-db5f-4d3a-bbf2-8cb643af8d32

# Gateway port 18080 (operativo)
curl -s "http://localhost:18080/api/v1/ontology/types/$TX/objects?per_page=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Gateway port 8080 (necesario para SPA dev)
curl -s "http://localhost:8080/api/v1/ontology/types/$TX/objects?per_page=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## 9 · Mapa de archivos relevantes

### Ya implementados (referencia)

| Archivo | Propósito |
|---|---|
| [services/object-database-service/internal/handlers/objects_bridge.go](../../services/object-database-service/internal/handlers/objects_bridge.go) | Bridge `/api/v1/ontology/types/{id}/objects` (List/Get/Create/**Patch** con merge + LWT) |
| [services/application-composition-service/internal/handlers/apps.go](../../services/application-composition-service/internal/handlers/apps.go) | `/api/v1/apps` CRUD + publish |
| [services/ontology-definition-service/internal/handlers/properties_links.go](../../services/ontology-definition-service/internal/handlers/properties_links.go) | Properties + LinkTypes routes |
| [tools/online-retail/seed_object_database.py](../../tools/online-retail/seed_object_database.py) | Seeder PoC (sustituir por indexer real) |
| [tools/online-retail/dashboard-app-definition.json](../../tools/online-retail/dashboard-app-definition.json) | App fixture (3 páginas, 7 widgets). **WIP unstaged:** `var_anomalies` con `static_filter` directo. |
| [apps/web/src/routes/apps/WorkshopEditorPage.tsx](../../apps/web/src/routes/apps/WorkshopEditorPage.tsx) | **WIP unstaged:** soporte `static_filter` en variables, nav de páginas en preview, hook order fix, defaults defensivos en widgets. |

### A crear

| Archivo | Para qué |
|---|---|
| `services/iceberg-indexer-service/...` | Servicio nuevo (Tarea 1.1) |
| `services/pipeline-runner-spark/src/main/scala/com/openfoundry/indexer/IcebergToObjectStoreIndexer.scala` | Scala main para indexer (Tarea 1.2) |
| `services/pipeline-runner-spark/src/main/scala/com/openfoundry/audit/ActionLogStreamSink.scala` | Streaming sink Kafka → Iceberg (Tarea 2) |
| `infra/helm/infra/spark-jobs/templates/_indexer-run-template.yaml` | CR template (Tarea 1.4) |
| `docs/architecture/adr/NNNN-objectstore-canonical-iceberg-audit.md` | ADR formal (Tarea 5.1) |

### A modificar

| Archivo | Cambio |
|---|---|
| [services/object-database-service/internal/storage/types.go](../../services/object-database-service/internal/storage/types.go) | Añadir `Count()` al interface (Tarea 4.1) |
| [services/object-database-service/internal/handlers/objects_bridge.go](../../services/object-database-service/internal/handlers/objects_bridge.go) | Usar `Count()` real, exponer cursor (4.1, 4.2) |
| [services/object-database-service/internal/server/server.go](../../services/object-database-service/internal/server/server.go) | Internal-token middleware (Tarea 4.3) |
| `services/ontology-actions-service/internal/handlers/execute.go` | Publish a Kafka tras Execute (Tarea 2.1) |
| `services/pipeline-build-service/internal/...` | Auto-trigger indexer al completar pipeline (Tarea 1.5) |
| [services/pipeline-runner-spark/build.sbt](../../services/pipeline-runner-spark/build.sbt) | Bump Iceberg → 1.6+ (Tarea 4.4) |
| `services/datasets-service/internal/repo/migrations/...` | Añadir `target_object_type_id`, `target_id_column` (Tarea 1.5) |

---

## 10 · Orden recomendado de ejecución

1. **Cerrar Tarea 0 (Browser pass)** — los parches existen unstaged. Validar
   "Mark resolved" round-trip y commitear. **30 min.**
2. **Filter pushdown server-side** (descubrimiento del browser pass) — exponer
   `POST /objects/query` en el bridge con filter-spec. Sin esto, todo lo que
   pase de 10⁴ rows en el dashboard rompe el cliente. **3 h.** *(no estaba
   en la versión inicial del doc; lo añadió el browser pass)*
3. **Tarea 4.1 + 4.2 (Count + cursors)** — alinea con #2 (mismo handler). **2 h.**
4. **Tarea 3 (Cassandra)** — sin esto los datos se pierden al restart. **3 h.**
5. **Tarea 1 (Indexer real)** — la pieza de producción. **2-3 días.**
6. **Tarea 2 (Audit log)** — desbloquea time-travel sobre acciones. **1-2 días.**
7. **Tarea 4.3 + 4.4 (auth + Arrow upgrade)** — hardening. **1 día.**
8. **Tarea 5 (Polish: ADR + tests + README)** — al final. **1 día.**

Total estimado: **6-8 días-persona** desde el estado actual a una PoC completa, end-to-end, sin stubs.

---

## 11 · Si te atascas

- **Logs de Spark drivers:** `kubectl -n openfoundry logs <driver-pod> -f`. Apache Arrow / Iceberg suelen dejar mensajes claros.
- **El gateway no enruta lo que esperas:** mirar
  [services/edge-gateway-service/internal/proxy/router_table.go](../../services/edge-gateway-service/internal/proxy/router_table.go).
  Es un switch grande pero legible.
- **La SPA llama un endpoint que no existe:** `grep -rn '/api/v1/<path>' apps/web/src/lib/api/` y comparar con
  [router_table.go](../../services/edge-gateway-service/internal/proxy/router_table.go)
  para ver a qué backend se rutea.
- **Postgres CNPG cluster no responde:**
  ```sh
  kubectl -n openfoundry get clusters.postgresql.cnpg.io
  kubectl -n openfoundry logs pg-runtime-config-1 --tail=50
  ```
- **Lima OOM:** `limactl shell k3s-master -- free -m`. Si está rojo, scale-down servicios o aumentar memoria de las VMs (requiere stop+start).
- **Algo se olvidó:** el commit `fa60eef9` es la base. `git diff fa60eef9 HEAD -- '*.go'` para ver lo que se añadió desde entonces. La memoria persistente del agente vive en
  `~/.claude/projects/-Users-torrefacto-Documents-Repositorios-OpenFoundry/memory/` —
  contiene contexto sobre Lima, parallel agents, y este PoC.
