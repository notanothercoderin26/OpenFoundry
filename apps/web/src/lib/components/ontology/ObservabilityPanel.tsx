import { useMemo, useState } from "react";

import { EChartCanvas } from "@components/EChartCanvas";
import { Glyph } from "@components/ui/Glyph";

export interface MonitoringRule {
  id: string;
  name: string;
  condition: string;
  status: "healthy" | "warning" | "failing" | "paused" | string;
  lastRunAt?: string | null;
}

interface ObservabilityPanelProps {
  /** Deterministic seed for the mock usage curve (object type / action / function id). */
  seedId: string;
  /** Optional title; defaults to "Usage" with an N-day suffix. */
  title?: string;
  monitoringRules?: ReadonlyArray<MonitoringRule>;
}

export type ObservabilityRange = "30d" | "90d";

/**
 * Foundry "Observability" tab shared by Action types and Function packages.
 * Two stacked blocks:
 *  - Usage bar chart with a 30d / 90d range toggle.
 *  - Monitoring rules table (name, condition, status, last run).
 *
 * Until usage and monitoring endpoints land, the chart synthesises a stable
 * mock series from `seedId`, and the rules table accepts an explicit array
 * so callers can pass real data when it's available.
 */
export function ObservabilityPanel({
  seedId,
  title,
  monitoringRules = [],
}: ObservabilityPanelProps) {
  const [range, setRange] = useState<ObservabilityRange>("30d");

  const series = useMemo(() => buildUsageSeries(seedId, range), [seedId, range]);
  const options = useMemo(() => chartOptions(series), [series]);
  const total = useMemo(
    () => series.values.reduce((acc, v) => acc + v, 0),
    [series.values],
  );

  return (
    <div className="flex flex-col gap-4">
      <section
        className={[
          "p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "flex flex-col gap-3",
        ].join(" ")}
        aria-label="Usage chart"
      >
        <header className="flex items-center gap-2">
          <h3 className="text-of-16 font-of-semibold text-of-text">
            {title ?? "Usage"}
          </h3>
          <span className="text-of-13 text-of-text-muted tabular-nums">
            {total.toLocaleString()} invocations
          </span>
          <RangeToggle range={range} onChange={setRange} className="ml-auto" />
        </header>
        <div className="-mx-1 h-[220px]">
          <EChartCanvas options={options} style={{ height: "100%", width: "100%" }} />
        </div>
      </section>

      <section
        className={[
          "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card",
          "overflow-hidden",
        ].join(" ")}
        aria-label="Monitoring rules"
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-of-border">
          <h3 className="text-of-16 font-of-semibold text-of-text">
            Monitoring rules
          </h3>
          <span className="text-of-13 text-of-text-muted tabular-nums">
            {monitoringRules.length}
          </span>
          <button
            type="button"
            disabled
            className={[
              "ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-of-sm",
              "text-of-13 font-of-medium text-of-text-muted",
              "disabled:opacity-60",
            ].join(" ")}
          >
            <Glyph name="plus" size={12} tone="currentColor" />
            New rule
          </button>
        </header>
        {monitoringRules.length === 0 ? (
          <p className="px-4 py-5 text-of-13 text-of-text-muted text-center">
            No monitoring rules configured.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="bg-of-surface text-of-12 text-of-text-muted">
              <tr>
                <th className="text-left px-3 py-2 font-of-medium">Name</th>
                <th className="text-left px-3 py-2 font-of-medium">Condition</th>
                <th className="text-left px-3 py-2 font-of-medium">Status</th>
                <th className="text-left px-3 py-2 font-of-medium">Last run</th>
              </tr>
            </thead>
            <tbody>
              {monitoringRules.map((rule) => (
                <tr key={rule.id} className="border-t border-of-border">
                  <td className="px-3 py-2 text-of-13 text-of-text font-of-medium">
                    {rule.name}
                  </td>
                  <td className="px-3 py-2 text-of-12 text-of-text-muted font-mono truncate max-w-[280px]">
                    {rule.condition}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={rule.status} />
                  </td>
                  <td className="px-3 py-2 text-of-12 text-of-text-muted">
                    {rule.lastRunAt ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette = (() => {
    switch (status) {
      case "healthy":
        return { bg: "#e8f6ec", fg: "#1d8348", label: "Healthy" };
      case "warning":
        return { bg: "#fff3df", fg: "#9a5b00", label: "Warning" };
      case "failing":
        return { bg: "#fde7e7", fg: "#b42318", label: "Failing" };
      case "paused":
        return { bg: "#eef0f3", fg: "#5f6b7c", label: "Paused" };
      default:
        return { bg: "#eef0f3", fg: "#5f6b7c", label: status };
    }
  })();
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-of-sm text-of-12 font-of-medium"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {palette.label}
    </span>
  );
}

function RangeToggle({
  range,
  onChange,
  className,
}: {
  range: ObservabilityRange;
  onChange: (next: ObservabilityRange) => void;
  className?: string;
}) {
  const wrap = [
    "inline-flex h-7 rounded-of-sm overflow-hidden",
    "border border-of-border bg-of-surface-raised",
  ];
  if (className) wrap.push(className);
  return (
    <div className={wrap.join(" ")} role="group" aria-label="Range">
      <RangeButton active={range === "30d"} onClick={() => onChange("30d")}>
        30d
      </RangeButton>
      <RangeButton active={range === "90d"} onClick={() => onChange("90d")}>
        90d
      </RangeButton>
    </div>
  );
}

function RangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = [
    "inline-flex items-center justify-center px-2 text-of-12 font-of-medium",
    active
      ? "bg-of-accent-soft text-of-accent"
      : "text-of-text-muted hover:text-of-text",
  ].join(" ");
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {children}
    </button>
  );
}

interface UsageSeries {
  labels: string[];
  values: number[];
}

function buildUsageSeries(seedId: string, range: ObservabilityRange): UsageSeries {
  let h = 0;
  for (let i = 0; i < seedId.length; i++) {
    h = ((h << 5) - h + seedId.charCodeAt(i)) | 0;
  }
  const random = mulberry32(Math.abs(h) || 1);

  const days = range === "30d" ? 30 : 90;
  const now = new Date();
  const labels: string[] = [];
  const values: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    labels.push(
      date.toLocaleString(undefined, { month: "short", day: "numeric" }),
    );
    values.push(Math.floor(random() * 40) + (i % 7 === 0 ? 20 : 0));
  }
  return { labels, values };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chartOptions(series: UsageSeries) {
  return {
    grid: { left: 28, right: 12, top: 10, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: "#e5e8eb",
      borderWidth: 1,
      textStyle: { color: "#1c2127", fontSize: 12 },
    },
    xAxis: {
      type: "category",
      data: series.labels,
      axisLine: { lineStyle: { color: "#e5e8eb" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#5f6b7c",
        fontSize: 10,
        interval: Math.max(0, Math.floor(series.labels.length / 8)),
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#eef0f3" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#5f6b7c", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        data: series.values,
        itemStyle: { color: "#215db0", borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 12,
      },
    ],
  };
}
