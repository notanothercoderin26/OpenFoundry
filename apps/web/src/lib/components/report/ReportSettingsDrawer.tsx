import { useEffect, useMemo, useState } from 'react';

import { Drawer } from '@/lib/components/ui/Drawer';

import type {
  DistributionRecipient,
  GeneratorKind,
  ReportDefinition,
  ReportSchedule,
  ReportSection,
  ReportTemplate,
  ScheduleCadence,
  SectionKind,
} from '@/lib/api/reports';

const GENERATORS: GeneratorKind[] = ['pdf', 'excel', 'csv', 'html', 'pptx'];
const CADENCES: ScheduleCadence[] = ['manual', 'daily', 'weekly', 'monthly', 'cron'];
const SECTION_KINDS: SectionKind[] = ['kpi', 'chart', 'table', 'narrative', 'map'];

export interface ReportSettingsForm {
  name: string;
  description: string;
  owner: string;
  generator_kind: GeneratorKind;
  dataset_name: string;
  active: boolean;
  tags: string;
  template: ReportTemplate;
  schedule: ReportSchedule;
  recipients: DistributionRecipient[];
}

interface ReportSettingsDrawerProps {
  open: boolean;
  report: ReportDefinition | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (form: ReportSettingsForm) => Promise<void> | void;
}

function emptyForm(): ReportSettingsForm {
  return {
    name: 'New report',
    description: 'Describe the audience and the operating cadence.',
    owner: 'You',
    generator_kind: 'pdf',
    dataset_name: '',
    active: true,
    tags: 'briefing',
    template: {
      title: 'New report',
      subtitle: '',
      theme: 'copper',
      layout: 'briefing',
      sections: [],
    },
    schedule: {
      cadence: 'manual',
      expression: null,
      timezone: 'UTC',
      anchor_time: '09:00',
      interval_minutes: null,
      enabled: false,
      next_run_at: null,
    },
    recipients: [],
  };
}

function reportToForm(report: ReportDefinition): ReportSettingsForm {
  return {
    name: report.name,
    description: report.description,
    owner: report.owner,
    generator_kind: report.generator_kind,
    dataset_name: report.dataset_name,
    active: report.active,
    tags: report.tags.join(', '),
    template: { ...report.template, sections: report.template.sections.map((entry) => ({ ...entry, config: { ...entry.config } })) },
    schedule: { ...report.schedule },
    recipients: report.recipients.map((entry) => ({ ...entry, config: { ...entry.config } })),
  };
}

