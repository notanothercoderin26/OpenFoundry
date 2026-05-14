import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  buildLogicAutomationDraft,
  buildLogicAutomationEventChart,
  buildLogicAutomationProposal,
  decideLogicAutomationProposal,
  type LogicAutomationEditMode,
  type LogicAutomationProposal,
  type LogicVersionDefinition,
  type LogicSavedVersion,
} from '@/lib/logic/blocks';

type AutomateTab = 'overview' | 'proposals' | 'decision-log';

const EMPTY_SUMMARY = {
  inputs: [],
  blocks: [],
  outputs: [],
  promptChanges: [],
  modelChanges: [],
};

function queryMode(value: string | null): LogicAutomationEditMode {
  return value === 'auto_apply' ? 'auto_apply' : 'stage_for_review';
}

function versionFromQuery(versionNumber: number, definition: LogicVersionDefinition): LogicSavedVersion {
  return {
    id: `logic-version-${versionNumber}`,
    versionNumber,
    author: 'Logic Uses sidebar',
    createdAtIso: '2026-05-13T12:00:00.000Z',
    status: 'published',
    definition,
    changeSummary: EMPTY_SUMMARY,
    publishedAtIso: '2026-05-13T12:00:00.000Z',
  };
}

function definitionFromQuery(params: URLSearchParams): LogicVersionDefinition {
  const functionRid = params.get('functionRid') || 'logic.customer-triage';
  const outputApiName = params.get('output') || 'actionEditPreview';
  const actionTypeId = params.get('actionTypeId') || 'create-service-case';
  const objectType = params.get('objectType') || 'Customer';
  return {
    inputs: [
      { id: 'input-object', name: `${objectType} object`, apiName: 'customerRecord', type: 'object', required: true, objectTypeId: objectType },
      { id: 'input-summary', name: 'Logic context', apiName: 'complaintText', type: 'string', required: true, defaultValue: `Event payload for ${functionRid}` },
    ],
    blocks: [{
      id: 'llm-automate-effect',
      name: 'Generate edit bundle',
      kind: 'use_llm',
      toolAccess: [{
        kind: 'apply_action',
        name: 'Apply Ontology action',
        actionTypeId,
        parameterMappings: { customer: 'customerRecord', summary: 'complaintText' },
      }],
    }],
    outputs: [{
      id: 'out-ontology-edits',
      name: 'Ontology edit bundle',
      apiName: outputApiName,
      outputType: 'ontology_edit_bundle',
      source: 'ontology_edit_bundle',
      sourceId: actionTypeId,
      final: true,
      workshopUsage: 'none',
    }],
  };
}

