# HOME-001 — Workspace Home (`/`)

Task pack para construir el home `/` de OpenFoundry visualmente alineado con Compass de Foundry. Hecho para ejecutarse pasito a pasito en una sola sesion: contexto + referencias + spec + tareas atomicas + prompt + DoD.

## 1. Contexto

- **Ruta:** `/`
- **Componente actual:** [apps/web/src/routes/Home.tsx](../../apps/web/src/routes/Home.tsx) (164 lineas, scaffolding de migracion: header strip + 4 KPI cards + tabla de rutas + Recent + Environment).
- **Shell padre:** [apps/web/src/lib/components/AppShell.tsx](../../apps/web/src/lib/components/AppShell.tsx), con [Sidebar](../../apps/web/src/lib/components/Sidebar.tsx) y [Topbar](../../apps/web/src/lib/components/Topbar.tsx).
- **Sistema de tokens:** clases `.of-*` y variables `--*` en [apps/web/src/styles/app.css](../../apps/web/src/styles/app.css). Todo el trabajo debe usar `of-page`, `of-panel`, `of-toolbar`, `of-button`, `of-input`, `of-table`, `of-chip`, `of-heading-xl/lg/md/sm`, `of-eyebrow`, `of-text-muted` y variables `var(--text-strong)`, `var(--border-subtle)`, `var(--status-success)`, etc. **No introducir colores ni espacios hardcodeados nuevos.**
- **Estado del inventario:** [HOME-001 en el blueprint](../frontend-ui-flow-blueprint.md) lo marca `Parcial / P0` — la pantalla existe pero no replica el patron Compass de Foundry y faltan componentes target (`ResourceTable`, `ActivityPanel`, `QuickActions`).

## 2. Referencia Visual

Foundry no tiene una sola "home"; el equivalente mas cercano a `/` es la pantalla **Compass** que mezcla "Data Catalog" con un selector de espacios (Portfolios / Projects / Your files / Shared with you).

| Captura | Ruta local | Que mirar |
|---|---|---|
| Compass Overview | [docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Overview_assets/img_001.png](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Overview_assets/img_001.png) | Layout completo: rail izquierdo de iconos, top strip, tabs Quick filters, 3 banners promocionales, search + facets, tabla principal con FILE NAME / LAST MODIFIED / TAGS / PORTFOLIO. |
| Compass Data Catalog | [docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Data Catalog_assets/img_001.png](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Data%20Catalog_assets/img_001.png) | Patron de header limpio: tabs de espacios arriba, titulo grande + sub-tabs (Collections/Files), accion derecha (Request data + `+ New`), tabla compacta NAME / FILES. |
| Project navigation panel | [docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Use Project navigation panel_assets/img_001.png](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Use%20Project%20navigation%20panel_assets/img_001.png) | Para sub-rail de proyecto que reutilizaremos en `PROJECT-002`. Aqui solo informativa. |

**Lectura de patrones (lo que tomamos para `/`):**

1. **Header de espacios** (top strip): tabs horizontales `Portfolios | Projects | Your files | Shared with you` con iconos. Sin gradientes, fondo blanco, separador inferior `1px solid var(--border-subtle)`. Boton `Manage spaces ⚙️` en extremo derecho.
2. **Title row**: H1 grande (titulo de la vista) + sub-tabs `Collections | Files` en linea + cluster de acciones en la derecha (`Request data` secundario + `+ New` primario verde).
3. **Filters rail izquierdo** (en Overview): bloque colapsable Filters > Types > Status > Portfolios > Projects > Tags > Organizations.
4. **Banner row** (en Overview): 3 cards horizontales para Portfolios / Projects / Promoted items, cada uno con titulo, descripcion corta, link `Apply` y `Hide`.
5. **Tabla principal**: filas finas con icono+nombre, columnas auxiliares (LAST MODIFIED, TAGS chips, PORTFOLIO chip).

**Adaptacion a OpenFoundry** (los espacios de Foundry no aplican literalmente — somos un workspace generico):

