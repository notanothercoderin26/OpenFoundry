import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getFunctionPackage,
  type FunctionPackage,
  type FunctionVersionEntry,
} from "@/lib/api/ontology";
import { Glyph } from "@/lib/components/ui/Glyph";
import { TabBar } from "@/lib/components/ui/TabBar";
import { Badge } from "@/lib/components/ui/Badge";
import { ResourceIcon } from "@/lib/components/ui/ResourceIcon";
import { ontologyGroupColor } from "@/lib/components/ontology/groupColors";
import { ObservabilityPanel } from "@/lib/components/ontology/ObservabilityPanel";
import {
  useFunctionUsageHistory,
  useFunctionVersions,
} from "@/lib/hooks/useOntologyData";

type Tab = "overview" | "configuration" | "observability";

export function FunctionDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [pkg, setPkg] = useState<FunctionPackage | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const current = await getFunctionPackage(id);
        if (cancelled) return;
        setPkg(current);
        setSelectedVersionId(current.id);
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

  const { data: versions = [] } = useFunctionVersions(pkg?.id);
  const { data: usageHistory = [] } = useFunctionUsageHistory(pkg?.id);

  const activeVersion = useMemo(() => {
    if (!pkg) return null;
    if (!selectedVersionId) return pkg;
    const match = versions.find((entry) => entry.id === selectedVersionId);
    if (!match) return pkg;
    return {
      ...pkg,
      id: match.id,
      version: match.version,
      display_name: match.display_name,
      created_at: match.created_at,
    } as FunctionPackage;
  }, [versions, selectedVersionId, pkg]);

  if (loading || !pkg || !activeVersion) {
    return (
      <div className="px-6 py-8">
        <p className="text-of-13 text-of-text-muted">
          {error || "Loading function…"}
        </p>
      </div>
    );
  }

  const color = ontologyGroupColor(pkg.name);

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
            Functions
          </button>
        </div>
        <div className="flex flex-col gap-2 px-3 py-3 border-b border-of-border">
          <span className="text-of-12 text-of-text-muted">Version</span>
          <VersionPicker
            versions={versions}
            currentId={activeVersion.id}
            onChange={setSelectedVersionId}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-3 border-b border-of-border">
          <ResourceIcon glyph="code" color={color} size="md" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-of-13 font-of-semibold text-of-text truncate">
              {pkg.display_name || pkg.name}
            </span>
            <span className="text-of-12 text-of-text-muted truncate font-mono">
              {pkg.name}
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
            label="Configuration"
            glyph="settings"
            active={tab === "configuration"}
            onClick={() => setTab("configuration")}
          />
          <SidebarItem
            label="Observability"
            glyph="pie-chart"
            active={tab === "observability"}
            onClick={() => setTab("observability")}
          />
        </nav>
      </aside>

      <main className="flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-of-border bg-of-surface-raised">
          <ResourceIcon glyph="code" color={color} size="lg" />
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className="text-of-20 font-of-semibold text-of-text m-0 truncate">
              {activeVersion.display_name || activeVersion.name}
            </h1>
            <p className="text-of-13 text-of-text-muted m-0">
              Function · v{activeVersion.version} · {activeVersion.runtime}
            </p>
          </div>
          <a
            href={`/compute-modules?focus=${encodeURIComponent(pkg.name)}`}
            className={[
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm",
              "border border-of-border bg-of-surface-raised text-of-13 font-of-medium text-of-text",
              "hover:border-of-border-strong",
            ].join(" ")}
          >
            Open in Code Repository
            <Glyph name="external-link" size={11} tone="currentColor" />
          </a>
        </header>

        <TabBar
          tabs={[
            { id: "overview" as const, label: "Overview" },
            { id: "configuration" as const, label: "Configuration" },
            { id: "observability" as const, label: "Observability" },
          ]}
          active={tab}
          onChange={(next) => setTab(next as Tab)}
          className="px-6"
        />

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {tab === "overview" ? (
            <OverviewBody pkg={activeVersion} usageHistory={usageHistory} />
          ) : tab === "configuration" ? (
            <ConfigurationBody pkg={activeVersion} />
          ) : (
            <ObservabilityPanel
              seedId={pkg.id}
              title={`${activeVersion.display_name || activeVersion.name} usage`}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function OverviewBody({
  pkg,
  usageHistory,
}: {
  pkg: FunctionPackage;
  usageHistory: ReadonlyArray<{ app_id: string; app_name: string; app_kind: string; version: string }>;
}) {
  return (
    <>
      <section
        className={[
          "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "grid gap-x-8 gap-y-3 grid-cols-1 lg:grid-cols-2",
        ].join(" ")}
      >
        <Row label="Display name">
          <span className="text-of-13 text-of-text">{pkg.display_name}</span>
        </Row>
        <Row label="API name">
          <span className="text-of-13 text-of-text font-mono truncate" title={pkg.name}>
            {pkg.name}
          </span>
        </Row>
        <Row label="Runtime">
          <span className="text-of-13 text-of-text">{pkg.runtime}</span>
        </Row>
        <Row label="Entrypoint">
          <span className="text-of-13 text-of-text font-mono truncate" title={pkg.entrypoint}>
            {pkg.entrypoint}
          </span>
        </Row>
        <Row label="Version">
          <span className="text-of-13 text-of-text font-mono">v{pkg.version}</span>
        </Row>
        <Row label="Status">
          <Badge variant="active">Active</Badge>
        </Row>
        <Row label="Description">
          <span className="text-of-13 text-of-text">
            {pkg.description || (
              <span className="text-of-text-muted italic">No description</span>
            )}
          </span>
        </Row>
      </section>

      <section
        className={[
          "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "flex flex-col gap-3",
        ].join(" ")}
        aria-label="Usage history"
      >
        <header className="flex items-center gap-2">
          <h3 className="text-of-16 font-of-semibold text-of-text">
            Usage history
          </h3>
          <span className="text-of-13 text-of-text-muted tabular-nums">
            {usageHistory.length}
          </span>
        </header>
        {usageHistory.length === 0 ? (
          <p className="text-of-13 text-of-text-muted m-0">
            No applications have pinned this function yet. As pipelines and
            Workshop modules consume it, they will surface here grouped by
            the version they pin.
          </p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-px">
            {usageHistory.map((entry) => (
              <li
                key={entry.app_id}
                className="flex items-center gap-2 px-2 h-8 rounded-of-sm hover:bg-of-surface-muted"
              >
                <span className="text-of-13 font-of-medium text-of-text truncate flex-1">
                  {entry.app_name}
                </span>
                <span className="text-of-12 text-of-text-muted truncate">
                  {entry.app_kind}
                </span>
                <span
                  className="text-of-12 font-mono text-of-text-muted"
                  title={`Pinned to v${entry.version}`}
                >
                  v{entry.version}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ConfigurationBody({ pkg }: { pkg: FunctionPackage }) {
  const capabilities = pkg.capabilities ?? ({} as Record<string, unknown>);
  return (
    <section
      className={[
        "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "flex flex-col gap-3",
      ].join(" ")}
      aria-label="Configuration"
    >
      <h3 className="text-of-16 font-of-semibold text-of-text m-0">Capabilities</h3>
      <pre
        className={[
          "rounded-of-sm border border-of-border bg-of-surface",
          "p-3 text-of-12 font-mono text-of-text overflow-auto",
        ].join(" ")}
      >
        {JSON.stringify(capabilities, null, 2)}
      </pre>
    </section>
  );
}

function VersionPicker({
  versions,
  currentId,
  onChange,
}: {
  versions: FunctionVersionEntry[];
  currentId: string;
  onChange: (id: string) => void;
}) {
  if (versions.length === 0) {
    return <span className="text-of-12 text-of-text-muted">No versions</span>;
  }
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-8 px-2 rounded-of-sm",
        "border border-of-border bg-of-surface-raised",
      ].join(" ")}
    >
      <Glyph name="autosaved" size={12} tone="var(--of-text-muted)" />
      <select
        value={currentId}
        onChange={(event) => onChange(event.target.value)}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-of-13 text-of-text appearance-none"
      >
        {versions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            v{entry.version}
            {entry.is_latest ? "  ·  latest" : ""}
          </option>
        ))}
      </select>
      <Glyph name="chevron-down" size={11} tone="var(--of-text-muted)" />
    </span>
  );
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
