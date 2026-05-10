// Barrel for the widget registry. Importing this module triggers
// registration of all built-in widget types as a side effect.

export { getWidget, listRegisteredWidgets, registerWidget, type WidgetRegistration, type WidgetRenderProps } from './registry';
export { WorkshopDataContext, useWorkshopData, type WorkshopDataContextValue } from './workshop-context';
export { WorkshopRuntimeProvider } from './WorkshopRuntimeProvider';

import { registerWorkshopWidgets } from './adapters';

registerWorkshopWidgets();
