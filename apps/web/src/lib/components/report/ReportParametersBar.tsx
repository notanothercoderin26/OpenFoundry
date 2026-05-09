import { useMemo } from 'react';

import type { ReportDefinition } from '@/lib/api/reports';

interface ReportParametersBarProps {
  report: ReportDefinition | null;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onResetAll: () => void;
  onCopyLink: () => void;
}

interface ParameterDescriptor {
  id: string;
  label: string;
  kind: 'text' | 'number';
  defaultValue: string;
  placeholder: string;
}

function inferParameters(report: ReportDefinition | null): ParameterDescriptor[] {
  if (!report) {
    return [
      { id: 'period', label: 'Period', kind: 'text', defaultValue: '', placeholder: 'Enter a value…' },
      { id: 'value_min', label: 'Value (min.)', kind: 'number', defaultValue: '', placeholder: '123 Enter a number…' },
    ];
  }
  const declared = report.parameters && typeof report.parameters === 'object' ? Object.entries(report.parameters) : [];
  if (declared.length > 0) {
    return declared.map(([key, raw]) => {
      const value = raw === null || raw === undefined ? '' : String(raw);
      const kind: ParameterDescriptor['kind'] = Number.isFinite(Number(value)) && value !== '' ? 'number' : 'text';
      return {
        id: key,
        label: key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        kind,
        defaultValue: value,
        placeholder: kind === 'number' ? '123 Enter a number…' : 'Enter a value…',
      };
    });
  }
  // Derive a sensible default set from the schedule + a min-value control.
  const cadence = report.schedule?.cadence ?? 'manual';
  return [
    {
      id: 'period',
      label: cadence === 'monthly' ? 'Month' : cadence === 'weekly' ? 'Week' : 'Period',
      kind: 'text',
      defaultValue: cadence,
      placeholder: 'Enter a value…',
    },
    {
      id: 'value_min',
      label: 'Value (min.)',
      kind: 'number',
      defaultValue: '',
      placeholder: '123 Enter a number…',
    },
  ];
}

export function ReportParametersBar({ report, values, onChange, onResetAll, onCopyLink }: ReportParametersBarProps) {
  const params = useMemo(() => inferParameters(report), [report]);

  function update(id: string, next: string) {
    onChange({ ...values, [id]: next });
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 16px',
        background: '#ffffff',
        borderBottom: '1px solid var(--border-default)',
        flexWrap: 'wrap',
      }}
    >
      {params.map((param, index) => {
        const value = values[param.id] ?? '';
        const overridden = value && value !== param.defaultValue;
        return (
          <div
            key={param.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              paddingRight: 12,
              borderRight: index === params.length - 1 ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-strong)',
                fontWeight: 600,
              }}
            >
              <span>{param.label}</span>
              {param.defaultValue ? (
                <span
                  aria-label="Default value"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 18,
                    padding: '0 6px',
                    borderRadius: 4,
                    background: overridden ? '#fde68a' : '#dbeafe',
                    color: overridden ? '#92400e' : '#1d4ed8',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {param.defaultValue.length > 5 ? param.defaultValue.slice(0, 5) : param.defaultValue}
                </span>
              ) : null}
            </div>
            <input
              type={param.kind === 'number' ? 'number' : 'text'}
              value={value}
              placeholder={param.placeholder}
              onChange={(e) => update(param.id, e.target.value)}
              className="of-input"
              style={{ minWidth: 200, height: 30, fontSize: 13 }}
            />
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={onResetAll}
        title="Reset parameter overrides"
        aria-label="Reset parameters"
        style={iconButtonStyle}
      >
        <ResetIcon />
      </button>
      <button
        type="button"
        onClick={onCopyLink}
        title="Copy link with current parameter state"
        aria-label="Copy link"
        style={iconButtonStyle}
      >
        <LinkIcon />
      </button>
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-muted)',
  borderRadius: 'var(--radius-sm)',
};

function ResetIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M4 5v4h4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 8.5 8.5 7A3.2 3.2 0 0 0 4 11.5 3.2 3.2 0 0 0 7.2 14.7l1.8-1.8"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 15.5 15.5 17A3.2 3.2 0 0 0 20 12.5 3.2 3.2 0 0 0 16.8 9.3L15 11.1"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 15l6-6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
