import { useMemo, useState, type ReactNode } from "react";

import type {
  ActionType,
  LinkType,
  ObjectType,
  OntologyCleanupCandidate,
  OntologyHealthIssue,
  OntologyInterface,
  OntologyObjectTypeGroup,
  OntologyValueType,
  Property,
  SharedPropertyType,
} from "@/lib/api/ontology";
import { linkTypeCardinalityLabel } from "@/lib/api/ontology";
import { ontologyGroupColor } from "@components/ontology/groupColors";
import { Badge } from "@components/ui/Badge";
import { Glyph, type GlyphName } from "@components/ui/Glyph";
import { GroupChip } from "@components/ui/GroupChip";
import {
  MiniLinkGraph,
  type MiniLinkGraphEdge,
  type MiniLinkGraphNode,
} from "@components/ui/MiniLinkGraph";
import { ResourceCard } from "@components/ui/ResourceCard";
import { ResourceIcon } from "@components/ui/ResourceIcon";

/* ------------------------------------------------------------------------- */
/* Shared header                                                              */
/* ------------------------------------------------------------------------- */

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDef {
  id: string;
  label: string;
  options: FilterOption[];
}

interface ListHeaderProps {
  title: string;
  total: number;
  search: string;
  onSearchChange: (next: string) => void;
  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  onFilterChange?: (id: string, value: string) => void;
  viewMode?: "list" | "grid";
  onViewModeChange?: (mode: "list" | "grid") => void;
  trailing?: ReactNode;
}

function ListHeader({
  title,
  total,
  search,
  onSearchChange,
  filters,
  filterValues,
  onFilterChange,
  viewMode,
  onViewModeChange,
  trailing,
}: ListHeaderProps) {
  return (
    <header className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-of-border">
      <h2 className="text-of-16 font-of-semibold text-of-text">{title}</h2>
      <span className="text-of-13 text-of-text-muted tabular-nums">{total}</span>
      <div className="ml-auto flex items-center gap-2 flex-wrap">
        {filters?.map((filter) => (
          <FilterDropdown
            key={filter.id}
            filter={filter}
            value={filterValues?.[filter.id] ?? ""}
            onChange={(value) => onFilterChange?.(filter.id, value)}
          />
        ))}
        <SearchInput value={search} onChange={onSearchChange} />
        {onViewModeChange ? (
          <ViewToggle mode={viewMode ?? "list"} onChange={onViewModeChange} />
        ) : null}
        {trailing}
      </div>
    </header>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm",
        "border border-of-border bg-of-surface-raised",
      ].join(" ")}
    >
      <Glyph name="search" size={12} tone="var(--of-text-muted)" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search…"
        className="w-36 bg-transparent border-0 outline-none text-of-12 text-of-text placeholder:text-of-text-soft"
      />
    </span>
  );
}

function FilterDropdown({
  filter,
  value,
  onChange,
}: {
  filter: FilterDef;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm",
        "border border-of-border bg-of-surface-raised text-of-12 text-of-text",
      ].join(" ")}
    >
      <span className="text-of-text-muted">{filter.label}:</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent border-0 outline-none text-of-12 text-of-text appearance-none pr-2"
      >
        {filter.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Glyph name="chevron-down" size={11} tone="var(--of-text-muted)" />
    </span>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: "list" | "grid";
  onChange: (mode: "list" | "grid") => void;
}) {
  return (
    <div
      className="inline-flex h-7 rounded-of-sm overflow-hidden border border-of-border bg-of-surface-raised"
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-pressed={mode === "list"}
        aria-label="List view"
        className={[
          "inline-flex items-center justify-center w-7 h-full",
          mode === "list"
            ? "bg-of-accent-soft text-of-accent"
            : "text-of-text-muted hover:text-of-text",
        ].join(" ")}
      >
        <Glyph name="list" size={13} tone="currentColor" />
      </button>
      <button
        type="button"
        onClick={() => onChange("grid")}
        aria-pressed={mode === "grid"}
        aria-label="Grid view"
        className={[
          "inline-flex items-center justify-center w-7 h-full",
          mode === "grid"
            ? "bg-of-accent-soft text-of-accent"
            : "text-of-text-muted hover:text-of-text",
        ].join(" ")}
      >
        <Glyph name="view-grid" size={13} tone="currentColor" />
      </button>
    </div>
  );
}

