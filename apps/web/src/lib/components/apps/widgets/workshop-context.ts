// WorkshopDataContext — carries the per-app variables and the available
// object types into the widget tree. The actual widget components live in
// WorkshopEditorPage.tsx and accept these as props; the registry adapters
// in ./adapters.tsx read from this context and forward them.
//
// Both the editor preview and the public runtime provide values for this
// context. Widgets never call listObjectTypes() themselves.

import { createContext, useContext } from 'react';

import type { ObjectType } from '@/lib/api/ontology';
import type { WorkshopVariable } from '@/routes/apps/WorkshopEditorPage';

export interface WorkshopDataContextValue {
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
}

const EMPTY: WorkshopDataContextValue = { variables: [], objectTypes: [] };

export const WorkshopDataContext = createContext<WorkshopDataContextValue>(EMPTY);

export function useWorkshopData(): WorkshopDataContextValue {
  return useContext(WorkshopDataContext);
}
