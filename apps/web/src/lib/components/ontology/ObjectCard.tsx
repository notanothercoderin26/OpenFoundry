import { formatPropertyValue, objectViewTitle, objectViewVisibleProperties, propertyConditionalStyle, type ObjectInstance, type ObjectType, type Property } from '@/lib/api/ontology';

interface ObjectCardAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ObjectCardProps {
  object: ObjectInstance;
  properties?: Property[];
  objectType?: ObjectType | null;
  actions?: ObjectCardAction[];
  onClick?: () => void;
  schemaOnly?: boolean;
}

const MARKING_TONE: Record<string, { background: string; color: string }> = {
  public: { background: '#064e3b', color: '#6ee7b7' },
  confidential: { background: '#7c2d12', color: '#fdba74' },
  pii: { background: '#831843', color: '#f9a8d4' },
};

export function ObjectCard({ object, properties = [], objectType = null, actions = [], onClick, schemaOnly = false }: ObjectCardProps) {
  const visible = objectViewVisibleProperties(properties).slice(0, 4);
  const access = object.object_view_access;
  const valuesRestricted = schemaOnly || Boolean(access && !access.can_view_instances);
  const marking = valuesRestricted ? 'schema-only' : object.marking ?? 'public';
  const title = valuesRestricted ? `${objectType?.display_name || objectType?.name || 'Object'} schema` : objectViewTitle(object, objectType);
  const tone = MARKING_TONE[marking] ?? { background: '#1e293b', color: '#cbd5e1' };

  return (
    <article
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderLeft: `4px solid ${objectType?.color ?? '#475569'}`,
        borderRadius: 6,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <strong title={object.id}>{title}</strong>
        <span style={{ ...tone, padding: '2px 8px', borderRadius: 3, fontSize: 11 }}>{marking}</span>
      </header>
      {objectType && <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>{objectType.display_name || objectType.name}</p>}
      {valuesRestricted && (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          {access?.reason || 'Object values are restricted; showing schema only.'}
        </p>
      )}
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, margin: 0, fontSize: 12 }}>
        {visible.map((p) => {
          const propertyRestricted = object.object_security_access?.property_decisions.some((decision) => decision.property_name === p.name && !decision.can_read);
          return (
            <div key={p.id} style={{ display: 'flex', gap: 6 }}>
              <dt style={{ color: '#64748b', minWidth: 90 }}>{p.display_name || p.name}</dt>
              <dd style={{ margin: 0, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(valuesRestricted || propertyRestricted ? {} : propertyConditionalStyle(p, object.properties?.[p.name])) }}>
                {valuesRestricted || propertyRestricted ? 'Restricted' : formatPropertyValue(p, object.properties?.[p.name])}
              </dd>
            </div>
          );
        })}
      </dl>
      {!valuesRestricted && actions.length > 0 && (
        <footer style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); a.onClick(); }}
              className="of-button"
              style={{ fontSize: 11, ...(a.danger ? { background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' } : {}) }}
            >
              {a.label}
            </button>
          ))}
        </footer>
      )}
    </article>
  );
}
