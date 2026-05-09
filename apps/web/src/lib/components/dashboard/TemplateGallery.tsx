import type { DashboardTemplateSummary } from '@/lib/utils/dashboards';

interface TemplateGalleryProps {
  templates: DashboardTemplateSummary[];
  selectedTemplateId?: string;
  compact?: boolean;
  onSelect?: (templateId: string) => void;
  onUseTemplate?: (templateId: string) => void;
}

export function TemplateGallery({
  templates,
  selectedTemplateId,
  compact = false,
  onSelect,
  onUseTemplate,
}: TemplateGalleryProps) {
  return (
    <section className="of-panel" style={{ overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: '1px solid var(--border-default)',
          padding: '10px 12px',
        }}
      >
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>
            Template gallery
          </p>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
            Start from a Foundry-style dashboard shape.
          </p>
        </div>
        <span className="of-badge">{templates.length}</span>
      </header>

      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
          padding: 10,
        }}
      >
        {templates.map((template) => {
          const selected = selectedTemplateId === template.id;
          return (
            <article
              key={template.id}
              className="of-panel-muted"
              style={{
                display: 'grid',
                gap: 8,
                padding: 10,
                borderColor: selected ? 'var(--status-info)' : undefined,
                background: selected ? 'var(--status-info-bg)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <span className="of-chip of-chip-active">{template.category}</span>
                  <h3 className="of-heading-sm" style={{ margin: '8px 0 0' }}>
                    {template.name}
                  </h3>
                </div>
                <span className="of-badge">{template.widgetTypes.length}</span>
              </div>

              <p className="of-text-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                {template.description}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {template.widgetTypes.map((type, index) => (
                  <span key={`${template.id}-${type}-${index}`} className="of-chip">
                    {type}
                  </span>
                ))}
              </div>

              <p className="of-text-soft" style={{ margin: 0, fontSize: 11 }}>
                {template.recommendedFor}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {onSelect ? (
                  <button type="button" className="of-button" onClick={() => onSelect(template.id)}>
                    Preview
                  </button>
                ) : null}
                {onUseTemplate ? (
                  <button type="button" className="of-button of-button--primary" onClick={() => onUseTemplate(template.id)}>
                    Use template
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