interface ListColumn<T> {
  id: string;
  header: ReactNode;
  width?: string;
  cell: (item: T) => ReactNode;
}

interface ListTableProps<T> {
  items: ReadonlyArray<T>;
  columns: Array<ListColumn<T>>;
  onPick?: (item: T) => void;
  emptyMessage?: string;
  keyOf: (item: T) => string;
}

function ListTable<T>({
  items,
  columns,
  onPick,
  emptyMessage,
  keyOf,
}: ListTableProps<T>) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-of-13 text-of-text-muted text-center">
        {emptyMessage ?? "No items."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-of-surface text-of-12 text-of-text-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className="text-left px-3 py-2 font-of-medium"
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-of-13 text-of-text">
          {items.map((item) => (
            <tr
              key={keyOf(item)}
              onClick={onPick ? () => onPick(item) : undefined}
              className={[
                "border-t border-of-border transition-colors",
                onPick ? "cursor-pointer hover:bg-of-surface-muted" : "",
              ].join(" ")}
            >
              {columns.map((column) => (
                <td key={column.id} className="px-3 py-2 align-middle">
                  {column.cell(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PANEL_CLASS =
  "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card overflow-hidden";

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function lower(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function matchesSearch(
  needle: string,
  ...fields: Array<string | null | undefined>
): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  return fields.some((field) => lower(field).includes(n));
}

function nameCell(displayName: string, apiName: string, glyph: GlyphName = "cube", colorKey?: string) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <ResourceIcon
        glyph={glyph}
        colorKey={colorKey ?? displayName}
        size="sm"
        tone="soft"
      />
      <span className="flex flex-col min-w-0">
        <span className="text-of-13 font-of-medium text-of-text truncate">
          {displayName}
        </span>
        <span className="text-of-12 text-of-text-muted font-mono truncate">
          {apiName}
        </span>
      </span>
    </span>
  );
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const ms = Date.now() - date.getTime();
  const day = 86_400_000;
  if (ms < day) return "today";
  if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
  if (ms < 365 * day) return `${Math.floor(ms / (30 * day))}mo ago`;
  return `${Math.floor(ms / (365 * day))}y ago`;
}

/* ------------------------------------------------------------------------- */
/* Object types                                                               */
/* ------------------------------------------------------------------------- */

interface ObjectTypesListPanelProps {
  objectTypes: ObjectType[];
  groups: OntologyObjectTypeGroup[];
  onPick: (objectType: ObjectType) => void;
}

export function ObjectTypesListPanel({
  objectTypes,
  groups,
  onPick,
}: ObjectTypesListPanelProps) {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const groupOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "All" },
      ...groups.map((entry) => ({
        value: entry.name,
        label: entry.display_name || entry.name,
      })),
    ],
    [groups],
  );

  const visible = useMemo(() => {
    return objectTypes.filter((entry) => {
      if (
        groupFilter !== "all" &&
        !(entry.group_names ?? []).includes(groupFilter)
      ) {
        return false;
      }
      if (
        statusFilter !== "all" &&
        (entry.status ?? "active").toLowerCase() !== statusFilter
      ) {
        return false;
      }
      if (
        visibilityFilter !== "all" &&
        (entry.visibility ?? "normal").toLowerCase() !== visibilityFilter
      ) {
        return false;
      }
      return matchesSearch(
        search,
        entry.display_name,
        entry.name,
        entry.description,
      );
    });
  }, [objectTypes, groupFilter, statusFilter, visibilityFilter, search]);

  const groupById = useMemo(
    () => new Map(groups.map((entry) => [entry.name, entry])),
    [groups],
  );

  return (
    <section className={PANEL_CLASS} aria-label="Object types">
      <ListHeader
        title="Object types"
        total={objectTypes.length}
        search={search}
        onSearchChange={setSearch}
        filters={[
          { id: "group", label: "Group", options: groupOptions },
          {
            id: "status",
            label: "Status",
            options: [
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "experimental", label: "Experimental" },
              { value: "deprecated", label: "Deprecated" },
            ],
          },
          {
            id: "visibility",
            label: "Visibility",
            options: [
              { value: "all", label: "All" },
              { value: "normal", label: "Normal" },
              { value: "hidden", label: "Hidden" },
              { value: "prominent", label: "Prominent" },
            ],
          },
        ]}
        filterValues={{
          group: groupFilter,
          status: statusFilter,
          visibility: visibilityFilter,
        }}
        onFilterChange={(id, value) => {
          if (id === "group") setGroupFilter(value);
          else if (id === "status") setStatusFilter(value);
          else if (id === "visibility") setVisibilityFilter(value);
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === "grid" ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((entry) => {
            const groupName = entry.group_names?.[0];
            const group = groupName ? groupById.get(groupName) : undefined;
            const color = ontologyGroupColor(
              group?.display_name ?? groupName ?? entry.display_name,
            );
            return (
              <ResourceCard
                key={entry.id}
                name={entry.display_name || entry.name}
                glyph="cube"
                iconColor={color}
                group={
                  group
                    ? {
                        name: group.display_name || group.name,
                        count:
                          group.object_type_count ??
                          group.object_type_ids?.length ??
                          0,
                        color,
                      }
                    : undefined
                }
                description={entry.description}
                onClick={() => onPick(entry)}
              />
            );
          })}
        </div>
      ) : (
        <ListTable
          items={visible}
          keyOf={(entry) => entry.id}
          onPick={onPick}
          emptyMessage="No object types match the filters."
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (entry) =>
                nameCell(
                  entry.display_name || entry.name,
                  entry.name,
                  "cube",
                  entry.group_names?.[0] ?? entry.display_name,
                ),
            },
            {
              id: "group",
              header: "Group",
              cell: (entry) => {
                const groupName = entry.group_names?.[0];
                if (!groupName) return <span className="text-of-text-soft">—</span>;
                const group = groupById.get(groupName);
                return (
                  <GroupChip
                    name={group?.display_name ?? groupName}
                    size="sm"
                  />
                );
              },
            },
            {
              id: "status",
              header: "Status",
              cell: (entry) => (
                <Badge
                  variant={
                    (entry.status ?? "active") === "experimental"
                      ? "experimental"
                      : (entry.status ?? "active") === "deprecated"
                        ? "disabled"
                        : "active"
                  }
                >
                  {(entry.status ?? "active").replace(/^\w/, (c) =>
                    c.toUpperCase(),
                  )}
                </Badge>
              ),
            },
            {
              id: "visibility",
              header: "Visibility",
              cell: (entry) => {
                const v = (entry.visibility ?? "normal").toLowerCase();
                return v === "hidden" ? (
                  <Badge variant="visibility-hidden" />
                ) : v === "prominent" ? (
                  <Badge variant="visibility-prominent" />
                ) : (
                  <Badge variant="visibility-normal" />
                );
              },
            },
            {
              id: "updated",
              header: "Updated",
              cell: (entry) => (
                <span className="text-of-12 text-of-text-muted">
                  {formatRelative(entry.updated_at)}
                </span>
              ),
            },
          ]}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Properties (aggregated)                                                    */
/* ------------------------------------------------------------------------- */

interface PropertiesListPanelProps {
  objectTypes: ObjectType[];
  sharedProperties: SharedPropertyType[];
  onPickObjectType?: (id: string) => void;
}

export function PropertiesListPanel({
  objectTypes,
  sharedProperties,
  onPickObjectType,
}: PropertiesListPanelProps) {
  const [search, setSearch] = useState("");
  const aggregated = useMemo(() => {
    const out: Array<{
      key: string;
      property: Property;
      ownerName: string;
      ownerDisplay: string;
      ownerId: string;
      shared: boolean;
    }> = [];
    for (const ot of objectTypes) {
      for (const property of ot.properties ?? []) {
        out.push({
          key: `${ot.id}:${property.id}`,
          property,
          ownerName: ot.name,
          ownerDisplay: ot.display_name || ot.name,
          ownerId: ot.id,
          shared: false,
        });
      }
    }
    for (const shared of sharedProperties) {
      out.push({
        key: `shared:${shared.id}`,
        property: {
          id: shared.id,
          object_type_id: "",
          name: shared.name,
          display_name: shared.display_name,
          description: shared.description,
          property_type: shared.property_type,
          base_type: shared.property_type,
          required: false,
          unique_constraint: false,
          time_dependent: false,
        } as Property,
        ownerName: "—",
        ownerDisplay: "Shared",
        ownerId: "",
        shared: true,
      });
    }
    return out;
  }, [objectTypes, sharedProperties]);

  const visible = useMemo(
    () =>
      aggregated.filter((entry) =>
        matchesSearch(
          search,
          entry.property.display_name,
          entry.property.name,
          entry.ownerDisplay,
        ),
      ),
    [aggregated, search],
  );

  return (
    <section className={PANEL_CLASS} aria-label="Properties">
      <ListHeader
        title="Properties"
        total={aggregated.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.key}
        emptyMessage="No properties found."
        onPick={
          onPickObjectType
            ? (entry) => {
                if (entry.ownerId) onPickObjectType(entry.ownerId);
              }
            : undefined
        }
        columns={[
          {
            id: "name",
            header: "Property name",
            cell: (entry) =>
              nameCell(
                entry.property.display_name || entry.property.name,
                entry.property.name,
              ),
          },
          {
            id: "type",
            header: "Type",
            cell: (entry) => (
              <span className="text-of-12 text-of-text-muted font-mono">
                {entry.property.base_type ?? entry.property.property_type}
              </span>
            ),
          },
          {
            id: "owner",
            header: "Object type",
            cell: (entry) =>
              entry.shared ? (
                <Badge variant="title">Shared</Badge>
              ) : (
                <span className="text-of-13 text-of-text">
                  {entry.ownerDisplay}
                </span>
              ),
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Shared properties                                                          */
/* ------------------------------------------------------------------------- */

interface SharedPropertiesListPanelProps {
  sharedProperties: SharedPropertyType[];
  objectTypes: ObjectType[];
}

export function SharedPropertiesListPanel({
  sharedProperties,
  objectTypes,
}: SharedPropertiesListPanelProps) {
  const [search, setSearch] = useState("");

  const usedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ot of objectTypes) {
      for (const property of ot.properties ?? []) {
        const id = property.shared_property_type_id;
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [objectTypes]);

  const visible = useMemo(
    () =>
      sharedProperties.filter((entry) =>
        matchesSearch(search, entry.display_name, entry.name, entry.description),
      ),
    [sharedProperties, search],
  );

  return (
    <section className={PANEL_CLASS} aria-label="Shared Properties">
      <ListHeader
        title="Shared Properties"
        total={sharedProperties.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        emptyMessage="No shared properties."
        columns={[
          {
            id: "name",
            header: "Shared property",
            cell: (entry) => nameCell(entry.display_name, entry.name, "ontology"),
          },
          {
            id: "type",
            header: "Type",
            cell: (entry) => (
              <span className="text-of-12 text-of-text-muted font-mono">
                {entry.property_type}
              </span>
            ),
          },
          {
            id: "used",
            header: "Used by",
            cell: (entry) => {
              const count = usedCounts.get(entry.id) ?? 0;
              return (
                <span className="text-of-13 text-of-text tabular-nums">
                  {count} object type{count === 1 ? "" : "s"}
                </span>
              );
            },
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Link types                                                                 */
/* ------------------------------------------------------------------------- */

interface LinkTypesListPanelProps {
  linkTypes: LinkType[];
  typeById: Map<string, ObjectType>;
  onPick: (link: LinkType) => void;
}

export function LinkTypesListPanel({
  linkTypes,
  typeById,
  onPick,
}: LinkTypesListPanelProps) {
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      linkTypes.filter((entry) =>
        matchesSearch(search, entry.display_name, entry.name, entry.description),
      ),
    [linkTypes, search],
  );

  return (
    <section className={PANEL_CLASS} aria-label="Link types">
      <ListHeader
        title="Link types"
        total={linkTypes.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        onPick={onPick}
        emptyMessage="No link types defined."
        columns={[
          {
            id: "name",
            header: "Link",
            cell: (link) => nameCell(link.display_name, link.name, "link"),
          },
          {
            id: "endpoints",
            header: "Endpoints",
            cell: (link) => {
              const source =
                typeById.get(link.source_type_id)?.display_name ??
                link.source_type_id;
              const target =
                typeById.get(link.target_type_id)?.display_name ??
                link.target_type_id;
              return (
                <span className="text-of-13 text-of-text">
                  {source} → {target}
                </span>
              );
            },
          },
          {
            id: "cardinality",
            header: "Cardinality",
            cell: (link) => (
              <Badge variant="visibility-normal">
                {linkTypeCardinalityLabel(String(link.cardinality))}
              </Badge>
            ),
          },
          {
            id: "preview",
            header: "Preview",
            cell: (link) => {
              const source = typeById.get(link.source_type_id);
              const target = typeById.get(link.target_type_id);
              if (!source || !target) {
                return (
                  <span className="text-of-12 text-of-text-soft">—</span>
                );
              }
              const nodes: MiniLinkGraphNode[] = [
                {
                  id: source.id,
                  label: source.display_name || source.name,
                  glyph: "cube",
                  colorKey: source.display_name,
                },
                {
                  id: target.id,
                  label: target.display_name || target.name,
                  glyph: "cube",
                  colorKey: target.display_name,
                },
              ];
              const edges: MiniLinkGraphEdge[] = [
                {
                  from: source.id,
                  to: target.id,
                  label: cardinalityArrowChar(String(link.cardinality)),
                },
              ];
              return (
                <MiniLinkGraph
                  nodes={nodes}
                  edges={edges}
                  width={260}
                  height={56}
                />
              );
            },
          },
        ]}
      />
    </section>
  );
}

function cardinalityArrowChar(c: string): string {
  if (c === "one_to_one" || c === "many_to_one") return "1";
  return "*";
}

/* ------------------------------------------------------------------------- */
/* Action types                                                               */
/* ------------------------------------------------------------------------- */

interface ActionTypesListPanelProps {
  actionTypes: ActionType[];
  typeById: Map<string, ObjectType>;
  onPick: (action: ActionType) => void;
}

export function ActionTypesListPanel({
  actionTypes,
  typeById,
  onPick,
}: ActionTypesListPanelProps) {
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      actionTypes.filter((entry) =>
        matchesSearch(search, entry.display_name, entry.name, entry.description),
      ),
    [actionTypes, search],
  );
  return (
    <section className={PANEL_CLASS} aria-label="Action types">
      <ListHeader
        title="Action types"
        total={actionTypes.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        onPick={onPick}
        emptyMessage="No action types defined."
        columns={[
          {
            id: "name",
            header: "Action",
            cell: (entry) => nameCell(entry.display_name, entry.name, "pencil"),
          },
          {
            id: "object",
            header: "Object type",
            cell: (entry) => (
              <span className="text-of-13 text-of-text">
                {typeById.get(entry.object_type_id)?.display_name ??
                  entry.object_type_id}
              </span>
            ),
          },
          {
            id: "params",
            header: "Parameters",
            cell: (entry) => (
              <span className="text-of-13 text-of-text tabular-nums">
                {entry.input_schema?.length ?? 0}
              </span>
            ),
          },
          {
            id: "modified",
            header: "Last modified",
            cell: (entry) => (
              <span className="text-of-12 text-of-text-muted">
                {formatRelative(entry.updated_at)}
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Interfaces                                                                 */
/* ------------------------------------------------------------------------- */

interface InterfacesListPanelProps {
  interfaces: OntologyInterface[];
  objectTypes: ObjectType[];
  onPick?: (entry: OntologyInterface) => void;
}

export function InterfacesListPanel({
  interfaces,
  objectTypes,
  onPick,
}: InterfacesListPanelProps) {
  const [search, setSearch] = useState("");
  const implCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ot of objectTypes) {
      for (const impl of (ot as unknown as { implemented_interface_ids?: string[] })
        .implemented_interface_ids ?? []) {
        counts.set(impl, (counts.get(impl) ?? 0) + 1);
      }
    }
    return counts;
  }, [objectTypes]);
  const visible = useMemo(
    () =>
      interfaces.filter((entry) =>
        matchesSearch(search, entry.display_name, entry.name, entry.description),
      ),
    [interfaces, search],
  );
  return (
    <section className={PANEL_CLASS} aria-label="Interfaces">
      <ListHeader
        title="Interfaces"
        total={interfaces.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        onPick={onPick}
        emptyMessage="No interfaces defined."
        columns={[
          {
            id: "name",
            header: "Interface",
            cell: (entry) =>
              nameCell(entry.display_name, entry.name, "artifact"),
          },
          {
            id: "props",
            header: "Properties",
            cell: (entry) => (
              <span className="text-of-13 text-of-text tabular-nums">
                {(entry as unknown as { properties?: unknown[] }).properties
                  ?.length ?? 0}
              </span>
            ),
          },
          {
            id: "implementations",
            header: "Implementations",
            cell: (entry) => (
              <span className="text-of-13 text-of-text tabular-nums">
                {implCounts.get(entry.id) ?? 0} object types
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Value types                                                                */
/* ------------------------------------------------------------------------- */

interface ValueTypesListPanelProps {
  valueTypes: OntologyValueType[];
}

export function ValueTypesListPanel({ valueTypes }: ValueTypesListPanelProps) {
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      valueTypes.filter((entry) =>
        matchesSearch(
          search,
          entry.display_name,
          entry.name,
          entry.semantic_type,
          entry.description,
        ),
      ),
    [valueTypes, search],
  );
  return (
    <section className={PANEL_CLASS} aria-label="Value types">
      <ListHeader
        title="Value types"
        total={valueTypes.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        emptyMessage="No value types defined."
        columns={[
          {
            id: "name",
            header: "Value type",
            cell: (entry) => nameCell(entry.display_name, entry.name, "tag"),
          },
          {
            id: "base",
            header: "Base type",
            cell: (entry) => (
              <span className="text-of-12 text-of-text-muted font-mono">
                {entry.base_type}
              </span>
            ),
          },
          {
            id: "semantic",
            header: "Semantic type",
            cell: (entry) => (
              <Badge variant="title">{entry.semantic_type}</Badge>
            ),
          },
          {
            id: "version",
            header: "Version",
            cell: (entry) => (
              <span className="text-of-12 text-of-text-muted">
                v{entry.version}
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Groups                                                                     */
/* ------------------------------------------------------------------------- */

interface GroupsListPanelProps {
  groups: OntologyObjectTypeGroup[];
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  onPick?: (group: OntologyObjectTypeGroup) => void;
}

export function GroupsListPanel({
  groups,
  objectTypes,
  linkTypes,
  onPick,
}: GroupsListPanelProps) {
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      groups.filter((entry) =>
        matchesSearch(search, entry.display_name, entry.name, entry.description),
      ),
    [groups, search],
  );
  return (
    <section className={PANEL_CLASS} aria-label="Groups">
      <ListHeader
        title="Groups"
        total={groups.length}
        search={search}
        onSearchChange={setSearch}
      />
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visible.map((group) => {
          const memberIds = (group.object_type_ids ?? []).slice(0, 6);
          const members = memberIds
            .map((id) => objectTypes.find((entry) => entry.id === id))
            .filter((entry): entry is ObjectType => Boolean(entry));
          const nodes: MiniLinkGraphNode[] = members.map((entry) => ({
            id: entry.id,
            label: entry.display_name || entry.name,
            glyph: "cube",
            colorKey: entry.group_names?.[0] ?? group.display_name,
          }));
          const memberSet = new Set(memberIds);
          const edges: MiniLinkGraphEdge[] = linkTypes
            .filter(
              (lt) =>
                memberSet.has(lt.source_type_id) &&
                memberSet.has(lt.target_type_id),
            )
            .map((lt) => ({
              from: lt.source_type_id,
              to: lt.target_type_id,
              label: cardinalityArrowChar(String(lt.cardinality)),
            }));
          const color = ontologyGroupColor(group.display_name);
          const count =
            group.object_type_count ?? group.object_type_ids?.length ?? 0;
          return (
            <button
              type="button"
              key={group.id}
              onClick={onPick ? () => onPick(group) : undefined}
              className={[
                "flex flex-col gap-3 p-3 text-left min-w-0",
                "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
                onPick ? "hover:border-of-border-strong cursor-pointer" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-of-14 font-of-semibold text-of-text truncate">
                  {group.display_name || group.name}
                </span>
                <span className="text-of-12 text-of-text-muted tabular-nums">
                  {count} types
                </span>
              </div>
              {nodes.length === 0 ? (
                <p className="text-of-12 text-of-text-muted text-center py-3 border border-dashed border-of-border rounded-of-sm">
                  No object types yet
                </p>
              ) : (
                <div className="rounded-of-sm border border-of-border bg-of-surface px-2 py-2">
                  <MiniLinkGraph
                    nodes={nodes}
                    edges={edges}
                    width={420}
                    height={130}
                    className="block w-full"
                  />
                </div>
              )}
              <GroupChip name={group.display_name} count={count} color={color} size="sm" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Functions (stub — no data loaded on the Ontology Manager page yet)         */
/* ------------------------------------------------------------------------- */

export function FunctionsListPanel({
  computeModulesHref = "/compute-modules",
}: { computeModulesHref?: string }) {
  return (
    <section className={PANEL_CLASS} aria-label="Functions">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-of-border">
        <h2 className="text-of-16 font-of-semibold text-of-text">Functions</h2>
      </header>
      <div className="p-6 flex flex-col items-center gap-2 text-center">
        <Glyph name="code" size={28} tone="var(--of-text-soft)" />
        <p className="text-of-14 font-of-semibold text-of-text m-0">
          Function packages live in Compute modules
        </p>
        <p className="text-of-13 text-of-text-muted m-0 max-w-[420px]">
          Browse, version and observe function packages from the Compute
          modules page. Each package gets a dedicated detail view.
        </p>
        <a
          href={computeModulesHref}
          className={[
            "mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm",
            "border border-of-border bg-of-surface-raised text-of-13 font-of-medium text-of-text",
            "hover:border-of-border-strong",
          ].join(" ")}
        >
          Open Compute modules
          <Glyph name="external-link" size={11} tone="currentColor" />
        </a>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Health issues                                                              */
/* ------------------------------------------------------------------------- */

interface HealthIssuesListPanelProps {
  issues: OntologyHealthIssue[];
  onResolve?: (issue: OntologyHealthIssue) => void;
}

export function HealthIssuesListPanel({
  issues,
  onResolve,
}: HealthIssuesListPanelProps) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const visible = useMemo(
    () =>
      issues.filter((entry) => {
        if (severityFilter !== "all" && entry.severity !== severityFilter)
          return false;
        return matchesSearch(
          search,
          entry.resource_label,
          entry.message,
          entry.category_label,
        );
      }),
    [issues, severityFilter, search],
  );
  return (
    <section className={PANEL_CLASS} aria-label="Health issues">
      <ListHeader
        title="Health issues"
        total={issues.length}
        search={search}
        onSearchChange={setSearch}
        filters={[
          {
            id: "severity",
            label: "Severity",
            options: [
              { value: "all", label: "All" },
              { value: "critical", label: "Critical" },
              { value: "warning", label: "Warning" },
              { value: "info", label: "Info" },
            ],
          },
        ]}
        filterValues={{ severity: severityFilter }}
        onFilterChange={(_, value) => setSeverityFilter(value)}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        emptyMessage="No health issues."
        columns={[
          {
            id: "severity",
            header: "Severity",
            cell: (entry) => <SeverityBadge severity={entry.severity} />,
          },
          {
            id: "resource",
            header: "Resource",
            cell: (entry) => (
              <div className="flex flex-col">
                <span className="text-of-13 text-of-text">
                  {entry.resource_label}
                </span>
                <span className="text-of-12 text-of-text-muted">
                  {entry.category_label}
                </span>
              </div>
            ),
          },
          {
            id: "message",
            header: "Issue",
            cell: (entry) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-of-13 text-of-text">{entry.message}</span>
                <span className="text-of-12 text-of-text-muted">
                  {entry.remediation}
                </span>
              </div>
            ),
          },
          {
            id: "actions",
            header: "",
            cell: (entry) =>
              onResolve ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onResolve(entry);
                  }}
                  className={[
                    "inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
                    "text-of-13 font-of-medium text-of-accent hover:bg-of-accent-soft",
                  ].join(" ")}
                >
                  Resolve
                </button>
              ) : null,
          },
        ]}
      />
    </section>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-danger-soft text-of-danger text-of-12 font-of-medium">
        Critical
      </span>
    );
  if (severity === "warning")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-warning-soft text-of-warning text-of-12 font-of-medium">
        Warning
      </span>
    );
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-info-soft text-of-info text-of-12 font-of-medium">
      Info
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* ------------------------------------------------------------------------- */

interface CleanupListPanelProps {
  candidates: OntologyCleanupCandidate[];
  onResolve?: (candidate: OntologyCleanupCandidate) => void;
}

export function CleanupListPanel({
  candidates,
  onResolve,
}: CleanupListPanelProps) {
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      candidates.filter((entry) =>
        matchesSearch(search, entry.label, entry.reason),
      ),
    [candidates, search],
  );
  return (
    <section className={PANEL_CLASS} aria-label="Cleanup">
      <ListHeader
        title="Cleanup"
        total={candidates.length}
        search={search}
        onSearchChange={setSearch}
      />
      <ListTable
        items={visible}
        keyOf={(entry) => entry.id}
        emptyMessage="Nothing to clean up."
        columns={[
          {
            id: "severity",
            header: "Severity",
            cell: (entry) => <SeverityBadge severity={entry.severity} />,
          },
          {
            id: "resource",
            header: "Resource",
            cell: (entry) => (
              <span className="text-of-13 text-of-text">{entry.label}</span>
            ),
          },
          {
            id: "reason",
            header: "Reason",
            cell: (entry) => (
              <span className="text-of-13 text-of-text-muted">
                {entry.reason}
              </span>
            ),
          },
          {
            id: "usage",
            header: "Usage",
            cell: (entry) => (
              <span className="text-of-13 text-of-text tabular-nums">
                {entry.usage_count}
              </span>
            ),
          },
          {
            id: "actions",
            header: "",
            cell: (entry) =>
              onResolve && entry.delete_supported ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onResolve(entry);
                  }}
                  className={[
                    "inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
                    "text-of-13 font-of-medium text-of-danger hover:bg-of-danger-soft",
                  ].join(" ")}
                >
                  Stage delete
                </button>
              ) : null,
          },
        ]}
      />
    </section>
  );
}
