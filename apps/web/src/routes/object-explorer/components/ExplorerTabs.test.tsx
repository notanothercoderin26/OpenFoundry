// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplorerTabs } from './ExplorerTabs';

afterEach(() => cleanup());

describe('ExplorerTabs', () => {
  it('renders labels without count chips when no count is provided', () => {
    render(
      <ExplorerTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'objects', label: 'Objects' },
        ]}
        active="overview"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Objects' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByText(/\d+/)).toBeNull();
  });

  it('renders the count chip when count is defined', () => {
    render(
      <ExplorerTabs
        tabs={[
          { id: 'overview', label: 'All', count: 4 },
          { id: 'objects', label: 'Objects', count: 2 },
          { id: 'types', label: 'Object types', count: 1 },
          { id: 'artifacts', label: 'Artifacts', count: 0 },
        ]}
        active="overview"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('calls onChange with the clicked tab id', () => {
    const onChange = vi.fn();
    render(
      <ExplorerTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'objects', label: 'Objects' },
        ]}
        active="overview"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Objects' }));
    expect(onChange).toHaveBeenCalledWith('objects');
  });
});
