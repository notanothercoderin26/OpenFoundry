import {
  listGroups,
  listPermissions,
  listPolicies,
  listRestrictedViews,
  listRoles,
  listUsers,
} from '@api/auth';

export const settingsQueryKeys = {
  users: ['settings', 'users'] as const,
  permissions: ['settings', 'permissions'] as const,
  roles: ['settings', 'roles'] as const,
  groups: ['settings', 'groups'] as const,
  policies: ['settings', 'policies'] as const,
  restrictedViews: ['settings', 'restricted-views'] as const,
};

export const usersQuery = {
  queryKey: settingsQueryKeys.users,
  queryFn: () => listUsers(),
};

export const permissionsQuery = {
  queryKey: settingsQueryKeys.permissions,
  queryFn: () => listPermissions(),
};

export const rolesQuery = {
  queryKey: settingsQueryKeys.roles,
  queryFn: () => listRoles(),
};

export const groupsQuery = {
  queryKey: settingsQueryKeys.groups,
  queryFn: () => listGroups(),
};

export const policiesQuery = {
  queryKey: settingsQueryKeys.policies,
  queryFn: () => listPolicies(),
};

export const restrictedViewsQuery = {
  queryKey: settingsQueryKeys.restrictedViews,
  queryFn: () => listRestrictedViews(),
};
