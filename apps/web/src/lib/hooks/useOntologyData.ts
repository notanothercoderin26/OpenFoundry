import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteFavorite,
  fetchActionTypeMonitoringRules,
  fetchActionTypeUsage,
  fetchFunctionUsage,
  fetchFunctionUsageHistory,
  fetchFunctionVersions,
  fetchHomepageConfig,
  fetchObjectTypeDependents,
  fetchObjectTypeUsage,
  fetchOntologyDiscover,
  postFavorite,
  pushHomepageConfig,
  type OntologyFavoriteKind,
  type OntologyHomepageConfig,
  type UsageRange,
} from "@/lib/api/ontology";

/**
 * TanStack Query hooks for the Foundry calque's pending backend endpoints.
 *
 * Every hook caches at module level (1 minute stale time by default) and
 * tolerates a missing endpoint via the fallback baked into the underlying
 * client. The query keys mirror the URL structure so cache invalidation
 * stays predictable.
 */

const STALE_MS = 60_000;

/* ----- Discover aggregator ---------------------------------------------- */

export function useOntologyDiscover(ontologyId: string) {
  return useQuery({
    queryKey: ["ontologies", ontologyId, "discover"],
    queryFn: () => fetchOntologyDiscover(ontologyId),
    staleTime: STALE_MS,
  });
}

/* ----- Homepage config (network-aware) ---------------------------------- */

export function useRemoteHomepageConfig(ontologyId: string) {
  return useQuery({
    queryKey: ["ontologies", ontologyId, "homepage-config"],
    queryFn: () => fetchHomepageConfig(ontologyId),
    staleTime: STALE_MS,
  });
}

export function usePushHomepageConfig(ontologyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: OntologyHomepageConfig) =>
      pushHomepageConfig(ontologyId, config),
    onSuccess: (config) => {
      queryClient.setQueryData(
        ["ontologies", ontologyId, "homepage-config"],
        config,
      );
    },
  });
}

/* ----- Favorites (POST / DELETE) ---------------------------------------- */

export function useAddFavorite(ontologyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
    }: {
      kind: OntologyFavoriteKind;
      id: string;
    }) => postFavorite(ontologyId, kind, id),
    onSuccess: (_, { kind }) => {
      void queryClient.invalidateQueries({
        queryKey: ["ontology", ontologyId, "favorites", kind],
      });
    },
  });
}

export function useRemoveFavorite(ontologyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
    }: {
      kind: OntologyFavoriteKind;
      id: string;
    }) => deleteFavorite(ontologyId, kind, id),
    onSuccess: (_, { kind }) => {
      void queryClient.invalidateQueries({
        queryKey: ["ontology", ontologyId, "favorites", kind],
      });
    },
  });
}

/* ----- Object type dependents ------------------------------------------- */

export function useObjectTypeDependents(
  objectTypeId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["object-types", objectTypeId ?? "", "dependents"],
    queryFn: () => fetchObjectTypeDependents(objectTypeId!),
    enabled: Boolean(objectTypeId),
    staleTime: STALE_MS,
  });
}

/* ----- Usage time-series ------------------------------------------------ */

export function useObjectTypeUsage(
  objectTypeId: string | null | undefined,
  range: UsageRange,
) {
  return useQuery({
    queryKey: ["object-types", objectTypeId ?? "", "usage", range],
    queryFn: () => fetchObjectTypeUsage(objectTypeId!, range),
    enabled: Boolean(objectTypeId),
    staleTime: STALE_MS,
  });
}

export function useActionTypeUsage(
  actionTypeId: string | null | undefined,
  range: UsageRange,
) {
  return useQuery({
    queryKey: ["action-types", actionTypeId ?? "", "usage", range],
    queryFn: () => fetchActionTypeUsage(actionTypeId!, range),
    enabled: Boolean(actionTypeId),
    staleTime: STALE_MS,
  });
}

export function useActionTypeMonitoringRules(
  actionTypeId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["action-types", actionTypeId ?? "", "monitoring-rules"],
    queryFn: () => fetchActionTypeMonitoringRules(actionTypeId!),
    enabled: Boolean(actionTypeId),
    staleTime: STALE_MS,
  });
}

/* ----- Function usage / versions ---------------------------------------- */

export function useFunctionUsage(
  functionId: string | null | undefined,
  range: UsageRange,
) {
  return useQuery({
    queryKey: ["functions", functionId ?? "", "usage", range],
    queryFn: () => fetchFunctionUsage(functionId!, range),
    enabled: Boolean(functionId),
    staleTime: STALE_MS,
  });
}

export function useFunctionUsageHistory(
  functionId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["functions", functionId ?? "", "usage-history"],
    queryFn: () => fetchFunctionUsageHistory(functionId!),
    enabled: Boolean(functionId),
    staleTime: STALE_MS,
  });
}

export function useFunctionVersions(functionId: string | null | undefined) {
  return useQuery({
    queryKey: ["functions", functionId ?? "", "versions"],
    queryFn: () => fetchFunctionVersions(functionId!),
    enabled: Boolean(functionId),
    staleTime: STALE_MS,
  });
}
