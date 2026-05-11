import { describe, expect, it } from 'vitest';

import { createWorkshopVariableEngine, type WorkshopVariableLike } from './workshopVariables';
import {
  formatMetricValue,
  metricCardRuleMatches,
  readMetricCardProps,
  resolveMetricCardMetrics,
} from './metricCard';

describe('Metric Card helpers', () => {
  it('resolves grouped numeric and string variables with formatting', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'temp', kind: 'numeric', name: 'Temperature', object_type_id: '', default_value: 84.23 },
      { id: 'wind', kind: 'numeric', name: 'Wind speed', object_type_id: '', default_value: 4.76 },
      { id: 'summary', kind: 'string', name: 'Summary', object_type_id: '', default_value: 'Clear' },
    ];
    const engine = createWorkshopVariableEngine(variables);
    const props = readMetricCardProps({
      label: 'Weather Conditions',
      layout_style: 'card',
      metric_size: 'large',
      metrics: [
        {
          id: 'temperature',
          label: 'Current Temperature',
          value_type: 'number',
          variable_id: 'temp',
          format: { kind: 'unit', precision: 0, unit: 'Fahrenheit' },
          conditional_formatting: [{ operator: 'gte', value: 80, tone: 'warning' }],
        },
        {
          id: 'wind',
          label: 'Current Windspeed',
          value_type: 'number',
          variable_id: 'wind',
          format: { kind: 'unit', precision: 1, unit: 'mph' },
        },
        {
          id: 'summary',
          label: 'Forecast',
          value_type: 'string',
          variable_id: 'summary',
        },
      ],
    });

    const metrics = resolveMetricCardMetrics(props, engine);

    expect(metrics.map((metric) => [metric.label, metric.displayValue])).toEqual([
      ['Current Temperature', '84 Fahrenheit'],
      ['Current Windspeed', '4.8 mph'],
      ['Forecast', 'Clear'],
    ]);
    expect(metrics[0].matchedRule?.tone).toBe('warning');
    expect(metrics[0].style.color).toBe('#a16207');
  });

  it('keeps legacy single-value props compatible', () => {
    const props = readMetricCardProps({ value: '128', delta: '+4.2%', format: 'integer' });
    const metrics = resolveMetricCardMetrics(props, createWorkshopVariableEngine([]));

    expect(props.metrics).toHaveLength(1);
    expect(metrics[0].displayValue).toBe('128');
    expect(metrics[0].secondary?.displayValue).toBe('+4.2%');
  });

  it('formats common numeric display modes', () => {
    expect(formatMetricValue(0.8732, 'number', { kind: 'percent', precision: 1 })).toBe('87.3%');
    expect(formatMetricValue(1527, 'number', { kind: 'compact', precision: 1 })).toBe('1.5K');
    expect(formatMetricValue(62, 'number', { kind: 'unit', precision: 0, suffix: ' degrees' })).toBe('62 degrees');
    expect(formatMetricValue(null, 'number', { empty_value: 'No data' })).toBe('No data');
  });

  it('evaluates numeric and string conditional formatting rules', () => {
    expect(metricCardRuleMatches({ operator: 'between', min: 70, max: 90 }, 84, 84)).toBe(true);
    expect(metricCardRuleMatches({ operator: 'contains', value: 'clear' }, 'Clear skies', null)).toBe(true);
    expect(metricCardRuleMatches({ operator: 'lte', value: 0 }, -1, -1)).toBe(true);
    expect(metricCardRuleMatches({ operator: 'gt', value: 10 }, 4.8, 4.8)).toBe(false);
  });
});
