import type { ObjectInstance } from '@/lib/api/ontology';

export type ChartXyLayerType = 'bar' | 'line' | 'scatter';
export type ChartXySeriesMetric = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'approx_unique';
export type ChartXySortBy = 'key_asc' | 'key_desc' | 'value_asc' | 'value_desc';

export interface ChartXyLayerLike {
  id: string;
  title: string;
  source_variable_id?: string;
  object_type_id?: string;
  layer_type: ChartXyLayerType;
  show_labels?: boolean;
  x_property: string;
  x_limit?: string;
  series_metric: ChartXySeriesMetric;
  series_property?: string;
  cumulative_sum?: boolean;
  segment_by?: string;
}

export interface ChartXyBuildOptions {
  sortBy?: ChartXySortBy;
  barOrientation?: 'horizontal' | 'vertical';
}

export interface ChartXySeries {
  layerId: string;
  name: string;
  type: ChartXyLayerType;
  data: number[];
  objectsByCategory: Record<string, ObjectInstance[]>;
  showLabels: boolean;
}

export interface ChartXyAggregationResult {
  categories: string[];
  series: ChartXySeries[];
  objectsByCategory: Record<string, ObjectInstance[]>;
  firstCategoryProperty: string;
}

interface Accumulator {
  sum: number;
  count: number;
  min: number | null;
  max: number | null;
  unique: Set<string>;
  objects: ObjectInstance[];
}

export function buildChartXyAggregation(
  rowsByLayer: Record<string, ObjectInstance[]>,
  layers: ChartXyLayerLike[],
  options: ChartXyBuildOptions = {},
): ChartXyAggregationResult {
  const categories = new Set<string>();
  const objectsByCategory = new Map<string, ObjectInstance[]>();
  const series: ChartXySeries[] = [];
  const firstCategoryProperty = layers.find((layer) => layer.x_property)?.x_property ?? '';

  for (const layer of layers.filter((entry) => entry.x_property)) {
    const layerRows = rowsByLayer[layer.id] ?? [];
    const segmentBuckets = new Map<string, Map<string, Accumulator>>();
    for (const row of layerRows) {
      const props = row.properties ?? {};
      const category = categoryKey(props[layer.x_property]);
      const segment = layer.segment_by ? categoryKey(props[layer.segment_by]) : layer.title || 'Series';
      const value = metricValue(row, layer);
      if (value === null) continue;
      categories.add(category);
      addObject(objectsByCategory, category, row);
      const bucketMap = segmentBuckets.get(segment) ?? new Map<string, Accumulator>();
      const accumulator = bucketMap.get(category) ?? emptyAccumulator();
      accumulator.count += 1;
      accumulator.sum += value;
      accumulator.min = accumulator.min === null ? value : Math.min(accumulator.min, value);
      accumulator.max = accumulator.max === null ? value : Math.max(accumulator.max, value);
      accumulator.unique.add(uniqueValue(row, layer));
      accumulator.objects.push(row);
      bucketMap.set(category, accumulator);
      segmentBuckets.set(segment, bucketMap);
    }

    for (const [segment, bucketMap] of segmentBuckets) {
      const safeName = layer.segment_by ? `${layer.title || 'Layer'}: ${segment}` : (layer.title || segment);
      series.push({
        layerId: layer.id,
        name: safeName,
        type: layer.layer_type,
        data: [],
        objectsByCategory: Object.fromEntries([...bucketMap.entries()].map(([category, accumulator]) => [category, uniqueObjects(accumulator.objects)])),
        showLabels: layer.show_labels !== false,
      });
    }
  }

  const categoryTotals = new Map<string, number>();
  for (const category of categories) {
    let total = 0;
    for (const layer of layers) {
      const layerSeries = series.filter((entry) => entry.layerId === layer.id);
      for (const entry of layerSeries) {
        total += aggregateCategoryValue(rowsByLayer[layer.id] ?? [], layer, category, entry.name);
      }
    }
    categoryTotals.set(category, total);
  }

  let orderedCategories = [...categories];
  orderedCategories.sort((a, b) => compareCategories(a, b, categoryTotals, options.sortBy ?? 'key_asc'));
  const limit = firstPositiveLimit(layers);
  if (limit > 0) orderedCategories = orderedCategories.slice(0, limit);

  for (const layer of layers) {
    const layerSeries = series.filter((entry) => entry.layerId === layer.id);
    for (const entry of layerSeries) {
      let values = orderedCategories.map((category) => {
        const rows = rowsByLayer[layer.id] ?? [];
        return aggregateCategoryValue(rows, layer, category, entry.name);
      });
      if (layer.cumulative_sum) {
        let running = 0;
        values = values.map((value) => {
          running += value;
          return running;
        });
      }
      entry.data = values;
    }
  }

  return {
    categories: orderedCategories,
    series,
    objectsByCategory: Object.fromEntries(orderedCategories.map((category) => [category, uniqueObjects(objectsByCategory.get(category) ?? [])])),
    firstCategoryProperty,
  };
}

