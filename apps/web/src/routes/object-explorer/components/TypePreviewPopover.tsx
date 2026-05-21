import { useEffect, useMemo } from 'react';

import {
  objectExplorerLinkedTargetForType,
  type LinkType,
  type ObjectType,
} from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import { useTypeProperties } from '../queries';
import {
  classifyPropertyKind,
  propertyKindGlyph,
  propertyKindLabel,
} from '../propertyKind';
import './TypePreviewPopover.css';

export interface TypePreviewPopoverProps {
  typeId: string;
  typeById: Map<string, ObjectType>;
  linkTypes: LinkType[];
  onClose: () => void;
  onStartExploration: (typeId: string) => void;
  /** Optional handler for the "View →" link in the Properties header. */
  onViewProperties?: (typeId: string) => void;
}

export function TypePreviewPopover({
  typeId,
  typeById,
  linkTypes,
  onClose,
  onStartExploration,
  onViewProperties,
}: TypePreviewPopoverProps) {
  const objectType = typeById.get(typeId);
  const propertiesQuery = useTypeProperties(typeId);
  const properties = propertiesQuery.data ?? objectType?.properties ?? [];

  const linkedTargets = useMemo(() => {
    if (!objectType) return [];
    return linkTypes
      .map((linkType) => {
        const target = objectExplorerLinkedTargetForType(linkType, typeId);
        if (!target) return null;
        return {
          linkType,
          targetType: typeById.get(target.target_object_type_id) ?? null,
          targetTypeId: target.target_object_type_id,
        };
      })
      .filter((entry): entry is { linkType: LinkType; targetType: ObjectType | null; targetTypeId: string } =>
        Boolean(entry),
      );
  }, [linkTypes, objectType, typeById, typeId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!objectType) return null;

  const name = objectType.display_name || objectType.name;
  const titleProperty = objectType.title_property;
  const primaryKey = objectType.primary_key_property || objectType.primary_key;
  const visibility = (objectType.visibility ?? 'normal').toLowerCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${name}`}
      onClick={onClose}
      className="oe oe-preview__backdrop"
    >
      <article className="oe-preview" onClick={(event) => event.stopPropagation()}>
        <header className="oe-preview__header">
          <span
            className="oe-type-icon oe-type-icon--lg"
            style={{ background: iconBackground(objectType.id, objectType.color) }}
            aria-hidden="true"
          >
            {initialFor(name)}
          </span>
          <div className="oe-preview__heading">
            <h2 className="oe-preview__name">{name}</h2>
            <span className="oe-preview__sublabel">Object Type</span>
          </div>
          <button
            type="button"
            className="oe-preview__close"
            onClick={onClose}
            aria-label="Close preview"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="oe-preview__body">
          <section className="oe-preview__section">
            <div className="oe-preview__section-header">
              <span className="oe-preview__section-label">Description</span>
            </div>
            <p className="oe-preview__text">
              {objectType.description?.trim() || (
                <span className="oe-preview__empty">No description.</span>
              )}
            </p>
          </section>

          <section className="oe-preview__section">
            <div className="oe-preview__section-header">
              <span className="oe-preview__section-label">Visibility</span>
              <span className="oe-preview__visibility" data-state={visibility}>
                {capitalize(visibility)}
              </span>
            </div>
          </section>

          <section className="oe-preview__section">
            <div className="oe-preview__section-header">
              <span className="oe-preview__section-label">
                Properties <span className="oe-preview__section-count">({properties.length})</span>
              </span>
              {onViewProperties && properties.length > 0 && (
                <button
                  type="button"
                  className="oe-preview__section-link"
                  onClick={() => onViewProperties(typeId)}
                >
                  View →
                </button>
              )}
            </div>
            {propertiesQuery.isLoading && properties.length === 0 ? (
              <p className="oe-preview__empty">Loading properties…</p>
            ) : properties.length === 0 ? (
              <p className="oe-preview__empty">No properties available.</p>
            ) : (
              <div className="oe-preview__scroll">
                <ul className="oe-preview__list">
                  {properties.map((property) => {
                    const kind = classifyPropertyKind(property.property_type);
                    const isTitle = property.name === titleProperty;
                    const isPrimary = property.name === primaryKey;
                    return (
                      <li key={property.id || property.name} className="oe-preview__row">
                        <span
                          className="oe-preview__property-icon"
                          title={propertyKindLabel(kind)}
                          aria-label={propertyKindLabel(kind)}
                        >
                          {propertyKindGlyph(kind)}
                        </span>
                        <span className="oe-preview__row-label">
                          {property.display_name || property.name}
                        </span>
                        <span className="oe-preview__row-tags">
                          {isTitle && (
                            <span className="oe-preview__tag" data-kind="title">
                              Title
                            </span>
                          )}
                          {isPrimary && (
                            <span className="oe-preview__tag" data-kind="primary">
                              Primary key
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <section className="oe-preview__section">
            <div className="oe-preview__section-header">
              <span className="oe-preview__section-label">
                Linked object types <span className="oe-preview__section-count">({linkedTargets.length})</span>
              </span>
            </div>
            {linkedTargets.length === 0 ? (
              <p className="oe-preview__empty">No linked object types.</p>
            ) : (
              <ul className="oe-preview__list">
                {linkedTargets.map(({ linkType, targetType, targetTypeId }) => {
                  const targetName = targetType?.display_name || targetType?.name || targetTypeId;
                  const seed = targetType?.id ?? targetTypeId;
                  const missing = !targetType;
                  return (
                    <li key={linkType.id} className="oe-preview__row">
                      <span
                        className="oe-type-icon oe-type-icon--sm"
                        style={{ background: iconBackground(seed, targetType?.color ?? null) }}
                        aria-hidden="true"
                      >
                        {initialFor(targetName)}
                      </span>
                      <span className="oe-preview__row-label">{targetName}</span>
                      {missing && (
                        <span
                          className="oe-preview__warning"
                          title="Linked object type is unresolved"
                          aria-label="Linked object type is unresolved"
                        >
                          ⚠
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <footer className="oe-preview__footer">
          <button
            type="button"
            className="oe-preview__primary-btn"
            onClick={() => onStartExploration(objectType.id)}
          >
            Start exploring →
          </button>
        </footer>
      </article>
    </div>
  );
}

function initialFor(name: string) {
  const cleaned = name.replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
