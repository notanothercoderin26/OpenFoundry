import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  dataConnection,
  type ConnectorAgent,
  type NetworkEgressPolicy,
  type Source,
} from '@/lib/api/data-connection';
import { ChipBadge } from '@/lib/components/ui/ChipBadge';
import { Glyph } from '@/lib/components/ui/Glyph';
import { WizardModal, type WizardStep } from '@/lib/components/ui/WizardModal';

export interface MigrateToFoundryWorkerWizardProps {
  open: boolean;
  source: Source;
  onClose: () => void;
  onMigrated: (updated: Source) => void;
}

const STEPS: WizardStep[] = [
  { id: 'start', label: 'Start' },
  { id: 'select-agent', label: 'Select agent' },
  { id: 'certificates', label: 'Copy certificates' },
  { id: 'driver', label: 'Configure driver' },
  { id: 'egress', label: 'Add egress policies' },
  { id: 'confirmation', label: 'Confirmation' },
];

const JDBC_DRIVER_CONNECTORS = new Set<string>([
  'generic_connector',
  'postgresql',
  'mssql',
  'mysql',
  'oracle',
]);

// In a real implementation the agent would expose its installed certificates;
// for the wizard we stub a couple of placeholder certs derived from the agent
// metadata so the user can exercise the checkboxes.
function stubAgentCertificates(agent: ConnectorAgent): string[] {
  const fromMetadata = Array.isArray(
    (agent.metadata as { certificates?: unknown })?.certificates,
  )
    ? ((agent.metadata as { certificates: unknown[] }).certificates.filter(
        (cert) => typeof cert === 'string',
      ) as string[])
    : [];
  if (fromMetadata.length > 0) return fromMetadata;
  return [`${agent.name}-root-ca`, `${agent.name}-source-ca`];
}

