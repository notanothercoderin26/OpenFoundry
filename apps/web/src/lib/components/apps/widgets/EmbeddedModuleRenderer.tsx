// EmbeddedModuleRenderer — mounts a published child Workshop module
// inside a parent one and bridges their interface variables.
//
// Lifecycle:
//   1. Read the configured `module_slug` (or `module_rid`) and mapping.
//   2. Self-reference guard: if the slug appears in the ancestor chain
//      (EmbeddedAncestorsContext), refuse to mount and show a warning.
//   3. Lazy mount: defer the network call + provider render until the
//      embed scrolls into the viewport.
//   4. Fetch the child app's published version + interface variables.
//   5. Build a bridge from `mapping` that reads/writes parent state.
//   6. Render `<WorkshopRuntimeProvider>` for the child with the bridge
//      and the parent ancestor chain (extended by this slug).
//
// Failure modes:
//   - 404 / permission error -> "Failed to load module" message that
//     mirrors Palantir's wording, with a retry button.
//   - Missing slug / mapping -> editor-helpful placeholder.

import { useContext, useMemo, useRef, type CSSProperties } from 'react';

import { useQuery } from '@tanstack/react-query';

import type { AppWidget } from '@/lib/api/apps';
import {
  getPublishedApp,
  getPublishedAppInterface,
  type AppDefinition,
  type AppInterfaceVariable,
} from '@/lib/api/apps';
import { ApiError } from '@/lib/api/client';

import { AppRenderer } from '../AppRenderer';
import {
  bridgeKindsCompatible,
  EmbeddedAncestorsContext,
  EmbeddedBridgeContext,
  type EmbeddedRuntimeBridge,
  type InterfaceMapping,
  type InterfaceMappingEntry,
} from './embeddedRuntimeBridge';
import { useRuntime } from './workshop-runtime-context';
import { useWorkshopData } from './workshop-context';
import { useEmbeddedLazyMount } from './useEmbeddedLazyMount';
import { WorkshopRuntimeProvider } from './WorkshopRuntimeProvider';

const PANEL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 160,
  border: '1px solid var(--border-subtle, #e5e7eb)',
  borderRadius: 6,
  background: '#fff',
  overflow: 'hidden',
};

export interface EmbeddedModuleConfig {
  module_slug?: string;
  module_rid?: string;
  mapping?: InterfaceMapping;
  lazy_load?: boolean;
  open_referenced_module_in_new_tab?: boolean;
}

export interface EmbeddedModuleRendererProps {
  /**
   * Configuration source — usually `widget.props` or the loop
   * section's `props.embedded_module` block. Both `module_slug` and
   * `module_rid` are accepted; `module_slug` wins when both are set.
   */
  config: EmbeddedModuleConfig;
  /**
   * Overrides for `mapping`. The loop layout uses this to inject the
   * current iteration item as a mapped interface variable without
   * mutating the widget config.
   */
  mappingOverride?: InterfaceMapping;
  /**
   * Optional debug label shown when the widget is not yet configured
   * (e.g. "Loop iteration #3").
   */
  fallbackLabel?: string;
}

