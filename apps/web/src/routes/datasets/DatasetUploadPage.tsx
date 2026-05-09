import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createDataset, uploadData } from '@/lib/api/datasets';
import { Glyph } from '@/lib/components/ui/Glyph';

type DatasetFormat = 'parquet' | 'csv' | 'json';
type WriteMode = 'transactionless' | 'transactional';

interface InferredColumn {
  name: string;
  type: string;
  nullable: boolean;
  sample: string;
}

interface SchemaInference {
  format: DatasetFormat;
  delimiter?: string;
  headerRows?: number;
  rowsSampled: number;
  columns: InferredColumn[];
  warnings: string[];
}

const ACCEPTED_EXTENSIONS = '.parquet,.csv,.json,.jsonl,.tsv';
const MAX_SAMPLE_BYTES = 256 * 1024;

const FORMAT_OPTIONS: Array<{ value: DatasetFormat; label: string }> = [
  { value: 'parquet', label: 'Parquet' },
  { value: 'csv', label: 'CSV / TSV' },
  { value: 'json', label: 'JSON / JSONL' },
];

const WRITE_MODES: Array<{
  value: WriteMode;
  label: string;
  detail: string;
  bullets: string[];
}> = [
  {
    value: 'transactionless',
    label: 'Transactionless',
    detail: 'Updates reflected immediately.',
    bullets: [
      'Writes are reflected per item',
      'Failures are limited to this upload',
      'Best match for the current dataset upload API',
    ],
  },
  {
    value: 'transactional',
    label: 'Transactional',
    detail: 'Transaction-based guarantees, similar to datasets.',
    bullets: [
      'Stages files as one commit unit',
      'Keeps snapshot semantics explicit',
      'Requires a transaction-backed upload surface',
    ],
  },
];