- Tabs de espacios → `Recent | Pinned | Shared with you | Trash` (tabs locales del home, no rail).
- Sub-tabs Collections/Files → `Resources | Activity` (tabs locales del home).
- `+ New` primario → menu desplegable con `New project / New dataset / New pipeline / Upload data`.
- Banners → mantener UNO solo opcional ("Welcome / Quick start") con boton de cerrar; el `Hide` es real.
- Filters rail izquierdo → NO replicar literal en `/`; eso vive en `/datasets` y `/projects`. En home solo facetas chiquitas en la barra de search.

## 3. Layout Objetivo

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Sidebar       │  Topbar (breadcrumbs · branch · share · save · user)       │
│  (existing)    ├────────────────────────────────────────────────────────────┤
│                │  [SpacesTab] Recent · Pinned · Shared · Trash    Manage ⚙ │
│                ├────────────────────────────────────────────────────────────┤
│                │  H1: Workspace                          Request data  [+ New ▾]│
│                │  Sub-tabs: Resources · Activity                            │
│                ├────────────────────────────────────────────────────────────┤
│                │  ┌─ KPI ─┐ ┌─ KPI ─┐ ┌─ KPI ─┐ ┌─ KPI ─┐                  │
│                │  │ 56    │ │ 8     │ │ 24    │ │ 3     │                  │
│                │  │ Resour│ │ Builds│ │ Object│ │Branch │                  │
│                │  └───────┘ └───────┘ └───────┘ └───────┘                  │
│                ├────────────────────────────────────────────────────────────┤
│                │  ┌──────────────────────────────────┐  ┌──────────────┐   │
│                │  │ Resources         [search] [⋮]   │  │ Activity     │   │
│                │  │ ┌──────────────────────────────┐ │  │ • event 1    │   │
│                │  │ │ Name | Path | Owner | Status │ │  │ • event 2    │   │
│                │  │ │ ...                          │ │  │ • event 3    │   │
│                │  │ └──────────────────────────────┘ │  ├──────────────┤   │
│                │  │ Pagination · 1–10 of 56          │  │ Quick start  │   │
│                │  └──────────────────────────────────┘  │ • Project    │   │
│                │                                        │ • Dataset    │   │
│                │                                        │ • Pipeline   │   │
│                │                                        ├──────────────┤   │
│                │                                        │ Environment  │   │
│                │                                        │ Branch master│   │
│                │                                        └──────────────┘   │
└────────────────┴────────────────────────────────────────────────────────────┘
```

Regiones (de arriba abajo):

1. **L0 Spaces strip** — nuevo, dentro del `<section className="of-page">`. Tabs horizontales con borde inferior y un boton derecho `Manage spaces`.
2. **L1 Title row** — H1 + sub-tabs locales + cluster de acciones derecho (`Request data` secundario + `+ New` primario con menu).
3. **L2 KPI ribbon** — 4 cards finas con `of-panel`. Reusa lo que ya tiene el Home actual pero ajusta tamanos (numero `var(--text-strong)`, eyebrow arriba).
4. **L3 Two-column grid** —
   - Columna izquierda (~2/3): card `Resources` con header (titulo + search + menu) y tabla `of-table` compacta.
   - Columna derecha (~1/3): pila de cards `Activity`, `Quick start`, `Environment`.
5. **L4 (futuro)** — la fila de banners promocionales de Compass NO se construye en este slice; queda anotada como follow-up.

## 4. Plan De Componentes

| Componente | Estado | Decision |
|---|---|---|
| `AppShell` / `Sidebar` / `Topbar` | Existe | No tocar en este slice. |
| `SpacesTab` | NO existe | Inline en `Home.tsx` por ahora — solo 4 tabs estaticos, sin extraer. Cuando se repita en otra pantalla lo extraemos. |
| `KpiCard` | NO existe | Inline en `Home.tsx`. La forma actual ya es buena, solo ajustar tamano y eyebrow. |
| `ResourceTable` | NO existe (target en blueprint) | **NO crear el primitivo aqui.** Implementar la tabla del home como JSX local en `Home.tsx` siguiendo `of-table`. La extraccion sale en `DATASET-001` o un task de refactor. |
| `ActivityList` | NO existe | Inline. Items mock por ahora (icono + accion + timestamp). |
| `QuickStartCard` | NO existe | Inline. Lista de 3-4 acciones que linkean a `/projects`, `/datasets`, `/pipelines`. |
| `EnvironmentCard` | Ya existe inline | Reutilizar. |

Regla: **nada de extraer primitivos compartidos en este slice.** El objetivo es cerrar el `/` visual; los primitivos se extraen cuando aparezcan en la 2da/3ra pantalla.

## 5. Tareas Atomicas

Cada tarea es lo bastante chica para hacerla en un turno con foco completo.

- [ ] **T1** Quitar el array `MIGRATED_ROUTES` del `Home.tsx` (es debug). Reemplazar por una constante chica `DEFAULT_RESOURCES` con 8-12 entradas mock que reflejen lo que veria un usuario real (proyectos, datasets, pipelines, dashboards).
- [ ] **T2** Implementar **L0 Spaces strip** con 4 tabs (`Recent`, `Pinned`, `Shared with you`, `Trash`). Tab activa por estado local `useState<'recent'|'pinned'|'shared'|'trash'>('recent')`. Boton `Manage spaces ⚙️` a la derecha (link a `/settings` por ahora). Estilo: borde inferior `1px solid var(--border-subtle)`, padding `8px 0`, gap entre tabs.
- [ ] **T3** Implementar **L1 Title row**: H1 `Workspace` con `of-heading-xl`, sub-tabs `Resources | Activity` con estado local, y cluster derecho con `Request data` (`of-button`) + `+ New ▾` (`of-button of-button--primary`). El menu del `+ New` puede ser un `<details>` nativo o `position:absolute` simple por ahora; abre lista con `New project`, `New dataset`, `New pipeline`, `Upload data`, cada uno linkeando a la ruta correspondiente.
- [ ] **T4** Refinar **L2 KPI ribbon**: mantener el grid actual de 4 cards pero subir el numero a `font-size: 28px; font-weight: 600` y agregar microcopy debajo del numero (ej. "↑ 12% week over week" en muted). Mantener `of-eyebrow` arriba.
- [ ] **T5** Implementar **L3 izquierda — Resources card**: header con titulo + search input + menu de tres puntos (placeholder). Tabla `of-table` con columnas `Name | Path | Owner | Last modified | Status`. Filas vienen de `DEFAULT_RESOURCES`. Status renderiza `of-chip` (success / warning / info segun valor mock). Footer con "1–10 of 56" + paginacion dummy (botones disabled si N=10).
- [ ] **T6** Implementar **L3 derecha**: tres cards apiladas con `of-panel`:
  - `Activity` — lista de 4-6 items mock con icono, texto, timestamp relativo. Cada item es flex row con borde top sutil `1px solid var(--border-subtle)`.
  - `Quick start` — 4 links: New project, New dataset, New pipeline, Browse marketplace.
  - `Environment` — lo que ya hay (Branch / Ontology / Access / Build health).
- [ ] **T7** Verificar visualmente: levantar dev server, abrir `/`, comparar con [Compass Overview screenshot](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Overview_assets/img_001.png) y [Data Catalog screenshot](../../docs_original_palantir_foundry/foundry-docs/Security%20%26%20governance/Applications/Compass/Data%20Catalog_assets/img_001.png). Anotar discrepancias visibles (espaciados, alineaciones, jerarquia tipografica). Iterar T2-T6 hasta cerrar.

## 6. Prompt De Implementacion

Pegar este prompt en una sesion de Claude Code fresca (o usarlo como guia explicita para la sesion actual):

```
Tarea: implementar HOME-001 (workspace home `/`) siguiendo docs/tasks/HOME-001.md.

