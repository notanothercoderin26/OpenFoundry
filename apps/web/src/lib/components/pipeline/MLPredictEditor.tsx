import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listMLModels, type MLModel, type PipelineNode } from '@/lib/api/pipelines';

interface MLPredictEditorProps {
  open: boolean;
  node: PipelineNode | null;
  upstreamColumns: string[];
  onClose: () => void;
  onApply: (node: PipelineNode) => void;
}

interface MLPredictConfig {
  model_id?: string;
  input_mapping?: Record<string, string>;
  output_columns?: Record<string, string>;
}

function readConfig(node: PipelineNode | null): MLPredictConfig {
  if (!node) return {};
  const cfg = node.config as Record<string, unknown> | undefined;
  if (!cfg) return {};
  return {
    model_id: typeof cfg.model_id === 'string' ? cfg.model_id : undefined,
    input_mapping: typeof cfg.input_mapping === 'object' && cfg.input_mapping !== null
      ? (cfg.input_mapping as Record<string, string>)
      : {},
    output_columns: typeof cfg.output_columns === 'object' && cfg.output_columns !== null
      ? (cfg.output_columns as Record<string, string>)
      : {},
  };
}

export function MLPredictEditor({ open, node, upstreamColumns, onClose, onApply }: MLPredictEditorProps) {
  const [models, setModels] = useState<MLModel[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [inputMapping, setInputMapping] = useState<Record<string, string>>({});
  const [outputColumns, setOutputColumns] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const initial = readConfig(node);
    setSelectedId(initial.model_id ?? '');
    setInputMapping(initial.input_mapping ?? {});
    setOutputColumns(initial.output_columns ?? {});
    let cancelled = false;
    setLoadError('');
    void listMLModels()
      .then((response) => {
        if (!cancelled) setModels(response.items);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'Failed to load ML models');
          setModels([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, node]);

  const selectedModel = useMemo(() => models?.find((entry) => entry.id === selectedId) ?? null, [models, selectedId]);

  if (!open || !node) return null;

  function apply() {
    if (!node) return;
    if (!selectedId) return;
    const trimmedInput = Object.fromEntries(
      Object.entries(inputMapping).filter(([, value]) => value && value.trim().length > 0),
    );
    const trimmedOutput = Object.fromEntries(
      Object.entries(outputColumns).filter(([, value]) => value && value.trim().length > 0),
    );
    onApply({
      ...node,
      transform_type: 'ml_predict',
      config: {
        ...(node.config as Record<string, unknown>),
        model_id: selectedId,
        input_mapping: trimmedInput,
        output_columns: trimmedOutput,
      },
    });
    onClose();
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.32)', zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-label="ML predict editor"
        style={{
          position: 'fixed',
          top: '8vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(560px, 92vw)',
          maxHeight: '84vh',
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.24)',
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Glyph name="cube" size={14} />
          <strong style={{ fontSize: 14 }}>Trained model</strong>
          <span className="of-text-muted" style={{ fontSize: 12 }}>
            Score upstream rows with a registered model.
          </span>
          <button type="button" className="of-button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', padding: '2px 6px' }}>
            <Glyph name="x" size={12} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gap: 14 }}>
          {loadError && (
            <p className="of-status-danger" style={{ fontSize: 12, padding: '6px 8px', borderRadius: 4 }}>{loadError}</p>
          )}
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Model
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="of-select"
              style={{ fontSize: 12 }}
            >
              <option value="">— select a model —</option>
              {(models ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.display_name} · {model.framework} v{model.version}
                </option>
              ))}
            </select>
            {selectedModel?.description && (
              <span className="of-text-muted" style={{ fontSize: 11 }}>{selectedModel.description}</span>
            )}
            {selectedModel && !selectedModel.inference_url && (
              <span
                className="of-chip"
                title="No inference_url configured; the runtime will emit deterministic mock predictions for this model."
                style={{ background: '#fef3c7', color: '#92400e', alignSelf: 'flex-start', fontSize: 10 }}
              >
                mock predictions only
              </span>
            )}
          </label>

          {selectedModel && (
            <section style={{ display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.4 }}>INPUT MAPPING</p>
              {selectedModel.input_schema.length === 0 ? (
                <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>This model declares no input features.</p>
              ) : (
                selectedModel.input_schema.map((field) => (
                  <label key={field.name} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    <span>
                      <code style={{ fontSize: 11 }}>{field.name}</code>{' '}
                      <span className="of-text-muted" style={{ fontSize: 11 }}>({field.type})</span>
                    </span>
                    <select
                      value={inputMapping[field.name] ?? field.name}
                      onChange={(event) =>
                        setInputMapping((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      className="of-select"
                      style={{ fontSize: 12 }}
                    >
                      {upstreamColumns.length === 0 && <option value={field.name}>{field.name}</option>}
                      {upstreamColumns.map((column) => (
                        <option key={column} value={column}>{column}</option>
                      ))}
                    </select>
                  </label>
                ))
              )}
            </section>
          )}

          {selectedModel && selectedModel.output_schema.length > 0 && (
            <section style={{ display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.4 }}>OUTPUT COLUMNS</p>
              {selectedModel.output_schema.map((field) => (
                <label key={field.name} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  <span>
                    <code style={{ fontSize: 11 }}>{field.name}</code>{' '}
                    <span className="of-text-muted" style={{ fontSize: 11 }}>({field.type})</span>
                  </span>
                  <input
                    value={outputColumns[field.name] ?? field.name}
                    onChange={(event) =>
                      setOutputColumns((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    placeholder={field.name}
                    className="of-input"
                    style={{ fontSize: 12 }}
                  />
                </label>
              ))}
            </section>
          )}
        </div>

        <footer
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span className="of-text-muted" style={{ fontSize: 11 }}>
            Outputs append to the upstream row.
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="of-button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="of-button of-button--primary"
              onClick={apply}
              disabled={!selectedId}
            >
              Apply
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}
