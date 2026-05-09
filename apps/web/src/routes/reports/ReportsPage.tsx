import { useEffect, useMemo, useRef, useState } from 'react';

import { ReportCanvas } from '@/lib/components/report/ReportCanvas';
import { ReportHistory } from '@/lib/components/report/ReportHistory';
import { ReportOutline } from '@/lib/components/report/ReportOutline';
import { ReportParametersBar } from '@/lib/components/report/ReportParametersBar';
import { ReportPreview } from '@/lib/components/report/ReportPreview';
import { ReportSettingsDrawer, type ReportSettingsForm } from '@/lib/components/report/ReportSettingsDrawer';
import { ReportShareDialog } from '@/lib/components/report/ReportShareDialog';
import { ReportSidebar } from '@/lib/components/report/ReportSidebar';
import { ReportToolbar, type ReportMode } from '@/lib/components/report/ReportToolbar';
import { ScheduleManager } from '@/lib/components/report/ScheduleManager';
import { TemplateLibrary } from '@/lib/components/report/TemplateLibrary';
import {
  createReport,
  generateReport,
  getCatalog,
  getDownload,
  getExecution,
  getOverview,
  getScheduleBoard,
  listHistory,
  listReports,
  updateReport,
  type DistributionRecipient,
  type DownloadPayload,
  type ReportCatalog,
  type ReportDefinition,
  type ReportExecution,
  type ReportOverview,
  type ScheduleBoard,
} from '@/lib/api/reports';
import { notifications } from '@stores/notifications';

const STORAGE_KEY_STARRED = 'openfoundry.reports.starred';

type ActivityTab = 'preview' | 'history' | 'schedules' | 'catalog';