function StatusPill({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'var(--status-success)' : tone === 'warning' ? 'var(--status-warning)' : 'var(--status-info)';
  const bg = tone === 'success' ? 'var(--status-success-bg)' : tone === 'warning' ? 'var(--status-warning-bg)' : 'var(--status-info-bg)';
  return <span style={{ borderRadius: 999, background: bg, color, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{children}</span>;
}

function ProposalDetail({ proposal, onDecision }: {
  proposal: LogicAutomationProposal;
  onDecision: (decision: 'approved' | 'rejected') => void;
}) {
  return (
    <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <p className="of-eyebrow">Agent proposal detail</p>
          <h2 className="of-heading-md" style={{ margin: 0 }}>{proposal.summary}</h2>
        </div>
        <StatusPill tone={proposal.status === 'open' ? 'warning' : proposal.status === 'applied' ? 'success' : 'info'}>{proposal.status}</StatusPill>
      </div>
      <p className="of-text-muted" style={{ margin: 0 }}>{proposal.reason}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 8 }}>
        <div className="of-panel" style={{ padding: 10 }}>
          <p className="of-eyebrow">Logic run</p>
          <strong>{proposal.logicRunId}</strong>
        </div>
        <div className="of-panel" style={{ padding: 10 }}>
          <p className="of-eyebrow">Action</p>
          <strong>{proposal.actionTypeId}</strong>
        </div>
        <div className="of-panel" style={{ padding: 10 }}>
          <p className="of-eyebrow">Target</p>
          <strong>{proposal.targetObjectId}</strong>
        </div>
      </div>
      <div className="of-panel" style={{ padding: 10 }}>
        <p className="of-eyebrow">Proposed action preview</p>
        <pre style={{ margin: '8px 0 0', overflow: 'auto', fontSize: 12, maxHeight: 260 }}>{JSON.stringify(proposal.proposedActionPreview, null, 2)}</pre>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="of-button" onClick={() => onDecision('rejected')} disabled={proposal.status !== 'open'}>Reject</button>
        <button type="button" className="of-button of-button--primary" onClick={() => onDecision('approved')} disabled={proposal.status !== 'open'}>Approve and apply</button>
      </div>
    </div>
  );
}

export function AutomatePage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<LogicAutomationEditMode>(() => queryMode(params.get('mode')));
  const [activeTab, setActiveTab] = useState<AutomateTab>('overview');
  const [saved, setSaved] = useState(false);
  const definition = useMemo(() => definitionFromQuery(params), [params]);
  const versionNumber = Number(params.get('version') ?? '1') || 1;
  const publishedVersion = useMemo(() => versionFromQuery(versionNumber, definition), [definition, versionNumber]);
  const functionRid = params.get('functionRid') || 'logic.customer-triage';
  const draft = useMemo(() => buildLogicAutomationDraft({
    functionRid,
    publishedVersion,
    definition,
    mode,
    source: 'automate_app',
  }), [definition, functionRid, mode, publishedVersion]);
  const chart = useMemo(() => draft ? buildLogicAutomationEventChart(draft, new Date('2026-05-13T12:00:00Z')) : [], [draft]);
  const [proposal, setProposal] = useState<LogicAutomationProposal | null>(() => draft ? buildLogicAutomationProposal(draft, new Date('2026-05-13T12:00:00Z')) : null);

  useEffect(() => {
    setProposal(draft ? buildLogicAutomationProposal(draft, new Date('2026-05-13T12:00:00Z')) : null);
  }, [draft]);

  const maxTriggered = Math.max(1, ...chart.map((bucket) => bucket.triggered));
  const totalEvents = chart.reduce((sum, bucket) => sum + bucket.triggered, 0);
  const totalStaged = chart.reduce((sum, bucket) => sum + bucket.staged, 0);
  const totalApplied = chart.reduce((sum, bucket) => sum + bucket.applied, 0);

  if (!draft || !proposal) {
    return (
      <section className="of-page">
        <div className="of-panel" style={{ padding: 20 }}>
          <h1 className="of-heading-lg" style={{ margin: 0 }}>Automate</h1>
          <p className="of-text-muted">No Logic automation draft could be built from the current URL.</p>
        </div>
      </section>
    );
  }

  function decide(decision: 'approved' | 'rejected') {
    setProposal((current) => current ? decideLogicAutomationProposal(current, decision, 'Casey Author', new Date('2026-05-13T12:10:00Z')) : current);
    setActiveTab('decision-log');
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <div className="of-toolbar" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="of-eyebrow">Automate</div>
          <h1 className="of-heading-lg" style={{ margin: 0 }}>{draft.name}</h1>
          <div className="of-text-muted">{draft.functionRid} v{draft.publishedVersionNumber} to {draft.ontologyEditOutputApiName}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="of-select" value={mode} onChange={(event) => setMode(event.target.value as LogicAutomationEditMode)} style={{ width: 220 }}>
            <option value="stage_for_review">Stage proposals for review</option>
            <option value="auto_apply">Apply edits automatically</option>
          </select>
          <button type="button" className="of-button of-button--primary" onClick={() => setSaved(true)}>{saved ? 'Saved' : 'Save automation'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 10 }}>
        <aside className="of-panel" style={{ padding: 8, alignSelf: 'start' }}>
          {(['overview', 'proposals', 'decision-log'] as AutomateTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className="of-button"
              onClick={() => setActiveTab(tab)}
              style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6, background: activeTab === tab ? 'var(--status-info-bg)' : 'var(--bg-panel)' }}
            >
              <span>{tab.replace('-', ' ')}</span>
              <span className="of-text-soft">›</span>
            </button>
          ))}
        </aside>

        {activeTab === 'overview' && (
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 10 }}>
              <div className="of-panel" style={{ padding: 12 }}>
                <p className="of-eyebrow">Status</p>
                <strong>{saved ? 'active draft' : draft.status}</strong>
              </div>
              <div className="of-panel" style={{ padding: 12 }}>
                <p className="of-eyebrow">Trigger</p>
                <strong>{draft.trigger.eventName}</strong>
              </div>
              <div className="of-panel" style={{ padding: 12 }}>
                <p className="of-eyebrow">Events</p>
                <strong>{totalEvents}</strong>
              </div>
              <div className="of-panel" style={{ padding: 12 }}>
                <p className="of-eyebrow">Outcome</p>
                <strong>{totalStaged} staged / {totalApplied} applied</strong>
              </div>
            </div>

            <div className="of-panel" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  <p className="of-eyebrow">Automation event chart</p>
                  <h2 className="of-heading-md" style={{ margin: 0 }}>Logic effect outcomes</h2>
                </div>
                <StatusPill tone="info">{draft.editMode.replaceAll('_', ' ')}</StatusPill>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {chart.map((bucket) => (
                  <div key={bucket.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 260px', gap: 10, alignItems: 'center' }}>
                    <strong>{bucket.label}</strong>
                    <div style={{ height: 18, background: 'var(--bg-panel-muted)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${(bucket.applied / maxTriggered) * 100}%`, background: 'var(--status-success)' }} />
                      <div style={{ width: `${(bucket.staged / maxTriggered) * 100}%`, background: 'var(--status-warning)' }} />
                      <div style={{ width: `${(bucket.failed / maxTriggered) * 100}%`, background: 'var(--status-danger)' }} />
                    </div>
                    <span className="of-text-muted">{bucket.triggered} triggered, {bucket.applied} applied, {bucket.staged} staged, {bucket.failed} failed</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="of-panel" style={{ padding: 12 }}>
              <p className="of-eyebrow">Workflow payload</p>
              <pre style={{ margin: '8px 0 0', overflow: 'auto', fontSize: 12, maxHeight: 340 }}>{JSON.stringify(draft.workflowPayload, null, 2)}</pre>
            </div>
          </section>
        )}

        {activeTab === 'proposals' && (
          <section style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.55fr) minmax(420px, 1fr)', gap: 10 }}>
            <div className="of-panel" style={{ padding: 12, alignSelf: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <p className="of-eyebrow">Proposals</p>
                  <strong>{proposal.status === 'open' ? 'Pending review' : 'Completed proposal'}</strong>
                </div>
                <StatusPill tone={proposal.status === 'open' ? 'warning' : 'success'}>{proposal.status}</StatusPill>
              </div>
              <button type="button" className="of-panel-muted" onClick={() => setActiveTab('proposals')} style={{ width: '100%', padding: 10, marginTop: 10, textAlign: 'left' }}>
                <strong>{proposal.summary}</strong>
                <p className="of-text-muted" style={{ margin: '6px 0 0' }}>Expires {new Date(proposal.expiresAtIso).toLocaleString()}</p>
              </button>
            </div>
            <ProposalDetail proposal={proposal} onDecision={decide} />
          </section>
        )}

        {activeTab === 'decision-log' && (
          <section className="of-panel" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div>
                <p className="of-eyebrow">Decision log handoff</p>
                <h2 className="of-heading-md" style={{ margin: 0 }}>Action proposal audit trail</h2>
              </div>
              <StatusPill tone={proposal.status === 'applied' ? 'success' : proposal.status === 'rejected' ? 'warning' : 'info'}>{proposal.status}</StatusPill>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {proposal.decisionLog.map((entry) => (
                <div key={entry.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gridTemplateColumns: '180px 160px 1fr', gap: 10, alignItems: 'center' }}>
                  <span className="of-text-muted">{new Date(entry.atIso).toLocaleString()}</span>
                  <strong>{entry.actor}</strong>
                  <span>{entry.event}: {entry.detail}</span>
                </div>
              ))}
            </div>
            <div className="of-panel-muted" style={{ padding: 10, marginTop: 12 }}>
              <p className="of-eyebrow">Handoff payload</p>
              <pre style={{ margin: '8px 0 0', overflow: 'auto', fontSize: 12 }}>{JSON.stringify({
                proposal_id: proposal.id,
                logic_run_id: proposal.logicRunId,
                action_type_id: proposal.actionTypeId,
                status: proposal.status,
                decision_log: proposal.decisionLog,
              }, null, 2)}</pre>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