export function ReportSettingsDrawer({ open, report, busy, onClose, onSubmit }: ReportSettingsDrawerProps) {
  const initial = useMemo(() => (report ? reportToForm(report) : emptyForm()), [report]);
  const [form, setForm] = useState<ReportSettingsForm>(initial);
  const [tab, setTab] = useState<'general' | 'sections' | 'schedule' | 'recipients'>('general');

  useEffect(() => {
    if (open) setForm(initial);
  }, [initial, open]);

  function patch(next: Partial<ReportSettingsForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function patchTemplate(next: Partial<ReportTemplate>) {
    setForm((current) => ({ ...current, template: { ...current.template, ...next } }));
  }

  function patchSchedule(next: Partial<ReportSchedule>) {
    setForm((current) => ({ ...current, schedule: { ...current.schedule, ...next } }));
  }

  function updateSection(index: number, next: Partial<ReportSection>) {
    setForm((current) => {
      const sections = [...current.template.sections];
      sections[index] = { ...sections[index], ...next };
      return { ...current, template: { ...current.template, sections } };
    });
  }

  function addSection() {
    setForm((current) => ({
      ...current,
      template: {
        ...current.template,
        sections: [
          ...current.template.sections,
          {
            id: `section-${current.template.sections.length + 1}`,
            title: 'New section',
            kind: 'kpi',
            query: 'select 1',
            description: '',
            config: {},
          },
        ],
      },
    }));
  }

  function removeSection(index: number) {
    setForm((current) => {
      const sections = [...current.template.sections];
      sections.splice(index, 1);
      return { ...current, template: { ...current.template, sections } };
    });
  }

  function updateRecipient(index: number, next: Partial<DistributionRecipient>) {
    setForm((current) => {
      const recipients = [...current.recipients];
      recipients[index] = { ...recipients[index], ...next };
      return { ...current, recipients };
    });
  }

  function addRecipient() {
    setForm((current) => ({
      ...current,
      recipients: [
        ...current.recipients,
        {
          id: `recipient-${current.recipients.length + 1}`,
          channel: 'email',
          target: '',
          label: null,
          config: {},
        },
      ],
    }));
  }

  function removeRecipient(index: number) {
    setForm((current) => {
      const recipients = [...current.recipients];
      recipients.splice(index, 1);
      return { ...current, recipients };
    });
  }

  return (
    <Drawer open={open} title={report ? 'Definition settings' : 'Create report'} side="right" width="520px" onClose={onClose}>
      <div style={{ background: '#ffffff', color: 'var(--text-default)', borderRadius: 'var(--radius-md)', padding: 16, margin: '-16px' }}>
      <div role="tablist" className="of-tabbar" style={{ padding: '0 4px', marginBottom: 12 }}>
        {(
          [
            { id: 'general', label: 'General' },
            { id: 'sections', label: 'Sections' },
            { id: 'schedule', label: 'Schedule' },
            { id: 'recipients', label: 'Recipients' },
          ] as const
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={`of-tab ${tab === entry.id ? 'of-tab-active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12, padding: '0 4px' }}>
        {tab === 'general' && (
          <>
            <Field label="Name">
              <input className="of-input" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Owner">
              <input className="of-input" value={form.owner} onChange={(e) => patch({ owner: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea
                className="of-textarea"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
                style={{ minHeight: 96 }}
              />
            </Field>
            <Field label="Generator">
              <select
                className="of-select"
                value={form.generator_kind}
                onChange={(e) => patch({ generator_kind: e.target.value as GeneratorKind })}
              >
                {GENERATORS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dataset">
              <input
                className="of-input"
                value={form.dataset_name}
                onChange={(e) => patch({ dataset_name: e.target.value })}
                placeholder="sales_fact_daily"
              />
            </Field>
            <Field label="Tags (comma separated)">
              <input
                className="of-input"
                value={form.tags}
                onChange={(e) => patch({ tags: e.target.value })}
                placeholder="executive, weekly"
              />
            </Field>
            <Field label="Template title">
              <input
                className="of-input"
                value={form.template.title}
                onChange={(e) => patchTemplate({ title: e.target.value })}
              />
            </Field>
            <Field label="Template subtitle">
              <input
                className="of-input"
                value={form.template.subtitle}
                onChange={(e) => patchTemplate({ subtitle: e.target.value })}
              />
            </Field>
            <label style={checkboxStyle}>
              <input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} />
              <span>Definition active</span>
            </label>
          </>
        )}

        {tab === 'sections' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {form.template.sections.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sections yet. Add one to render a widget on the canvas.</p>
            ) : (
              form.template.sections.map((section, index) => (
                <div
                  key={section.id}
                  style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <input
                      className="of-input"
                      value={section.title}
                      onChange={(e) => updateSection(index, { title: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <select
                      className="of-select"
                      value={section.kind}
                      onChange={(e) => updateSection(index, { kind: e.target.value as SectionKind })}
                      style={{ width: 120 }}
                    >
                      {SECTION_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="of-btn of-btn-danger" onClick={() => removeSection(index)}>
                      Remove
                    </button>
                  </div>
                  <input
                    className="of-input"
                    placeholder="ID"
                    value={section.id}
                    onChange={(e) => updateSection(index, { id: e.target.value })}
                  />
                  <textarea
                    className="of-textarea"
                    placeholder="Description"
                    value={section.description}
                    onChange={(e) => updateSection(index, { description: e.target.value })}
                    style={{ minHeight: 60 }}
                  />
                  <textarea
                    className="of-textarea"
                    placeholder="select ... from ..."
                    value={section.query}
                    onChange={(e) => updateSection(index, { query: e.target.value })}
                    style={{ minHeight: 60, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              ))
            )}
            <button type="button" className="of-btn" onClick={addSection}>
              + Add section
            </button>
          </div>
        )}

        {tab === 'schedule' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Cadence">
              <select
                className="of-select"
                value={form.schedule.cadence}
                onChange={(e) => patchSchedule({ cadence: e.target.value as ScheduleCadence })}
              >
                {CADENCES.map((cadence) => (
                  <option key={cadence} value={cadence}>
                    {cadence}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cron expression">
              <input
                className="of-input"
                value={form.schedule.expression ?? ''}
                onChange={(e) => patchSchedule({ expression: e.target.value || null })}
                placeholder="0 9 * * MON"
              />
            </Field>
            <Field label="Timezone">
              <input
                className="of-input"
                value={form.schedule.timezone}
                onChange={(e) => patchSchedule({ timezone: e.target.value })}
              />
            </Field>
            <Field label="Anchor time">
              <input
                className="of-input"
                value={form.schedule.anchor_time}
                onChange={(e) => patchSchedule({ anchor_time: e.target.value })}
                placeholder="09:00"
              />
            </Field>
            <Field label="Interval (minutes)">
              <input
                className="of-input"
                type="number"
                value={form.schedule.interval_minutes ?? ''}
                onChange={(e) =>
                  patchSchedule({ interval_minutes: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Field>
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={form.schedule.enabled}
                onChange={(e) => patchSchedule({ enabled: e.target.checked })}
              />
              <span>Schedule enabled</span>
            </label>
          </div>
        )}

        {tab === 'recipients' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {form.recipients.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recipients yet. Add channels to distribute executions.</p>
            ) : (
              form.recipients.map((recipient, index) => (
                <div
                  key={recipient.id}
                  style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="of-select"
                      value={recipient.channel}
                      onChange={(e) =>
                        updateRecipient(index, { channel: e.target.value as DistributionRecipient['channel'] })
                      }
                      style={{ width: 120 }}
                    >
                      {(['email', 'slack', 'teams', 's3', 'webhook'] as const).map((channel) => (
                        <option key={channel} value={channel}>
                          {channel}
                        </option>
                      ))}
                    </select>
                    <input
                      className="of-input"
                      placeholder="target"
                      value={recipient.target}
                      onChange={(e) => updateRecipient(index, { target: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="of-btn of-btn-danger" onClick={() => removeRecipient(index)}>
                      Remove
                    </button>
                  </div>
                  <input
                    className="of-input"
                    placeholder="Label (optional)"
                    value={recipient.label ?? ''}
                    onChange={(e) => updateRecipient(index, { label: e.target.value || null })}
                  />
                </div>
              ))
            )}
            <button type="button" className="of-btn" onClick={addRecipient}>
              + Add recipient
            </button>
          </div>
        )}
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 4px', marginTop: 16, borderTop: '1px solid var(--border-default)' }}>
        <button type="button" className="of-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="of-btn of-btn-primary"
          onClick={() => {
            void onSubmit(form);
          }}
          disabled={busy}
        >
          {report ? 'Save changes' : 'Create report'}
        </button>
      </footer>
      </div>
    </Drawer>
  );
}

const checkboxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  border: '1px solid var(--border-default)',
  background: '#ffffff',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span className="of-eyebrow" style={{ margin: 0 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
