import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  DEFAULT_HOMEPAGE_CONFIG,
  getHomepageConfig,
  listFavorites,
  toggleFavorite,
  updateHomepageConfig,
  type OntologyFavoriteKind,
  type OntologyHomepageConfig,
} from "@/lib/api/ontology";

/**
 * TanStack Query wrappers around the Discover-page persistence helpers.
 *
 * The helpers in `lib/api/ontology.ts` are localStorage-backed today, but
 * wrapping them in `useQuery`/`useMutation` gives us:
 *
 *  - A single React Query cache, so multiple components reading the same
 *    favourites list re-render together when one of them toggles.
 *  - Automatic invalidation on mutation so we don't have to bump a manual
 *    tick state any more.
 *  - A drop-in upgrade path: when the backend exposes
 *    POST/DELETE /ontologies/{id}/favorites and a homepage-config
 *    endpoint, only `queryFn` / `mutationFn` need to swap to fetch().
 */

function favoritesKey(ontologyId: string, kind: OntologyFavoriteKind) {
  return ["ontology", ontologyId, "favorites", kind] as const;
}

function homepageKey(ontologyId: string) {
  return ["ontology", ontologyId, "homepage"] as const;
}

export function useFavorites(
  ontologyId: string,
  kind: OntologyFavoriteKind,
) {
  return useQuery({
    queryKey: favoritesKey(ontologyId, kind),
    queryFn: () => Promise.resolve(listFavorites(ontologyId, kind)),
    staleTime: Infinity,
  });
}

export function useToggleFavorite(
  ontologyId: string,
  kind: OntologyFavoriteKind,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      Promise.resolve(toggleFavorite(ontologyId, kind, id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: favoritesKey(ontologyId, kind),
      });
    },
  });
}

export function useHomepageConfig(ontologyId: string) {
  return useQuery({
    queryKey: homepageKey(ontologyId),
    queryFn: () => Promise.resolve(getHomepageConfig(ontologyId)),
    staleTime: Infinity,
    initialData: DEFAULT_HOMEPAGE_CONFIG,
  });
}

export function useUpdateHomepageConfig(ontologyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: OntologyHomepageConfig) => {
      updateHomepageConfig(ontologyId, config);
      return Promise.resolve(config);
    },
    onSuccess: (config) => {
      queryClient.setQueryData(homepageKey(ontologyId), config);
    },
  });
}
