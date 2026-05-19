// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ParameterEditor } from './ParameterEditor';

afterEach(() => cleanup());
import type { SearchAroundParameter } from '@/lib/api/vertexSearchArounds';

const empty: SearchAroundParameter[] = [];

describe('ParameterEditor', () => {
  it('shows the empty-state message when no parameters are configured', () => {
    render(<ParameterEditor parameters={empty} onChange={() => {}} />);
    expect(screen.getByText(/no parameters yet/i)).toBeTruthy();
  });

  it('adds a parameter with the chosen type and a unique name', () => {
    const onChange = vi.fn();
    render(<ParameterEditor parameters={empty} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue(/add parameter/i), { target: { value: 'date' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'date', name: 'DateParam', required: false }),
    ]);
  });

  it('parses literal values via JSON when editing the inline value cell', () => {
    const onChange = vi.fn();
    const params: SearchAroundParameter[] = [
      { name: 'IsCancelled', type: 'boolean', description: '', required: false },
    ];
    render(<ParameterEditor parameters={params} onChange={onChange} />);
    const valueInput = screen.getByLabelText(/IsCancelled value/i);
    fireEvent.change(valueInput, { target: { value: 'true' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'IsCancelled', default_value_json: true }),
    ]);
  });

  it('opens the edit drawer when the pencil is pressed and saves changes', () => {
    const onChange = vi.fn();
    const params: SearchAroundParameter[] = [
      { name: 'StateCode', type: 'string', description: '', required: false },
    ];
    render(<ParameterEditor parameters={params} onChange={onChange} />);
    fireEvent.click(screen.getByTitle(/edit parameter/i));
    // Required toggle is rendered now.
    const required = screen.getByLabelText(/required/i) as HTMLInputElement;
    fireEvent.click(required);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'StateCode', required: true }),
    ]);
  });

  it('deletes a parameter from the edit drawer', () => {
    const onChange = vi.fn();
    const params: SearchAroundParameter[] = [
      { name: 'StateCode', type: 'string', description: '', required: false },
    ];
    render(<ParameterEditor parameters={params} onChange={onChange} />);
    fireEvent.click(screen.getByTitle(/edit parameter/i));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('hides the parameter table when "Hide parameters" is clicked', () => {
    const params: SearchAroundParameter[] = [
      { name: 'StateCode', type: 'string', description: '', required: false },
    ];
    render(<ParameterEditor parameters={params} onChange={() => {}} />);
    expect(screen.queryByText('StateCode')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /hide parameters/i }));
    expect(screen.queryByText('StateCode')).toBeNull();
  });
});
