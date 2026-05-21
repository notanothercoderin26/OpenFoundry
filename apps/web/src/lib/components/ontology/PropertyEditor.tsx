import { useMemo, useState, type ReactNode } from "react";

import type {
  ObjectTypeBinding,
  Property,
} from "@/lib/api/ontology";
import type { Dataset } from "@/lib/api/datasets";
import { Badge } from "@components/ui/Badge";
import { Glyph } from "@components/ui/Glyph";

/* ------------------------------------------------------------------------- */
/* Shared property-type icon                                                  */
/* ------------------------------------------------------------------------- */

interface PropertyTypeAppearance {
  label: string;
  bg: string;
  fg: string;
  monospace: boolean;
}

export function appearanceForProperty(
  property: Property,
): PropertyTypeAppearance {
  const base = (
    property.base_type ?? property.property_type ?? ""
  ).toLowerCase();
  if (base === "string" || base === "text" || base === "uuid" || base === "rid") {
    return { label: "“”", bg: "#eef0f3", fg: "#5f6b7c", monospace: true };
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
    return { label: "📅", bg: "#fef3c7", fg: "#9a5b00", monospace: false };
  }
  if (base === "geo" || base === "geohash" || base === "geoshape") {
    return { label: "@", bg: "#e0f2fe", fg: "#0284c7", monospace: false };
  }
  if (base === "array" || property.is_array) {
    return { label: "[ ]", bg: "#e0e7ff", fg: "#4f46e5", monospace: true };
  }
  return { label: "“”", bg: "#eef0f3", fg: "#5f6b7c", monospace: true };
}