export function ReportsPage() {
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [scheduleBoard, setScheduleBoard] = useState<ScheduleBoard | null>(null);
  const [history, setHistory] = useState<ReportExecution[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [latestExecution, setLatestExecution] = useState<ReportExecution | null>(null);
  const [downloadPayload, setDownloadPayload] = useState<DownloadPayload | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ReportMode>('editing');
  const [outlinePinned, setOutlinePinned] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>('preview');
  const [starredIds, setStarredIds] = useState<Set<string>>(() => loadStarred());
  const [busyAction, setBusyAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uiError, setUiError] = useState('');

  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const busy = loading || busyAction.length > 0;
  const selectedReport = reports.find((entry) => entry.id === selectedReportId) ?? null;

  const savedLabel = useMemo(() => {
    if (!savedAt) return selectedReport ? 'All changes saved' : 'Draft';
    const seconds = Math.max(1, Math.round((Date.now() - savedAt) / 1000));
    if (seconds < 60) return `Saved ${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `Saved ${minutes}m ago`;
  }, [savedAt, selectedReport]);

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveStarred(starredIds);
  }, [starredIds]);

  async function refreshAll(preferredReportId?: string) {
    setLoading(true);
    setUiError('');
    try {
      const [overviewResponse, catalogResponse, reportsResponse, boardResponse] = await Promise.all([
        getOverview(),
        getCatalog(),
        listReports(),
        getScheduleBoard(),
      ]);
      setOverview(overviewResponse);
      setCatalog(catalogResponse);
      setReports(reportsResponse.items);
      setScheduleBoard(boardResponse);

      const nextSelected = preferredReportId ?? selectedReportId ?? reportsResponse.items[0]?.id ?? '';
      if (nextSelected) {
        await selectReport(nextSelected, false, reportsResponse.items);
      } else {
        clearSelection();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load reporting surfaces';
      setUiError(message);
      notifications.error(message);
    } finally {
      setLoading(false);
    }
  }

  function clearSelection() {
    setSelectedReportId('');
    setHistory([]);
    setLatestExecution(null);
    setDownloadPayload(null);
    setParameterValues({});
    setActiveSectionId(undefined);
  }

  async function selectReport(reportId: string, notify = true, source?: ReportDefinition[]) {
    setSelectedReportId(reportId);
    setActiveSectionId(undefined);
    const pool = source ?? reports;
    const report = pool.find((entry) => entry.id === reportId);
    setParameterValues(seedParameterValues(report));
    if (reportId) {
      await loadHistory(reportId);
      if (notify) notifications.info(`Loaded ${report?.name ?? 'report'} context`);
    }
  }

  async function loadHistory(reportId: string) {
    const response = await listHistory(reportId);
    setHistory(response.items);
    if (response.items.length > 0) {
      const newest = response.items[0];
      setLatestExecution(newest);
      setDownloadPayload(await getDownload(newest.id));
    } else {
      setLatestExecution(null);
      setDownloadPayload(null);
    }
  }

  async function selectExecution(executionId: string) {
    setBusyAction('load-execution');
    setUiError('');
    try {
      setLatestExecution(await getExecution(executionId));
      setDownloadPayload(await getDownload(executionId));
      setActivityTab('preview');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load execution';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function persistDefinition(form: ReportSettingsForm) {
    setBusyAction('save-report');
    setUiError('');
    try {
      const tags = form.tags
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const payload = {
        name: form.name,
        description: form.description,
        owner: form.owner,
        generator_kind: form.generator_kind,
        dataset_name: form.dataset_name,
        active: form.active,
        tags,
        template: form.template,
        schedule: form.schedule,
        recipients: form.recipients,
        parameters: {} as Record<string, unknown>,
      };
      const report = selectedReport
        ? await updateReport(selectedReport.id, payload)
        : await createReport(payload);
      notifications.success(`${report.name} saved`);
      setSavedAt(Date.now());
      setSettingsOpen(false);
      await refreshAll(report.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save report';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function persistRecipients(recipients: DistributionRecipient[]) {
    if (!selectedReport) return;
    setBusyAction('save-recipients');
    setUiError('');
    try {
      const report = await updateReport(selectedReport.id, { recipients });
      notifications.success(`${report.name} recipients updated`);
      setSavedAt(Date.now());
      setShareOpen(false);
      await refreshAll(report.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update recipients';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  async function runSelectedReport() {
    if (!selectedReport) {
      notifications.warning('Select or create a report before generating it');
      return;
    }
    setBusyAction('run-report');
    setUiError('');
    try {
      const execution = await generateReport(selectedReport.id);
      setLatestExecution(execution);
      setDownloadPayload(await getDownload(execution.id));
      setActivityTab('preview');
      notifications.success(`${execution.report_name} generated`);
      await refreshAll(selectedReport.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate report';
      setUiError(message);
      notifications.error(message);
    } finally {
      setBusyAction('');
    }
  }

  function exportArtifact(kind: 'pdf' | 'pptx' | 'csv' | 'html' | 'excel') {
    if (!selectedReport) {
      notifications.warning('Select a report before exporting');
      return;
    }
    if (downloadPayload?.storage_url) {
      window.open(downloadPayload.storage_url, '_blank', 'noopener');
      notifications.info(`Opened ${kind.toUpperCase()} artifact`);
      return;
    }
    notifications.warning(`Generate the report first to export a ${kind.toUpperCase()} artifact`);
  }

  function copyMarkdown() {
    if (!selectedReport) return;
    const lines: string[] = [`# ${selectedReport.name}`, ''];
    if (selectedReport.description) {
      lines.push(selectedReport.description, '');
    }
    for (const section of selectedReport.template.sections) {
      lines.push(`## ${section.title}`, '');
      if (section.description) lines.push(section.description, '');
      lines.push('```', section.query, '```', '');
    }
    const text = lines.join('\n');
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(
        () => notifications.success('Report copied as Markdown'),
        () => notifications.error('Clipboard write blocked'),
      );
    } else {
      notifications.warning('Clipboard API unavailable in this environment');
    }
  }

  function exploreLineage() {
    if (!selectedReport?.dataset_name) {
      notifications.warning('No dataset bound to this report yet');
      return;
    }
    window.open(`/lineage?dataset=${encodeURIComponent(selectedReport.dataset_name)}`, '_blank', 'noopener');
  }

  function duplicateSelected() {
    if (!selectedReport) {
      setSettingsOpen(true);
      return;
    }
    const recipients = selectedReport.recipients.map((entry) => ({ ...entry, config: { ...entry.config } }));
    const tags = [...selectedReport.tags];
    setBusyAction('duplicate-report');
    setUiError('');
    void createReport({
      name: `${selectedReport.name} copy`,
      description: selectedReport.description,
      owner: selectedReport.owner,
      generator_kind: selectedReport.generator_kind,
      dataset_name: selectedReport.dataset_name,
      template: { ...selectedReport.template, sections: selectedReport.template.sections.map((section) => ({ ...section, config: { ...section.config } })) },
      schedule: { ...selectedReport.schedule, enabled: false },
      recipients,
      tags,
      parameters: { ...selectedReport.parameters },
      active: false,
    })
      .then(async (created) => {
        notifications.success(`Duplicated as ${created.name}`);
        await refreshAll(created.id);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to duplicate report';
        setUiError(message);
        notifications.error(message);
      })
      .finally(() => setBusyAction(''));
  }

  function toggleStar(id: string) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyShareLink() {
    if (!selectedReport) return;
    const params = new URLSearchParams();
    params.set('report', selectedReport.id);
    Object.entries(parameterValues).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const url = `${window.location.origin}/reports?${params.toString()}`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(
        () => notifications.success('Link copied to clipboard'),
        () => notifications.error('Clipboard write blocked'),
      );
    } else {
      notifications.info(url);
    }
  }

  function resetParameters() {
    setParameterValues(seedParameterValues(selectedReport));
    notifications.info('Parameters reset to defaults');
  }

  function registerSectionRef(id: string, element: HTMLElement | null) {
    if (element) sectionRefs.current.set(id, element);
    else sectionRefs.current.delete(id);
  }

  function focusSection(id: string) {
    setActiveSectionId(id);
    const element = sectionRefs.current.get(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <ReportsHero overview={overview} />

      {uiError && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {uiError}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: outlinePinned
            ? '280px minmax(0, 1fr) 260px'
            : '280px minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <ReportSidebar
          reports={reports}
          selectedReportId={selectedReportId}
          busy={busy}
          starredIds={starredIds}
          onSelect={(id) => void selectReport(id)}
          onCreate={() => {
            clearSelection();
            setSettingsOpen(true);
          }}
          onToggleStar={toggleStar}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            minHeight: 0,
          }}
        >
          <ReportToolbar
            report={selectedReport}
            mode={mode}
            busy={busy}
            outlinePinned={outlinePinned}
            savedLabel={savedLabel}
            starred={selectedReport ? starredIds.has(selectedReport.id) : false}
            onModeChange={setMode}
            onToggleOutline={() => setOutlinePinned((value) => !value)}
            onToggleStar={() => selectedReport && toggleStar(selectedReport.id)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShare={() => setShareOpen(true)}
            onGenerate={() => void runSelectedReport()}
            onExport={exportArtifact}
            onCopyMarkdown={copyMarkdown}
            onDuplicate={duplicateSelected}
            onExploreLineage={exploreLineage}
          />
          <ReportParametersBar
            report={selectedReport}
            values={parameterValues}
            onChange={setParameterValues}
            onResetAll={resetParameters}
            onCopyLink={copyShareLink}
          />
          <div style={{ padding: 20, background: 'var(--bg-canvas)', flex: 1 }}>
            <ReportCanvas
              report={selectedReport}
              execution={latestExecution}
              mode={mode}
              busy={busy}
              onGenerate={() => void runSelectedReport()}
              onSelectSection={focusSection}
              activeSectionId={activeSectionId}
              registerSection={registerSectionRef}
            />
          </div>
        </div>

        {outlinePinned ? (
          <ReportOutline
            report={selectedReport}
            preview={latestExecution?.preview ?? null}
            pinned={outlinePinned}
            onTogglePin={() => setOutlinePinned((value) => !value)}
            onClose={() => setOutlinePinned(false)}
            onSelect={focusSection}
            activeId={activeSectionId}
          />
        ) : null}
      </div>

      <ActivityPanel
        activeTab={activityTab}
        onChangeTab={setActivityTab}
        execution={latestExecution}
        download={downloadPayload}
        history={history}
        scheduleBoard={scheduleBoard}
        catalog={catalog}
        selectedReportId={selectedReportId}
        busy={busy}
        onSelectReport={(id) => void selectReport(id)}
        onSelectExecution={(id) => void selectExecution(id)}
        onGenerate={() => void runSelectedReport()}
      />

      <ReportSettingsDrawer
        open={settingsOpen}
        report={selectedReport}
        busy={busy}
        onClose={() => setSettingsOpen(false)}
        onSubmit={persistDefinition}
      />
      <ReportShareDialog
        open={shareOpen}
        report={selectedReport}
        busy={busy}
        onClose={() => setShareOpen(false)}
        onSubmit={persistRecipients}
      />
    </section>
  );
}

function ReportsHero({ overview }: { overview: ReportOverview | null }) {
  return (
    <div className="of-panel" style={{ padding: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ maxWidth: 720 }}>
          <p className="of-eyebrow" style={{ color: '#b45309' }}>
            Reports
          </p>
          <h1 className="of-heading-xl" style={{ marginTop: 6 }}>
            Compose, schedule, and distribute briefings
          </h1>
          <p className="of-text-muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
            Use the library to switch reports, edit definitions in the settings drawer, and run executions on demand. Outputs flow to PDF, PPTX, CSV, HTML, and channel deliveries.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, minWidth: 360 }}>
          <Stat label="Definitions" value={overview?.report_count ?? 0} />
          <Stat label="Active schedules" value={overview?.active_schedules ?? 0} />
          <Stat label="Executions 24h" value={overview?.executions_24h ?? 0} />
          <Stat
            label="Generators"
            value={overview?.generator_mix && overview.generator_mix.length > 0 ? overview.generator_mix.join(' • ') : 'No generators'}
            small
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="of-panel-muted" style={{ padding: 12 }}>
      <p className="of-eyebrow" style={{ margin: 0 }}>
        {label}
      </p>
      <p
        style={{
          marginTop: 6,
          fontSize: small ? 12 : 22,
          fontWeight: small ? 500 : 600,
          color: 'var(--text-strong)',
        }}
      >
        {value}
      </p>
    </div>
  );
}

