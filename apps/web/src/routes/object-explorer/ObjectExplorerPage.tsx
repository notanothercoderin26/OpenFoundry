import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  createObjectSet,
  evaluateObjectSet,
  getObjectView,
  listObjectSets,
  listObjectTypes,
  materializeObjectSet,
  searchOntology,
  type ObjectSetDefinition,
  type ObjectSetEvaluationResponse,
  type ObjectType,
  type ObjectViewResponse,
  type SearchResult,
} from '@/lib/api/ontology';
import { ActionExecutor } from '@/lib/components/ontology/ActionExecutor';

type SearchMode = 'lexical' | 'semantic';
type EvaluationMode = 'preview' | 'materialize';

interface RecentItem {
  kind: string;
  id: string;
  title: string;
  route: string;
  objectTypeId: string | null;
  createdAt: string;
}

const RECENTS_KEY = 'of.objectExplorer.recents';
const SEARCH_KINDS = [
  { value: '', label: 'All resources' },
  { value: 'object_instance', label: 'Objects' },
  { value: 'object_type', label: 'Object types' },
  { value: 'action_type', label: 'Actions' },
  { value: 'link_type', label: 'Links' },
  { value: 'shared_property_type', label: 'Shared properties' },
];

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function readRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function writeRecents(items: RecentItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, 30)));
}

