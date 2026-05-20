// Foundry-style Build timeline Gantt — one row per selected dataset,
// horizontal bars per build colored either by build state or by
// pipeline (≈ schedule). Clicking a bar opens an inline popover with
// state, start/end/duration, and View build / View job / View schedule
// deep links.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  RANGE_LABELS,
  buildDuration,
  type BuildTimelineBar,
  type BuildTimelineColorBy,
  type BuildTimelineRangeKey,
  type BuildTimelineRow,
} from '@/lib/lineage/buildTimeline';

interface BuildTimelinePanelProps {
  rows: BuildTimelineRow[];
  from: number;
  until: number;
  rangeKey: BuildTimelineRangeKey;
  colorBy: BuildTimelineColorBy;
  onRangeChange: (range: BuildTimelineRangeKey) => void;
  onColorByChange: (mode: BuildTimelineColorBy) => void;
  emptyHint: string;
}

const ROW_HEIGHT = 26;
const ROW_PADDING_Y = 4;
const LABEL_WIDTH = 160;
const AXIS_HEIGHT = 24;
const MIN_BAR_WIDTH = 4;

const RANGE_KEYS: BuildTimelineRangeKey[] = ['1h', '6h', '12h', '1d', '3d', '7d', '10d'];

const STATE_LABELS: Record<string, string> = {
  BUILD_COMPLETED: 'Successful job',
  BUILD_FAILED: 'Failed job',
  BUILD_RUNNING: 'Running job',
  BUILD_ABORTED: 'Aborted job',
  BUILD_QUEUED: 'Queued job',
  BUILD_RESOLUTION: 'Resolving build',
  BUILD_ABORTING: 'Aborting job',
};

interface PopupState {
  bar: BuildTimelineBar;
  datasetLabel: string;
  /** SVG-local coordinates of the click anchor. */
  anchorX: number;
  anchorY: number;
}

