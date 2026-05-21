import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getObjectType,
  linkTypeCardinalityLabel,
  linkTypeEndpointLabels,
  listLinkTypes,
  type LinkType,
  type ObjectType,
} from "@/lib/api/ontology";
import { Glyph } from "@/lib/components/ui/Glyph";
import { TabBar } from "@/lib/components/ui/TabBar";
import { Badge } from "@/lib/components/ui/Badge";
import { ResourceIcon } from "@/lib/components/ui/ResourceIcon";
import { ontologyGroupColor } from "@/lib/components/ontology/groupColors";

type Tab = "overview" | "datasources";

export function LinkTypeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [link, setLink] = useState<LinkType | null>(null);
  const [source, setSource] = useState<ObjectType | null>(null);
  const [target, setTarget] = useState<ObjectType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        /* No dedicated getLinkType endpoint yet; page through the list. */
        const result = await listLinkTypes({ per_page: 500 });
        if (cancelled) return;
        const found = result.data.find((entry) => entry.id === id) ?? null;
        if (!found) {
          setError(`Link type ${id} not found`);
          setLoading(false);
          return;
        }
        setLink(found);
        const [src, tgt] = await Promise.all([
          getObjectType(found.source_type_id).catch(() => null),
          getObjectType(found.target_type_id).catch(() => null),
        ]);
        if (cancelled) return;
        setSource(src);
        setTarget(tgt);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading || !link) {
    return (
      <div className="px-6 py-8">
        <p className="text-of-13 text-of-text-muted">
          {error || "Loading link type…"}
        </p>
      </div>
    );
  }

  const endpoints = linkTypeEndpointLabels(link);

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] min-h-[calc(100vh-3rem)] bg-of-canvas">
      <aside className="border-r border-of-border bg-of-surface-raised flex flex-col">
        <div className="px-3 py-2 border-b border-of-border">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1 h-7 px-1 -ml-1 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:text-of-text"
          >
            <Glyph name="chevron-left" size={12} tone="currentColor" />
            {source?.display_name ?? source?.name ?? "Back"}
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-3 border-b border-of-border">
          <ResourceIcon
            glyph="link"
            color={ontologyGroupColor(link.display_name)}
            size="md"
          />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-of-13 font-of-semibold text-of-text truncate">
              {link.display_name || link.name}
            </span>
            <span className="text-of-12 text-of-text-muted truncate font-mono">
              {link.name}
            </span>
          </div>
        </div>
        <nav className="p-1.5 flex flex-col gap-px">
          <SidebarItem
            label="Overview"
            glyph="home"
            active={tab === "overview"}
            onClick={() => setTab("overview")}
          />
          <SidebarItem
            label="Datasources"
            glyph="database"
            active={tab === "datasources"}
            onClick={() => setTab("datasources")}
          />
        </nav>
      </aside>

      <main className="flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-of-border bg-of-surface-raised">
          <ResourceIcon
            glyph="link"
            color={ontologyGroupColor(link.display_name)}
            size="lg"
          />
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className="text-of-20 font-of-semibold text-of-text m-0 truncate">
              {link.display_name || link.name}
            </h1>
            <p className="text-of-13 text-of-text-muted m-0">
              Link type · {linkTypeCardinalityLabel(String(link.cardinality))}
            </p>
          </div>
          <Badge variant="active">Active</Badge>
        </header>

        <TabBar
          tabs={[
            { id: "overview" as const, label: "Overview" },
            { id: "datasources" as const, label: "Datasources" },
          ]}
          active={tab}
          onChange={(next) => setTab(next as Tab)}
          className="px-6"
        />

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {tab === "overview" ? (
            <OverviewBody
              link={link}
              source={source}
              target={target}
              endpoints={endpoints}
            />
          ) : (
            <DatasourcesBody link={link} />
          )}
        </div>
      </main>
    </div>
  );
}

interface OverviewBodyProps {
  link: LinkType;
  source: ObjectType | null;
  target: ObjectType | null;
  endpoints: { forward: string; reverse: string };
}

