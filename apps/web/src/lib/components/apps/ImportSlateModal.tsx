import { useEffect, useState, type FormEvent } from 'react';

import type { ImportSlatePackageParams, SlatePackageFile } from '@/lib/api/apps';
import { JsonEditor } from '@/lib/components/JsonEditor';
import { Glyph } from '@/lib/components/ui/Glyph';

interface ImportSlateModalProps {
  open: boolean;
  busy: boolean;
  initialBody: string;
  onClose: () => void;
  onImport: (body: ImportSlatePackageParams) => Promise<void> | void;
}

function starterFile(): SlatePackageFile {
  return {
    path: 'src/App.tsx',
    language: 'tsx',
    content: [
      "import { AppRuntime } from '@open-foundry/sdk/react';",
      '',
      'export default function App() {',
      "  return <AppRuntime slug=\"current-app\" />;",
      '}',
    ].join('\n'),
  };
}

function defaultBody() {
  return JSON.stringify(
    {
      framework: 'react',
      package_name: '@open-foundry/workshop-app',
      entry_file: 'src/App.tsx',
      sdk_import: '@open-foundry/sdk/react',
      files: [starterFile()],
    },
    null,
    2,
  );
}

function validateImportPayload(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Import payload must be an object.';
  const files = (parsed as { files?: unknown }).files;
  if (!Array.isArray(files)) return 'files must be an array.';
  for (const file of files) {
    if (!file || typeof file !== 'object') return 'Each file must be an object.';
    const entry = file as Partial<SlatePackageFile>;
    if (!entry.path || !entry.language || typeof entry.content !== 'string') {
      return 'Each file needs path, language, and content.';
    }
  }
  return null;
}

export function ImportSlateModal({ open, busy, initialBody, onClose, onImport }: ImportSlateModalProps) {
  const [body, setBody] = useState(defaultBody());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setBody(initialBody.trim() ? initialBody : defaultBody());
    setError('');
  }, [initialBody, open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const parsed = JSON.parse(body) as ImportSlatePackageParams;
      const validation = validateImportPayload(parsed);
      if (validation) {
        setError(validation);
        return;
      }
      await onImport(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid Slate package JSON.');
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(31, 37, 45, 0.46)',
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-slate-title"
        className="of-panel"
        onSubmit={(event) => void submit(event)}
        style={{ width: 'min(820px, 100%)', overflow: 'hidden', background: 'var(--bg-panel)' }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>Slate package</p>
            <h2 id="import-slate-title" className="of-heading-sm" style={{ margin: 0 }}>
              Import Slate
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy} aria-label="Close">
            <Glyph name="x" size={15} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          {error ? (
            <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              {error}
            </div>
          ) : null}

          <JsonEditor
            label="Package JSON"
            value={body}
            onChange={setBody}
            minHeight={360}
            validate={validateImportPayload}
            disabled={busy}
          />
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-panel-muted)',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary" disabled={busy}>
            {busy ? 'Importing...' : 'Import Slate'}
          </button>
        </footer>
      </form>
    </div>
  );
}