export function PropertyTypeIcon({
  property,
  size = 20,
}: {
  property: Property;
  size?: number;
}) {
  const a = appearanceForProperty(property);
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-of-sm"
      style={{
        width: size,
        height: size,
        background: a.bg,
        color: a.fg,
        fontFamily: a.monospace ? "var(--font-mono)" : undefined,
        fontWeight: 600,
        fontSize: size <= 18 ? 10 : 11,
      }}
      aria-hidden
      title={property.base_type ?? property.property_type ?? "value"}
    >
      {a.label}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Main editor                                                                */
/* ------------------------------------------------------------------------- */

export interface PropertyEditorProps {
  properties: Property[];
  primaryKeyName?: string | null;
  titleKeyName?: string | null;
  bindings?: ObjectTypeBinding[];
  datasets?: Dataset[];
  onCreate?: () => void;
  onPropertySelect?: (property: Property) => void;
  onPropertyDelete?: (property: Property) => void;
  /** Bulk action handler when one or more rows are checkbox-selected. */
  onBulkAction?: (
    action: "delete" | "hide" | "show",
    propertyIds: string[],
  ) => void;
  /** Preview source-table button (right cluster). */
  onPreviewObjects?: () => void;
  onPreviewTable?: () => void;
  onAutomap?: () => void;
}

export function PropertyEditor({
  properties,
  primaryKeyName,
  titleKeyName,
  bindings,
  datasets,
  onCreate,
  onPropertySelect,
  onPropertyDelete,
  onBulkAction,
  onPreviewObjects,
  onPreviewTable,
  onAutomap,
}: PropertyEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    properties[0]?.id ?? null,
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showMapped, setShowMapped] = useState(true);
  const [search, setSearch] = useState("");

  const visibleProperties = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return properties;
    return properties.filter((entry) =>
      [entry.display_name, entry.name, entry.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [properties, search]);

  const mappedCount = useMemo(
    () =>
      properties.filter((property) => Boolean(propertyColumn(property))).length,
    [properties],
  );

  const selected = useMemo(
    () => properties.find((entry) => entry.id === selectedId) ?? null,
    [properties, selectedId],
  );

  const select = (property: Property) => {
    setSelectedId(property.id);
    onPropertySelect?.(property);
  };

  const toggleCheck = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked((current) =>
      current.size === visibleProperties.length
        ? new Set()
        : new Set(visibleProperties.map((entry) => entry.id)),
    );
  };

  return (
    <div className="flex flex-col h-full min-h-[640px]">
      <div className="flex flex-1 min-h-0 gap-3">
        <PropertyEditorTable
          properties={visibleProperties}
          total={properties.length}
          mappedCount={mappedCount}
          search={search}
          onSearchChange={setSearch}
          selectedId={selectedId}
          checked={checked}
          onCheck={toggleCheck}
          onCheckAll={toggleAll}
          primaryKeyName={primaryKeyName}
          titleKeyName={titleKeyName}
          onSelect={select}
          onCreate={onCreate}
          onBulkAction={onBulkAction}
        />
        {selected ? (
          <PropertyEditorDrawer
            property={selected}
            isPrimaryKey={primaryKeyName === selected.name}
            isTitle={titleKeyName === selected.name}
            onDelete={onPropertyDelete ? () => onPropertyDelete(selected) : undefined}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
      <PropertyEditorFooter
        bindings={bindings}
        datasets={datasets}
        showMapped={showMapped}
        onShowMappedChange={setShowMapped}
        onAutomap={onAutomap}
        onPreviewObjects={onPreviewObjects}
        onPreviewTable={onPreviewTable}
        properties={properties}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Table                                                                      */
/* ------------------------------------------------------------------------- */

interface TableProps {
  properties: Property[];
  total: number;
  mappedCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  checked: Set<string>;
  onCheck: (id: string) => void;
  onCheckAll: () => void;
  primaryKeyName?: string | null;
  titleKeyName?: string | null;
  onSelect: (property: Property) => void;
  onCreate?: () => void;
  onBulkAction?: (
    action: "delete" | "hide" | "show",
    propertyIds: string[],
  ) => void;
}

function PropertyEditorTable({
  properties,
  total,
  mappedCount,
  search,
  onSearchChange,
  selectedId,
  checked,
  onCheck,
  onCheckAll,
  primaryKeyName,
  titleKeyName,
  onSelect,
  onCreate,
  onBulkAction,
}: TableProps) {
  const allChecked = properties.length > 0 && checked.size === properties.length;
  const checkedIds = useMemo(() => Array.from(checked), [checked]);

  return (
    <section
      className={[
        "flex-1 min-w-0 flex flex-col",
        "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "overflow-hidden",
      ].join(" ")}
      aria-label="Properties"
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-of-border">
        <h2 className="text-of-16 font-of-semibold text-of-text">Properties</h2>
        <span className="text-of-13 text-of-text-muted tabular-nums">
          {total}
        </span>
        <span className="text-of-12 text-of-text-muted">
          {mappedCount} of {total} Columns mapped
        </span>
        <div className="ml-auto flex items-center gap-2">
          {onCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className={[
                "inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
                "bg-of-accent hover:bg-of-accent-hover text-of-text-inverse",
                "text-of-12 font-of-semibold",
              ].join(" ")}
            >
              <Glyph name="plus" size={12} tone="#ffffff" />
              Create property
            </button>
          ) : null}
          <SearchBox value={search} onChange={onSearchChange} />
          <FilterButton />
        </div>
      </header>

      {checked.size > 0 && onBulkAction ? (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-of-border bg-of-accent-soft text-of-12 text-of-accent">
          <span className="font-of-semibold">{checked.size} selected</span>
          <button
            type="button"
            onClick={() => onBulkAction("hide", checkedIds)}
            className="ml-2 underline-offset-2 hover:underline"
          >
            Hide
          </button>
          <button
            type="button"
            onClick={() => onBulkAction("show", checkedIds)}
            className="hover:underline"
          >
            Show
          </button>
          <button
            type="button"
            onClick={() => onBulkAction("delete", checkedIds)}
            className="hover:underline text-of-danger"
          >
            Delete
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-of-surface text-of-12 text-of-text-muted">
            <tr>
              <th className="w-8 px-2 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={onCheckAll}
                  aria-label="Select all"
                  className="align-middle"
                />
              </th>
              <th className="text-left px-2 py-2 font-of-medium">
                Property name
              </th>
              <th className="text-left px-2 py-2 font-of-medium">Status</th>
              <th className="text-left px-2 py-2 font-of-medium">Visibility</th>
              <th className="text-left px-2 py-2 font-of-medium">
                Base formatter
              </th>
              <th className="text-left px-2 py-2 font-of-medium">Column</th>
              <th className="w-10 px-2 py-2" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {properties.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-of-13 text-of-text-muted text-center"
                >
                  No properties.
                </td>
              </tr>
            ) : (
              properties.map((property) => {
                const selected = property.id === selectedId;
                const isChecked = checked.has(property.id);
                const isPk = primaryKeyName === property.name;
                const isTitle = titleKeyName === property.name;
                const column = propertyColumn(property);
                const visibility = (property.display_mode ?? "normal").toString();
                const formatter = propertyFormatter(property);
                const status = propertyStatus(property);
                return (
                  <tr
                    key={property.id}
                    onClick={() => onSelect(property)}
                    className={[
                      "border-t border-of-border cursor-pointer transition-colors",
                      selected
                        ? "bg-of-accent-soft"
                        : "hover:bg-of-surface-muted",
                    ].join(" ")}
                  >
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onCheck(property.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${property.display_name || property.name}`}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <PropertyTypeIcon property={property} />
                        <span className="text-of-13 text-of-text truncate">
                          {property.display_name || property.name}
                        </span>
                        {isTitle ? <Badge variant="title" /> : null}
                        {isPk ? <Badge variant="primary-key" /> : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <Badge
                        variant={
                          status === "experimental"
                            ? "experimental"
                            : status === "deprecated"
                              ? "disabled"
                              : "active"
                        }
                      >
                        {status === "experimental"
                          ? "Experimental"
                          : status === "deprecated"
                            ? "Deprecated"
                            : "Active"}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <VisibilityCell visibility={visibility} />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <span className="inline-flex items-center gap-1 text-of-13 text-of-text">
                        {formatter}
                        <Glyph
                          name="chevron-down"
                          size={11}
                          tone="var(--of-text-muted)"
                        />
                      </span>
                    </td>
                    <td className="px-2 py-2 align-middle text-of-13 text-of-text font-mono truncate">
                      {column ?? <span className="text-of-text-soft">—</span>}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Row actions"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
                      >
                        <Glyph name="settings" size={13} tone="currentColor" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VisibilityCell({ visibility }: { visibility: string }) {
  const v = visibility.toLowerCase();
  if (v === "hidden") return <Badge variant="visibility-hidden" />;
  if (v === "prominent") return <Badge variant="visibility-prominent" />;
  return <Badge variant="visibility-normal" />;
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
        "border border-of-border bg-of-surface-raised",
      ].join(" ")}
    >
      <Glyph name="search" size={12} tone="var(--of-text-muted)" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search…"
        className="w-32 bg-transparent border-0 outline-none text-of-12 text-of-text placeholder:text-of-text-soft"
      />
    </span>
  );
}

function FilterButton() {
  return (
    <button
      type="button"
      aria-label="Filter properties"
      className={[
        "inline-flex items-center justify-center w-7 h-7 rounded-of-sm",
        "border border-of-border bg-of-surface-raised text-of-text-muted hover:text-of-text",
      ].join(" ")}
    >
      <Glyph name="list" size={13} tone="currentColor" />
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Drawer                                                                     */
/* ------------------------------------------------------------------------- */

interface DrawerProps {
  property: Property;
  isPrimaryKey: boolean;
  isTitle: boolean;
  onClose: () => void;
  onDelete?: () => void;
}

function PropertyEditorDrawer({
  property,
  isPrimaryKey,
  isTitle,
  onClose,
  onDelete,
}: DrawerProps) {
  return (
    <aside
      className={[
        "shrink-0 w-[420px] flex flex-col",
        "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "overflow-hidden",
      ].join(" ")}
      aria-label="Property detail"
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-of-border">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
        >
          <Glyph name="chevron-left" size={14} tone="currentColor" />
        </button>
        <PropertyTypeIcon property={property} size={20} />
        <span className="text-of-14 font-of-semibold text-of-text truncate">
          {property.display_name || property.name}
        </span>
        {isTitle ? <Badge variant="title" /> : null}
        {isPrimaryKey ? <Badge variant="primary-key" /> : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete property"
            className="ml-auto inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-danger-soft hover:text-of-danger"
          >
            <Glyph name="trash" size={14} tone="currentColor" />
          </button>
        ) : null}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <p className="text-of-13 text-of-text-muted">
          Detail editor (General / Display / Interaction / Details / Advanced)
          lands in the next iteration. Selected property:{" "}
          <span className="font-mono">{property.name}</span>.
        </p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------- */
/* Footer (source-table preview)                                              */
/* ------------------------------------------------------------------------- */

interface FooterProps {
  bindings?: ObjectTypeBinding[];
  datasets?: Dataset[];
  showMapped: boolean;
  onShowMappedChange: (next: boolean) => void;
  onAutomap?: () => void;
  onPreviewObjects?: () => void;
  onPreviewTable?: () => void;
  properties: Property[];
}

function PropertyEditorFooter({
  bindings,
  datasets,
  showMapped,
  onShowMappedChange,
  onAutomap,
  onPreviewObjects,
  onPreviewTable,
  properties,
}: FooterProps) {
  const binding = bindings?.[0];
  const dataset = binding
    ? datasets?.find((entry) => entry.id === binding.dataset_id)
    : undefined;
  const datasetName = dataset?.name ?? binding?.dataset_id ?? "No dataset bound";

  const mappedColumns = useMemo(() => {
    const set = new Set<string>();
    for (const property of properties) {
      const column = propertyColumn(property);
      if (column) set.add(column);
    }
    return set;
  }, [properties]);

  return (
    <section
      className={[
        "mt-3 flex flex-col",
        "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
        "overflow-hidden",
      ].join(" ")}
      aria-label="Source dataset preview"
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-of-border">
        <span className="inline-flex items-center gap-1.5">
          <Glyph name="spreadsheet" size={14} tone="var(--of-text-muted)" />
          <span className="text-of-13 font-of-medium text-of-text truncate">
            {datasetName}
          </span>
          <Glyph name="chevron-down" size={11} tone="var(--of-text-muted)" />
        </span>
        <label className="ml-3 inline-flex items-center gap-2 text-of-12 text-of-text">
          <Switch checked={showMapped} onChange={onShowMappedChange} />
          Show mapped columns
        </label>
        <button
          type="button"
          onClick={onAutomap}
          disabled={!onAutomap}
          className={[
            "ml-2 inline-flex items-center justify-center h-7 px-2.5 rounded-of-sm",
            "border border-of-border bg-of-surface-raised text-of-12 font-of-medium",
            "text-of-text hover:border-of-border-strong",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          Automap all
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onPreviewObjects}
            disabled={!onPreviewObjects}
            className={[
              "inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
              "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            Preview objects
          </button>
          <button
            type="button"
            onClick={onPreviewTable}
            disabled={!onPreviewTable}
            className={[
              "inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
              "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            Preview table
            <Glyph name="chevron-down" size={11} tone="currentColor" />
          </button>
        </div>
      </header>

      <div className="px-3 py-2 text-of-12 text-of-text-muted">
        {binding ? (
          <>
            <span className="font-of-medium text-of-text">
              {mappedColumns.size}
            </span>{" "}
            columns mapped to properties.
            {showMapped ? null : " Toggle off to see unmapped columns too."}
          </>
        ) : (
          "Bind a dataset to preview rows here."
        )}
      </div>
    </section>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex items-center w-7 h-4 rounded-full transition-colors",
        checked ? "bg-of-accent" : "bg-of-border-strong",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
          checked ? "left-3.5" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function propertyColumn(property: Property): string | null {
  // Best-effort: pick up a source column hint when the property carries one.
  // Falls back to the property name (Foundry's default for inferred mappings).
  const explicit = (
    property as unknown as { source_column?: string | null; column?: string | null }
  );
  if (explicit.source_column) return explicit.source_column;
  if (explicit.column) return explicit.column;
  return property.name;
}

function propertyFormatter(property: Property): ReactNode {
  const formatting = property.value_formatting as
    | { type?: string }
    | undefined;
  if (formatting && typeof formatting === "object" && formatting.type) {
    return formatting.type;
  }
  return "No formatting";
}

function propertyStatus(property: Property): string {
  const status = (
    property as unknown as { status?: string }
  ).status?.toLowerCase();
  if (status === "active" || status === "experimental" || status === "deprecated") {
    return status;
  }
  return "experimental";
}
