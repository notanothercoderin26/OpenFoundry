import { useMemo } from 'react';

import {
  objectExplorerLinkedTargetForType,
  type LinkType,
  type ObjectType,
} from '@/lib/api/ontology';

import { EmptyState, PanelHeader } from './atoms';
import { useTypeProperties } from '../queries';

interface TypePreviewPopoverProps {
  typeId: string;
  typeById: Map<string, ObjectType>;
  linkTypes: LinkType[];
  onClose: () => void;
  onStartExploration: (typeId: string) => void;
}

export function TypePreviewPopover({
  typeId,
  typeById,
  linkTypes,
  onClose,
  onStartExploration,
}: TypePreviewPopoverProps) {
  const objectType = typeById.get(typeId);
  const propertiesQuery = useTypeProperties(typeId);
  const properties = propertiesQuery.data ?? objectType?.properties ?? [];

  const linkedTargets = useMemo(() => {
    if (!objectType) return [] as Array<{ linkType: LinkType; targetType: ObjectType | null }>;
    return linkTypes
      .map((linkType) => {
        const target = objectExplorerLinkedTargetForType(linkType, typeId);
        if (!target) return null;
        return { linkType, targetType: typeById.get(target.target_object_type_id) ?? null };
      })
      .filter((entry): entry is { linkType: LinkType; targetType: ObjectType | null } => Boolean(entry));
  }, [linkTypes, objectType, typeById, typeId]);

  if (!objectType) return null;

  const titleProperty = objectType.title_property;
  const primaryKey = objectType.primary_key_property || objectType.primary_key;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${objectType.display_name || objectType.name}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 22, 36, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '60px 16px 16px',
        zIndex: 50,
      }}
    >
      <article
        onClick={(event) => event.stopPropagation()}
        className="of-panel"
        style={{
          width: 'min(100%, 480px)',
          maxHeight: 'calc(100vh - 80px)',
          overflow: 'auto',
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <p className="of-eyebrow">Object Type</p>
            <h2 className="of-heading-md" style={{ marginTop: 4 }}>
              {objectType.display_name || objectType.name}
            </h2>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {objectType.name}
            </p>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} aria-label="Close preview">
            ✕
          </button>
        </header>

        {objectType.description && (
          <section>
            <PanelHeader label="Description" />
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.4 }}>{objectType.description}</p>
          </section>
        )}

        <section>
          <PanelHeader label="Properties" value={`${properties.length}`} />
          {propertiesQuery.isLoading && properties.length === 0 ? (
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Loading properties…</p>
          ) : properties.length === 0 ? (
            <EmptyState label="No properties available." compact />
          ) : (
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {properties.slice(0, 12).map((property) => {
                const tags: string[] = [];
                if (property.name === titleProperty) tags.push('Title');
                if (property.name === primaryKey) tags.push('Primary key');
                return (
                  <li
                    key={property.id || property.name}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '2px 0' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {property.display_name || property.name}
                    </span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {tags.map((tag) => (
                        <span key={tag} className="of-chip">{tag}</span>
                      ))}
                    </span>
                  </li>
                );
              })}
              {properties.length > 12 && (
                <li className="of-text-muted" style={{ fontSize: 11 }}>
                  +{properties.length - 12} more
                </li>
              )}
            </ul>
          )}
        </section>

        <section>
          <PanelHeader label="Linked object types" value={`${linkedTargets.length}`} />
          {linkedTargets.length === 0 ? (
            <EmptyState label="No linked object types." compact />
          ) : (
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {linkedTargets.slice(0, 10).map(({ linkType, targetType }) => (
                <li
                  key={linkType.id}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '2px 0' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {targetType?.display_name || targetType?.name || linkType.target_type_id || 'Unknown'}
                  </span>
                  <span className="of-text-muted" style={{ fontSize: 11 }}>
                    {linkType.display_name || linkType.name}
                  </span>
                </li>
              ))}
              {linkedTargets.length > 10 && (
                <li className="of-text-muted" style={{ fontSize: 11 }}>
                  +{linkedTargets.length - 10} more
                </li>
              )}
            </ul>
          )}
        </section>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="of-button" onClick={onClose}>Close</button>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={() => onStartExploration(objectType.id)}
          >
            Start exploration →
          </button>
        </footer>
      </article>
    </div>
  );
}