function shortId(value: string | null | undefined, length = 10) {
  if (!value) return '-';
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : dateFormatter.format(parsed);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function displayObjectTitle(view: ObjectViewResponse | null, type: ObjectType | undefined) {
  if (!view) return 'No object selected';
  const primary = type?.primary_key_property;
  if (primary && view.object.properties?.[primary] !== undefined) {
    return String(view.object.properties[primary]);
  }
  const summaryName = view.summary.name ?? view.summary.title ?? view.summary.display_name;
  return typeof summaryName === 'string' && summaryName ? summaryName : shortId(view.object.id, 12);
}

function uniqueRecentKey(item: RecentItem) {
  return `${item.kind}:${item.id}`;
}

export function ObjectExplorerPage() {
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [objectSets, setObjectSets] = useState<ObjectSetDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('lexical');
  const [searchKindFilter, setSearchKindFilter] = useState('object_instance');
  const [searchTypeFilter, setSearchTypeFilter] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<ObjectViewResponse | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const [newSetName, setNewSetName] = useState('Saved object set');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [newSetType, setNewSetType] = useState('');
  const [newSetWhatIf, setNewSetWhatIf] = useState('');
  const [evaluation, setEvaluation] = useState<ObjectSetEvaluationResponse | null>(null);
  const [evaluationSetId, setEvaluationSetId] = useState('');
  const [objectSetBusy, setObjectSetBusy] = useState(false);
  const [objectSetError, setObjectSetError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPageError('');
      try {
        const [typeRes, setRes] = await Promise.all([
          listObjectTypes({ per_page: 200 }),
          listObjectSets(),
        ]);
        if (cancelled) return;
        setObjectTypes(typeRes.data);
        setObjectSets(setRes.data);
        setNewSetType(typeRes.data[0]?.id ?? '');
        setRecents(readRecents());
      } catch (cause) {
        if (cancelled) return;
        setPageError(cause instanceof Error ? cause.message : 'Failed to load object explorer');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchTypeFilter) setNewSetType(searchTypeFilter);
  }, [searchTypeFilter]);

  const typeById = useMemo(() => {
    return new Map(objectTypes.map((type) => [type.id, type]));
  }, [objectTypes]);

  const selectedType = selectedObject ? typeById.get(selectedObject.object.object_type_id) : undefined;
  const selectedAction = selectedObject?.applicable_actions.find((action) => action.id === selectedActionId) ?? null;
  const summaryEntries = selectedObject ? Object.entries(selectedObject.summary).slice(0, 8) : [];
  const propertyEntries = selectedObject ? Object.entries(selectedObject.object.properties ?? {}).slice(0, 12) : [];
  const evaluationRows = evaluation?.rows.slice(0, 8) ?? [];

  async function refreshObjectSets() {
    const res = await listObjectSets();
    setObjectSets(res.data);
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setHasSearched(true);
    try {
      const res = await searchOntology({
        query,
        kind: searchKindFilter || undefined,
        object_type_id: searchTypeFilter || undefined,
        limit: 50,
        semantic: searchMode === 'semantic',
      });
      setSearchResults(res.data);
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }

  function rememberResult(result: SearchResult) {
    const recent: RecentItem = {
      kind: result.kind,
      id: result.id,
      title: result.title || result.id,
      route: result.route,
      objectTypeId: result.object_type_id,
      createdAt: new Date().toISOString(),
    };
    const key = uniqueRecentKey(recent);
    const next = [recent, ...recents.filter((item) => uniqueRecentKey(item) !== key)];
    setRecents(next);
    writeRecents(next);
  }

  async function selectResult(result: SearchResult) {
    setSelectedResult(result);
    setPreviewError('');
    setActionNotice('');
    rememberResult(result);

    if (!result.object_type_id || result.kind !== 'object_instance') {
      setSelectedObject(null);
      setSelectedActionId('');
      return;
    }

    setPreviewLoading(true);
    try {
      const view = await getObjectView(result.object_type_id, result.id);
      setSelectedObject(view);
      setSelectedActionId(view.applicable_actions[0]?.id ?? '');
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Failed to load object view');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function selectRecent(item: RecentItem) {
    const result: SearchResult = {
      kind: item.kind,
      id: item.id,
      object_type_id: item.objectTypeId,
      title: item.title,
      subtitle: null,
      snippet: '',
      score: 1,
      route: item.route,
      metadata: {},
    };
    await selectResult(result);
  }

  async function createSet() {
    if (!newSetName.trim() || !newSetType) {
      setObjectSetError('Name and base type are required.');
      return;
    }
    setObjectSetBusy(true);
    setObjectSetError('');
    try {
      const created = await createObjectSet({
        name: newSetName.trim(),
        description: newSetDescription.trim() || undefined,
        base_object_type_id: newSetType,
        what_if_label: newSetWhatIf.trim() || undefined,
      });
      await refreshObjectSets();
      setEvaluation(await evaluateObjectSet(created.id, { limit: 50 }));
      setEvaluationSetId(created.id);
      setNewSetName(searchQuery.trim() ? `${searchQuery.trim()} set` : 'Saved object set');
      setNewSetDescription('');
      setNewSetWhatIf('');
    } catch (cause) {
      setObjectSetError(cause instanceof Error ? cause.message : 'Failed to create object set');
    } finally {
      setObjectSetBusy(false);
    }
  }

  async function evaluateSet(id: string, mode: EvaluationMode) {
    setObjectSetBusy(true);
    setObjectSetError('');
    setEvaluationSetId(id);
    try {
      const response =
        mode === 'materialize'
          ? await materializeObjectSet(id, { limit: 500 })
          : await evaluateObjectSet(id, { limit: 50 });
      setEvaluation(response);
      if (mode === 'materialize') await refreshObjectSets();
    } catch (cause) {
      setObjectSetError(cause instanceof Error ? cause.message : `${mode} failed`);
    } finally {
      setObjectSetBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 12 }}>
      <header className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 280 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Link to="/ontology" className="of-link" style={{ fontSize: 12 }}>
                Ontology
              </Link>
              <span className="of-text-muted">/</span>
              <span className="of-text-muted" style={{ fontSize: 12 }}>Object explorer</span>
            </div>
            <h1 className="of-heading-xl" style={{ marginTop: 8 }}>
              Object explorer
            </h1>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link to="/ontology/graph" className="of-button">
              Graph
            </Link>
            <Link to="/ontology/object-sets" className="of-button">
              Object sets
            </Link>
            <Link to="/object-views" className="of-button">
              Views
            </Link>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
          <MetricCard label="Types" value={numberFormatter.format(objectTypes.length)} />
          <MetricCard label="Saved sets" value={numberFormatter.format(objectSets.length)} />
          <MetricCard label="Results" value={numberFormatter.format(searchResults.length)} />
          <MetricCard label="Recent" value={numberFormatter.format(recents.length)} />
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(min(100%, 360px), 1fr) repeat(3, minmax(min(100%, 150px), auto))', alignItems: 'center' }}>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search objects, actions, links"
            className="of-input"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
          />
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', minHeight: 30 }}>
            {(['lexical', 'semantic'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSearchMode(mode)}
                className={searchMode === mode ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
                style={{ border: 0, borderRadius: 0, minWidth: 76 }}
              >
                {mode === 'lexical' ? 'Lexical' : 'Semantic'}
              </button>
            ))}
          </div>
          <select value={searchKindFilter} onChange={(event) => setSearchKindFilter(event.target.value)} className="of-input">
            {SEARCH_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
          <select value={searchTypeFilter} onChange={(event) => setSearchTypeFilter(event.target.value)} className="of-input">
            <option value="">All types</option>
            {objectTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.display_name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void runSearch()} disabled={searchLoading || !searchQuery.trim()} className="of-button of-button--primary">
            {searchLoading ? 'Searching' : 'Search'}
          </button>
        </div>
      </header>

      {pageError && (
        <div className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {pageError}
        </div>
      )}

      {loading ? (
        <section className="of-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading object explorer...
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <PanelHeader label="Search results" value={hasSearched ? `${searchResults.length}` : 'Ready'} />

            {searchError && (
              <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {searchError}
              </div>
            )}

            <div style={{ display: 'grid', gap: 6, maxHeight: 520, overflow: 'auto' }}>
              {searchResults.map((result, index) => (
                <SearchResultRow
                  key={`${result.kind}-${result.id}-${index}`}
                  result={result}
                  selected={selectedResult?.id === result.id && selectedResult.kind === result.kind}
                  typeLabel={result.object_type_id ? typeById.get(result.object_type_id)?.display_name : undefined}
                  onPreview={() => void selectResult(result)}
                />
              ))}
              {searchResults.length === 0 && (
                <EmptyState label={hasSearched ? 'No matching resources.' : 'Run a search to populate the explorer.'} />
              )}
            </div>

            <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <PanelHeader label="Recent objects" value={`${recents.length}`} />
              <div style={{ display: 'grid', gap: 4, maxHeight: 190, overflow: 'auto' }}>
                {recents.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => void selectRecent(item)}
                    className="of-button of-button--ghost"
                    style={{ justifyContent: 'space-between', minHeight: 32, padding: '4px 6px', textAlign: 'left' }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </span>
                      <span className="of-text-muted" style={{ display: 'block', fontSize: 11 }}>
                        {item.kind} - {formatDate(item.createdAt)}
                      </span>
                    </span>
                  </button>
                ))}
                {recents.length === 0 && <EmptyState label="No recent objects." compact />}
              </div>
            </section>
          </section>

          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <PanelHeader
              label="Object preview"
              value={selectedObject ? `${selectedObject.neighbors.length} links` : previewLoading ? 'Loading' : 'Idle'}
            />

            {previewError && (
              <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {previewError}
              </div>
            )}

            {previewLoading ? (
              <EmptyState label="Loading object view..." />
            ) : selectedObject ? (
              <>
                <article className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="of-eyebrow">{selectedType?.display_name ?? selectedObject.object.object_type_id}</p>
                      <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                        {displayObjectTitle(selectedObject, selectedType)}
                      </h2>
                      <p className="of-text-muted" style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {selectedObject.object.id}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span className="of-chip">{selectedObject.object.marking ?? 'unmarked'}</span>
                      <Link to={`/ontology/${selectedObject.object.object_type_id}`} className="of-button">
                        Open type
                      </Link>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}>
                    <MetricCard label="Actions" value={`${selectedObject.applicable_actions.length}`} />
                    <MetricCard label="Rules" value={`${selectedObject.matching_rules.length}`} />
                    <MetricCard label="Timeline" value={`${selectedObject.timeline.length}`} />
                  </div>
                </article>

                <section className="of-panel-muted" style={{ padding: 12 }}>
                  <PanelHeader label="Summary" value={`${summaryEntries.length}`} />
                  <KeyValueGrid entries={summaryEntries} />
                </section>

                <section className="of-panel-muted" style={{ padding: 12 }}>
                  <PanelHeader label="Properties" value={`${propertyEntries.length}`} />
                  <KeyValueGrid entries={propertyEntries} />
                </section>

                <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <PanelHeader label="Linked objects" value={`${selectedObject.neighbors.length}`} />
                  <div style={{ display: 'grid', gap: 6, maxHeight: 210, overflow: 'auto' }}>
                    {selectedObject.neighbors.slice(0, 12).map((neighbor) => (
                      <div key={neighbor.link_id} className="of-card" style={{ padding: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong>{neighbor.link_name}</strong>
                          <span className="of-chip">{neighbor.direction}</span>
                        </div>
                        <p className="of-text-muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {shortId(neighbor.object.id, 14)}
                        </p>
                      </div>
                    ))}
                    {selectedObject.neighbors.length === 0 && <EmptyState label="No linked objects." compact />}
                  </div>
                </section>

                <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <PanelHeader label="Applicable actions" value={`${selectedObject.applicable_actions.length}`} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedObject.applicable_actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          setSelectedActionId(action.id);
                          setActionNotice('');
                        }}
                        className={selectedActionId === action.id ? 'of-button of-button--primary' : 'of-button'}
                      >
                        {action.display_name || action.name}
                      </button>
                    ))}
                    {selectedObject.applicable_actions.length === 0 && <span className="of-text-muted">No actions.</span>}
                  </div>
                  {selectedAction && (
                    <div className="of-panel" style={{ padding: 12 }}>
                      <ActionExecutor
                        action={selectedAction}
                        targetObjectId={selectedObject.object.id}
                        onExecuted={(response) => {
                          setActionNotice('total' in response ? `Batch execution recorded: ${response.succeeded}/${response.total}` : 'Execution recorded.');
                        }}
                      />
                    </div>
                  )}
                  {actionNotice && (
                    <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                      {actionNotice}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <EmptyState label={selectedResult ? 'Selected resource has no object preview.' : 'Select an object result.'} />
            )}
          </section>

          <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <PanelHeader label="Object sets" value={`${objectSets.length}`} />

            {objectSetError && (
              <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                {objectSetError}
              </div>
            )}

            <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <input
                value={newSetName}
                onChange={(event) => setNewSetName(event.target.value)}
                placeholder="Set name"
                className="of-input"
              />
              <select value={newSetType} onChange={(event) => setNewSetType(event.target.value)} className="of-input">
                <option value="">Pick base type</option>
                {objectTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.display_name}
                  </option>
                ))}
              </select>
              <input
                value={newSetDescription}
                onChange={(event) => setNewSetDescription(event.target.value)}
                placeholder="Description"
                className="of-input"
              />
              <input
                value={newSetWhatIf}
                onChange={(event) => setNewSetWhatIf(event.target.value)}
                placeholder="What-if label"
                className="of-input"
              />
              <button type="button" onClick={() => void createSet()} disabled={objectSetBusy} className="of-button of-button--primary">
                {objectSetBusy ? 'Working' : 'Create set'}
              </button>
            </section>

            <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
              {objectSets.map((set) => (
                <article
                  key={set.id}
                  className={evaluationSetId === set.id ? 'of-panel' : 'of-panel-muted'}
                  style={{ padding: 10, display: 'grid', gap: 8 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {set.name}
                      </strong>
                      <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                        {typeById.get(set.base_object_type_id)?.display_name ?? shortId(set.base_object_type_id)}
                      </p>
                    </div>
                    <span className="of-chip">{numberFormatter.format(set.materialized_row_count)} rows</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" onClick={() => void evaluateSet(set.id, 'preview')} disabled={objectSetBusy} className="of-button">
                      Preview
                    </button>
                    <button type="button" onClick={() => void evaluateSet(set.id, 'materialize')} disabled={objectSetBusy} className="of-button">
                      Materialize
                    </button>
                  </div>
                </article>
              ))}
              {objectSets.length === 0 && <EmptyState label="No saved object sets." compact />}
            </div>

            {evaluation && (
              <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <PanelHeader label="Last evaluation" value={`${evaluation.total_rows} rows`} />
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}>
                  <MetricCard label="Base matches" value={`${evaluation.total_base_matches}`} />
                  <MetricCard label="Neighbors" value={`${evaluation.traversal_neighbor_count}`} />
                  <MetricCard label="Materialized" value={evaluation.materialized ? 'Yes' : 'No'} />
                </div>
                <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflow: 'auto' }}>
                  {evaluationRows.map((row, index) => (
                    <pre
                      key={index}
                      style={{
                        margin: 0,
                        padding: 8,
                        background: 'var(--bg-default)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  ))}
                  {evaluationRows.length === 0 && <EmptyState label="No evaluation rows." compact />}
                </div>
              </section>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="of-panel-muted" style={{ padding: 10 }}>
      <p className="of-eyebrow">{label}</p>
      <p style={{ marginTop: 4, color: 'var(--text-strong)', fontSize: 18, fontWeight: 600 }}>{value}</p>
    </div>
  );
}

function PanelHeader({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <p className="of-eyebrow">{label}</p>
      {value && <span className="of-chip">{value}</span>}
    </div>
  );
}

function EmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className="of-text-muted"
      style={{
        padding: compact ? 10 : 24,
        textAlign: 'center',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
      }}
    >
      {label}
    </div>
  );
}

function KeyValueGrid({ entries }: { entries: Array<[string, unknown]> }) {
  if (entries.length === 0) return <EmptyState label="No values." compact />;
  return (
    <dl style={{ display: 'grid', gap: 6, margin: '8px 0 0' }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 0.45fr) minmax(0, 1fr)', gap: 8, fontSize: 12 }}>
          <dt className="of-text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {key}
          </dt>
          <dd style={{ margin: 0, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SearchResultRow({
  result,
  selected,
  typeLabel,
  onPreview,
}: {
  result: SearchResult;
  selected: boolean;
  typeLabel?: string;
  onPreview: () => void;
}) {
  return (
    <article
      className={selected ? 'of-panel' : 'of-panel-muted'}
      style={{ padding: 10, display: 'grid', gap: 8, borderColor: selected ? '#2d72d2' : undefined }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {result.title || result.id}
          </strong>
          <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
            {typeLabel ? `${typeLabel} - ` : ''}
            {result.subtitle ?? result.kind}
          </p>
        </div>
        <span className="of-chip">{result.score.toFixed(2)}</span>
      </div>
      {result.snippet && (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
          {result.snippet}
        </p>
      )}
      {result.score_breakdown && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span className="of-chip">lex {result.score_breakdown.lexical_score.toFixed(2)}</span>
          <span className="of-chip">sem {result.score_breakdown.semantic_score.toFixed(2)}</span>
          <span className="of-chip">{result.score_breakdown.fusion_strategy}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" onClick={onPreview} className={result.kind === 'object_instance' ? 'of-button of-button--primary' : 'of-button'}>
          {result.kind === 'object_instance' ? 'Preview' : 'Select'}
        </button>
        {result.route && (
          <Link to={result.route} className="of-button">
            Open
          </Link>
        )}
      </div>
    </article>
  );
}
