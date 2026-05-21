import { useMemo, useState } from "react";

import {
  listFavoriteGroups,
  listFavoriteObjectTypes,
  listFavorites,
  listRecentObjectTypes,
  toggleFavorite,
  type LinkType,
  type ObjectType,
  type OntologyObjectTypeGroup,
  type OntologyResourceRegistryEntry,
} from "@/lib/api/ontology";
import { ontologyGroupColor } from "@components/ontology/groupColors";
import { GroupChip } from "@components/ui/GroupChip";
import {
  MiniLinkGraph,
  type MiniLinkGraphEdge,
  type MiniLinkGraphNode,
} from "@components/ui/MiniLinkGraph";
import { ResourceCard } from "@components/ui/ResourceCard";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StarFavoriteButton } from "@components/ui/StarFavoriteButton";
import type { GlyphName } from "@components/ui/Glyph";

interface DiscoverPageProps {
  ontologyId: string;
  objectTypes: ObjectType[];
  objectTypeGroups: OntologyObjectTypeGroup[];
  linkTypes: LinkType[];
  registry: OntologyResourceRegistryEntry[];
  /** Default items per section (Customize homepage). */
  itemsPerSection?: number;
  /** Configure-homepage button click. Opens a modal in the parent page. */
  onConfigure?: () => void;
  /** "See all →" click on the Recently-viewed section. */
  onSeeAllRecent?: () => void;
  /** "See all →" click on the Favorites section. */
  onSeeAllFavorites?: () => void;
  /** "See all →" click on the Favourite type groups section. */
  onSeeAllGroups?: () => void;
  /** Click on an object-type result card. The page maps it to a navigation. */
  onPickObjectType: (objectType: ObjectType) => void;
  /** Click on a type-group card. */
  onPickGroup?: (group: OntologyObjectTypeGroup) => void;
}

/* Hash the object type id into a stable mock instance count until a real
 * server-side count lands. Same hash always yields the same number so the
 * Discover page reads the same way across sessions. */
function mockInstanceCount(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const positive = Math.abs(h);
  const buckets = [5, 12, 80, 2_000, 16_000, 34_000, 40_000];
  return buckets[positive % buckets.length];
}

