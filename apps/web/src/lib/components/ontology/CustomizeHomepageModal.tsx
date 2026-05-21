import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type {
  ObjectType,
  OntologyHomepageConfig,
  OntologyHomepageSection,
  OntologyHomepageSectionId,
  OntologyObjectTypeGroup,
} from "@/lib/api/ontology";
import { GroupChip } from "@components/ui/GroupChip";
import { Glyph } from "@components/ui/Glyph";
import { ResourceIcon } from "@components/ui/ResourceIcon";
import { ontologyGroupColor } from "@components/ontology/groupColors";

const ITEMS_PER_SECTION_OPTIONS = [4, 6, 8, 12] as const;

const BUILTIN_SECTIONS: Array<{
  id: Exclude<OntologyHomepageSectionId, `group:${string}`>;
  label: string;
}> = [
  { id: "recent", label: "Recently viewed object types" },
  { id: "favorite-object-types", label: "Favorite object types" },
  { id: "favorite-groups", label: "Favorite groups" },
];

interface CustomizeHomepageModalProps {
  open: boolean;
  onClose: () => void;
  config: OntologyHomepageConfig;
  onApply: (next: OntologyHomepageConfig) => void;
  groups: OntologyObjectTypeGroup[];
  objectTypes: ObjectType[];
}

type DraftSection = OntologyHomepageSection;

/**
 * Foundry-style "Customize homepage" modal. Lets the user reorder sections,
 * remove them, add new ones (built-in or per-group), and pick how many items
 * each one renders.
 *
 * The modal works on a local draft; the parent only sees the final
 * OntologyHomepageConfig when the user presses Apply.
 */
