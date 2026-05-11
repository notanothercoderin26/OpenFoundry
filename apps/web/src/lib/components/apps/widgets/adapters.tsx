// Registry adapters — bridge the widget components defined in
// WorkshopEditorPage.tsx (which take typed props like `variables` and
// `objectTypes`) to the registry's uniform `{widget}`-only API.
//
// Each adapter is a thin component that pulls from WorkshopDataContext and
// forwards. This keeps the original components prop-driven (so the editor
// can render them with explicit values) while letting the runtime drive
// them via context.

import {
  ButtonGroupWidgetView,
  ChartPieWidgetView,
  ChartXyWidgetView,
  FilterListWidgetView,
  MapWidgetView,
  MetricCardWidgetView,
  ObjectSetTitleWidgetView,
  ObjectTableWidgetView,
  PropertyListWidgetView,
  ScenarioWidgetView,
} from '@/routes/apps/WorkshopEditorPage';
import { FreeFormAnalysisWidget } from './FreeFormAnalysisWidget';

import { registerWidget, type WidgetRenderProps } from './registry';
import { useWorkshopData } from './workshop-context';

function ObjectTableAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <ObjectTableWidgetView widget={widget} variables={variables} />;
}

function FilterListAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <FilterListWidgetView widget={widget} variables={variables} />;
}

function ObjectSetTitleAdapter({ widget }: WidgetRenderProps) {
  const { variables, objectTypes } = useWorkshopData();
  return <ObjectSetTitleWidgetView widget={widget} variables={variables} objectTypes={objectTypes} />;
}

function ButtonGroupAdapter({ widget }: WidgetRenderProps) {
  return <ButtonGroupWidgetView widget={widget} />;
}

function PropertyListAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <PropertyListWidgetView widget={widget} variables={variables} />;
}

function ChartPieAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <ChartPieWidgetView widget={widget} variables={variables} />;
}

function ChartXyAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <ChartXyWidgetView widget={widget} variables={variables} />;
}

function MetricCardAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <MetricCardWidgetView widget={widget} variables={variables} />;
}

function MapAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <MapWidgetView widget={widget} variables={variables} />;
}

function FreeFormAnalysisAdapter({ widget }: WidgetRenderProps) {
  const { variables } = useWorkshopData();
  return <FreeFormAnalysisWidget widget={widget} variables={variables} />;
}

function ScenarioAdapter({ widget }: WidgetRenderProps) {
  return <ScenarioWidgetView widget={widget} />;
}

let registered = false;

export function registerWorkshopWidgets(): void {
  if (registered) return;
  registered = true;
  registerWidget({ type: 'object_table', Component: ObjectTableAdapter, label: 'Object table', version: '1.0.0' });
  registerWidget({ type: 'filter_list', Component: FilterListAdapter, label: 'Filter list', version: '1.0.0' });
  registerWidget({ type: 'object_set_title', Component: ObjectSetTitleAdapter, label: 'Object set KPI', version: '1.0.0' });
  registerWidget({ type: 'button_group', Component: ButtonGroupAdapter, label: 'Button group', version: '1.0.0' });
  registerWidget({ type: 'property_list', Component: PropertyListAdapter, label: 'Property list', version: '1.0.0' });
  registerWidget({ type: 'chart_pie', Component: ChartPieAdapter, label: 'Pie chart', version: '1.0.0' });
  registerWidget({ type: 'chart_xy', Component: ChartXyAdapter, label: 'XY chart', version: '1.0.0' });
  registerWidget({ type: 'metric', Component: MetricCardAdapter, label: 'Metric card', version: '1.0.0' });
  registerWidget({ type: 'map', Component: MapAdapter, label: 'Map', version: '1.0.0' });
  registerWidget({ type: 'free_form_analysis', Component: FreeFormAnalysisAdapter, label: 'Free-form analysis', version: '1.0.0' });
  registerWidget({ type: 'scenario', Component: ScenarioAdapter, label: 'Scenario controls', version: '1.0.0' });
}
