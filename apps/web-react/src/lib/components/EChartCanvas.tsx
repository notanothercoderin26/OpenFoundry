import { useEffect, useRef } from 'react';

// Loose type to avoid pulling echarts types into the synchronous bundle —
// the actual module is lazy-imported below.
type EChartsLike = {
  setOption: (option: unknown, notMerge?: boolean) => void;
  resize: () => void;
  dispose: () => void;
};

interface EChartCanvasProps {
  options: unknown;
  style?: React.CSSProperties;
  className?: string;
}

export function EChartCanvas({ options, style, className }: EChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsLike | null>(null);

  // Init + dispose lifecycle. Runs once per mount; the lazy import keeps echarts
  // out of the initial bundle and lets the chunk be cached across routes.
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const echarts = await import('echarts');
      if (disposed || !containerRef.current) return;

      const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
      chartRef.current = chart as EChartsLike;
      chart.setOption(options as Parameters<typeof chart.setOption>[0], true);

      resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the chart in sync with prop changes. setOption is internally diffable,
  // so passing the same value twice is cheap. Callers with very volatile options
  // should still useMemo the object to avoid re-running the effect every render.
  useEffect(() => {
    chartRef.current?.setOption(options, true);
  }, [options]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: 320, ...style }}
    />
  );
}