export function MigrateToFoundryWorkerWizard({
  open,
  source,
  onClose,
  onMigrated,
}: MigrateToFoundryWorkerWizardProps) {
  const driverRequired = JDBC_DRIVER_CONNECTORS.has(source.connector_type);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [agents, setAgents] = useState<ConnectorAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentId, setAgentId] = useState('');

  const [certificates, setCertificates] = useState<string[]>([]);
  const [skipCertificates, setSkipCertificates] = useState(false);

  const [driverId, setDriverId] = useState('');

  const [policies, setPolicies] = useState<NetworkEgressPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policyIds, setPolicyIds] = useState<string[]>([]);

  const [ackJobs, setAckJobs] = useState(false);
  const [ackRevert, setAckRevert] = useState(false);

  const reset = useCallback(() => {
    setStepIndex(0);
    setBusy(false);
    setError('');
    setAgentId('');
    setCertificates([]);
    setSkipCertificates(false);
    setDriverId('');
    setPolicyIds([]);
    setAckJobs(false);
    setAckRevert(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setAgentsLoading(true);
    dataConnection
      .listSourceAgents(source.id)
      .then((res) => {
        const list = res.length > 0 ? res : [];
        setAgents(list);
        if (list.length > 0) setAgentId(list[0].id);
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
    setPoliciesLoading(true);
    dataConnection
      .listSourcePolicies(source.id)
      .then((res) => setPolicies(Array.isArray(res) ? res : []))
      .catch(() => setPolicies([]))
      .finally(() => setPoliciesLoading(false));
  }, [open, source.id, reset]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === agentId) ?? null,
    [agents, agentId],
  );
  const certCandidates = selectedAgent ? stubAgentCertificates(selectedAgent) : [];

  const visibleSteps = useMemo(
    () =>
      driverRequired
        ? STEPS
        : STEPS.filter((step) => step.id !== 'driver'),
    [driverRequired],
  );

  const currentStepId = visibleSteps[stepIndex]?.id ?? 'start';
  const completedStepIds = visibleSteps.slice(0, stepIndex).map((step) => step.id);
  const isLastStep = stepIndex === visibleSteps.length - 1;

  function toggleCert(name: string) {
    setCertificates((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }

  function togglePolicy(id: string) {
    setPolicyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function canAdvance(): boolean {
    switch (currentStepId) {
      case 'select-agent':
        return agentId !== '';
      case 'certificates':
        return skipCertificates || certCandidates.length === 0 || certificates.length > 0;
      case 'driver':
        return !driverRequired || driverId.trim().length > 0;
      case 'confirmation':
        return ackJobs && ackRevert;
      default:
        return true;
    }
  }

  function goBack() {
    setError('');
    setStepIndex((index) => Math.max(0, index - 1));
  }

  function goNext() {
    setError('');
    setStepIndex((index) => Math.min(visibleSteps.length - 1, index + 1));
  }

  async function commitMigration() {
    setBusy(true);
    setError('');
    try {
      const updated = await dataConnection.migrateToFoundryWorker(source.id, {
        representative_agent_id: agentId || undefined,
        certificates: skipCertificates ? [] : certificates,
        driver_id: driverRequired ? driverId.trim() || undefined : undefined,
        egress_policy_ids: policyIds,
        acknowledged: true,
      });
      onMigrated(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to migrate source');
    } finally {
      setBusy(false);
    }
  }

  async function switchManually() {
    setBusy(true);
    setError('');
    try {
      const updated = await dataConnection.updateSource(source.id, { worker: 'foundry' });
      onMigrated(updated);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Failed to switch source to Foundry worker',
      );
    } finally {
      setBusy(false);
    }
  }

  const advanceLabel = isLastStep ? 'Migrate' : 'Continue';

  return (
    <WizardModal
      open={open}
      title="Migrate to Foundry worker"
      steps={visibleSteps}
      activeStepId={currentStepId}
      completedStepIds={completedStepIds}
      onClose={onClose}
      footerLeft={
        <button
          type="button"
          onClick={() => void switchManually()}
          disabled={busy}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--text-link)',
            fontSize: 13,
            fontWeight: 500,
            cursor: busy ? 'wait' : 'pointer',
            padding: 0,
            font: 'inherit',
          }}
        >
          Switch to Foundry worker manually
        </button>
      }
      footerRight={
        <>
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className="of-button"
              style={{ fontSize: 13 }}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (isLastStep ? void commitMigration() : goNext())}
            disabled={busy || !canAdvance()}
            className="of-button of-button--primary"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            {busy ? 'Working…' : advanceLabel}
          </button>
        </>
      }
    >
      {error ? (
        <div
          className="of-status-danger"
          style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, marginBottom: 14 }}
        >
          {error}
        </div>
      ) : null}

      {currentStepId === 'start' && <StartStep />}
      {currentStepId === 'select-agent' && (
        <SelectAgentStep
          agents={agents}
          loading={agentsLoading}
          selected={agentId}
          onSelect={setAgentId}
        />
      )}
      {currentStepId === 'certificates' && (
        <CertificatesStep
          certificates={certCandidates}
          selected={certificates}
          skip={skipCertificates}
          onToggle={toggleCert}
          onSkipChange={setSkipCertificates}
        />
      )}
      {currentStepId === 'driver' && (
        <DriverStep
          connectorType={source.connector_type}
          driverId={driverId}
          onDriverIdChange={setDriverId}
        />
      )}
      {currentStepId === 'egress' && (
        <EgressStep
          policies={policies}
          loading={policiesLoading}
          selected={policyIds}
          onToggle={togglePolicy}
        />
      )}
      {currentStepId === 'confirmation' && (
        <ConfirmationStep
          ackJobs={ackJobs}
          ackRevert={ackRevert}
          onAckJobsChange={setAckJobs}
          onAckRevertChange={setAckRevert}
        />
      )}
    </WizardModal>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StartStep() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text-strong)' }}>
        Migrate to Foundry worker
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>
        Follow these steps to easily migrate your source to run via Foundry worker instead of
        Agent worker. Foundry worker&apos;s scalable compute provides improved performance,
        stability, and a wider set of first-class features.
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>
        Sources using Foundry worker can connect to directly accessible systems via direct
        network egress policies, and to on-premise systems using agent proxy policies. You can
        continue using your existing agents while reducing maintenance overhead.
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>
        The steps taken here are all reversible, so if anything goes wrong you can switch back
        to your current configuration within 30 days.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <ChipBadge variant="recommended">Recommended</ChipBadge>
        <ChipBadge variant="reversible">Reversible</ChipBadge>
      </div>

      <div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Additional documentation
        </p>
        <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
          <DocCard
            title="Using an agent proxy policy with Foundry worker"
            href="/docs/data-connection/agent-proxy-policy"
          />
          <DocCard
            title="Foundry worker documentation"
            href="/docs/data-connection/foundry-worker"
          />
        </div>
      </div>
    </div>
  );
}

function DocCard({ title, href }: { title: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--bg-panel-muted)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-link)',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Glyph name="book-open" size={18} tone="currentColor" />
      <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
      <Glyph name="external-link" size={14} tone="currentColor" />
    </a>
  );
}

interface SelectAgentStepProps {
  agents: ConnectorAgent[];
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
}

