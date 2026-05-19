// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { FilterEditor, type PropertyOption } from './FilterEditor';

afterEach(() => cleanup());
import type { SearchAroundFilter, SearchAroundParameter } from '@/lib/api/vertexSearchArounds';

const properties: PropertyOption[] = [
  { name: 'Cancelled', displayName: 'Cancelled' },
  { name: 'AirportStateCode', displayName: 'Airport State Code' },
];

const parameters: SearchAroundParameter[] = [
  { name: 'StateCode', type: 'string', description: '', required: false, default_value_json: 'NY' },
];

function baseFilter(over: Partial<SearchAroundFilter> = {}): SearchAroundFilter {
  return { property: 'Cancelled', op: 'eq', literal_json: 'false', ...over };
}

describe('FilterEditor', () => {
  it('emits the new property when the property dropdown changes', () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        filter={baseFilter()}
        properties={properties}
        parameters={parameters}
        onChange={onChange}
        onDelete={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/property/i), {
      target: { value: 'AirportStateCode' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ property: 'AirportStateCode' }));
  });

  it('parses JSON literals (true/numbers/arrays) when the input looks like JSON', () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        filter={baseFilter()}
        properties={properties}
        parameters={parameters}
        onChange={onChange}
        onDelete={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/literal value/i), {
      target: { value: '[1, 2, 3]' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ literal_json: [1, 2, 3], parameter_ref: undefined }),
    );
  });

  it('keeps the value as a string when the JSON parse would fail', () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        filter={baseFilter()}
        properties={properties}
        parameters={parameters}
        onChange={onChange}
        onDelete={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/literal value/i), {
      target: { value: 'San Francisco' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ literal_json: 'San Francisco' }),
    );
  });

  it('switches to a parameter selector when the toggle is pressed', () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        filter={baseFilter()}
        properties={properties}
        parameters={parameters}
        onChange={onChange}
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByTitle(/switch to parameter/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ parameter_ref: 'StateCode', literal_json: undefined }),
    );
  });

  it('renders the parameter dropdown when filter.parameter_ref is set', () => {
    render(
      <FilterEditor
        filter={baseFilter({ parameter_ref: 'StateCode', literal_json: undefined })}
        properties={properties}
        parameters={parameters}
        onChange={() => {}}
        onDelete={() => {}}
      />,
    );
    const dropdown = screen.getByLabelText(/parameter reference/i) as HTMLSelectElement;
    expect(dropdown.value).toBe('StateCode');
  });

  it('calls onDelete when the remove button is pressed', () => {
    const onDelete = vi.fn();
    render(
      <FilterEditor
        filter={baseFilter()}
        properties={properties}
        parameters={parameters}
        onChange={() => {}}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTitle(/remove filter/i));
    expect(onDelete).toHaveBeenCalled();
  });
});
