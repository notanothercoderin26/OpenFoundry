import api from './client';

// ────────────────────────────────────────────────────────────────
// Derived property bindings — function-backed virtual properties
// attached to an object type. CRUD-light: list, create, delete.
// ────────────────────────────────────────────────────────────────

export interface DerivedPropertyBinding {
  id: string;
  object_type_id: string;
  property_name: string;
  display_name: string;
  description: string;
  function_rid: string;
  return_type: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDerivedPropertyBindingRequest {
  object_type_id: string;
  property_name: string;
  display_name: string;
  description: string;
  function_rid: string;
  return_type: string;
}

interface DerivedPropertyBindingListResponse {
  items: DerivedPropertyBinding[] | null;
}

export async function listDerivedPropertyBindings(objectTypeId: string): Promise<DerivedPropertyBinding[]> {
  const params = new URLSearchParams();
  params.set('object_type_id', objectTypeId);
  const response = await api.get<DerivedPropertyBindingListResponse>(
    `/vertex/derived-property-bindings?${params.toString()}`,
  );
  return response.items ?? [];
}

export async function createDerivedPropertyBinding(
  body: CreateDerivedPropertyBindingRequest,
): Promise<DerivedPropertyBinding> {
  return api.post<DerivedPropertyBinding>('/vertex/derived-property-bindings', body);
}

export async function deleteDerivedPropertyBinding(id: string): Promise<void> {
  await api.delete<void>(`/vertex/derived-property-bindings/${id}`);
}
