import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { listLinkTypes, listProperties, type LinkType, type Property } from '@/lib/api/ontology';
import type {
  SearchAroundFilter,
  SearchAroundParameter,
  SearchAroundStep,
} from '@/lib/api/vertexSearchArounds';

import { FilterEditor, type PropertyOption } from './FilterEditor';

interface StepEditorProps {
  step: SearchAroundStep;
  startingObjectTypeId: string;
  parameters: SearchAroundParameter[];
  resultingCount?: number;
  resultingTypeName?: string;
  onChange: (next: SearchAroundStep) => void;
  onDelete: () => void;
}

// One step of a Search Around DSL. Renders the Relation picker, the
// list of Filters with an Add filter button, and the Resulting
// Objects count slot that the parent fills in after running a
// preview traverse against the backend.
export function StepEditor({
  step,
  startingObjectTypeId,
  parameters,
  resultingCount,
  resultingTypeName,
  onChange,
  onDelete,
}: StepEditorProps) {
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [error, setError] = useState('');

  // Load link types whose source matches the current starting type.
  // We don't paginate; ontology typically returns a small set per type.
  useEffect(() => {
    if (!startingObjectTypeId) {
      setLinkTypes([]);
      return;
    }
    let cancelled = false;
    listLinkTypes({ object_type_id: startingObjectTypeId, per_page: 200 })
      .then((res) => {
        if (!cancelled) setLinkTypes(res.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [startingObjectTypeId]);

  // When the user picks a relation, fetch the properties of the
  // *target* type so the filter picker has the right shortlist.
  const targetTypeId = useMemo(() => {
    const lt = linkTypes.find((l) => l.id === step.relation_id);
    return lt?.target_type_id ?? '';
  }, [linkTypes, step.relation_id]);

  useEffect(() => {
    if (!targetTypeId) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    listProperties(targetTypeId)
      .then((res) => {
        if (!cancelled) {
          setProperties(
            res.map((p: Property) => ({ name: p.name, displayName: p.display_name || p.name })),
          );
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [targetTypeId]);

  function patchFilter(idx: number, next: SearchAroundFilter) {
    onChange({
      ...step,
      filters: step.filters.map((f, i) => (i === idx ? next : f)),
    });
  }

  function deleteFilter(idx: number) {
    onChange({ ...step, filters: step.filters.filter((_, i) => i !== idx) });
  }

  function addFilter() {
    onChange({
      ...step,
      filters: [
        ...step.filters,
        { property: properties[0]?.name ?? '', op: 'eq', literal_json: '' },
      ],
    });
  }

  return (
    <section className="of-panel" style={{ padding: 10, marginBottom: 8 }}>
      <header
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
      >
        <Glyph name="link" size={12} />
        <strong style={{ fontSize: 12 }}>Relation</strong>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          title="Remove link"
          onClick={onDelete}
          style={{ marginLeft: 'auto', minHeight: 24, padding: '0 6px' }}
        >
          <Glyph name="x" size={12} />
        </button>
      </header>

      <select
        className="of-select"
        value={step.relation_id}
        onChange={(e) => onChange({ ...step, relation_id: e.target.value, filters: [] })}
        style={{ width: '100%', marginBottom: 6 }}
      >
        <option value="">(pick relation)</option>
        {linkTypes.map((lt) => (
          <option key={lt.id} value={lt.id}>
            {lt.display_name || lt.name}
          </option>
        ))}
      </select>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
      >
        <label style={{ fontSize: 11 }}>
          Direction
          <select
            className="of-select"
            value={step.direction}
            onChange={(e) =>
              onChange({ ...step, direction: e.target.value as 'outgoing' | 'incoming' })
            }
            style={{ marginLeft: 6 }}
          >
            <option value="outgoing">outgoing</option>
            <option value="incoming">incoming</option>
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 6 }}>
        <strong style={{ fontSize: 11 }}>Filters</strong>
        <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
          {step.filters.map((f, i) => (
            <FilterEditor
              key={i}
              filter={f}
              properties={properties}
              parameters={parameters}
              onChange={(next) => patchFilter(i, next)}
              onDelete={() => deleteFilter(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          onClick={addFilter}
          disabled={!step.relation_id}
          style={{ marginTop: 4, fontSize: 11 }}
        >
          <Glyph name="plus" size={12} /> Add filter
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          paddingTop: 6,
          borderTop: '1px solid var(--border-default)',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>Resulting Objects</span>
        <span className="of-chip" style={{ marginLeft: 'auto' }}>
          {resultingTypeName || 'objects'}
        </span>
        <span
          className="of-chip of-status-info"
          aria-label="resulting count"
          style={{ minWidth: 32, textAlign: 'center' }}
        >
          {resultingCount === undefined ? '—' : resultingCount}
        </span>
      </div>

      {error && (
        <div className="of-status-warning" style={{ marginTop: 6, fontSize: 11 }}>
          {error}
        </div>
      )}
    </section>
  );
}
