import type {
  DashboardChartType,
  DashboardNumberFormat,
  DashboardWidget,
  DashboardWidgetLayout,
} from '@/lib/utils/dashboards';

interface ChartSettingsProps {
  draft: DashboardWidget;
  columnOptions: string[];
  seriesColumnsInput: string;
  onPatchDraft: (patch: Partial<DashboardWidget>) => void;
  onPatchLayout: (patch: Partial<DashboardWidgetLayout>) => void;
  onSeriesColumnsInputChange: (value: string) => void;
}

const CHART_TYPES: Array<{ value: DashboardChartType; label: string }> = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
];

const NUMBER_FORMATS: Array<{ value: DashboardNumberFormat; label: string }> = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
];

function toLayoutValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

function ColumnDatalist({ id, columns }: { id: string; columns: string[] }) {
  if (columns.length === 0) return null;
  return (
    <datalist id={id}>
      {columns.map((column) => (
        <option key={column} value={column} />
      ))}
    </datalist>
  );
}

export function ChartSettings({
  draft,
  columnOptions,
  seriesColumnsInput,
  onPatchDraft,
  onPatchLayout,
  onSeriesColumnsInputChange,
}: ChartSettingsProps) {
  const datalistId = `widget-config-columns-${draft.id}`;

  return (
    <div className="widget-config-section">
      <div className="widget-config-section__header">
        <div>
          <h3>Layout</h3>
          <span>{draft.layout.colSpan} columns by {draft.layout.rowSpan} rows</span>
        </div>
      </div>

      <div className="widget-config-grid widget-config-grid--narrow">
        <label className="widget-config-field">
          <span>Columns</span>
          <input
            type="number"
            className="of-input"
            min={1}
            max={12}
            value={draft.layout.colSpan}
            onChange={(event) => onPatchLayout({ colSpan: toLayoutValue(Number(event.target.value), 1, 12) })}
          />
        </label>
        <label className="widget-config-field">
          <span>Rows</span>
          <input
            type="number"
            className="of-input"
            min={1}
            max={4}
            value={draft.layout.rowSpan}
            onChange={(event) => onPatchLayout({ rowSpan: toLayoutValue(Number(event.target.value), 1, 4) })}
          />
        </label>
      </div>

      <ColumnDatalist id={datalistId} columns={columnOptions} />

      {draft.type === 'chart' && (
        <>
          <div className="widget-config-section__header widget-config-section__header--compact">
            <div>
              <h3>Chart settings</h3>
              <span>{draft.chartType}</span>
            </div>
          </div>

          <div className="widget-config-grid">
            <label className="widget-config-field">
              <span>Chart type</span>
              <select
                className="of-select"
                value={draft.chartType}
                onChange={(event) => onPatchDraft({ chartType: event.target.value as DashboardChartType } as Partial<DashboardWidget>)}
              >
                {CHART_TYPES.map((chartType) => (
                  <option key={chartType.value} value={chartType.value}>
                    {chartType.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="widget-config-field">
              <span>Category column</span>
              <input
                type="text"
                className="of-input"
                list={datalistId}
                value={draft.categoryColumn}
                onChange={(event) => onPatchDraft({ categoryColumn: event.target.value } as Partial<DashboardWidget>)}
              />
            </label>
          </div>

          <label className="widget-config-field">
            <span>Series columns</span>
            <input
              type="text"
              className="of-input"
              value={seriesColumnsInput}
              onChange={(event) => onSeriesColumnsInputChange(event.target.value)}
              placeholder="ingested, published"
            />
          </label>

          <label className="widget-config-check">
            <input
              type="checkbox"
              checked={draft.stacked}
              onChange={(event) => onPatchDraft({ stacked: event.target.checked } as Partial<DashboardWidget>)}
            />
            <span>Stack series</span>
          </label>
        </>
      )}

      {draft.type === 'table' && (
        <>
          <div className="widget-config-section__header widget-config-section__header--compact">
            <div>
              <h3>Table settings</h3>
              <span>{draft.pageSize} rows per page</span>
            </div>
          </div>

          <div className="widget-config-grid">
            <label className="widget-config-field">
              <span>Page size</span>
              <input
                type="number"
                className="of-input"
                min={3}
                max={50}
                value={draft.pageSize}
                onChange={(event) => onPatchDraft({ pageSize: toLayoutValue(Number(event.target.value), 3, 50) } as Partial<DashboardWidget>)}
              />
            </label>

            <label className="widget-config-field">
              <span>Default sort column</span>
              <input
                type="text"
                className="of-input"
                list={datalistId}
                value={draft.defaultSortColumn}
                onChange={(event) => onPatchDraft({ defaultSortColumn: event.target.value } as Partial<DashboardWidget>)}
              />
            </label>

            <label className="widget-config-field">
              <span>Sort direction</span>
              <select
                className="of-select"
                value={draft.defaultSortDirection}
                onChange={(event) => onPatchDraft({ defaultSortDirection: event.target.value as 'asc' | 'desc' } as Partial<DashboardWidget>)}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
        </>
      )}

      {draft.type === 'kpi' && (
        <>
          <div className="widget-config-section__header widget-config-section__header--compact">
            <div>
              <h3>KPI settings</h3>
              <span>{draft.valueFormat}</span>
            </div>
          </div>

          <div className="widget-config-grid">
            <label className="widget-config-field">
              <span>Value column</span>
              <input
                type="text"
                className="of-input"
                list={datalistId}
                value={draft.valueColumn}
                onChange={(event) => onPatchDraft({ valueColumn: event.target.value } as Partial<DashboardWidget>)}
              />
            </label>
            <label className="widget-config-field">
              <span>Delta column</span>
              <input
                type="text"
                className="of-input"
                list={datalistId}
                value={draft.deltaColumn}
                onChange={(event) => onPatchDraft({ deltaColumn: event.target.value } as Partial<DashboardWidget>)}
              />
            </label>
            <label className="widget-config-field">
              <span>Sparkline column</span>
              <input
                type="text"
                className="of-input"
                list={datalistId}
                value={draft.sparklineColumn}
                onChange={(event) => onPatchDraft({ sparklineColumn: event.target.value } as Partial<DashboardWidget>)}
              />
            </label>
            <label className="widget-config-field">
              <span>Value format</span>
              <select
                className="of-select"
                value={draft.valueFormat}
                onChange={(event) => onPatchDraft({ valueFormat: event.target.value as DashboardNumberFormat } as Partial<DashboardWidget>)}
              >
                {NUMBER_FORMATS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
