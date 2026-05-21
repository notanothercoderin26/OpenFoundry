import { useMemo, useState } from "react";

import {
  listFavoriteObjectTypes,
  listFavorites,
  listRecentObjectTypes,
  toggleFavorite,
  type ObjectType,
  type OntologyObjectTypeGroup,
  type OntologyResourceRegistryEntry,
} from "@/lib/api/ontology";
import { ontologyGroupColor } from "@components/ontology/groupColors";
import { ResourceCard } from "@components/ui/ResourceCard";
import { SectionHeader } from "@components/ui/SectionHeader";
import type { GlyphName } from "@components/ui/Glyph";

interface DiscoverPageProps {
  ontologyId: string;
  objectTypes: ObjectType[];
  objectTypeGroups: OntologyObjectTypeGroup[];
  registry: OntologyResourceRegistryEntry[];
  /** Default items per section (Customize homepage). */
  itemsPerSection?: number;
  /** Configure-homepage button click. Opens a modal in the parent page. */
  onConfigure?: () => void;
  /** "See all →" click on the Recently-viewed section. */
  onSeeAllRecent?: () => void;
  /** "See all →" click on the Favorites section. */
  onSeeAllFavorites?: () => void;
  /** Click on a result card. The page maps it to a section navigation. */
  onPickObjectType: (objectType: ObjectType) => void;
}

/* Hash the object type id into a stable mock instance count until a real
 * server-side count lands. Same hash always yields the same number so the
 * Discover page reads the same way across sessions. */
function mockInstanceCount(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const positive = Math.abs(h);
  // Roll a few brackets to mimic Foundry's "2k / 5 / 40k" mix.
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

/**
 * Pick the most relevant group for an object type (first non-empty
 * `group_names` entry) and resolve its size from `objectTypeGroups`.
 */
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

export function DiscoverPage({
  ontologyId,
  objectTypes,
  objectTypeGroups,
  registry,
  itemsPerSection = 6,
  onConfigure,
  onSeeAllRecent,
  onSeeAllFavorites,
  onPickObjectType,
}: DiscoverPageProps) {
  /* favTick is bumped on every toggle so the recent/favorites memos refresh
   * after the localStorage write. The actual data lives in localStorage. */
  const [favTick, setFavTick] = useState(0);

  const recent = useMemo(
    () => listRecentObjectTypes(ontologyId, objectTypes, itemsPerSection),
    [ontologyId, objectTypes, itemsPerSection, favTick],
  );

  const favorites = useMemo(
    () => listFavoriteObjectTypes(ontologyId, objectTypes, itemsPerSection),
    [ontologyId, objectTypes, itemsPerSection, favTick],
  );

  const favoriteIds = useMemo(() => {
    void favTick;
    return new Set(listFavorites(ontologyId, "object-type"));
  }, [ontologyId, favTick]);

  const toggle = (id: string) => {
    toggleFavorite(ontologyId, "object-type", id);
    setFavTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col gap-8">
      <DiscoverSection
        title="Recently viewed object types"
        total={recent.length}
        onConfigure={onConfigure}
        onSeeAll={onSeeAllRecent}
        items={recent}
        emptyMessage="Open an object type and it will land here next time."
        renderCard={(objectType) => renderCard(objectType)}
      />

      <DiscoverSection
        title="Favorite object types"
        total={favorites.length}
        onConfigure={onConfigure}
        onSeeAll={onSeeAllFavorites}
        items={favorites}
        emptyMessage="Star an object type to keep it pinned at the top of Discover."
        renderCard={(objectType) => renderCard(objectType, true)}
      />
    </div>
  );

  function renderCard(objectType: ObjectType, showProminent = false) {
    const groupContext = groupContextFor(objectType, objectTypeGroups);
    const color = ontologyGroupColor(
      groupContext?.name ?? objectType.display_name,
    );
    const dependents = dependentCountFor(objectType, registry);
    const instanceCount = mockInstanceCount(objectType.id);
    const prominent =
      showProminent && (dependents ?? 0) >= 5;

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
          groupContext
            ? { name: groupContext.name, count: groupContext.count, color }
            : undefined
        }
        description={objectType.description}
        favorite={favoriteIds.has(objectType.id)}
        onToggleFavorite={() => toggle(objectType.id)}
        onClick={() => onPickObjectType(objectType)}
      />
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
}

function DiscoverSection<T>({
  title,
  total,
  onConfigure,
  onSeeAll,
  items,
  emptyMessage,
  renderCard,
}: DiscoverSectionProps<T>) {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => renderCard(item))}
        </div>
      )}
    </section>
  );
}