export function EmbeddedModuleRenderer({
  config,
  mappingOverride,
  fallbackLabel,
}: EmbeddedModuleRendererProps) {
  const slug = (config.module_slug || config.module_rid || '').trim();
  const ancestors = useAncestors();
  const isSelfRef = slug.length > 0 && ancestors.includes(slug);

  const containerRef = useRef<HTMLDivElement>(null);
  const lazyLoadEnabled = config.lazy_load !== false;
  const isVisible = useEmbeddedLazyMount(containerRef, lazyLoadEnabled);

  if (!slug) {
    return (
      <div ref={containerRef} style={PANEL_STYLE}>
        <Placeholder
          title="No module selected"
          body={
            fallbackLabel
              ? `Configure ${fallbackLabel} with a module slug to embed.`
              : 'Pick a published module in the inspector to embed it here.'
          }
        />
      </div>
    );
  }

  if (isSelfRef) {
    return (
      <div ref={containerRef} style={PANEL_STYLE}>
        <Placeholder
          tone="warning"
          title="Self-reference detected"
          body={`The module "${slug}" appears in its own ancestor chain. Workshop refuses to render recursive embeds.`}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={PANEL_STYLE}>
      {isVisible ? (
        <LoadedEmbedded
          slug={slug}
          mapping={mergeMappings(config.mapping, mappingOverride)}
          openInNewTab={Boolean(config.open_referenced_module_in_new_tab)}
        />
      ) : (
        <Placeholder title="Embed deferred" body="Scroll into view to load this module." />
      )}
    </div>
  );
}

function LoadedEmbedded({
  slug,
  mapping,
  openInNewTab,
}: {
  slug: string;
  mapping: InterfaceMapping;
  openInNewTab: boolean;
}) {
  const childQuery = useQuery({
    queryKey: ['embedded-module', slug],
    queryFn: () => loadChildModule(slug),
    retry: false,
    staleTime: 30_000,
  });

  if (childQuery.isLoading) {
    return <Placeholder title="Loading module…" body={`Fetching ${slug}.`} />;
  }
  if (childQuery.isError) {
    return (
      <FailedToLoad
        slug={slug}
        error={childQuery.error}
        onRetry={() => childQuery.refetch()}
      />
    );
  }
  if (!childQuery.data) {
    return <FailedToLoad slug={slug} error={null} onRetry={() => childQuery.refetch()} />;
  }

  const { app, interfaceVariables } = childQuery.data;
  return (
    <EmbeddedChild
      childApp={app}
      childInterface={interfaceVariables}
      mapping={mapping}
      slug={slug}
      openInNewTab={openInNewTab}
    />
  );
}

function EmbeddedChild({
  childApp,
  childInterface,
  mapping,
  slug,
  openInNewTab,
}: {
  childApp: AppDefinition;
  childInterface: AppInterfaceVariable[];
  mapping: InterfaceMapping;
  slug: string;
  openInNewTab: boolean;
}) {
  const parentRuntime = useRuntime();
  const parentData = useWorkshopData();
  const ancestors = useAncestors();

  // Bridge — closes over the parent runtime so updates propagate
  // through React's normal re-render path. The mapped external ids are
  // derived from the mapping; missing parent variables are dropped.
  const bridge = useMemo<EmbeddedRuntimeBridge>(() => {
    const resolved: Record<string, InterfaceMappingEntry> = {};
    const mappedIds: string[] = [];
    for (const child of childInterface) {
      const entry = mapping[child.external_id];
      if (!entry) continue;
      const parentVar =
        entry.kind === 'variable' && entry.variable_id
          ? parentData.variables.find((v) => v.id === entry.variable_id)
          : null;
      if (entry.kind === 'variable' && (!parentVar || !bridgeKindsCompatible(child.kind, parentVar.kind))) {
        // Skip — runtime can't honor the mapping. The editor surface
        // is responsible for highlighting incompatibility.
        continue;
      }
      resolved[child.external_id] = entry;
      mappedIds.push(child.external_id);
    }
    return {
      mappedExternalIDs: mappedIds,
      read: (childExternalID) => {
        const entry = resolved[childExternalID];
        if (!entry) return undefined;
        if (entry.kind === 'literal') return entry.value;
        if (entry.kind === 'runtime_parameter') {
          return parentRuntime.runtimeParameters?.[String(entry.value ?? '')];
        }
        if (entry.kind === 'variable' && entry.variable_id) {
          return parentRuntime.primitiveValues[entry.variable_id];
        }
        return undefined;
      },
      write: (childExternalID, value) => {
        const entry = resolved[childExternalID];
        if (!entry || entry.kind !== 'variable' || !entry.variable_id) return;
        parentRuntime.setPrimitiveValue(entry.variable_id, value);
      },
    };
  }, [childInterface, mapping, parentData.variables, parentRuntime]);

  const nextAncestors = useMemo(() => [...ancestors, slug], [ancestors, slug]);

  // The child gets a synthetic urlParams derived from current parent
  // values so any of its non-routing-but-mapped variables can still
  // receive an initial value via the existing URL-hydration path.
  const childUrlParams = useMemo(() => {
    const out: Record<string, string> = {};
    for (const externalID of bridge.mappedExternalIDs) {
      const value = bridge.read(externalID);
      if (value === null || value === undefined) continue;
      out[externalID] =
        typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value);
    }
    return out;
  }, [bridge]);

  return (
    <EmbeddedAncestorsContext.Provider value={nextAncestors}>
      <EmbeddedBridgeContext.Provider value={bridge}>
        <div className="of-app-embedded" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EmbeddedBar
            slug={slug}
            childAppName={childApp.name ?? slug}
            openInNewTab={openInNewTab}
            childUrlParams={childUrlParams}
          />
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <WorkshopRuntimeProvider app={childApp} urlParams={childUrlParams}>
              <AppRenderer app={childApp} mode="published" chrome="panel" />
            </WorkshopRuntimeProvider>
          </div>
        </div>
      </EmbeddedBridgeContext.Provider>
    </EmbeddedAncestorsContext.Provider>
  );
}

