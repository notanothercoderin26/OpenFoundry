import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BranchGraph } from '@/lib/components/dataset/BranchGraph';
import { CreateBranchDialog } from '@/lib/components/dataset/CreateBranchDialog';
import {
  deleteDatasetBranch,
  getDataset,
  listBranches,
  listDatasetTransactions,
  type Dataset,
  type DatasetBranch,
  type DatasetTransaction,
} from '@/lib/api/datasets';

export function DatasetBranchesPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [branches, setBranches] = useState<DatasetBranch[]>([]);
  const [transactions, setTransactions] = useState<DatasetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBranchName, setSelectedBranchName] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [d, br, tx] = await Promise.all([
        getDataset(id),
        listBranches(id),
        listDatasetTransactions(id).catch(() => [] as DatasetTransaction[]),
      ]);
      setDataset(d);
      setBranches(br);
      setTransactions(tx);
      setSelectedBranchName((current) => {
        if (current && br.some((branch) => branch.name === current)) return current;
        return br.find((branch) => branch.is_default)?.name ?? br[0]?.name ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function handleDelete(branchName: string) {
    if (!id) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete branch ${branchName}?`)) return;
    setBusy(true);
    try {
      await deleteDatasetBranch(id, branchName);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const txCountByName = useMemo(() => {
    const m: Record<string, { transactions: number }> = {};
    for (const b of branches) m[b.name] = { transactions: 0 };
    for (const tx of transactions) {
      const branchName = (tx as DatasetTransaction & { branch_name?: string }).branch_name;
      if (branchName && m[branchName]) m[branchName].transactions += 1;
    }
    return m;
  }, [branches, transactions]);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.name === selectedBranchName) ?? branches.find((branch) => branch.is_default) ?? branches[0] ?? null,
    [branches, selectedBranchName],
  );

  const branchStats = useMemo(() => {
    const active = branches.filter((branch) => !branch.archived_at).length;
    const archived = branches.length - active;
    const open = branches.filter((branch) => branch.has_open_transaction).length;
    const defaultName = branches.find((branch) => branch.is_default)?.name ?? '—';
    return { active, archived, open, defaultName };
  }, [branches]);

  function parentName(b: DatasetBranch): string {
    if (!b.parent_branch_id) return '— (root)';
    const parent = branches.find((p) => p.id === b.parent_branch_id);
    return parent?.name ?? `${b.parent_branch_id.slice(0, 8)}…`;
  }

  function formatTimestamp(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function handleCreated(branch: DatasetBranch) {
    setSelectedBranchName(branch.name);
    void load();
  }

  const branchRows = branches.map((branch) => ({
    branch,
    txCount: txCountByName[branch.name]?.transactions ?? 0,
  }));

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <header className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <Link to={`/datasets/${id}`} style={{ color: 'var(--text-muted)', fontSize: 12 }}>← {dataset?.name ?? 'Dataset'}</Link>
            <h1 className="of-heading-lg" style={{ marginTop: 4 }}>Dataset branches</h1>
            <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {id}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setView('graph')}
              className={view === 'graph' ? 'of-button of-button--primary' : 'of-button'}
              style={{ fontSize: 12 }}
            >
              Graph
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={view === 'table' ? 'of-button of-button--primary' : 'of-button'}
              style={{ fontSize: 12 }}
            >
              Table
            </button>
            <button type="button" onClick={() => setCreateOpen(true)} disabled={loading} className="of-button of-button--primary" style={{ fontSize: 12 }}>
              + New branch
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {[
            ['Active branches', branchStats.active],
            ['Open tx', branchStats.open],
            ['Archived', branchStats.archived],
            ['Default', branchStats.defaultName],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel-muted)' }}>
              <p className="of-eyebrow">{label}</p>
              <p style={{ marginTop: 2, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)', fontFamily: label === 'Default' ? 'var(--font-mono)' : undefined }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-text-muted">Loading…</p>
        </section>
      ) : view === 'graph' ? (
        <section className="of-panel" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)', gap: 16, alignItems: 'start' }}>
            <BranchGraph
              branches={branches}
              extras={txCountByName}
              selectedBranch={selectedBranch?.name ?? null}
              onSelect={(branch) => setSelectedBranchName(branch.name)}
              onDoubleClick={(branch) => navigate(`/datasets/${id}/branches/${encodeURIComponent(branch.name)}`)}
            />
            <aside style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Selected branch</p>
              {selectedBranch ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                  <div>
                    <h2 className="of-heading-md" style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
                      {selectedBranch.name}
                    </h2>
                    <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                      {selectedBranch.description || (selectedBranch.is_default ? 'Default branch' : 'Branch pointer')}
                    </p>
                  </div>
                  <dl style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: '6px 10px', margin: 0, fontSize: 12 }}>
                    <dt className="of-text-muted">Parent</dt>
                    <dd style={{ margin: 0, minWidth: 0 }}>{parentName(selectedBranch)}</dd>
                    <dt className="of-text-muted">Head tx</dt>
                    <dd style={{ margin: 0, minWidth: 0, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{selectedBranch.head_transaction_id ?? '—'}</dd>
                    <dt className="of-text-muted">Transactions</dt>
                    <dd style={{ margin: 0 }}>{txCountByName[selectedBranch.name]?.transactions ?? 0}</dd>
                    <dt className="of-text-muted">Updated</dt>
                    <dd style={{ margin: 0 }}>{formatTimestamp(selectedBranch.last_activity_at ?? selectedBranch.updated_at)}</dd>
                    <dt className="of-text-muted">Retention</dt>
                    <dd style={{ margin: 0 }}>{selectedBranch.retention_policy ?? 'INHERITED'}</dd>
                  </dl>
                  {(selectedBranch.fallback_chain?.length ?? 0) > 0 && (
                    <div>
                      <p className="of-eyebrow">Fallback chain</p>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {selectedBranch.fallback_chain?.map((fallback) => (
                          <span key={fallback} className="of-chip" style={{ fontFamily: 'var(--font-mono)' }}>{fallback}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedBranch.labels && Object.keys(selectedBranch.labels).length > 0 && (
                    <div>
                      <p className="of-eyebrow">Labels</p>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {Object.entries(selectedBranch.labels).map(([key, value]) => (
                          <span key={key} className="of-chip" style={{ fontFamily: 'var(--font-mono)' }}>{key}={value}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Link to={`/datasets/${id}/branches/${encodeURIComponent(selectedBranch.name)}`} className="of-button" style={{ justifySelf: 'start', fontSize: 12 }}>
                    Open branch detail
                  </Link>
                </div>
              ) : (
                <p className="of-text-muted" style={{ marginTop: 8 }}>No branches.</p>
              )}
            </aside>
          </div>
        </section>
      ) : (
        <section className="of-panel" style={{ padding: 16, overflow: 'auto' }}>
          <table className="of-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                {['Name', 'Parent', 'Head tx', 'Last activity', '# tx', 'Open?', 'Fallback', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branchRows.map(({ branch: b, txCount }) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>
                    <Link to={`/datasets/${id}/branches/${encodeURIComponent(b.name)}`}>
                      {b.name}{b.is_default ? ' ★' : ''}
                    </Link>
                  </td>
                  <td>{parentName(b)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>
                    {b.head_transaction_id ? `${b.head_transaction_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td>{formatTimestamp(b.last_activity_at)}</td>
                  <td>{txCount}</td>
                  <td>{b.has_open_transaction ? 'OPEN' : '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{(b.fallback_chain ?? []).join(' → ') || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => void handleDelete(b.name)}
                      disabled={busy}
                      className="of-button"
                      style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr><td colSpan={8} className="of-text-muted" style={{ padding: 12 }}>No branches.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <CreateBranchDialog
        datasetRid={id}
        open={createOpen}
        branches={branches}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </section>
  );
}
