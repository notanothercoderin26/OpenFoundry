// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ObjectType } from '@/lib/api/ontology';

import { SavedArtifactEditor, type SavedArtifactEditorProps } from './SavedArtifactEditor';

afterEach(() => cleanup());

function makeType(id: string, displayName: string): ObjectType {
  return {
    id,
    name: id,
    display_name: displayName,
    description: '',
    primary_key_property: null,
    icon: null,
    color: null,
    properties: [],
  } as unknown as ObjectType;
}

function baseProps(overrides: Partial<SavedArtifactEditorProps> = {}): SavedArtifactEditorProps {
  return {
    open: true,
    objectTypesWithVisibleRows: [makeType('flight', '[Example Data] Flight')],
    busy: false,
    newSetName: '',
    setNewSetName: () => undefined,
    newSetType: '',
    setNewSetType: () => undefined,
    newSetDescription: '',
    setNewSetDescription: () => undefined,
    newSetWhatIf: '',
    setNewSetWhatIf: () => undefined,
    saveKind: 'exploration',
    setSaveKind: () => undefined,
    savePrivacy: 'private',
    setSavePrivacy: () => undefined,
    saveProjectId: '',
    setSaveProjectId: () => undefined,
    saveFolderPath: '/home/Explorations',
    setSaveFolderPath: () => undefined,
    saveLayoutView: 'split',
    setSaveLayoutView: () => undefined,
    saveColumns: 'id, title',
    setSaveColumns: () => undefined,
    lastShareLink: '',
    onSubmit: () => undefined,
    onClose: () => undefined,
    ...overrides,
  };
}

describe('SavedArtifactEditor', () => {
  it('returns null when closed', () => {
    const { container } = render(<SavedArtifactEditor {...baseProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the form fields when open', () => {
    render(<SavedArtifactEditor {...baseProps()} />);
    expect(screen.getByText('New artifact')).toBeTruthy();
    expect(screen.getByPlaceholderText('My exploration')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save exploration/i })).toBeTruthy();
  });

  it('toggles the CTA label when saveKind switches to list', () => {
    render(<SavedArtifactEditor {...baseProps({ saveKind: 'list' })} />);
    expect(screen.getByRole('button', { name: /Save list/i })).toBeTruthy();
  });

  it('disables the share folder path while privacy is private and re-enables it on public', () => {
    const { rerender } = render(<SavedArtifactEditor {...baseProps()} />);
    const folder = screen.getByPlaceholderText('/Shared/Explorations') as HTMLInputElement;
    expect(folder.disabled).toBe(true);
    rerender(<SavedArtifactEditor {...baseProps({ savePrivacy: 'public' })} />);
    const folder2 = screen.getByPlaceholderText('/Shared/Explorations') as HTMLInputElement;
    expect(folder2.disabled).toBe(false);
  });

  it('calls onSubmit when the form is submitted', () => {
    const onSubmit = vi.fn();
    render(<SavedArtifactEditor {...baseProps({ onSubmit })} />);
    fireEvent.click(screen.getByRole('button', { name: /Save exploration/i }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('closes on backdrop click and on Escape', () => {
    const onClose = vi.fn();
    render(<SavedArtifactEditor {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