function SelectAgentStep({ agents, loading, selected, onSelect }: SelectAgentStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
        Select agent
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Choose a representative agent currently assigned to this source. We will read its
        secrets, certificates, and (if applicable) JDBC driver to seed the Foundry worker
        configuration. The agent itself stays untouched.
      </p>
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading agents…</p>
      ) : agents.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No agents are assigned to this source. The migration can still proceed but you may
          need to manually re-enter credentials and certificates after the switch.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {agents.map((agent) => {
            const active = agent.id === selected;
            return (
              <li key={agent.id}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    border: `1px solid ${active ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="representative-agent"
                    checked={active}
                    onChange={() => onSelect(agent.id)}
                    style={{ accentColor: 'var(--status-info)' }}
                  />
                  <span style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-strong)' }}>
                      {agent.name}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Version {agent.version || '—'} · owner {agent.owner_id}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface CertificatesStepProps {
  certificates: string[];
  selected: string[];
  skip: boolean;
  onToggle: (name: string) => void;
  onSkipChange: (skip: boolean) => void;
}

function CertificatesStep({
  certificates,
  selected,
  skip,
  onToggle,
  onSkipChange,
}: CertificatesStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
        Copy certificates
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        With Foundry worker, certificates must be applied directly to the source. Pick the
        certificates from the representative agent that should be transferred. If the agent
        has no certificates, skip this step.
      </p>
      {certificates.length === 0 ? (
        <div
          style={{
            padding: 14,
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          No certificates were detected on the selected agent. You can continue without
          copying any.
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {certificates.map((name) => (
            <li key={name}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bg-panel-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  onChange={() => onToggle(name)}
                  disabled={skip}
                  style={{ accentColor: 'var(--status-info)' }}
                />
                <Glyph name="shield" size={16} tone="var(--text-muted)" />
                <span style={{ color: 'var(--text-strong)' }}>{name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--text-default)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => onSkipChange(e.target.checked)}
          style={{ accentColor: 'var(--status-info)' }}
        />
        Skip — no certificates needed for this source
      </label>
    </div>
  );
}

interface DriverStepProps {
  connectorType: string;
  driverId: string;
  onDriverIdChange: (id: string) => void;
}

function DriverStep({ connectorType, driverId, onDriverIdChange }: DriverStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
        Configure driver
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        The <code>{connectorType}</code> connector requires a JDBC driver. Select the driver
        from the representative agent to use with the Foundry worker, or paste a driver id
        registered in the artifact repository.
      </p>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 600 }}>
          Driver id
        </span>
        <input
          type="text"
          value={driverId}
          onChange={(e) => onDriverIdChange(e.target.value)}
          placeholder="e.g. drivers.postgresql.42.7.3"
          className="of-input"
          style={{ maxWidth: 420 }}
        />
      </label>
    </div>
  );
}

interface EgressStepProps {
  policies: NetworkEgressPolicy[];
  loading: boolean;
  selected: string[];
  onToggle: (id: string) => void;
}

function EgressStep({ policies, loading, selected, onToggle }: EgressStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
        Add egress policies
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Choose the egress policies the Foundry worker should use to reach this source. Pick a
        direct-connection policy for systems accessible from Foundry, or an agent-proxy policy
        to route through the existing agent.
      </p>
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading egress policies…</p>
      ) : policies.length === 0 ? (
        <div
          style={{
            padding: 14,
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          No egress policies are attached to this source yet.{' '}
          <a
            href="/data-connection/egress-policies"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--text-link)', fontWeight: 500 }}
          >
            Create one
          </a>
          {' '}or continue and add policies later.
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {policies.map((policy) => (
            <li key={policy.id}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bg-panel-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(policy.id)}
                  onChange={() => onToggle(policy.id)}
                  style={{ accentColor: 'var(--status-info)' }}
                />
                <span style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-strong)' }}>
                    {policy.name}
                  </strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {policy.kind === 'agent_proxy' ? 'Agent proxy' : 'Direct connection'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ConfirmationStepProps {
  ackJobs: boolean;
  ackRevert: boolean;
  onAckJobsChange: (v: boolean) => void;
  onAckRevertChange: (v: boolean) => void;
}

function ConfirmationStep({
  ackJobs,
  ackRevert,
  onAckJobsChange,
  onAckRevertChange,
}: ConfirmationStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
        Confirmation
      </h3>

      <section
        style={{
          padding: 16,
          background: 'var(--bg-panel-muted)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gap: 10,
        }}
      >
        <strong style={{ fontSize: 14, color: 'var(--text-strong)' }}>
          Running jobs will be terminated
        </strong>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          All running jobs (syncs, exports, tasks) will be terminated as part of the
          migration. Jobs which do not have schedules will need to be manually restarted.
          Scheduled jobs will run in Foundry on the next run. If your schedule does not run
          frequently, you may want to manually trigger jobs now to ensure they are working as
          expected.
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={ackJobs}
            onChange={(e) => onAckJobsChange(e.target.checked)}
            style={{ accentColor: 'var(--status-info)' }}
          />
          I understand that unscheduled jobs will need to be restarted manually.
        </label>
      </section>

      <section
        style={{
          padding: 16,
          background: 'var(--bg-panel-muted)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gap: 10,
        }}
      >
        <strong style={{ fontSize: 14, color: 'var(--text-strong)' }}>
          Revert to previous configuration
        </strong>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Should you encounter any complex issue, you will have 30 days to revert back to
          your previous connection settings after migration. After 30 days, your previous
          setup can not be automatically restored.
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={ackRevert}
            onChange={(e) => onAckRevertChange(e.target.checked)}
            style={{ accentColor: 'var(--status-info)' }}
          />
          I understand I will have 30 days to return to the previous setup.
        </label>
      </section>
    </div>
  );
}
