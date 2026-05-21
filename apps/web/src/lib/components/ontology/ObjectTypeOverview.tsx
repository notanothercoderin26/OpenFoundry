import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { Core, ElementDefinition, StylesheetStyle } from "cytoscape";

import type {
  ActionType,
  LinkType,
  ObjectType,
  Property,
} from "@/lib/api/ontology";
import { CytoscapeCanvas } from "@components/CytoscapeCanvas";
import { Badge } from "@components/ui/Badge";
import { Glyph } from "@components/ui/Glyph";

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function initials(value: string | null | undefined): string {
  if (!value) return "?";
  const parts = value
    .replace(/[@_.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return value.slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function truncate(value: string, length = 28): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}…`;
}

/** Derive a small alias list when the backend doesn't ship one explicitly. */
function defaultAliases(objectType: ObjectType): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [
    objectType.api_name,
    objectType.plural_display_name ?? undefined,
  ]) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed === objectType.display_name) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

function isIndexed(objectType: ObjectType): boolean {
  return Boolean(
    objectType.restricted_view_indexed_at ||
      objectType.restricted_view_registered_at,
  );
}

/* ------------------------------------------------------------------------- */
/* Metadata panel                                                             */
/* ------------------------------------------------------------------------- */

interface ObjectTypeMetadataPanelProps {
  objectType: ObjectType;
  ontologyName: string;
  /** Optional explicit aliases. Falls back to a derived list. */
  aliases?: string[];
  /** Optional contributors list. Renders "None" when empty. */
  contributors?: Array<{ id: string; name?: string; email?: string }>;
  /** Point-of-contact handle (initials/email). Falls back to owner_id. */
  pointOfContact?: { name?: string; email?: string };
  onEditPointOfContact?: () => void;
  /** Hooks for the right-column inline editors. Stubs are accepted. */
  onStatusChange?: (next: string) => void;
  onVisibilityChange?: (next: string) => void;
  onRemoveAlias?: (alias: string) => void;
}

export function ObjectTypeMetadataPanel({
  objectType,
  ontologyName,
  aliases,
  contributors,
  pointOfContact,
  onEditPointOfContact,
  onStatusChange,
  onVisibilityChange,
  onRemoveAlias,
}: ObjectTypeMetadataPanelProps) {
  const computedAliases = aliases ?? defaultAliases(objectType);
  const status = objectType.status ?? "active";
  const visibility = objectType.visibility ?? "normal";
  const editable = objectType.editable !== false;
  const indexed = isIndexed(objectType);

  const poc = pointOfContact ?? { email: objectType.owner_id };
  const pocDisplay = poc.name ?? poc.email ?? objectType.owner_id;

  return (
    <section
      className={[
        "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "grid gap-x-8 gap-y-3",
        "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
      ].join(" ")}
      aria-label="Object type metadata"
    >
      <dl className="m-0 flex flex-col gap-3">
        <Row label="Plural name">
          <span className="text-of-13 text-of-text">
            {objectType.plural_display_name ||
              `${objectType.display_name}s`}
          </span>
        </Row>
        <Row label="Description">
          <span className="text-of-13 text-of-text">
            {objectType.description || (
              <span className="text-of-text-muted italic">No description</span>
            )}
          </span>
        </Row>
        <Row
          label="Aliases"
          help="Other names used to refer to this object type."
        >
          {computedAliases.length === 0 ? (
            <span className="text-of-13 text-of-text-muted">None</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {computedAliases.map((alias) => (
                <span
                  key={alias}
                  className={[
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-of-sm",
                    "border border-of-border bg-of-surface text-of-12 text-of-text",
                  ].join(" ")}
                >
                  {alias}
                  {onRemoveAlias ? (
                    <button
                      type="button"
                      onClick={() => onRemoveAlias(alias)}
                      aria-label={`Remove ${alias}`}
                      className="-mr-0.5 text-of-text-muted hover:text-of-text"
                    >
                      <Glyph name="x" size={10} tone="currentColor" />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </Row>
        <Row
          label="Point of contact"
          help="The owner responsible for this object type."
        >
          <div className="flex items-center gap-2">
            <span
              className={[
                "inline-flex items-center justify-center w-5 h-5 rounded-full",
                "bg-of-accent text-white text-[10px] font-of-semibold",
              ].join(" ")}
              aria-hidden
            >
              {initials(pocDisplay)}
            </span>
            <span className="text-of-13 text-of-text truncate">
              {pocDisplay}
            </span>
            {poc.email ? (
              <a
                href={`mailto:${poc.email}`}
                aria-label="Send email"
                className="text-of-text-muted hover:text-of-text"
              >
                <Glyph name="email" size={12} tone="currentColor" />
              </a>
            ) : null}
            {onEditPointOfContact ? (
              <button
                type="button"
                onClick={onEditPointOfContact}
                aria-label="Edit point of contact"
                className="text-of-text-muted hover:text-of-text"
              >
                <Glyph name="pencil" size={12} tone="currentColor" />
              </button>
            ) : null}
          </div>
        </Row>
        <Row label="Contributors">
          {contributors && contributors.length > 0 ? (
            <div className="flex items-center -space-x-1">
              {contributors.slice(0, 6).map((c) => (
                <span
                  key={c.id}
                  title={c.name ?? c.email ?? c.id}
                  className={[
                    "inline-flex items-center justify-center w-5 h-5 rounded-full",
                    "bg-of-surface-muted border border-of-surface-raised",
                    "text-[10px] font-of-semibold text-of-text",
                  ].join(" ")}
                >
                  {initials(c.name ?? c.email ?? c.id)}
                </span>
              ))}
              {contributors.length > 6 ? (
                <span className="ml-2 text-of-12 text-of-text-muted">
                  +{contributors.length - 6}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-of-13 text-of-text-muted">None</span>
          )}
        </Row>
        <Row label="Ontology">
          <span className="text-of-13 text-of-text">{ontologyName}</span>
        </Row>
        <Row label="API name">
          <span
            className="text-of-13 text-of-text font-mono truncate"
            title={objectType.api_name ?? objectType.name}
          >
            {objectType.api_name ?? objectType.name}
          </span>
        </Row>
      </dl>

      <dl className="m-0 flex flex-col gap-3">
        <Row label="Status">
          <Dropdown
            value={status}
            options={[
              { value: "active", label: "Active" },
              { value: "experimental", label: "Experimental" },
              { value: "deprecated", label: "Deprecated" },
            ]}
            onChange={onStatusChange}
          />
        </Row>
        <Row label="Visibility">
          <Dropdown
            value={visibility}
            leading={
              <Glyph name="eye" size={12} tone="var(--of-text-muted)" />
            }
            options={[
              { value: "normal", label: "Normal" },
              { value: "hidden", label: "Hidden" },
              { value: "prominent", label: "Prominent" },
            ]}
            onChange={onVisibilityChange}
          />
        </Row>
        <Row label="Index status">
          {indexed ? (
            <Badge variant="active">Indexed</Badge>
          ) : (
            <Badge variant="not-indexed" />
          )}
        </Row>
        <Row label="Edits">
          <Badge variant={editable ? "active" : "disabled"}>
            {editable ? "Enabled" : "Disabled"}
          </Badge>
        </Row>
        <Row label="ID">
          <span
            className="text-of-13 text-of-text font-mono truncate"
            title={objectType.id}
          >
            {truncate(objectType.id)}
          </span>
        </Row>
        <Row label="RID">
          <span
            className="text-of-13 text-of-text font-mono truncate"
            title={objectType.rid ?? "—"}
          >
            {objectType.rid ? truncate(objectType.rid) : "—"}
          </span>
        </Row>
      </dl>
    </section>
  );
}

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3 min-h-6">
      <dt className="inline-flex items-center gap-1 text-of-12 text-of-text-muted">
        {label}
        {help ? (
          <span title={help} aria-hidden>
            <Glyph name="help" size={11} tone="currentColor" />
          </span>
        ) : null}
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

interface DropdownOption {
  value: string;
  label: string;
}

function Dropdown({
  value,
  options,
  onChange,
  leading,
}: {
  value: string;
  options: DropdownOption[];
  onChange?: (next: string) => void;
  leading?: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm",
        "border border-of-border bg-of-surface-raised",
      ].join(" ")}
    >
      {leading}
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={!onChange}
        className="bg-transparent border-0 outline-none text-of-13 text-of-text appearance-none pr-4 disabled:cursor-default"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Glyph name="chevron-down" size={11} tone="var(--of-text-muted)" />
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Properties panel                                                           */
/* ------------------------------------------------------------------------- */

interface ObjectTypePropertiesPanelProps {
  properties: Property[];
  primaryKeyPropertyName?: string | null;
  titleKeyPropertyName?: string | null;
  onNew?: () => void;
  onPick?: (property: Property) => void;
}

export function ObjectTypePropertiesPanel({
  properties,
  primaryKeyPropertyName,
  titleKeyPropertyName,
  onNew,
  onPick,
}: ObjectTypePropertiesPanelProps) {
  return (
    <section
      className={[
        "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "flex flex-col gap-3",
      ].join(" ")}
      aria-label="Properties"
    >
      <header className="flex items-center gap-2">
        <h3 className="text-of-16 font-of-semibold text-of-text">Properties</h3>
        <span className="text-of-13 text-of-text-muted tabular-nums">
          {properties.length}
        </span>
        {onNew ? (
          <button
            type="button"
            onClick={onNew}
            className={[
              "ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
              "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
            ].join(" ")}
          >
            <Glyph name="plus" size={12} tone="currentColor" />
            New
          </button>
        ) : null}
      </header>

      {properties.length === 0 ? (
        <p className="px-2 py-4 text-of-13 text-of-text-muted">
          No properties yet.
        </p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-px">
          {properties.map((property, index) => (
            <Fragment key={property.id}>
              {/* Foundry inserts a thin separator every couple of rows to
                  reinforce visual grouping. We emulate that with a 1px gap
                  every 2 entries (skip the very first). */}
              {index > 0 && index % 2 === 0 ? (
                <li className="my-1 border-t border-of-border" aria-hidden />
              ) : null}
              <li>
                <PropertyRow
                  property={property}
                  isPrimaryKey={primaryKeyPropertyName === property.name}
                  isTitle={titleKeyPropertyName === property.name}
                  onClick={onPick ? () => onPick(property) : undefined}
                />
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </section>
  );
}

function PropertyRow({
  property,
  isPrimaryKey,
  isTitle,
  onClick,
}: {
  property: Property;
  isPrimaryKey: boolean;
  isTitle: boolean;
  onClick?: () => void;
}) {
  const cls = [
    "group flex items-center gap-2 px-2 h-9 rounded-of-sm",
    onClick ? "cursor-pointer hover:bg-of-surface-muted" : "",
  ].join(" ");
  return (
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <PropertyTypeIcon property={property} />
      <span className="text-of-13 text-of-text truncate flex-1">
        {property.display_name || property.name}
      </span>
      {isTitle ? <Badge variant="title" /> : null}
      {isPrimaryKey ? <Badge variant="primary-key" /> : null}
    </div>
  );
}

interface PropertyTypeAppearance {
  label: string;
  bg: string;
  fg: string;
  monospace: boolean;
  glyph?: "history" | "tag" | "graph" | "check";
}

function appearanceFor(property: Property): PropertyTypeAppearance {
  const base = (
    property.base_type ?? property.property_type ?? ""
  ).toLowerCase();
  if (
    base === "string" ||
    base === "text" ||
    base === "uuid" ||
    base === "rid"
  ) {
    return {
      label: "“”",
      bg: "#eef0f3",
      fg: "#5f6b7c",
      monospace: true,
    };
  }
  if (
    base === "integer" ||
    base === "int" ||
    base === "long" ||
    base === "short" ||
    base === "byte"
  ) {
    return { label: "123", bg: "#eef0f3", fg: "#1c2127", monospace: true };
  }
  if (base === "double" || base === "float" || base === "decimal") {
    return { label: "1.0", bg: "#eef0f3", fg: "#1c2127", monospace: true };
  }
  if (base === "boolean" || base === "bool") {
    return { label: "T/F", bg: "#eef0f3", fg: "#1c2127", monospace: true };
  }
  if (
    base === "date" ||
    base === "datetime" ||
    base === "timestamp" ||
    base === "time"
  ) {
    return {
      label: "📅",
      bg: "#fef3c7",
      fg: "#9a5b00",
      monospace: false,
      glyph: "history",
    };
  }
  if (base === "geo" || base === "geohash" || base === "geoshape") {
    return {
      label: "@",
      bg: "#e0f2fe",
      fg: "#0284c7",
      monospace: false,
      glyph: "graph",
    };
  }
  if (base === "array" || property.is_array) {
    return { label: "[ ]", bg: "#e0e7ff", fg: "#4f46e5", monospace: true };
  }
  return {
    label: "“”",
    bg: "#eef0f3",
    fg: "#5f6b7c",
    monospace: true,
  };
}

function PropertyTypeIcon({ property }: { property: Property }) {
  const a = appearanceFor(property);
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-of-sm text-[10px]"
      style={{
        background: a.bg,
        color: a.fg,
        fontFamily: a.monospace ? "var(--font-mono)" : undefined,
        fontWeight: 600,
      }}
      aria-hidden
      title={property.base_type ?? property.property_type ?? "value"}
    >
      {a.glyph ? <Glyph name={a.glyph} size={12} tone={a.fg} /> : a.label}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Action types panel                                                         */
/* ------------------------------------------------------------------------- */

interface ObjectTypeActionsPanelProps {
  objectTypeName: string;
  actionTypes: ActionType[];
  onNew?: () => void;
  onPick?: (action: ActionType) => void;
}

export function ObjectTypeActionsPanel({
  objectTypeName,
  actionTypes,
  onNew,
  onPick,
}: ObjectTypeActionsPanelProps) {
  return (
    <section
      className={[
        "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "flex flex-col gap-3",
      ].join(" ")}
      aria-label="Action types"
    >
      <header className="flex items-center gap-2">
        <h3 className="text-of-16 font-of-semibold text-of-text">
          Action types
        </h3>
        <span className="text-of-13 text-of-text-muted tabular-nums">
          {actionTypes.length}
        </span>
        {onNew ? (
          <button
            type="button"
            onClick={onNew}
            className={[
              "ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
              "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
            ].join(" ")}
          >
            <Glyph name="plus" size={12} tone="currentColor" />
            New
          </button>
        ) : null}
      </header>

      <div
        className={[
          "flex items-center gap-2 px-2 py-1.5 -mx-1",
          "bg-of-surface rounded-of-sm border border-of-border",
        ].join(" ")}
      >
        <span className="text-of-12 text-of-text-muted">References</span>
        <span className="text-of-12 font-of-semibold text-of-text truncate">
          {objectTypeName}
        </span>
        <span className="ml-auto text-of-12 text-of-text-muted tabular-nums">
          {actionTypes.length}
        </span>
      </div>

      {actionTypes.length === 0 ? (
        <p className="px-2 py-4 text-of-13 text-of-text-muted">
          No action types reference this object type yet.
        </p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-px">
          {actionTypes.map((action) => (
            <li key={action.id}>
              <ActionRow action={action} onClick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionRow({
  action,
  onClick,
}: {
  action: ActionType;
  onClick?: (action: ActionType) => void;
}) {
  const cls = [
    "group w-full flex items-center gap-2 px-2 h-9 rounded-of-sm text-left",
    onClick ? "cursor-pointer hover:bg-of-surface-muted" : "",
  ].join(" ");
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick ? () => onClick(action) : undefined}
      disabled={!onClick}
    >
      <span
        className={[
          "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-of-sm",
          "bg-of-accent-soft text-of-accent",
        ].join(" ")}
        aria-hidden
      >
        <Glyph name="pencil" size={12} tone="var(--of-accent)" />
      </span>
      <span className="text-of-13 text-of-text truncate flex-1">
        {action.display_name || action.name}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Link types graph panel                                                     */
/* ------------------------------------------------------------------------- */

interface ObjectTypeLinkGraphPanelProps {
  currentType: ObjectType;
  links: LinkType[];
  typeById: Map<string, ObjectType>;
  selectedLinkId?: string | null;
  onSelectLink?: (link: LinkType) => void;
  onNewLink?: () => void;
}

type LinkPanelMode = "graph" | "list";

export function ObjectTypeLinkGraphPanel({
  currentType,
  links,
  typeById,
  selectedLinkId,
  onSelectLink,
  onNewLink,
}: ObjectTypeLinkGraphPanelProps) {
  const [mode, setMode] = useState<LinkPanelMode>("graph");
  const [cy, setCy] = useState<Core | null>(null);

  const { elements, stylesheet, layout } = useMemo(
    () => buildLinkGraph(currentType, links, typeById),
    [currentType, links, typeById],
  );

  return (
    <section
      className={[
        "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "flex flex-col gap-3",
      ].join(" ")}
      aria-label="Link types"
    >
      <header className="flex items-center gap-2">
        <h3 className="text-of-16 font-of-semibold text-of-text">Link types</h3>
        <span className="text-of-13 text-of-text-muted tabular-nums">
          {links.length}
        </span>
        {onNewLink ? (
          <button
            type="button"
            onClick={onNewLink}
            className={[
              "ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
              "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
            ].join(" ")}
          >
            <Glyph name="plus" size={12} tone="currentColor" />
            New
          </button>
        ) : null}
        <ModeToggle mode={mode} onChange={setMode} className={onNewLink ? "" : "ml-auto"} />
      </header>

      {mode === "graph" ? (
        <div className="relative rounded-of-sm border border-of-border bg-of-surface overflow-hidden">
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
            <CanvasButton
              ariaLabel="Zoom in"
              onClick={() => cy?.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: 0, y: 0 } })}
            >
              <Glyph name="plus" size={14} tone="currentColor" />
            </CanvasButton>
            <CanvasButton
              ariaLabel="Zoom out"
              onClick={() => cy?.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: 0, y: 0 } })}
            >
              <Glyph name="x" size={14} tone="currentColor" />
            </CanvasButton>
            <CanvasButton ariaLabel="Fit to view" onClick={() => cy?.fit(undefined, 40)}>
              <Glyph name="move" size={14} tone="currentColor" />
            </CanvasButton>
          </div>
          <CytoscapeCanvas
            elements={elements}
            stylesheet={stylesheet}
            layout={layout}
            height={280}
            onReady={(instance) => {
              setCy(instance);
              if (onSelectLink) {
                instance.on("tap", "edge", (event) => {
                  const id = event.target.id() as string;
                  const link = links.find((entry) => entry.id === id);
                  if (link) onSelectLink(link);
                });
              }
            }}
          />
          {onNewLink ? (
            <button
              type="button"
              onClick={onNewLink}
              className={[
                "absolute bottom-3 right-3 z-10",
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm",
                "bg-of-surface-raised border border-of-border shadow-of-popover",
                "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
              ].join(" ")}
            >
              <Glyph name="plus" size={12} tone="currentColor" />
              Create new link type
            </button>
          ) : null}
        </div>
      ) : (
        <LinkList
          links={links}
          typeById={typeById}
          selectedLinkId={selectedLinkId ?? null}
          onSelect={onSelectLink}
        />
      )}
    </section>
  );
}

function ModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: LinkPanelMode;
  onChange: (next: LinkPanelMode) => void;
  className?: string;
}) {
  const wrap = [
    "inline-flex h-7 rounded-of-sm overflow-hidden",
    "border border-of-border bg-of-surface-raised",
  ];
  if (className) wrap.push(className);

  return (
    <div className={wrap.join(" ")} role="group" aria-label="View mode">
      <ToggleButton
        active={mode === "graph"}
        onClick={() => onChange("graph")}
        ariaLabel="Graph view"
      >
        <Glyph name="graph" size={14} tone="currentColor" />
      </ToggleButton>
      <ToggleButton
        active={mode === "list"}
        onClick={() => onChange("list")}
        ariaLabel="List view"
      >
        <Glyph name="list" size={14} tone="currentColor" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  const cls = [
    "inline-flex items-center justify-center w-7 h-full transition-colors",
    active
      ? "bg-of-accent-soft text-of-accent"
      : "text-of-text-muted hover:text-of-text",
  ].join(" ");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cls}
    >
      {children}
    </button>
  );
}

function CanvasButton({
  ariaLabel,
  onClick,
  children,
}: {
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        "inline-flex items-center justify-center w-7 h-7 rounded-of-sm",
        "bg-of-surface-raised border border-of-border shadow-of-sm",
        "text-of-text-muted hover:text-of-text hover:border-of-border-strong",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function LinkList({
  links,
  typeById,
  selectedLinkId,
  onSelect,
}: {
  links: LinkType[];
  typeById: Map<string, ObjectType>;
  selectedLinkId: string | null;
  onSelect?: (link: LinkType) => void;
}) {
  if (links.length === 0) {
    return (
      <p className="px-2 py-4 text-of-13 text-of-text-muted">
        No link types yet.
      </p>
    );
  }
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-px">
      {links.map((link) => {
        const selected = link.id === selectedLinkId;
        const source =
          typeById.get(link.source_type_id)?.display_name ?? link.source_type_id;
        const target =
          typeById.get(link.target_type_id)?.display_name ?? link.target_type_id;
        const cls = [
          "w-full flex items-center gap-2 px-2 h-9 rounded-of-sm text-left",
          selected
            ? "bg-of-accent-soft text-of-accent"
            : "text-of-text hover:bg-of-surface-muted",
        ].join(" ");
        return (
          <li key={link.id}>
            <button
              type="button"
              onClick={onSelect ? () => onSelect(link) : undefined}
              className={cls}
            >
              <Glyph name="link" size={12} tone="currentColor" />
              <span className="text-of-13 font-of-medium truncate">
                {source} → {target}
              </span>
              <span className="ml-auto text-of-12 text-of-text-muted truncate">
                {link.display_name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function buildLinkGraph(
  currentType: ObjectType,
  links: LinkType[],
  typeById: Map<string, ObjectType>,
): {
  elements: ElementDefinition[];
  stylesheet: StylesheetStyle[];
  layout: { name: string; roots?: string; padding?: number; spacingFactor?: number };
} {
  const nodeIds = new Set<string>([currentType.id]);
  const elements: ElementDefinition[] = [];

  for (const link of links) {
    nodeIds.add(link.source_type_id);
    nodeIds.add(link.target_type_id);
  }

  for (const nodeId of nodeIds) {
    const ot = typeById.get(nodeId);
    elements.push({
      data: {
        id: nodeId,
        label: ot?.display_name ?? ot?.name ?? nodeId,
      },
      classes: nodeId === currentType.id ? "central" : "neighbor",
    });
  }

  for (const link of links) {
    elements.push({
      data: {
        id: link.id,
        source: link.source_type_id,
        target: link.target_type_id,
        label: link.display_name,
      },
    });
  }

  const stylesheet = [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": "#ffffff",
        "border-width": 1,
        "border-color": "#e5e8eb",
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": 11,
        "font-family": "var(--font-sans)",
        color: "#1c2127",
        width: "label",
        height: 28,
        padding: 8,
      },
    },
    {
      selector: "node.central",
      style: {
        "background-color": "#e8f0fb",
        "border-color": "#215db0",
        "border-width": 2,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#cdd2d8",
        "curve-style": "straight",
        "target-arrow-shape": "none",
      },
    },
  ] as unknown as StylesheetStyle[];

  return {
    elements,
    stylesheet,
    layout: {
      name: "breadthfirst",
      roots: `#${currentType.id}`,
      padding: 30,
      spacingFactor: 1.2,
    },
  };
}
