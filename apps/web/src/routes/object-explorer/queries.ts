import { useQueries, useQuery } from '@tanstack/react-query';

import {
  listActionTypes,
  listLinkTypes,
  listObjectSets,
  listObjectTypeGroups,
  listObjectTypes,
  listObjectViews,
  listProperties,
  type ActionType,
  type LinkType,
  type ObjectSetDefinition,
  type ObjectType,
  type ObjectViewDefinition,
  type OntologyObjectTypeGroup,
  type Property,
} from '@/lib/api/ontology';

export const objectExplorerKeys = {
  all: ['object-explorer'] as const,
  objectTypes: () => [...objectExplorerKeys.all, 'object-types'] as const,
  objectTypeGroups: () => [...objectExplorerKeys.all, 'object-type-groups'] as const,
  objectSets: () => [...objectExplorerKeys.all, 'object-sets'] as const,
  objectViews: () => [...objectExplorerKeys.all, 'object-views'] as const,
  linkTypes: () => [...objectExplorerKeys.all, 'link-types'] as const,
  actionTypes: () => [...objectExplorerKeys.all, 'action-types'] as const,
  properties: (typeId: string) => [...objectExplorerKeys.all, 'properties', typeId] as const,
};

export interface ObjectExplorerInitialData {
  objectTypes: ObjectType[];
  objectTypeGroups: OntologyObjectTypeGroup[];
  objectSets: ObjectSetDefinition[];
  objectViews: ObjectViewDefinition[];
  linkTypes: LinkType[];
  actionTypes: ActionType[];
  loading: boolean;
  error: string;
}

export function useObjectExplorerInitialData(): ObjectExplorerInitialData {
  const results = useQueries({
    queries: [
      {
        queryKey: objectExplorerKeys.objectTypes(),
        queryFn: () => listObjectTypes({ per_page: 200 }).then((res) => res.data),
      },
      {
        queryKey: objectExplorerKeys.objectTypeGroups(),
        queryFn: () => listObjectTypeGroups({ per_page: 200 }).then((res) => res.data),
      },
      {
        queryKey: objectExplorerKeys.objectSets(),
        queryFn: () => listObjectSets({ size: 500 }).then((res) => res.data),
      },
      {
        queryKey: objectExplorerKeys.objectViews(),
        queryFn: () => listObjectViews({ per_page: 500 }).then((res) => res.data),
      },
      {
        queryKey: objectExplorerKeys.linkTypes(),
        queryFn: () => listLinkTypes({ per_page: 200 }).then((res) => res.data),
      },
      {
        queryKey: objectExplorerKeys.actionTypes(),
        queryFn: () => listActionTypes({ per_page: 200 }).then((res) => res.data),
      },
    ],
  });

  const [typesRes, groupsRes, setsRes, viewsRes, linksRes, actionsRes] = results;
  const loading = results.some((r) => r.isLoading);
  const criticalError =
    typesRes.error || groupsRes.error || setsRes.error
      ? (typesRes.error || groupsRes.error || setsRes.error) as Error
      : null;

  return {
    objectTypes: typesRes.data ?? [],
    objectTypeGroups: groupsRes.data ?? [],
    objectSets: setsRes.data ?? [],
    objectViews: viewsRes.data ?? [],
    linkTypes: linksRes.data ?? [],
    actionTypes: actionsRes.data ?? [],
    loading,
    error: criticalError ? criticalError.message : '',
  };
}

export function useTypeProperties(typeId: string) {
  return useQuery<Property[]>({
    queryKey: objectExplorerKeys.properties(typeId),
    queryFn: () => listProperties(typeId),
    enabled: Boolean(typeId),
  });
}