interface ActivityPanelProps {
  activeTab: ActivityTab;
  onChangeTab: (tab: ActivityTab) => void;
  execution: ReportExecution | null;
  download: DownloadPayload | null;
  history: ReportExecution[];
  scheduleBoard: ScheduleBoard | null;
  catalog: ReportCatalog | null;
  selectedReportId: string;
  busy: boolean;
  onSelectReport: (id: string) => void;
  onSelectExecution: (id: string) => void;
  onGenerate: () => void;
}

function ActivityPanel({
  activeTab,
  onChangeTab,
  execution,
  download,
  history,
  scheduleBoard,
  catalog,
  selectedReportId,
  busy,
  onSelectReport,
  onSelectExecution,
  onGenerate,
}: ActivityPanelProps) {
  return (
    <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="of-tabbar" style={{ paddingLeft: 12 }}>
        {(
          [
            { id: 'preview', label: 'Execution preview' },
            { id: 'history', label: 'History' },
            { id: 'schedules', label: 'Schedules' },
            { id: 'catalog', label: 'Catalog' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`of-tab ${activeTab === tab.id ? 'of-tab-active' : ''}`}
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {activeTab === 'preview' && <ReportPreview execution={execution} download={download} />}
        {activeTab === 'history' && <ReportHistory history={history} onSelectExecution={onSelectExecution} />}
        {activeTab === 'schedules' && (
          <ScheduleManager
            board={scheduleBoard}
            selectedReportId={selectedReportId}
            busy={busy}
            onSelectReport={onSelectReport}
            onGenerate={onGenerate}
          />
        )}
        {activeTab === 'catalog' && <TemplateLibrary catalog={catalog} />}
      </div>
    </div>
  );
}

function seedParameterValues(report: ReportDefinition | null | undefined): Record<string, string> {
  if (!report) return {};
  const declared = report.parameters && typeof report.parameters === 'object' ? Object.entries(report.parameters) : [];
  if (declared.length === 0) return {};
  return Object.fromEntries(
    declared.map(([key, raw]) => [key, raw === null || raw === undefined ? '' : String(raw)]),
  );
}

function loadStarred(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_STARRED);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    // ignore
  }
  return new Set();
}

function saveStarred(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_STARRED, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}
