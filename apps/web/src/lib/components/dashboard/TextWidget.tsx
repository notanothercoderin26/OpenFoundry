import type { DashboardTextWidget } from '@/lib/utils/dashboards';

interface TextWidgetProps {
  widget: DashboardTextWidget;
}

export function TextWidget({ widget }: TextWidgetProps) {
  const lines = widget.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={`dashboard-text-widget dashboard-text-widget--${widget.tone}`}>
      {lines.length > 0 ? (
        lines.map((line, index) => (
          <p key={`${widget.id}-${index}`} className="dashboard-text-widget__line">
            {line}
          </p>
        ))
      ) : (
        <p className="dashboard-text-widget__line dashboard-text-widget__line--empty">
          No text configured.
        </p>
      )}
    </div>
  );
}