function EmbeddedBar({
  slug,
  childAppName,
  openInNewTab,
  childUrlParams,
}: {
  slug: string;
  childAppName: string;
  openInNewTab: boolean;
  childUrlParams: Record<string, string>;
}) {
  const debugHref = useMemo(() => {
    const base = `/apps/runtime/${encodeURIComponent(slug)}`;
    const query = new URLSearchParams(childUrlParams).toString();
    return query ? `${base}?${query}` : base;
  }, [slug, childUrlParams]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: '#f8fafc',
        borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
        fontSize: 11,
        color: 'var(--text-muted, #64748b)',
      }}
    >
      <span style={{ fontWeight: 600 }}>{childAppName}</span>
      <span style={{ fontFamily: 'monospace' }}>/{slug}</span>
      <a
        href={debugHref}
        target={openInNewTab ? '_blank' : '_self'}
        rel="noopener noreferrer"
        style={{ marginLeft: 'auto', textDecoration: 'underline' }}
        onClick={(event) => event.stopPropagation()}
      >
        Open referenced module
      </a>
    </div>
  );
}

function FailedToLoad({
  slug,
  error,
  onRetry,
}: {
  slug: string;
  error: unknown;
  onRetry: () => void;
}) {
  const detail =
    error instanceof ApiError && (error.status === 401 || error.status === 403)
      ? 'You may not have permission to view this module.'
      : error instanceof Error
        ? error.message
        : 'The embedded module could not be loaded.';
  return (
    <div style={{ display: 'grid', gap: 6, padding: 16, color: 'var(--text-muted, #64748b)', fontSize: 12 }}>
      <strong style={{ color: '#dc2626' }}>Failed to load module</strong>
      <span>
        Could not load <span style={{ fontFamily: 'monospace' }}>{slug}</span>. {detail}
      </span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          alignSelf: 'flex-start',
          padding: '4px 10px',
          fontSize: 12,
          border: '1px solid var(--border-default, #cbd5e1)',
          borderRadius: 4,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function Placeholder({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone?: 'warning';
}) {
  const accent = tone === 'warning' ? '#d97706' : 'var(--text-muted, #64748b)';
  return (
    <div style={{ display: 'grid', gap: 4, padding: 16, fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
      <strong style={{ color: accent }}>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function useAncestors(): string[] {
  return useContext(EmbeddedAncestorsContext);
}

function mergeMappings(
  base: InterfaceMapping | undefined,
  override: InterfaceMapping | undefined,
): InterfaceMapping {
  if (!base && !override) return {};
  return { ...(base ?? {}), ...(override ?? {}) };
}

async function loadChildModule(slug: string) {
  const [published, ifaceResponse] = await Promise.all([
    getPublishedApp(slug),
    getPublishedAppInterface(slug),
  ]);
  return {
    app: published.app,
    interfaceVariables: ifaceResponse.interface_variables,
  };
}

/**
 * Adapter for widget catalog → renderer. Reads the widget's props as
 * an `EmbeddedModuleConfig`. Exported separately so the loop layout
 * can construct configs at runtime instead of from `widget.props`.
 */
export function widgetToEmbeddedConfig(widget: AppWidget): EmbeddedModuleConfig {
  const props = (widget.props ?? {}) as Record<string, unknown>;
  return {
    module_slug: typeof props.module_slug === 'string' ? props.module_slug : '',
    module_rid: typeof props.module_rid === 'string' ? props.module_rid : '',
    mapping: (props.mapping as InterfaceMapping) ?? {},
    lazy_load: props.lazy_load !== false,
    open_referenced_module_in_new_tab: Boolean(props.open_referenced_module_in_new_tab),
  };
}