export function CustomizeHomepageModal({
  open,
  onClose,
  config,
  onApply,
  groups,
  objectTypes,
}: CustomizeHomepageModalProps) {
  const [draft, setDraft] = useState<DraftSection[]>(config.sections);
  const [itemsPerSection, setItemsPerSection] = useState<number>(
    config.itemsPerSection,
  );

  /* Reset the draft whenever the modal opens with a fresh config. */
  useEffect(() => {
    if (open) {
      setDraft(config.sections);
      setItemsPerSection(config.itemsPerSection);
    }
  }, [open, config.sections, config.itemsPerSection]);

  /* ESC closes; locks at the document level so the dialog wins. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const presentIds = new Set(draft.map((entry) => entry.id));
  const presentGroupIds = new Set(
    draft
      .map((entry) => (entry.id.startsWith("group:") ? entry.id.slice(6) : null))
      .filter((id): id is string => Boolean(id)),
  );

  const addBuiltin = (
    id: Exclude<OntologyHomepageSectionId, `group:${string}`>,
  ) => {
    if (presentIds.has(id)) return;
    setDraft((current) => [...current, { id, visible: true }]);
  };

  const addGroup = (groupId: string) => {
    const id: OntologyHomepageSectionId = `group:${groupId}`;
    if (presentIds.has(id)) return;
    setDraft((current) => [...current, { id, visible: true }]);
  };

  const removeSection = (id: OntologyHomepageSectionId) => {
    setDraft((current) => current.filter((entry) => entry.id !== id));
  };

  const moveSection = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setDraft((current) => {
      const next = current.slice();
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };

  const apply = () => {
    onApply({ itemsPerSection, sections: draft });
    onClose();
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(17, 24, 39, 0.45)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customize homepage"
        onClick={(event) => event.stopPropagation()}
        className={[
          "w-full max-w-[560px] flex flex-col overflow-hidden",
          "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-popover",
        ].join(" ")}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-of-border">
          <h2 className="text-of-16 font-of-semibold text-of-text">
            Customize homepage
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={[
              "ml-auto inline-flex items-center justify-center w-7 h-7 rounded-of-sm",
              "text-of-text-muted hover:bg-of-surface-muted hover:text-of-text",
            ].join(" ")}
          >
            <Glyph name="x" size={16} tone="currentColor" />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          <p className="text-of-13 text-of-text-muted">
            Personalize your homepage by selecting and arranging sections to
            create a tailored ontology experience. The ontology will start up
            with object types from your selected sections, ensuring the
            entities most relevant to you are readily available.
          </p>

          <div className="flex items-center gap-2">
            <label className="text-of-13 text-of-text font-of-medium">
              Items per section
            </label>
            <select
              value={itemsPerSection}
              onChange={(event) =>
                setItemsPerSection(Number(event.target.value))
              }
              className={[
                "h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-raised",
                "text-of-13 text-of-text",
              ].join(" ")}
            >
              {ITEMS_PER_SECTION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <AddSectionMenu
              presentIds={presentIds}
              presentGroupIds={presentGroupIds}
              groups={groups}
              objectTypes={objectTypes}
              onAddBuiltin={addBuiltin}
              onAddGroup={addGroup}
            />
          </div>

          <SectionList
            draft={draft}
            groups={groups}
            onMove={moveSection}
            onRemove={removeSection}
          />
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-of-border bg-of-surface">
          <button
            type="button"
            onClick={onClose}
            className={[
              "inline-flex items-center justify-center h-8 px-3 rounded-of-sm",
              "border border-of-border bg-of-surface-raised text-of-13",
              "font-of-medium text-of-text hover:border-of-border-strong",
            ].join(" ")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className={[
              "inline-flex items-center justify-center h-8 px-3 rounded-of-sm",
              "bg-of-accent hover:bg-of-accent-hover text-of-text-inverse",
              "text-of-13 font-of-semibold",
            ].join(" ")}
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Section list (draggable)                                                  */
/* ------------------------------------------------------------------------- */

interface SectionListProps {
  draft: DraftSection[];
  groups: OntologyObjectTypeGroup[];
  onMove: (from: number, to: number) => void;
  onRemove: (id: OntologyHomepageSectionId) => void;
}

function SectionList({ draft, groups, onMove, onRemove }: SectionListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const onDragStart = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };
  const onDragOver = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setHoverIndex(index);
  };
  const onDrop = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const from = dragIndex ?? Number(event.dataTransfer.getData("text/plain"));
    setDragIndex(null);
    setHoverIndex(null);
    if (!Number.isFinite(from)) return;
    onMove(from, index);
  };
  const onDragEnd = () => {
    setDragIndex(null);
    setHoverIndex(null);
  };

  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {draft.map((section, index) => (
        <li key={section.id}>
          <div
            draggable
            onDragStart={onDragStart(index)}
            onDragOver={onDragOver(index)}
            onDrop={onDrop(index)}
            onDragEnd={onDragEnd}
            className={[
              "flex items-center gap-2 h-10 px-2 rounded-of-sm border border-of-border bg-of-surface-raised",
              dragIndex === index ? "opacity-50" : "",
              hoverIndex === index && dragIndex !== null && dragIndex !== index
                ? "border-of-accent"
                : "",
            ].join(" ")}
          >
            <span
              className="shrink-0 inline-flex items-center justify-center w-4 h-6 text-of-text-soft cursor-grab"
              aria-hidden
              style={{ fontFamily: "var(--font-mono)" }}
            >
              ⋮⋮
            </span>
            <SectionLabel section={section} groups={groups} />
            <button
              type="button"
              onClick={() => onRemove(section.id)}
              aria-label={`Remove ${section.id}`}
              className={[
                "ml-auto inline-flex items-center justify-center w-7 h-7 rounded-of-sm",
                "text-of-text-muted hover:bg-of-surface-muted hover:text-of-danger",
              ].join(" ")}
            >
              <Glyph name="x" size={14} tone="currentColor" />
            </button>
          </div>
        </li>
      ))}
      {draft.length === 0 ? (
        <li
          className={[
            "px-4 py-6 rounded-of-md border border-dashed border-of-border",
            "bg-of-surface text-of-13 text-of-text-muted text-center",
          ].join(" ")}
        >
          No sections — press “Add section” to start.
        </li>
      ) : null}
    </ul>
  );
}