export function BuildTimelinePanel(props: BuildTimelinePanelProps) {
  const { rows, from, until, rangeKey, colorBy, onRangeChange, onColorByChange, emptyHint } = props;
  const [popup, setPopup] = useState<PopupState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.max(400, entry.contentRect.width));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Reset popup when range/color changes (the underlying bar may be gone).
  useEffect(() => {
    setPopup(null);
  }, [rangeKey, colorBy, from, until]);

  const totalHeight = rows.length === 0 ? AXIS_HEIGHT + 60 : AXIS_HEIGHT + rows.length * ROW_HEIGHT + 12;
  const plotWidth = Math.max(50, width - LABEL_WIDTH);

  const ticks = useMemo(() => buildAxisTicks(from, until), [from, until]);

  function xForTime(ts: number): number {
    if (until === from) return LABEL_WIDTH;
    return LABEL_WIDTH + ((ts - from) / (until - from)) * plotWidth;
  }

  return (
    <div ref={containerRef} style={panelRoot}>
      <div style={controlsRow}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Builds from past</span>
        <select
          value={rangeKey}
          onChange={(e) => onRangeChange(e.target.value as BuildTimelineRangeKey)}
          style={selectInput}
        >
          {RANGE_KEYS.map((key) => (
            <option key={key} value={key}>{RANGE_LABELS[key]}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>colored by</span>
        <select
          value={colorBy}
          onChange={(e) => onColorByChange(e.target.value as BuildTimelineColorBy)}
          style={selectInput}
        >
          <option value="schedule">schedule</option>
          <option value="status">job status</option>
        </select>
      </div>

      <div style={{ position: 'relative', overflow: 'auto', minHeight: 0, flex: 1 }}>
        {rows.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12, padding: 16 }}>{emptyHint}</div>
        ) : (
          <svg
            width={width}
            height={totalHeight}
            style={{ display: 'block' }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setPopup(null);
            }}
          >
            {/* Axis ticks (vertical lines + labels). */}
            {ticks.map((t) => (
              <g key={t.ts}>
                <line
                  x1={xForTime(t.ts)}
                  x2={xForTime(t.ts)}
                  y1={AXIS_HEIGHT - 6}
                  y2={totalHeight - 4}
                  stroke="var(--border-subtle)"
                  strokeDasharray="3 3"
                />
                <text
                  x={xForTime(t.ts) + 2}
                  y={AXIS_HEIGHT - 8}
                  fontSize={10}
                  fill="var(--text-muted)"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Dataset rows. */}
            {rows.map((row, rowIdx) => {
              const y = AXIS_HEIGHT + rowIdx * ROW_HEIGHT;
              const rowFill = rowIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)';
              return (
                <g key={row.datasetId}>
                  <rect x={0} y={y} width={width} height={ROW_HEIGHT} fill={rowFill} />
                  <text
                    x={8}
                    y={y + ROW_HEIGHT / 2 + 4}
                    fontSize={11}
                    fill="var(--text-default)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(row.datasetLabel, 22)}
                  </text>
                  {row.bars.map((bar) => {
                    const barX = xForTime(bar.startedAt);
                    const barEnd = xForTime(bar.finishedAt);
                    const barWidth = Math.max(MIN_BAR_WIDTH, barEnd - barX);
                    return (
                      <rect
                        key={`${row.datasetId}-${bar.build.id}`}
                        x={barX}
                        y={y + ROW_PADDING_Y}
                        width={barWidth}
                        height={ROW_HEIGHT - ROW_PADDING_Y * 2}
                        fill={bar.color}
                        stroke={bar.color}
                        rx={2}
                        style={{ cursor: 'pointer' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPopup({
                            bar,
                            datasetLabel: row.datasetLabel,
                            anchorX: barX + barWidth / 2,
                            anchorY: y + ROW_PADDING_Y,
                          });
                        }}
                      >
                        <title>
                          {`${row.datasetLabel} · ${STATE_LABELS[bar.build.state] ?? bar.build.state}`}
                        </title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}

        {popup && (
          <BuildBarPopover
            popup={popup}
            onClose={() => setPopup(null)}
          />
        )}
      </div>
    </div>
  );
}

function BuildBarPopover({ popup, onClose }: { popup: PopupState; onClose: () => void }) {
  const { bar, datasetLabel, anchorX, anchorY } = popup;
  const stateLabel = STATE_LABELS[bar.build.state] ?? bar.build.state;
  const isSuccess = bar.build.state === 'BUILD_COMPLETED';
  const isFailure = bar.build.state === 'BUILD_FAILED';
  return (
    <div
      role="dialog"
      style={{
        ...popoverWrap,
        top: anchorY + 24,
        left: Math.max(8, anchorX - 130),
      }}
    >
      <div
        style={{
          ...popoverHeader,
          background: isSuccess ? '#48a865' : isFailure ? '#d9534f' : '#444b53',
        }}
      >
        {stateLabel}
      </div>
      <div style={popoverBody}>
        <div style={popoverRow}>
          <span style={popoverLabel}>Dataset</span>
          <span style={popoverValue}>{datasetLabel}</span>
        </div>
        <div style={popoverRow}>
          <span style={popoverLabel}>Start time</span>
          <span style={popoverValue}>{formatStamp(bar.build.started_at)}</span>
        </div>
        <div style={popoverRow}>
          <span style={popoverLabel}>End time</span>
          <span style={popoverValue}>{formatStamp(bar.build.finished_at)}</span>
        </div>
        <div style={popoverRow}>
          <span style={popoverLabel}>Duration</span>
          <span style={popoverValue}>{buildDuration(bar.build)}</span>
        </div>
        <div style={popoverLinks}>
          <a
            href={`/builds/${encodeURIComponent(bar.build.rid)}`}
            target="_blank"
            rel="noreferrer"
            style={popoverLink}
          >
            View build
          </a>
          <a
            href={`/builds/${encodeURIComponent(bar.build.rid)}/jobs`}
            target="_blank"
            rel="noreferrer"
            style={popoverLink}
          >
            View job
          </a>
          <a
            href={`/schedules?pipeline=${encodeURIComponent(bar.pipelineRid)}`}
            target="_blank"
            rel="noreferrer"
            style={popoverLink}
          >
            View schedule
          </a>
        </div>
        <button type="button" style={popoverClose} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function buildAxisTicks(from: number, until: number): Array<{ ts: number; label: string }> {
  const total = until - from;
  if (total <= 0) return [];
  const TARGET_TICKS = 6;
  const step = total / TARGET_TICKS;
  const out: Array<{ ts: number; label: string }> = [];
  const useTimeOfDay = total <= 36 * 60 * 60 * 1000;
  for (let i = 0; i <= TARGET_TICKS; i++) {
    const ts = from + i * step;
    out.push({ ts, label: formatTick(ts, useTimeOfDay) });
  }
  return out;
}

function formatTick(ts: number, withTime: boolean): string {
  const d = new Date(ts);
  if (withTime) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

const panelRoot: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  height: '100%',
  minHeight: 0,
  padding: 8,
};
const controlsRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const selectInput: CSSProperties = {
  padding: '3px 6px',
  fontSize: 12,
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-default)',
};
const popoverWrap: CSSProperties = {
  position: 'absolute',
  zIndex: 30,
  minWidth: 260,
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  overflow: 'hidden',
};
const popoverHeader: CSSProperties = {
  padding: '6px 10px',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
};
const popoverBody: CSSProperties = {
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const popoverRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 11,
};
const popoverLabel: CSSProperties = {
  color: 'var(--text-muted)',
};
const popoverValue: CSSProperties = {
  color: 'var(--text-default)',
  fontWeight: 500,
};
const popoverLinks: CSSProperties = {
  display: 'flex',
  gap: 10,
  paddingTop: 6,
  borderTop: '1px solid var(--border-subtle)',
  marginTop: 4,
};
const popoverLink: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-link)',
  textDecoration: 'none',
};
const popoverClose: CSSProperties = {
  alignSelf: 'flex-end',
  background: 'transparent',
  border: 'none',
  fontSize: 11,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  marginTop: 2,
};