export function chartXyEChartsOption(
  aggregation: ChartXyAggregationResult,
  options: ChartXyBuildOptions & {
    showLegend?: boolean;
    showTooltips?: boolean;
    showTitle?: boolean;
    palette?: string[];
  } = {},
) {
  const isHorizontal = options.barOrientation === 'horizontal';
  const valueAxis = { type: 'value', name: options.showTitle ? 'Value' : '' };
  const categoryAxis = { type: 'category', data: aggregation.categories, name: options.showTitle ? aggregation.firstCategoryProperty : '' };
  return {
    color: options.palette,
    tooltip: options.showTooltips !== false ? { trigger: 'axis' } : { show: false },
    legend: options.showLegend ? { show: true, top: 0 } : { show: false },
    grid: { left: 50, right: 16, top: options.showLegend ? 28 : 12, bottom: 36, containLabel: true },
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series: aggregation.series.map((series) => {
      const seriesType = series.type === 'line' ? 'line' : series.type === 'scatter' ? 'scatter' : 'bar';
      return {
        name: series.name,
        type: seriesType,
        stack: aggregation.series.length > 1 && seriesType === 'bar' ? 'total' : undefined,
        data: series.data,
        label: { show: series.showLabels && seriesType !== 'scatter', position: isHorizontal ? 'right' : 'top' },
      };
    }),
  };
}

function aggregateCategoryValue(rows: ObjectInstance[], layer: ChartXyLayerLike, category: string, seriesName: string) {
  const matching = rows.filter((row) => {
    const props = row.properties ?? {};
    const rowCategory = categoryKey(props[layer.x_property]);
    const segment = layer.segment_by ? `${layer.title || 'Layer'}: ${categoryKey(props[layer.segment_by])}` : (layer.title || 'Series');
    return rowCategory === category && segment === seriesName;
  });
  if (matching.length === 0) return 0;
  if (layer.series_metric === 'count') return matching.length;
  if (layer.series_metric === 'approx_unique') {
    return new Set(matching.map((row) => uniqueValue(row, layer))).size;
  }
  const values = matching.map((row) => metricValue(row, layer)).filter((value): value is number => value !== null);
  if (values.length === 0) return 0;
  if (layer.series_metric === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (layer.series_metric === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (layer.series_metric === 'min') return Math.min(...values);
  if (layer.series_metric === 'max') return Math.max(...values);
  return values.length;
}

function categoryKey(value: unknown) {
  if (value === null || value === undefined || value === '') return 'No value';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function metricValue(row: ObjectInstance, layer: ChartXyLayerLike) {
  if (layer.series_metric === 'count') return 1;
  if (layer.series_metric === 'approx_unique') return 1;
  const raw = layer.series_property ? row.properties?.[layer.series_property] : undefined;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function uniqueValue(row: ObjectInstance, layer: ChartXyLayerLike) {
  const raw = layer.series_property ? row.properties?.[layer.series_property] : row.id;
  if (raw === null || raw === undefined) return '';
  return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
}

function emptyAccumulator(): Accumulator {
  return { sum: 0, count: 0, min: null, max: null, unique: new Set(), objects: [] };
}

function addObject(map: Map<string, ObjectInstance[]>, category: string, object: ObjectInstance) {
  const current = map.get(category) ?? [];
  if (!current.some((entry) => entry.id === object.id)) current.push(object);
  map.set(category, current);
}

function uniqueObjects(objects: ObjectInstance[]) {
  const seen = new Set<string>();
  const out: ObjectInstance[] = [];
  for (const object of objects) {
    if (seen.has(object.id)) continue;
    seen.add(object.id);
    out.push(object);
  }
  return out;
}

function compareCategories(left: string, right: string, totals: Map<string, number>, sortBy: ChartXySortBy) {
  if (sortBy === 'key_asc' || sortBy === 'key_desc') {
    const compared = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    return sortBy === 'key_asc' ? compared : -compared;
  }
  const leftTotal = totals.get(left) ?? 0;
  const rightTotal = totals.get(right) ?? 0;
  return sortBy === 'value_asc' ? leftTotal - rightTotal : rightTotal - leftTotal;
}

function firstPositiveLimit(layers: ChartXyLayerLike[]) {
  for (const layer of layers) {
    const value = Number(layer.x_limit);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return 0;
}
