import { useEffect, useState, type FormEvent } from 'react';

import { createBranchV2, type DatasetBranch } from '@/lib/api/datasets';

interface CreateBranchDialogProps {
  datasetRid: string;
  open: boolean;
  branches: DatasetBranch[];
  onClose: () => void;
  onCreated?: (branch: DatasetBranch) => void;
}

type Mode = 'from_branch' | 'from_transaction' | 'as_root';

export function CreateBranchDialog({ datasetRid, open, branches, onClose, onCreated }: CreateBranchDialogProps) {
  const [mode, setMode] = useState<Mode>('from_branch');
  const [name, setName] = useState('');
  const [fromBranch, setFromBranch] = useState('master');
  const [fromTxnRid, setFromTxnRid] = useState('');
  const [description, setDescription] = useState('');
  const [fallbackChainRaw, setFallbackChainRaw] = useState('');
  const [labelsRaw, setLabelsRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setMode(branches.length === 0 ? 'as_root' : 'from_branch');
      setName('');
      setFromBranch(branches.find((b) => b.is_default)?.name ?? branches[0]?.name ?? 'master');
      setFromTxnRid('');
      setDescription('');
      setFallbackChainRaw('');
      setLabelsRaw('');
      setError('');
    }
  }, [open, branches]);

  function parseFallback() {
    return fallbackChainRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  function parseLabels(): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const part of labelsRaw.split(',')) {
      const [k, v] = part.split('=').map((s) => s.trim());
      if (k && v) out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Branch name is required');
      return;
    }
    let source;
    if (mode === 'from_branch') {
      if (!fromBranch.trim()) { setError('Source branch is required'); return; }
      source = { from_branch: fromBranch.trim() };
    } else if (mode === 'from_transaction') {
      if (!fromTxnRid.trim()) { setError('Source transaction RID is required'); return; }
      source = { from_transaction_rid: fromTxnRid.trim() };
    } else {
      source = { as_root: true as const };
    }
    setBusy(true);
    setError('');
    const fallbackChain = parseFallback();
    try {
      const branch = await createBranchV2(datasetRid, {
        name: name.trim(),
        source,
        description: description.trim() || undefined,
        fallback_chain: fallbackChain.length > 0 ? fallbackChain : undefined,
        labels: parseLabels(),
      });
      onCreated?.(branch);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create branch');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <form onSubmit={submit} className="of-panel" style={{ width: '100%', maxWidth: 520, padding: 16, display: 'grid', gap: 12, boxShadow: 'var(--shadow-popover)' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Create branch</h2>

        <label style={{ fontSize: 13 }}>
          Branch name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="feature-x" className="of-input" style={{ marginTop: 4 }} />
        </label>

        <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 12 }}>
          <legend className="of-eyebrow" style={{ padding: '0 6px' }}>Source</legend>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input type="radio" name="mode" checked={mode === 'from_branch'} onChange={() => setMode('from_branch')} />
            <span style={{ flex: 1 }}>
              <strong>From another branch</strong>
              <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)} disabled={mode !== 'from_branch'} className="of-input" style={{ marginTop: 4, width: '100%' }}>
                {branches.map((b) => <option key={b.id} value={b.name}>{b.name}{b.is_default ? ' (default)' : ''}</option>)}
              </select>
            </span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginTop: 8 }}>
            <input type="radio" name="mode" checked={mode === 'from_transaction'} onChange={() => setMode('from_transaction')} />
            <span style={{ flex: 1 }}>
              <strong>From a specific transaction</strong>
              <input value={fromTxnRid} onChange={(e) => setFromTxnRid(e.target.value)} placeholder="ri.foundry.main.transaction.…" disabled={mode !== 'from_transaction'} className="of-input" style={{ marginTop: 4, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
            </span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginTop: 8 }}>
            <input type="radio" name="mode" checked={mode === 'as_root'} onChange={() => setMode('as_root')} disabled={branches.length > 0} />
            <span style={{ flex: 1 }}>
              <strong>As root branch</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                Only valid when the dataset has no other branches yet.
              </span>
            </span>
          </label>
        </fieldset>

        <label style={{ fontSize: 13 }}>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Short purpose for this branch" className="of-input" style={{ marginTop: 4, resize: 'vertical' }} />
        </label>

        <label style={{ fontSize: 13 }}>
          Fallback chain (comma-separated)
          <input value={fallbackChainRaw} onChange={(e) => setFallbackChainRaw(e.target.value)} placeholder="develop, master" className="of-input" style={{ marginTop: 4 }} />
        </label>

        <label style={{ fontSize: 13 }}>
          Labels (key=value, comma-separated)
          <input value={labelsRaw} onChange={(e) => setLabelsRaw(e.target.value)} placeholder="persona=data-eng, ticket=PR-123" className="of-input" style={{ marginTop: 4 }} />
        </label>

        {error && <p className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} className="of-button">Cancel</button>
          <button type="submit" disabled={busy} className="of-button of-button--primary">Create</button>
        </div>
      </form>
    </div>
  );
}