function SectionLabel({
  section,
  groups,
}: {
  section: DraftSection;
  groups: OntologyObjectTypeGroup[];
}) {
  if (section.id.startsWith("group:")) {
    const groupId = section.id.slice(6);
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) {
      return (
        <span className="text-of-13 text-of-text-muted truncate">
          Missing group
        </span>
      );
    }
    return (
      <GroupChip
        name={group.display_name}
        count={group.object_type_count ?? group.object_type_ids?.length ?? 0}
        color={ontologyGroupColor(group.display_name)}
        size="sm"
      />
    );
  }
  const builtin = BUILTIN_SECTIONS.find((entry) => entry.id === section.id);
  return (
    <span className="text-of-13 font-of-medium text-of-text truncate">
      {builtin?.label ?? section.id}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Add section menu (+ Group picker flyout)                                  */
/* ------------------------------------------------------------------------- */

interface AddSectionMenuProps {
  presentIds: Set<string>;
  presentGroupIds: Set<string>;
  groups: OntologyObjectTypeGroup[];
  objectTypes: ObjectType[];
  onAddBuiltin: (
    id: Exclude<OntologyHomepageSectionId, `group:${string}`>,
  ) => void;
  onAddGroup: (groupId: string) => void;
}

function AddSectionMenu({
  presentIds,
  presentGroupIds,
  groups,
  objectTypes,
  onAddBuiltin,
  onAddGroup,
}: AddSectionMenuProps) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="ml-auto relative">
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={[
          "inline-flex items-center gap-1 h-8 px-3 rounded-of-sm",
          "border border-of-border bg-of-surface-raised text-of-13",
          "font-of-medium text-of-text hover:border-of-border-strong",
        ].join(" ")}
      >
        <Glyph name="plus" size={12} tone="currentColor" />
        Add section
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute right-0 top-9 min-w-[240px] z-10",
            "bg-of-surface-raised border border-of-border rounded-of-sm shadow-of-popover p-1",
          ].join(" ")}
        >
          <MenuItem
            onClick={() => {
              setPickerOpen(true);
            }}
            trailing={<Glyph name="chevron-right" size={12} tone="currentColor" />}
          >
            <Glyph name="plus" size={12} tone="var(--of-text-muted)" />
            Group
          </MenuItem>
          {BUILTIN_SECTIONS.map((entry) => {
            const disabled = presentIds.has(entry.id);
            return (
              <MenuItem
                key={entry.id}
                disabled={disabled}
                onClick={() => {
                  onAddBuiltin(entry.id);
                  setOpen(false);
                }}
              >
                <Glyph name="plus" size={12} tone="var(--of-text-muted)" />
                {entry.label}
              </MenuItem>
            );
          })}
        </div>
      ) : null}

      {pickerOpen ? (
        <GroupPicker
          groups={groups}
          objectTypes={objectTypes}
          presentGroupIds={presentGroupIds}
          onAdd={(groupId) => {
            onAddGroup(groupId);
            setPickerOpen(false);
            setOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  trailing,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  const cls = [
    "w-full inline-flex items-center gap-2 px-2.5 h-8 rounded-of-sm",
    "text-of-13 text-of-text text-left transition-colors",
  ];
  if (disabled) cls.push("opacity-40 cursor-not-allowed");
  else cls.push("hover:bg-of-surface-muted cursor-pointer");
  return (
    <button
      type="button"
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cls.join(" ")}
    >
      {children}
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </button>
  );
}

interface GroupPickerProps {
  groups: OntologyObjectTypeGroup[];
  objectTypes: ObjectType[];
  presentGroupIds: Set<string>;
  onAdd: (groupId: string) => void;
  onClose: () => void;
}

function GroupPicker({
  groups,
  objectTypes,
  presentGroupIds,
  onAdd,
  onClose,
}: GroupPickerProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((entry) =>
      [entry.display_name, entry.name, entry.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [groups, search]);

  const selectedGroup = useMemo(
    () => groups.find((entry) => entry.id === selected) ?? null,
    [groups, selected],
  );

  const memberObjectTypes = useMemo(() => {
    if (!selectedGroup) return [];
    const ids = new Set(selectedGroup.object_type_ids ?? []);
    return objectTypes.filter((entry) => ids.has(entry.id));
  }, [selectedGroup, objectTypes]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose group"
      className={[
        "absolute right-[260px] top-9 z-20",
        "w-[560px] h-[360px] flex flex-col overflow-hidden",
        "bg-of-surface-raised border border-of-border rounded-of-sm shadow-of-popover",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 px-2.5 h-9 border-b border-of-border">
        <Glyph name="search" size={12} tone="var(--of-text-muted)" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Choose group…"
          autoFocus
          className={[
            "flex-1 min-w-0 bg-transparent border-0 outline-none",
            "text-of-13 text-of-text placeholder:text-of-text-soft",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close group picker"
          className="text-of-text-muted hover:text-of-text"
        >
          <Glyph name="x" size={14} tone="currentColor" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <ul className="w-[240px] shrink-0 overflow-y-auto p-1 border-r border-of-border list-none m-0">
          {filteredGroups.map((group) => {
            const present = presentGroupIds.has(group.id);
            const active = selected === group.id;
            const cls = [
              "w-full flex items-center gap-2 px-2 h-8 rounded-of-sm text-left",
              active ? "bg-of-accent-soft text-of-accent" : "text-of-text hover:bg-of-surface-muted",
            ].join(" ");
            const color = ontologyGroupColor(group.display_name);
            const memberCount =
              group.object_type_count ?? group.object_type_ids?.length ?? 0;
            return (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => setSelected(group.id)}
                  className={cls}
                >
                  <GroupChip
                    name={group.display_name}
                    color={color}
                    size="sm"
                  />
                  <span className="ml-auto text-of-12 text-of-text-muted tabular-nums">
                    {memberCount}
                  </span>
                  {present ? (
                    <span
                      className="ml-1 text-of-12 text-of-text-soft"
                      title="Already in homepage"
                      aria-label="Already added"
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {filteredGroups.length === 0 ? (
            <li className="px-2 py-3 text-of-12 text-of-text-muted">
              No matching groups.
            </li>
          ) : null}
        </ul>

        <div className="flex-1 min-w-0 overflow-y-auto p-2">
          {selectedGroup ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GroupChip
                  name={selectedGroup.display_name}
                  count={
                    selectedGroup.object_type_count ??
                    selectedGroup.object_type_ids?.length ??
                    0
                  }
                  color={ontologyGroupColor(selectedGroup.display_name)}
                />
                <span className="text-of-12 text-of-text-muted">
                  {memberObjectTypes.length} object types
                </span>
              </div>
              <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
                {memberObjectTypes.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 px-1.5 h-7"
                  >
                    <ResourceIcon
                      glyph="cube"
                      colorKey={entry.group_names?.[0] ?? entry.display_name}
                      size="xs"
                      tone="soft"
                    />
                    <span className="text-of-13 text-of-text truncate">
                      {entry.display_name || entry.name}
                    </span>
                  </li>
                ))}
                {memberObjectTypes.length === 0 ? (
                  <li className="text-of-12 text-of-text-muted px-1.5">
                    No object types yet.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="text-of-12 text-of-text-muted">
              Pick a group on the left to preview its object types.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-of-border bg-of-surface">
        <button
          type="button"
          onClick={onClose}
          className={[
            "inline-flex items-center justify-center h-7 px-3 rounded-of-sm",
            "border border-of-border bg-of-surface-raised text-of-12",
            "font-of-medium text-of-text hover:border-of-border-strong",
          ].join(" ")}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (selected) onAdd(selected);
          }}
          disabled={!selected || presentGroupIds.has(selected)}
          className={[
            "inline-flex items-center justify-center h-7 px-3 rounded-of-sm",
            "bg-of-accent hover:bg-of-accent-hover text-of-text-inverse",
            "text-of-12 font-of-semibold disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          Add
        </button>
      </div>
    </div>
  );
}
