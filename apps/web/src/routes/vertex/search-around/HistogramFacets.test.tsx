// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HistogramFacets, type HistogramFilterChip } from './HistogramFacets';

const histogramMock = vi.fn();

vi.mock('@/lib/api/vertexTraversal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/vertexTraversal')>();
  return {
    ...actual,
    histogram: (...args: Parameters<typeof actual.histogram>) => histogramMock(...args),
  };
});

beforeEach(() => {
  histogramMock.mockReset();
});

afterEach(() => cleanup());

const objectRefs = [
  { object_type_id: 'flight', object_id: '1', display_label: 'AA1004' },
  { object_type_id: 'airport', object_id: '2', display_label: 'SFO' },
];

const facets = [
  {
    property: '@object_type',
    buckets: [
      { value_json: 'flight', count: 2 },
      { value_json: 'airport', count: 1 },
    ],
    n: 3,
    uniq: 2,
  },
  {
    property: 'Cancelled',
    object_type_id: 'flight',
    buckets: [
      { value_json: false, count: 1 },
      { value_json: true, count: 1 },
    ],
    n: 2,
    uniq: 2,
  },
];

describe('HistogramFacets', () => {
  it('fetches facets and renders the Object Types row at the top', async () => {
    histogramMock.mockResolvedValue({ facets });
    render(
      <HistogramFacets
        tenant="tnt"
        objectRefs={objectRefs}
        chips={[]}
        onAddChip={() => {}}
        onRemoveChip={() => {}}
        resolveTypeName={(id) => (id === 'flight' ? '[Example Data] Flight' : id)}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/object types/i)).toBeTruthy();
    });
    // Resolved type label is rendered instead of raw id.
    expect(screen.getByText(/\[Example Data\] Flight/)).toBeTruthy();
  });

  it('mints a "to" chip when the "to" button is pressed', async () => {
    histogramMock.mockResolvedValue({ facets });
    const onAddChip = vi.fn();
    render(
      <HistogramFacets
        tenant="tnt"
        objectRefs={objectRefs}
        chips={[]}
        onAddChip={onAddChip}
        onRemoveChip={() => {}}
      />,
    );
    await waitFor(() => {
      expect(document.querySelectorAll('button[title="Filter to this value"]').length).toBeGreaterThan(0);
    });
    const toButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title="Filter to this value"]'));
    fireEvent.click(toButtons[0]);
    expect(onAddChip).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'to', property: '@object_type', value: 'flight' }),
    );
  });

  it('removes an existing chip when the active "to" button is pressed again', async () => {
    histogramMock.mockResolvedValue({ facets });
    const chip: HistogramFilterChip = {
      property: '@object_type',
      value: 'flight',
      mode: 'to',
      label: 'Object Types = flight',
    };
    const onRemoveChip = vi.fn();
    render(
      <HistogramFacets
        tenant="tnt"
        objectRefs={objectRefs}
        chips={[chip]}
        onAddChip={() => {}}
        onRemoveChip={onRemoveChip}
      />,
    );
    await waitFor(() => {
      expect(document.querySelectorAll('button[title="Filter to this value"]').length).toBeGreaterThan(0);
    });
    const toButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title="Filter to this value"]'));
    fireEvent.click(toButtons[0]);
    expect(onRemoveChip).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'to', property: '@object_type', value: 'flight' }),
    );
  });

  it('emits an "out" chip when the "out" button is pressed', async () => {
    histogramMock.mockResolvedValue({ facets });
    const onAddChip = vi.fn();
    render(
      <HistogramFacets
        tenant="tnt"
        objectRefs={objectRefs}
        chips={[]}
        onAddChip={onAddChip}
        onRemoveChip={() => {}}
      />,
    );
    await waitFor(() => {
      expect(document.querySelectorAll('button[title="Filter out this value"]').length).toBeGreaterThan(0);
    });
    const outButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title="Filter out this value"]'));
    fireEvent.click(outButtons[0]);
    expect(onAddChip).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'out', property: '@object_type', value: 'flight' }),
    );
  });

  it('does not call the API when no object refs are passed', async () => {
    render(
      <HistogramFacets
        tenant="tnt"
        objectRefs={[]}
        chips={[]}
        onAddChip={() => {}}
        onRemoveChip={() => {}}
      />,
    );
    // Give react a tick — the effect should bail early.
    await new Promise((r) => setTimeout(r, 10));
    expect(histogramMock).not.toHaveBeenCalled();
  });

  it('filters the visible facet list by the search input', async () => {
    histogramMock.mockResolvedValue({ facets });
    render(
      <HistogramFacets
        tenant="tnt"
        objectRefs={objectRefs}
        chips={[]}
        onAddChip={() => {}}
        onRemoveChip={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/object types/i)).toBeTruthy();
      expect(screen.getByText('Cancelled')).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText(/filter histogram/i), {
      target: { value: 'Cancelled' },
    });
    expect(screen.queryByText(/object types/i)).toBeNull();
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });
});