export function DatasetUploadPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<DatasetFormat>('parquet');
  const [tags, setTags] = useState('');
  const [logicalPath, setLogicalPath] = useState('');
  const [writeMode, setWriteMode] = useState<WriteMode>('transactionless');
  const [file, setFile] = useState<File | null>(null);
  const [inference, setInference] = useState<SchemaInference | null>(null);
  const [inferenceBusy, setInferenceBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inferenceRun = useRef(0);
  const navigate = useNavigate();

  const tagsList = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags],
  );

  async function inferSelectedFile(nextFile: File, nextFormat: DatasetFormat) {
    const runId = inferenceRun.current + 1;
    inferenceRun.current = runId;
    setInferenceBusy(true);
    setInference(null);
    try {
      const nextInference = await inferDatasetFile(nextFile, nextFormat);
      if (runId === inferenceRun.current) {
        setInference(nextInference);
      }
    } catch (cause) {
      if (runId === inferenceRun.current) {
        setInference({
          format: nextFormat,
          rowsSampled: 0,
          columns: [],
          warnings: [cause instanceof Error ? cause.message : 'Unable to infer schema.'],
        });
      }
    } finally {
      if (runId === inferenceRun.current) {
        setInferenceBusy(false);
      }
    }
  }

  function handleFile(nextFile: File | null) {
    setFile(nextFile);
    setInference(null);
    if (!nextFile) {
      setLogicalPath('');
      return;
    }

    const detectedFormat = detectFormat(nextFile);
    setFormat(detectedFormat);
    setLogicalPath(nextFile.name);
    if (!name.trim()) {
      setName(datasetNameFromFile(nextFile.name));
    }
    void inferSelectedFile(nextFile, detectedFormat);
  }

  function handleFormat(nextFormat: DatasetFormat) {
    setFormat(nextFormat);
    if (file) {
      void inferSelectedFile(file, nextFormat);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedPath = logicalPath.trim();
    if (!trimmedName) {
      setError('Dataset name is required.');
      return;
    }
    if (!file) {
      setError('Choose a file before uploading.');
      return;
    }
    if (!trimmedPath) {
      setError('Dataset file path is required.');
      return;
    }

    setBusy(true);
    try {
      const ds = await createDataset({
        name: trimmedName,
        description: description.trim() || undefined,
        format,
        tags: tagsList,
      });
      await uploadData(ds.id, file, { logicalPath: trimmedPath });
      navigate(`/datasets/${ds.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(file && name.trim() && logicalPath.trim() && !busy);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <header className="of-panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <Link to="/datasets" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Datasets</Link>
            <h1 className="of-heading-lg" style={{ marginTop: 4 }}>Upload dataset</h1>
            <p className="of-text-muted" style={{ marginTop: 2, maxWidth: 760 }}>
              Stage a local file, infer the shape, and register it as a dataset resource.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="of-chip">DATASET-003</span>
            <Link to="/datasets" className="of-button">Cancel</Link>
          </div>
        </div>
        <WizardSteps fileReady={Boolean(file)} detailsReady={Boolean(name.trim() && logicalPath.trim())} />
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <SectionTitle index={1} title="Select file" />
            <DatasetFileUpload file={file} disabled={busy} onFile={handleFile} />
          </section>

          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <SectionTitle index={2} title="Configure dataset" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} required className="of-input" />
              </Field>
              <Field label="File path">
                <input value={logicalPath} onChange={(e) => setLogicalPath(e.target.value)} required className="of-input" placeholder="data/source.csv" />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="of-input" style={{ minHeight: 72, resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <Field label="Dataset format">
                <select value={format} onChange={(e) => handleFormat(e.target.value as DatasetFormat)} className="of-input">
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags">
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="finance, monthly" className="of-input" />
              </Field>
            </div>
            {tagsList.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tagsList.map((tag) => <span key={tag} className="of-chip">{tag}</span>)}
              </div>
            )}
          </section>

          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <SectionTitle index={3} title="Write mode" />
            <div style={{ display: 'grid', gap: 8 }}>
              {WRITE_MODES.map((mode) => {
                const selected = writeMode === mode.value;
                return (
                  <label
                    key={mode.value}
                    className={selected ? 'of-panel-muted' : 'of-panel'}
                    style={{
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                      borderColor: selected ? 'var(--border-focus)' : 'var(--border-default)',
                      background: selected ? 'var(--status-info-bg)' : 'var(--bg-panel)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
                      <span>
                        <span style={{ display: 'block', color: 'var(--text-strong)', fontWeight: 600 }}>{mode.label}</span>
                        <span className="of-text-muted" style={{ display: 'block', fontSize: 12 }}>{mode.detail}</span>
                      </span>
                      <input
                        type="radio"
                        name="write-mode"
                        value={mode.value}
                        checked={selected}
                        onChange={() => setWriteMode(mode.value)}
                      />
                    </span>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-default)', fontSize: 12 }}>
                      {mode.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                    </ul>
                  </label>
                );
              })}
            </div>
            {writeMode === 'transactional' && (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                This upload will still use the current direct dataset endpoint; transactional file URLs are exposed separately for branch-aware flows.
              </p>
            )}
          </section>

          <footer className="of-toolbar" style={{ justifyContent: 'space-between', position: 'sticky', bottom: 0 }}>
            <div className="of-text-muted" style={{ fontSize: 12 }}>
              {file ? `${file.name} / ${formatFileSize(file.size)}` : 'No file selected'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link to="/datasets" className="of-button">Back</Link>
              <button type="submit" disabled={!canSubmit} className="of-button of-button--primary">
                {busy ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </footer>
        </div>

        <SchemaInferencePanel file={file} inference={inference} busy={inferenceBusy} />
      </form>
    </section>
  );
}

function WizardSteps({ fileReady, detailsReady }: { fileReady: boolean; detailsReady: boolean }) {
  const steps = [
    { label: 'File', ready: fileReady },
    { label: 'Configure', ready: detailsReady },
    { label: 'Upload', ready: fileReady && detailsReady },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
      {steps.map((step, index) => {
        const active = step.ready || (index === 0 && !fileReady) || (index === 1 && fileReady && !detailsReady);
        return (
          <div
            key={step.label}
            className={active ? 'of-panel-muted' : 'of-panel'}
            style={{
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
              borderColor: step.ready ? 'var(--border-focus)' : 'var(--border-default)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: step.ready ? 'var(--bg-chip-active)' : 'var(--bg-panel)',
                color: 'var(--text-strong)',
                fontSize: 11,
                fontWeight: 600,
                flex: '0 0 auto',
              }}
            >
              {index + 1}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-strong)', fontWeight: active ? 600 : 500 }}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-panel-muted)',
          color: 'var(--text-strong)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {index}
      </span>
      <h2 className="of-heading-sm" style={{ margin: 0 }}>{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-strong)', fontWeight: 600 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function DatasetFileUpload({
  file,
  disabled,
  onFile,
}: {
  file: File | null;
  disabled: boolean;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    onFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    onFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className="of-panel-muted"
      style={{
        minHeight: 136,
        padding: 14,
        display: 'grid',
        gap: 12,
        alignContent: 'center',
        borderStyle: 'dashed',
        borderColor: dragging ? 'var(--border-focus)' : 'var(--border-default)',
        background: dragging ? 'var(--status-info-bg)' : 'var(--bg-panel-muted)',
      }}
    >
      <input ref={inputRef} type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleInput} disabled={disabled} style={{ display: 'none' }} />
      {file ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-panel)',
              color: 'var(--text-link)',
            }}
          >
            <Glyph name="database" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>{formatFileSize(file.size)} / {file.type || 'unknown type'}</p>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={() => onFile(null)} disabled={disabled} aria-label="Remove file">
            <Glyph name="x" size={16} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8, textAlign: 'center' }}>
          <span
            style={{
              width: 42,
              height: 42,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-panel)',
              color: 'var(--text-link)',
            }}
          >
            <Glyph name="database" size={22} />
          </span>
          <div>
            <p style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 600 }}>Drop a data file here</p>
            <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Parquet, CSV, TSV, JSON, or JSONL</p>
          </div>
          <button type="button" className="of-button" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Choose file
          </button>
        </div>
      )}
      {file && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="of-button" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Replace file
          </button>
        </div>
      )}
    </div>
  );
}

function SchemaInferencePanel({
  file,
  inference,
  busy,
}: {
  file: File | null;
  inference: SchemaInference | null;
  busy: boolean;
}) {
  return (
    <aside className="of-panel" style={{ padding: 12, display: 'grid', gap: 12, position: 'sticky', top: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Schema</p>
          <h2 className="of-heading-sm" style={{ margin: 0 }}>Inference panel</h2>
        </div>
        <span className="of-chip">{inference?.format ?? 'pending'}</span>
      </div>

      {!file && (
        <div className="of-panel-muted" style={{ padding: 14, display: 'grid', gap: 6 }}>
          <p style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 600 }}>No file staged</p>
          <p className="of-text-muted" style={{ margin: 0 }}>Schema details appear after selecting a file.</p>
        </div>
      )}

      {file && busy && (
        <div className="of-panel-muted" style={{ padding: 14 }}>
          <p className="of-text-muted" style={{ margin: 0 }}>Reading file sample...</p>
        </div>
      )}

      {file && !busy && inference && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <Metric label="Rows sampled" value={String(inference.rowsSampled)} />
            <Metric label="Columns" value={String(inference.columns.length)} />
            <Metric label="Delimiter" value={delimiterLabel(inference.delimiter)} />
          </div>

          {inference.warnings.length > 0 && (
            <div className="of-panel-muted" style={{ padding: 10, borderColor: 'var(--status-warning)', background: 'var(--status-warning-bg)' }}>
              {inference.warnings.map((warning) => (
                <p key={warning} style={{ margin: 0, color: 'var(--status-warning)', fontSize: 12 }}>{warning}</p>
              ))}
            </div>
          )}

          {inference.columns.length > 0 ? (
            <div style={{ overflow: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
              <table className="of-table" style={{ minWidth: 420 }}>
                <thead>
                  <tr><th>Column</th><th>Type</th><th>Sample</th></tr>
                </thead>
                <tbody>
                  {inference.columns.map((column) => (
                    <tr key={column.name}>
                      <td style={{ fontWeight: 600 }}>{column.name}{column.nullable ? <span className="of-text-muted"> ?</span> : null}</td>
                      <td>{column.type}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.sample || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="of-panel-muted" style={{ padding: 14 }}>
              <p className="of-text-muted" style={{ margin: 0 }}>Column metadata will be available after upload.</p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="of-panel-muted" style={{ padding: 10, minWidth: 0 }}>
      <p className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>{label}</p>
      <p style={{ margin: '2px 0 0', color: 'var(--text-strong)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
    </div>
  );
}

async function inferDatasetFile(file: File, format: DatasetFormat): Promise<SchemaInference> {
  if (format === 'parquet') {
    return {
      format,
      rowsSampled: 0,
      columns: [],
      warnings: ['Parquet schema inference runs server-side after upload.'],
    };
  }

  const sample = await file.slice(0, MAX_SAMPLE_BYTES).text();
  if (format === 'json') {
    return inferJson(sample, file.size > MAX_SAMPLE_BYTES);
  }
  return inferDelimited(sample, file.name, file.size > MAX_SAMPLE_BYTES);
}

function inferDelimited(sample: string, filename: string, truncated: boolean): SchemaInference {
  const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : guessDelimiter(sample);
  const rows = parseDelimited(sample, delimiter).filter((row) => row.some((cell) => cell.trim() !== ''));
  const warnings: string[] = [];
  if (truncated) warnings.push('Inference uses the first 256 KB of the file.');
  if (rows.length === 0) {
    return { format: 'csv', delimiter, headerRows: 0, rowsSampled: 0, columns: [], warnings: [...warnings, 'No rows found in the sampled file.'] };
  }

  const header = rows[0].map((cell, index) => normalizeColumnName(cell, index));
  const dataRows = rows.slice(1, 26);
  const columns = header.map((name, index) => {
    const values = dataRows.map((row) => row[index] ?? '');
    return {
      name,
      type: inferTextType(values),
      nullable: values.some((value) => value.trim() === ''),
      sample: values.find((value) => value.trim() !== '') ?? '',
    };
  });

  return {
    format: 'csv',
    delimiter,
    headerRows: 1,
    rowsSampled: dataRows.length,
    columns,
    warnings,
  };
}

function inferJson(sample: string, truncated: boolean): SchemaInference {
  const warnings: string[] = [];
  if (truncated) warnings.push('Inference uses the first 256 KB of the file.');
  const trimmed = sample.trim();
  if (!trimmed) {
    return { format: 'json', rowsSampled: 0, columns: [], warnings: [...warnings, 'No JSON content found in the sampled file.'] };
  }

  let rows: unknown[] = [];
  try {
    const parsed = JSON.parse(trimmed);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const parsedLines: unknown[] = [];
    const badLines: number[] = [];
    trimmed.split(/\r?\n/).slice(0, 50).forEach((line, index) => {
      if (!line.trim()) return;
      try {
        parsedLines.push(JSON.parse(line));
      } catch {
        badLines.push(index + 1);
      }
    });
    rows = parsedLines;
    if (badLines.length > 0) {
      warnings.push(`Skipped ${badLines.length} invalid JSONL line(s).`);
    }
  }

  const objects = rows.slice(0, 25).map((row) => normalizeJsonRow(row));
  const keys = Array.from(new Set(objects.flatMap((row) => Object.keys(row))));
  const columns = keys.map((key) => {
    const values = objects.map((row) => row[key]);
    return {
      name: key,
      type: inferJsonType(values),
      nullable: values.some((value) => value === null || value === undefined || value === ''),
      sample: stringifySample(values.find((value) => value !== null && value !== undefined && value !== '')),
    };
  });

  return {
    format: 'json',
    rowsSampled: objects.length,
    columns,
    warnings,
  };
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= 50) break;
      continue;
    }
    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function guessDelimiter(sample: string) {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? '';
  const tabs = firstLine.split('\t').length;
  const commas = firstLine.split(',').length;
  return tabs > commas ? '\t' : ',';
}

function normalizeJsonRow(row: unknown): Record<string, unknown> {
  if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
    return row as Record<string, unknown>;
  }
  return { value: row };
}

function normalizeColumnName(value: string, index: number) {
  const trimmed = value.trim();
  return trimmed || `column_${index + 1}`;
}

function inferTextType(values: string[]) {
  const present = values.map((value) => value.trim()).filter(Boolean);
  if (present.length === 0) return 'STRING';
  if (present.every((value) => /^(true|false)$/i.test(value))) return 'BOOLEAN';
  if (present.every((value) => /^[-+]?\d+$/.test(value))) return 'LONG';
  if (present.every((value) => /^[-+]?\d+(\.\d+)?$/.test(value))) return 'DOUBLE';
  if (present.every((value) => /^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(value) && !Number.isNaN(Date.parse(value)))) return 'TIMESTAMP';
  return 'STRING';
}

function inferJsonType(values: unknown[]) {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (present.length === 0) return 'STRING';
  if (present.every((value) => typeof value === 'boolean')) return 'BOOLEAN';
  if (present.every((value) => typeof value === 'number' && Number.isInteger(value))) return 'LONG';
  if (present.every((value) => typeof value === 'number')) return 'DOUBLE';
  if (present.every((value) => Array.isArray(value))) return 'ARRAY';
  if (present.every((value) => typeof value === 'object')) return 'STRUCT';
  if (present.every((value) => typeof value === 'string')) return inferTextType(present as string[]);
  return 'STRING';
}

function stringifySample(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function detectFormat(file: File): DatasetFormat {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv';
  if (lower.endsWith('.json') || lower.endsWith('.jsonl')) return 'json';
  if (lower.endsWith('.parquet')) return 'parquet';
  if (file.type.includes('json')) return 'json';
  if (file.type.includes('csv') || file.type.includes('text')) return 'csv';
  return 'parquet';
}

function datasetNameFromFile(filename: string) {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function delimiterLabel(delimiter?: string) {
  if (!delimiter) return '-';
  if (delimiter === '\t') return 'Tab';
  if (delimiter === ',') return 'Comma';
  return delimiter;
}
