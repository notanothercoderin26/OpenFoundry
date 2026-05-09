import { useMemo } from 'react';

import type { AppWidget } from '@/lib/api/apps';
import { JsonEditor } from '@/lib/components/JsonEditor';

interface ThemePanelProps {
  value: string;
  onChange: (next: string) => void;
  pagesJson?: string;
}

type ThemeDraft = Record<string, unknown>;

const FONT_OPTIONS = ['Inter', 'Arial', 'Manrope', 'Space Grotesk', 'Source Sans 3', 'IBM Plex Sans'];

function parseTheme(value: string): ThemeDraft {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ThemeDraft : {};
  } catch {
    return {};
  }
}

function stringifyTheme(theme: ThemeDraft) {
  return JSON.stringify(theme, null, 2);
}

function stringValue(theme: ThemeDraft, key: string, fallback = '') {
  const value = theme[key];
  return typeof value === 'string' ? value : fallback;
}

function numberValue(theme: ThemeDraft, key: string, fallback: number) {
  const value = theme[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function patchTheme(theme: ThemeDraft, key: string, next: unknown) {
  const copy = { ...theme };
  if (next === '' || next === null) {
    delete copy[key];
  } else {
    copy[key] = next;
  }
  return copy;
}

interface ColorUsage {
  color: string;
  themeKeys: string[];
  widgets: Array<{ id: string; title: string; widget_type: string; field: string }>;
}

function collectColorUsage(theme: ThemeDraft, pagesJson?: string): ColorUsage[] {
  const themeColorEntries = Object.entries(theme).filter(([, value]) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value as string));
  const usage = new Map<string, ColorUsage>();
  for (const [key, value] of themeColorEntries) {
    const color = (value as string).toLowerCase();
    if (!usage.has(color)) usage.set(color, { color, themeKeys: [], widgets: [] });
    usage.get(color)!.themeKeys.push(key);
  }
  if (pagesJson) {
    try {
      const pages = JSON.parse(pagesJson) as Array<{ widgets?: AppWidget[] }>;
      const collectFromValue = (widget: AppWidget, value: unknown, field: string) => {
        if (typeof value !== 'string') return;
        const lower = value.toLowerCase();
        if (!/^#[0-9a-f]{3,8}$/i.test(lower)) return;
        if (!usage.has(lower)) usage.set(lower, { color: lower, themeKeys: [], widgets: [] });
        usage.get(lower)!.widgets.push({ id: widget.id, title: widget.title || widget.widget_type, widget_type: widget.widget_type, field });
      };
      for (const page of pages) {
        for (const widget of page.widgets ?? []) {
          const props = (widget.props ?? {}) as Record<string, unknown>;
          for (const [key, value] of Object.entries(props)) collectFromValue(widget, value, key);
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return Array.from(usage.values()).sort((a, b) => a.color.localeCompare(b.color));
}

export function ThemePanel({ value, onChange, pagesJson }: ThemePanelProps) {
  const theme = useMemo(() => parseTheme(value), [value]);
  const colorUsage = useMemo(() => collectColorUsage(theme, pagesJson), [theme, pagesJson]);
  const hasInvalidJson = useMemo(() => {
    try {
      JSON.parse(value);
      return false;
    } catch {
      return true;
    }
  }, [value]);

  function update(key: string, next: unknown) {
    onChange(stringifyTheme(patchTheme(theme, key, next)));
  }

  const colorFields = [
    ['primary_color', 'Primary'],
    ['accent_color', 'Accent'],
    ['background_color', 'Background'],
    ['surface_color', 'Surface'],
    ['text_color', 'Text'],
  ] as const;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {hasInvalidJson ? (
        <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Fix the raw theme JSON before using structured controls.
        </div>
      ) : null}

      <section className="of-panel-muted" style={{ display: 'grid', gap: 12, padding: 12 }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Theme panel</p>
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Configure the published runtime shell without editing JSON by hand.
          </p>
        </div>

        <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
          Theme name
          <input
            className="of-input"
            value={stringValue(theme, 'name')}
            onChange={(event) => update('name', event.target.value)}
            disabled={hasInvalidJson}
            placeholder="Operations Signal"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {colorFields.map(([key, label]) => {
            const current = stringValue(theme, key, '#ffffff');
            return (
              <label key={key} style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
                {label}
                <span style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 6 }}>
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#ffffff'}
                    onChange={(event) => update(key, event.target.value)}
                    disabled={hasInvalidJson}
                    style={{
                      width: 38,
                      height: 30,
                      padding: 0,
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                    }}
                    aria-label={`${label} color`}
                  />
                  <input
                    className="of-input"
                    value={stringValue(theme, key)}
                    onChange={(event) => update(key, event.target.value)}
                    disabled={hasInvalidJson}
                    placeholder="#0f766e"
                  />
                </span>
              </label>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Heading font
            <select
              className="of-input"
              value={stringValue(theme, 'heading_font', stringValue(theme, 'font_family', 'Inter'))}
              onChange={(event) => update('heading_font', event.target.value)}
              disabled={hasInvalidJson}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Body font
            <select
              className="of-input"
              value={stringValue(theme, 'body_font', stringValue(theme, 'font_family', 'Inter'))}
              onChange={(event) => update('body_font', event.target.value)}
              disabled={hasInvalidJson}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Border radius
            <input
              type="number"
              className="of-input"
              min={0}
              max={32}
              value={numberValue(theme, 'border_radius', 8)}
              onChange={(event) => update('border_radius', Math.min(Math.max(Number(event.target.value) || 0, 0), 32))}
              disabled={hasInvalidJson}
            />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
          Logo URL
          <input
            className="of-input"
            value={stringValue(theme, 'logo_url')}
            onChange={(event) => update('logo_url', event.target.value)}
            disabled={hasInvalidJson}
            placeholder="https://..."
          />
        </label>

        <div
          style={{
            display: 'grid',
            gap: 10,
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: stringValue(theme, 'background_color', '#f8fafc'),
            color: stringValue(theme, 'text_color', '#0f172a'),
            padding: 12,
          }}
        >
          <div
            style={{
              background: stringValue(theme, 'surface_color', '#ffffff'),
              borderRadius: numberValue(theme, 'border_radius', 8),
              border: '1px solid rgba(15,23,42,0.12)',
              padding: 12,
            }}
          >
            <p style={{ margin: 0, color: stringValue(theme, 'primary_color', '#0f766e'), fontSize: 12, fontWeight: 700 }}>
              Runtime preview
            </p>
            <h3 style={{ margin: '5px 0 4px', fontFamily: stringValue(theme, 'heading_font', 'Inter'), fontSize: 16 }}>
              {stringValue(theme, 'name', 'Workshop app')}
            </h3>
            <p style={{ margin: 0, fontFamily: stringValue(theme, 'body_font', 'Inter'), fontSize: 12, opacity: 0.75 }}>
              Surface, text, and accent colors are applied to published apps.
            </p>
          </div>
        </div>
      </section>

      <section className="of-panel-muted" style={{ display: 'grid', gap: 10, padding: 12 }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Used colors</p>
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Reads colors from theme tokens and widget props (matches Workshop&rsquo;s Used colors panel).
          </p>
        </div>
        {colorUsage.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No reusable hex colors detected yet.</p>
        ) : (
          <ul style={{ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {colorUsage.map((entry) => (
              <li
                key={entry.color}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px minmax(0, 1fr) auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: '6px 8px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-panel)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: entry.color,
                  }}
                />
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <code style={{ fontSize: 11, color: 'var(--text-default)' }}>{entry.color}</code>
                  <span className="of-text-muted" style={{ fontSize: 11 }}>
                    {entry.themeKeys.length > 0 ? `Theme: ${entry.themeKeys.join(', ')}` : 'Theme: —'}
                    {entry.widgets.length > 0 ? ` · Widgets: ${entry.widgets.length}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                  {entry.themeKeys.slice(0, 2).map((key) => (
                    <span key={`theme-${key}`} className="of-chip" style={{ minHeight: 20, fontSize: 11 }}>{key}</span>
                  ))}
                  {entry.widgets.slice(0, 2).map((widget) => (
                    <span key={`w-${widget.id}-${widget.field}`} className="of-chip of-chip-active" style={{ minHeight: 20, fontSize: 11 }}>
                      {widget.title || widget.widget_type}.{widget.field}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>Raw theme JSON</summary>
        <div style={{ marginTop: 8 }}>
          <JsonEditor value={value} onChange={onChange} minHeight={220} />
        </div>
      </details>
    </div>
  );
}