function formatObjectCount(n: number): string {
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k objects`;
  }
  return `${n} object${n === 1 ? "" : "s"}`;
}

function glyphFor(objectType: ObjectType): GlyphName {
  const icon = (objectType.icon ?? "").toLowerCase();
  if (icon.includes("plane") || icon.includes("aircraft")) return "cube";
  if (icon.includes("document") || icon.includes("page")) return "document";
  if (icon.includes("user")) return "users";
  if (icon.includes("folder")) return "folder";
  if (icon.includes("link")) return "link";
  return "cube";
}

interface GroupContext {
  name: string;
  count: number;
}

function groupContextFor(
  objectType: ObjectType,
  groups: OntologyObjectTypeGroup[],
): GroupContext | undefined {
  const groupName = objectType.group_names?.[0];
  if (!groupName) return undefined;
  const match = groups.find(
    (g) => g.name === groupName || g.display_name === groupName,
  );
  return {
    name: match?.display_name ?? groupName,
    count: match?.object_type_count ?? match?.object_type_ids?.length ?? 0,
  };
}

function dependentCountFor(
  objectType: ObjectType,
  registry: OntologyResourceRegistryEntry[],
): number | undefined {
  const entry = registry.find(
    (r) => r.resource_kind === "object_type" && r.resource_id === objectType.id,
  );
  return entry?.linked_resource_count;
}

/**
 * Convert a link-type cardinality into the badge label Foundry paints on the
 * arrow head. We render the target-side multiplicity since that's what the
 * captures show.
 */
function cardinalityArrow(cardinality: string): string {
  switch (cardinality) {
    case "one_to_one":
    case "many_to_one":
      return "1";
    case "one_to_many":
    case "many_to_many":
      return "*";
    default:
      return "1";
  }
}

export function DiscoverPage({
  ontologyId,
  objectTypes,
  objectTypeGroups,
  linkTypes,
  registry,
  itemsPerSection = 6,
  onConfigure,
  onSeeAllRecent,
  onSeeAllFavorites,
  onSeeAllGroups,
  onPickObjectType,
  onPickGroup,
}: DiscoverPageProps) {
  /* `tick` bumps on every favourite toggle so the recent/favorites memos
   * re-read localStorage after the write. */
  const [tick, setTick] = useState(0);

  const recent = useMemo(
    () => listRecentObjectTypes(ontologyId, objectTypes, itemsPerSection),
    [ontologyId, objectTypes, itemsPerSection, tick],
  );

  const favoriteObjectTypes = useMemo(
    () => listFavoriteObjectTypes(ontologyId, objectTypes, itemsPerSection),
    [ontologyId, objectTypes, itemsPerSection, tick],
  );

  const favoriteGroups = useMemo(
    () => listFavoriteGroups(ontologyId, objectTypeGroups, itemsPerSection),
    [ontologyId, objectTypeGroups, itemsPerSection, tick],
  );

  const objectFavoriteIds = useMemo(() => {
    void tick;
    return new Set(listFavorites(ontologyId, "object-type"));
  }, [ontologyId, tick]);

  const groupFavoriteIds = useMemo(() => {
    void tick;
    return new Set(listFavorites(ontologyId, "group"));
  }, [ontologyId, tick]);

  /* ------- Fallbacks for users without favourites / recent activity ------ */

  const recentlyModified = useMemo(() => {
    if (recent.length > 0) return null;
    return [...objectTypes]
      .filter((entry) => Boolean(entry.updated_at))
      .sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
      )
      .slice(0, itemsPerSection);
  }, [recent, objectTypes, itemsPerSection]);

  const prominentObjectTypes = useMemo(() => {
    if (favoriteObjectTypes.length > 0) return null;
    const countById = new Map<string, number>();
    for (const entry of registry) {
      if (entry.resource_kind === "object_type") {
        countById.set(entry.resource_id, entry.linked_resource_count);
      }
    }
    return [...objectTypes]
      .filter((entry) => (countById.get(entry.id) ?? 0) > 0)
      .sort(
        (a, b) =>
          (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0) ||
          (a.display_name ?? "").localeCompare(b.display_name ?? ""),
      )
      .slice(0, itemsPerSection);
  }, [favoriteObjectTypes, objectTypes, registry, itemsPerSection]);

  const toggleObject = (id: string) => {
    toggleFavorite(ontologyId, "object-type", id);
    setTick((t) => t + 1);
  };

  const toggleGroup = (id: string) => {
    toggleFavorite(ontologyId, "group", id);
    setTick((t) => t + 1);
  };

  const recentItems = recentlyModified ?? recent;
  const favoriteItems = prominentObjectTypes ?? favoriteObjectTypes;

  const recentTitle = recentlyModified
    ? "Recently modified"
    : "Recently viewed object types";
  const favoritesTitle = prominentObjectTypes
    ? "Prominent object types"
    : "Favorite object types";

  return (
    <div className="flex flex-col gap-8">
      <DiscoverSection
        title={recentTitle}
        total={recentItems.length}
        onConfigure={onConfigure}
        onSeeAll={onSeeAllRecent}
        items={recentItems}
        emptyMessage="Open an object type and it will land here next time."
        renderCard={(objectType) => renderObjectCard(objectType)}
      />

      <DiscoverSection
        title={favoritesTitle}
        total={favoriteItems.length}
        onConfigure={onConfigure}
        onSeeAll={onSeeAllFavorites}
        items={favoriteItems}
        emptyMessage="Star an object type to keep it pinned at the top of Discover."
        renderCard={(objectType) =>
          renderObjectCard(objectType, !prominentObjectTypes)
        }
      />

      <DiscoverSection
        title="Favourite type groups"
        total={favoriteGroups.length}
        onConfigure={onConfigure}
        onSeeAll={onSeeAllGroups}
        items={favoriteGroups}
        emptyMessage="Star a group to surface its object types as a mini graph."
        columns={2}
        renderCard={(group) => renderGroupCard(group)}
      />
    </div>
  );

  function renderObjectCard(objectType: ObjectType, showProminent = false) {
    const context = groupContextFor(objectType, objectTypeGroups);
    const color = ontologyGroupColor(
      context?.name ?? objectType.display_name,
    );
    const dependents = dependentCountFor(objectType, registry);
    const instanceCount = mockInstanceCount(objectType.id);
    const prominent = showProminent && (dependents ?? 0) >= 5;

    return (
      <ResourceCard
        key={objectType.id}
        name={objectType.display_name || objectType.name}
        glyph={glyphFor(objectType)}
        iconColor={color}
        objectCount={formatObjectCount(instanceCount)}
        dependentsCount={dependents}
        prominent={prominent}
        group={
          context
            ? { name: context.name, count: context.count, color }
            : undefined
        }
        description={objectType.description}
        favorite={objectFavoriteIds.has(objectType.id)}
        onToggleFavorite={() => toggleObject(objectType.id)}
        onClick={() => onPickObjectType(objectType)}
      />
    );
  }

  function renderGroupCard(group: OntologyObjectTypeGroup) {
    const memberIds = (group.object_type_ids ?? []).slice(0, 6);
    const members = memberIds
      .map((id) => objectTypes.find((entry) => entry.id === id))
      .filter((entry): entry is ObjectType => Boolean(entry));

    const nodes: MiniLinkGraphNode[] = members.map((entry) => ({
      id: entry.id,
      label: entry.display_name || entry.name,
      glyph: glyphFor(entry),
      colorKey: entry.group_names?.[0] ?? group.display_name,
    }));

    const memberSet = new Set(memberIds);
    const edges: MiniLinkGraphEdge[] = linkTypes
      .filter(
        (lt) =>
          memberSet.has(lt.source_type_id) && memberSet.has(lt.target_type_id),
      )
      .map((lt) => ({
        from: lt.source_type_id,
        to: lt.target_type_id,
        label: cardinalityArrow(String(lt.cardinality)),
      }));

    const color = ontologyGroupColor(group.display_name);
    const memberCount =
      group.object_type_count ?? group.object_type_ids?.length ?? 0;
    const favorite = groupFavoriteIds.has(group.id);

    const clickable = Boolean(onPickGroup);
    const baseClass = [
      "group flex flex-col gap-3 p-3 min-w-0",
      "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
      "transition-colors hover:border-of-border-strong",
    ];
    if (clickable) baseClass.push("cursor-pointer");

    return (
      <div
        key={group.id}
        className={baseClass.join(" ")}
        role={clickable ? "link" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={(event) => {
          if (!onPickGroup) return;
          if ((event.target as HTMLElement).closest("button")) return;
          onPickGroup(group);
        }}
        onKeyDown={(event) => {
          if (!onPickGroup) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPickGroup(group);
          }
        }}
      >
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-of-14 font-of-semibold text-of-text truncate">
              {group.display_name || group.name}
            </span>
            {group.description ? (
              <span className="text-of-12 text-of-text-muted truncate">
                {group.description}
              </span>
            ) : null}
          </div>
          <StarFavoriteButton
            value={favorite}
            onChange={() => toggleGroup(group.id)}
            size="sm"
            className="-mr-1"
          />
        </div>

        <div className="rounded-of-sm border border-of-border bg-of-surface px-2 py-3 overflow-hidden">
          {nodes.length === 0 ? (
            <p className="text-of-12 text-of-text-muted text-center py-4">
              No object types yet
            </p>
          ) : (
            <MiniLinkGraph
              nodes={nodes}
              edges={edges}
              width={460}
              height={150}
              className="block w-full"
            />
          )}
        </div>

        <div className="border-t border-of-border pt-2">
          <GroupChip name={group.display_name} count={memberCount} color={color} size="sm" />
        </div>
      </div>
    );
  }
}

interface DiscoverSectionProps<T> {
  title: string;
  total: number;
  onConfigure?: () => void;
  onSeeAll?: () => void;
  items: ReadonlyArray<T>;
  emptyMessage: string;
  renderCard: (item: T) => React.ReactNode;
  /** Default 3-column grid; pass `2` to render wider cards. */
  columns?: 2 | 3;
}

function DiscoverSection<T>({
  title,
  total,
  onConfigure,
  onSeeAll,
  items,
  emptyMessage,
  renderCard,
  columns = 3,
}: DiscoverSectionProps<T>) {
  const gridClass =
    columns === 2
      ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={title}
        count={total}
        onConfigure={onConfigure}
        onSeeAll={onSeeAll}
      />
      {items.length === 0 ? (
        <div
          className={[
            "px-4 py-8 rounded-of-md border border-dashed border-of-border",
            "bg-of-surface text-of-13 text-of-text-muted text-center",
          ].join(" ")}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className={gridClass}>{items.map((item) => renderCard(item))}</div>
      )}
    </section>
  );
}