Contexto critico:
- Archivo: apps/web/src/routes/Home.tsx
- Sistema de tokens: clases of-* y variables --* en apps/web/src/styles/app.css. NO usar
  colores hardcodeados, NO inventar nuevos espaciados fuera del token system.
- Referencias visuales (lee las dos imagenes antes de empezar):
  - docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Overview_assets/img_001.png
  - docs_original_palantir_foundry/foundry-docs/Security & governance/Applications/Compass/Data Catalog_assets/img_001.png
- Layout objetivo: ver seccion "Layout Objetivo" en docs/tasks/HOME-001.md.

Reglas:
- NO crear nuevos componentes compartidos en este slice. Todo inline en Home.tsx.
- NO tocar Sidebar, Topbar, AppShell, ni el router.
- Mock data permitido — nada de fetch real al backend.
- Usar las clases of-* existentes; si una clase necesaria no existe, agregarla a
  apps/web/src/styles/app.css siguiendo el patron de las otras (no romper el sistema).

Pasos: ejecutar T1..T7 de docs/tasks/HOME-001.md en orden, marcando cada uno
completado en el todo list. Despues de T7, levantar dev server y reportar
discrepancias visibles vs los screenshots.

Definicion de hecho: ver seccion "Definition Of Done" del task pack.
```

## 7. Definition Of Done

- [ ] `/` renderiza las 5 regiones: Spaces strip, Title row, KPI ribbon, Resources card (izq), columna derecha (Activity + Quick start + Environment).
- [ ] Las 4 tabs de Spaces son clicables y la activa cambia de estilo (no es necesario que carguen contenido distinto en este slice — solo el estilo activo).
- [ ] Los sub-tabs `Resources | Activity` togglean cual columna izquierda se muestra.
- [ ] El boton `+ New ▾` abre un menu con 4 acciones que linkean a las rutas correctas.
- [ ] Cero estilos inline con colores hardcodeados; todo via clases `of-*` y variables `var(--*)`.
- [ ] Ningun import nuevo de UI library externa. Ningun componente compartido extraido.
- [ ] El layout no rompe en viewport `1280×800` ni en `1920×1080` (el Foundry real esta pensado para >=1280).
- [ ] Visual diff vs el screenshot de Compass Data Catalog: jerarquia tipografica y densidad coinciden a ojo (no pixel-perfect, pero "se siente" Foundry).
- [ ] No hay regresiones en otras rutas: `/datasets`, `/projects`, `/pipelines` siguen montando bajo el mismo shell.
- [ ] Commit pendiente, mensaje sugerido: `feat(web/home): mirror Compass workspace landing for HOME-001`.

## 8. Follow-ups (no en este slice)

- **HOME-002**: banner row promocional (Portfolios / Projects / Promoted items) tipo Compass Overview, con `Hide` real en localStorage.
- **HOME-003**: cuando `Activity` exista en backend (`GET /workspace/recents` ya existe en `workspace.ts`), reemplazar mock por fetch real con loading/empty/error.
- **HOME-004**: cmd+k command palette — `SEARCH-001` en el inventario.
- **Refactor extract**: cuando `ResourceTable` se necesite por 3a vez (probablemente `DATASET-001`), extraer del Home + Datasets a `lib/components/ResourceTable.tsx` con prop API que sirva ambos casos.

## 9. Notas Para Otras Sesiones

- Si el dev server no levanta: `pnpm --filter @openfoundry/web dev` desde la raiz, o ver `apps/web/package.json` para el script real.
- Si necesitas datos reales de recents para T6: `apps/web/src/lib/api/workspace.ts` exporta `listRecents()`. Pero **en este slice usamos mock** para evitar acoplamiento.
- Si el spacer entre el Topbar y el inicio del contenido del Home se ve raro: ver `AppShell.tsx` — probablemente esta forzando un `padding-top` que conflicta con la nueva spaces strip. Resolver moviendo la strip dentro del padding existente, NO modificando el AppShell.
