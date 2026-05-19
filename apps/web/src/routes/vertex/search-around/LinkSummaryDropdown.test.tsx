// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LinkSummaryDropdown } from './LinkSummaryDropdown';

const linkSummaryMock = vi.fn();
const listLinkTypesMock = vi.fn();

vi.mock('@/lib/api/vertexTraversal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/vertexTraversal')>();
  return {
    ...actual,
    linkSummary: (...args: Parameters<typeof actual.linkSummary>) => linkSummaryMock(...args),
  };
});

vi.mock('@/lib/api/ontology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/ontology')>();
  return {
    ...actual,
    listLinkTypes: (...args: Parameters<typeof actual.listLinkTypes>) =>
      listLinkTypesMock(...args),
  };
});

beforeEach(() => {
  linkSummaryMock.mockReset();
  listLinkTypesMock.mockReset();
});

afterEach(() => cleanup());

describe('LinkSummaryDropdown', () => {
  it('lists relations sorted by descending count', async () => {
    listLinkTypesMock.mockResolvedValue({
      data: [
        { id: 'l1', name: 'arriving_flight', display_name: 'Arriving Flight', source_type_id: 't', target_type_id: 't', cardinality: 'many' },
        { id: 'l2', name: 'runway', display_name: 'Runway', source_type_id: 't', target_type_id: 't', cardinality: 'many' },
      ],
      total: 2,
    });
    linkSummaryMock.mockResolvedValue({
      entries: [
        { link_type_id: 'l1', direction: 'outgoing', count: 102064, count_is_estimate: false },
        { link_type_id: 'l2', direction: 'outgoing', count: 4, count_is_estimate: false },
      ],
      hidden_count: 0,
    });

    render(
      <LinkSummaryDropdown
        tenant="tnt"
        objectId="obj"
        objectTypeId="t"
        onExpand={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Arriving Flight')).toBeTruthy();
      expect(screen.getByText('Runway')).toBeTruthy();
    });
    // Verify count formatting (102K vs raw 4).
    expect(screen.getByText('102.1K')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('emits the entry on click', async () => {
    listLinkTypesMock.mockResolvedValue({
      data: [
        { id: 'l1', name: 'route', display_name: 'Route', source_type_id: 't', target_type_id: 't', cardinality: 'many' },
      ],
      total: 1,
    });
    linkSummaryMock.mockResolvedValue({
      entries: [
        { link_type_id: 'l1', direction: 'outgoing', count: 42, count_is_estimate: false },
      ],
      hidden_count: 0,
    });
    const onExpand = vi.fn();
    render(
      <LinkSummaryDropdown
        tenant="tnt"
        objectId="obj"
        objectTypeId="t"
        onExpand={onExpand}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Route')).toBeTruthy();
    });
    fireEvent.click(screen.getByTitle(/expand route/i));
    expect(onExpand).toHaveBeenCalledWith(
      expect.objectContaining({ link_type_id: 'l1', count: 42 }),
      expect.any(Object),
    );
  });

  it('collapses outgoing+incoming for the same link type into the higher-count row', async () => {
    listLinkTypesMock.mockResolvedValue({
      data: [
        { id: 'l1', name: 'flight', display_name: 'Flight', source_type_id: 't', target_type_id: 't', cardinality: 'many' },
      ],
      total: 1,
    });
    linkSummaryMock.mockResolvedValue({
      entries: [
        { link_type_id: 'l1', direction: 'outgoing', count: 5, count_is_estimate: false },
        { link_type_id: 'l1', direction: 'incoming', count: 99, count_is_estimate: false },
      ],
      hidden_count: 0,
    });
    render(
      <LinkSummaryDropdown
        tenant="tnt"
        objectId="obj"
        objectTypeId="t"
        onExpand={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('99')).toBeTruthy();
      expect(screen.queryByText('5')).toBeNull();
    });
  });
});