function OverviewBody({ link, source, target, endpoints }: OverviewBodyProps) {
  return (
    <>
      <section
        className={[
          "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "grid gap-x-8 gap-y-3 grid-cols-1 lg:grid-cols-2",
        ].join(" ")}
      >
        <Row label="Cardinality">
          <span className="text-of-13 text-of-text">
            {linkTypeCardinalityLabel(String(link.cardinality))}
          </span>
        </Row>
        <Row label="Visibility">
          <Badge variant="visibility-normal" />
        </Row>
        <Row label="Forward label">
          <span className="text-of-13 text-of-text font-mono truncate">
            {endpoints.forward}
          </span>
        </Row>
        <Row label="Reverse label">
          <span className="text-of-13 text-of-text font-mono truncate">
            {endpoints.reverse}
          </span>
        </Row>
        <Row label="Description">
          <span className="text-of-13 text-of-text">
            {link.description || (
              <span className="text-of-text-muted italic">No description</span>
            )}
          </span>
        </Row>
        <Row label="API name">
          <span
            className="text-of-13 text-of-text font-mono truncate"
            title={link.name}
          >
            {link.name}
          </span>
        </Row>
      </section>

      <section
        className={[
          "p-6 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "flex items-center justify-center gap-4",
        ].join(" ")}
        aria-label="Endpoint pair"
      >
        <EndpointTile objectType={source} role="source" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-of-12 text-of-text-muted">
            {endpoints.forward}
          </span>
          <span className="text-of-12 text-of-text-muted">
            {arrow(String(link.cardinality))}
          </span>
          <span className="text-of-12 text-of-text-muted">
            {endpoints.reverse}
          </span>
        </div>
        <EndpointTile objectType={target} role="target" />
      </section>
    </>
  );
}

function EndpointTile({
  objectType,
  role,
}: {
  objectType: ObjectType | null;
  role: "source" | "target";
}) {
  return (
    <div
      className={[
        "flex flex-col items-center gap-2 p-4 min-w-[180px]",
        "bg-of-surface border border-of-border rounded-of-md",
      ].join(" ")}
    >
      <ResourceIcon
        glyph="cube"
        color={
          objectType
            ? ontologyGroupColor(objectType.display_name)
            : ontologyGroupColor(role)
        }
        size="lg"
      />
      <span className="text-of-14 font-of-semibold text-of-text text-center">
        {objectType?.display_name ?? objectType?.name ?? "Unknown"}
      </span>
      <span className="text-of-12 text-of-text-muted uppercase tracking-wide">
        {role}
      </span>
    </div>
  );
}

function DatasourcesBody({ link }: { link: LinkType }) {
  const mapping = link.link_datasource_mapping ?? null;
  if (!mapping) {
    return (
      <section
        className={[
          "p-6 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "flex flex-col items-center text-center gap-2",
        ].join(" ")}
      >
        <Glyph name="database" size={28} tone="var(--of-text-soft)" />
        <p className="text-of-14 font-of-semibold text-of-text m-0">
          No datasource mapping
        </p>
        <p className="text-of-13 text-of-text-muted m-0 max-w-[420px]">
          Bind a dataset to materialise this link type. Mappings configure
          which columns supply source and target object ids.
        </p>
      </section>
    );
  }
  return (
    <section
      className={[
        "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "grid gap-3 grid-cols-1 sm:grid-cols-2",
      ].join(" ")}
      aria-label="Datasource mapping"
    >
      <Row label="Dataset">
        <span className="text-of-13 text-of-text font-mono truncate">
          {String((mapping as { dataset_id?: string }).dataset_id ?? "—")}
        </span>
      </Row>
      <Row label="Source column">
        <span className="text-of-13 text-of-text font-mono truncate">
          {String((mapping as { source_column?: string }).source_column ?? "—")}
        </span>
      </Row>
      <Row label="Target column">
        <span className="text-of-13 text-of-text font-mono truncate">
          {String((mapping as { target_column?: string }).target_column ?? "—")}
        </span>
      </Row>
    </section>
  );
}

function arrow(cardinality: string): string {
  switch (cardinality) {
    case "one_to_one":
      return "1 — 1";
    case "one_to_many":
      return "1 — *";
    case "many_to_one":
      return "* — 1";
    case "many_to_many":
      return "* — *";
    default:
      return "↔";
  }
}

function SidebarItem({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: import("@/lib/components/ui/Glyph").GlyphName;
  active: boolean;
  onClick: () => void;
}) {
  const cls = [
    "group flex items-center gap-2 w-full px-2 h-8 rounded-of-sm text-of-13 text-left transition-colors",
    active
      ? "bg-of-accent-soft text-of-accent font-of-semibold"
      : "text-of-text hover:bg-of-surface-muted font-of-medium",
  ].join(" ");
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Glyph
        name={glyph}
        size={13}
        tone={active ? "var(--of-accent)" : "var(--of-text-muted)"}
      />
      {label}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3 min-h-6">
      <span className="text-of-12 text-of-text-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/* `useMemo` placeholder for callers that may add memoised slots later. */
export const _internals = { useMemo };
