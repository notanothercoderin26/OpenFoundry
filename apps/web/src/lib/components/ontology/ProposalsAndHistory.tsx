import { useMemo, type ReactNode } from "react";

import type {
  OntologyGlobalBranchProposalIntegration,
  OntologyGlobalBranchProposalResource,
  OntologyHistoryEntry,
  OntologyHistoryResourceSummary,
  OntologyProposalTask,
} from "@/lib/api/ontology";
import { Badge } from "@components/ui/Badge";
import { Glyph } from "@components/ui/Glyph";

const PANEL_CLASS =
  "bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card overflow-hidden";

/* ------------------------------------------------------------------------- */
/* Proposals                                                                  */
/* ------------------------------------------------------------------------- */

interface ProposalsPanelProps {
  integration: OntologyGlobalBranchProposalIntegration;
  /** Optional callbacks fired when the user clicks approve / reject on a task. */
  onApproveTask?: (task: OntologyProposalTask) => void;
  onRejectTask?: (task: OntologyProposalTask) => void;
  /** Toggle inclusion of an individual resource in the merge bundle. */
  onToggleResource?: (resourceId: string, included: boolean) => void;
}

/**
 * Foundry-style proposals view. The Ontology Manager currently only tracks
 * one branch proposal at a time (the active branch's staged changes); this
 * panel renders it as a single proposal card with author, branch, status,
 * touched-resources list and per-task approve / reject controls.
 */
export function ProposalsPanel({
  integration,
  onApproveTask,
  onRejectTask,
  onToggleResource,
}: ProposalsPanelProps) {
  const status = proposalStatus(integration);
  const author = inferAuthor(integration);

  return (
    <section className={PANEL_CLASS} aria-label="Proposals">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-of-border">
        <h2 className="text-of-16 font-of-semibold text-of-text">Proposals</h2>
        <span className="text-of-13 text-of-text-muted tabular-nums">
          {integration.resources.length === 0 ? 0 : 1}
        </span>
      </header>

      {integration.resources.length === 0 ? (
        <p className="px-4 py-6 text-of-13 text-of-text-muted text-center">
          No active proposals. Stage edits on a branch to open one.
        </p>
      ) : (
        <article className="flex flex-col gap-3 p-4">
          <header className="flex items-start gap-3">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-of-sm bg-of-accent-soft text-of-accent"
              aria-hidden
            >
              <Glyph name="cube" size={18} tone="var(--of-accent)" />
            </span>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-of-16 font-of-semibold text-of-text truncate m-0">
                  {integration.branch_label || "Working branch"}
                </h3>
                <ProposalStatusBadge status={status} />
              </div>
              <p className="text-of-12 text-of-text-muted m-0 mt-0.5">
                Opened by {author}
                <span className="mx-1">·</span>
                {integration.resources.length} resource
                {integration.resources.length === 1 ? "" : "s"} touched
                <span className="mx-1">·</span>
                {integration.preview.ready_count} ready /
                {" "}
                {integration.preview.pending_count} pending /
                {" "}
                {integration.preview.blocked_count} blocked
              </p>
            </div>
            <ProposalDecisionBadge mergeable={integration.mergeable} />
          </header>

          {integration.warnings.length > 0 ? (
            <div className="px-3 py-2 rounded-of-sm border border-of-border bg-of-warning-soft text-of-12 text-of-warning flex items-start gap-1.5">
              <Glyph name="info" size={12} tone="currentColor" />
              <span>{integration.warnings.join(" · ")}</span>
            </div>
          ) : null}

          <ResourcesList
            resources={integration.resources}
            onToggleResource={onToggleResource}
          />

          {integration.proposal_tasks.length > 0 ? (
            <ProposalTasks
              tasks={integration.proposal_tasks}
              onApprove={onApproveTask}
              onReject={onRejectTask}
            />
          ) : null}

          {integration.checks.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <h4 className="text-of-12 font-of-semibold uppercase tracking-wide text-of-text-soft m-0">
                Checks
              </h4>
              <ul className="list-none p-0 m-0 flex flex-col gap-px">
                {integration.checks.map((check) => (
                  <li
                    key={check.id}
                    className="flex items-center gap-2 px-2 h-7 rounded-of-sm hover:bg-of-surface-muted"
                  >
                    <CheckStatusDot status={check.status} />
                    <span className="text-of-13 text-of-text truncate flex-1">
                      {check.label}
                    </span>
                    {check.message ? (
                      <span className="text-of-12 text-of-text-muted truncate">
                        {check.message}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      )}
    </section>
  );
}

function inferAuthor(integration: OntologyGlobalBranchProposalIntegration): string {
  /* The proposal integration doesn't carry an explicit author field. Pull
   * the first reviewer if any, otherwise fall back to the branch label. */
  const reviewer = integration.proposal_tasks.find(
    (task) => task.reviewer_id,
  )?.reviewer_id;
  return reviewer ?? integration.branch_label ?? "Unknown";
}

function proposalStatus(
  integration: OntologyGlobalBranchProposalIntegration,
): "draft" | "ready" | "blocked" {
  if (integration.preview.blocked_count > 0) return "blocked";
  if (integration.mergeable) return "ready";
  return "draft";
}

function ProposalStatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge variant="active">Ready to merge</Badge>;
  if (status === "blocked")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-danger-soft text-of-danger text-of-12 font-of-medium">
        Blocked
      </span>
    );
  return <Badge variant="experimental">Draft</Badge>;
}

function ProposalDecisionBadge({ mergeable }: { mergeable: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-of-sm text-of-12 font-of-medium",
        mergeable
          ? "bg-of-success-soft text-of-success"
          : "bg-of-warning-soft text-of-warning",
      ].join(" ")}
    >
      <Glyph
        name={mergeable ? "check" : "info"}
        size={11}
        tone="currentColor"
      />
      {mergeable ? "Mergeable" : "Needs review"}
    </span>
  );
}

function CheckStatusDot({ status }: { status: string }) {
  const colour = (() => {
    switch (status) {
      case "passing":
      case "success":
      case "ready":
        return "#1d8348";
      case "warning":
      case "pending":
        return "#9a5b00";
      case "failing":
      case "blocked":
      case "error":
        return "#b42318";
      default:
        return "#5f6b7c";
    }
  })();
  return (
    <span
      className="shrink-0 inline-block w-2 h-2 rounded-full"
      style={{ background: colour }}
      aria-hidden
    />
  );
}

function ResourcesList({
  resources,
  onToggleResource,
}: {
  resources: ReadonlyArray<OntologyGlobalBranchProposalResource>;
  onToggleResource?: (resourceId: string, included: boolean) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-of-12 font-of-semibold uppercase tracking-wide text-of-text-soft m-0">
        Resources touched
      </h4>
      <ul className="list-none p-0 m-0 flex flex-col gap-px">
        {resources.map((resource) => (
          <li
            key={resource.id}
            className="flex items-center gap-2 px-2 h-8 rounded-of-sm hover:bg-of-surface-muted"
          >
            <input
              type="checkbox"
              checked={resource.included}
              disabled={!onToggleResource || !resource.removable}
              onChange={(event) =>
                onToggleResource?.(resource.id, event.target.checked)
              }
              aria-label={`Include ${resource.label}`}
            />
            <span className="text-of-12 text-of-text-muted uppercase tracking-wide w-12">
              {resource.action}
            </span>
            <span className="text-of-13 text-of-text font-of-medium truncate flex-1">
              {resource.label}
            </span>
            <span className="text-of-12 text-of-text-muted truncate max-w-[140px]">
              {resource.kind}
            </span>
            <PreviewStatusChip status={resource.preview_status} />
            {resource.warnings.length > 0 || resource.errors.length > 0 ? (
              <span
                className="text-of-12 text-of-warning"
                title={[...resource.warnings, ...resource.errors].join("\n")}
              >
                <Glyph name="info" size={12} tone="currentColor" />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewStatusChip({ status }: { status: string }) {
  const palette = (() => {
    switch (status) {
      case "ready":
        return { bg: "#e8f6ec", fg: "#1d8348", label: "Ready" };
      case "pending":
        return { bg: "#fff3df", fg: "#9a5b00", label: "Pending" };
      case "blocked":
        return { bg: "#fde7e7", fg: "#b42318", label: "Blocked" };
      default:
        return { bg: "#eef0f3", fg: "#5f6b7c", label: status };
    }
  })();
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm text-of-12 font-of-medium"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {palette.label}
    </span>
  );
}

function ProposalTasks({
  tasks,
  onApprove,
  onReject,
}: {
  tasks: ReadonlyArray<OntologyProposalTask>;
  onApprove?: (task: OntologyProposalTask) => void;
  onReject?: (task: OntologyProposalTask) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-of-12 font-of-semibold uppercase tracking-wide text-of-text-soft m-0">
        Review tasks
      </h4>
      <ul className="list-none p-0 m-0 flex flex-col gap-px">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-start gap-2 px-2 py-2 rounded-of-sm border border-of-border bg-of-surface"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-of-13 font-of-semibold text-of-text truncate">
                  {task.title}
                </span>
                <TaskStatusBadge status={task.status} />
              </div>
              {task.description ? (
                <p className="text-of-12 text-of-text-muted m-0 mt-0.5">
                  {task.description}
                </p>
              ) : null}
              {task.reviewer_id ? (
                <p className="text-of-12 text-of-text-muted m-0 mt-0.5">
                  Reviewer: {task.reviewer_id}
                </p>
              ) : null}
            </div>
            {task.status === "pending" ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onReject ? () => onReject(task) : undefined}
                  disabled={!onReject}
                  className={[
                    "inline-flex items-center justify-center h-7 px-2 rounded-of-sm",
                    "border border-of-border bg-of-surface-raised text-of-12 font-of-medium text-of-text",
                    "hover:border-of-border-strong",
                    "disabled:opacity-50",
                  ].join(" ")}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={onApprove ? () => onApprove(task) : undefined}
                  disabled={!onApprove}
                  className={[
                    "inline-flex items-center justify-center h-7 px-2.5 rounded-of-sm",
                    "bg-of-accent hover:bg-of-accent-hover text-of-text-inverse",
                    "text-of-12 font-of-semibold",
                    "disabled:opacity-50",
                  ].join(" ")}
                >
                  Approve
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <Badge variant="active">Approved</Badge>;
  if (status === "rejected")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-danger-soft text-of-danger text-of-12 font-of-medium">
        Rejected
      </span>
    );
  return <Badge variant="experimental">Pending</Badge>;
}

/* ------------------------------------------------------------------------- */
/* History timeline                                                           */
/* ------------------------------------------------------------------------- */

interface HistoryPanelProps {
  entries: ReadonlyArray<OntologyHistoryEntry>;
  /** Author filter (string match). Defaults to "" (all). */
  author: string;
  onAuthorChange: (value: string) => void;
  /** Resource-kind filter; "" means all. */
  resourceKind: string;
  onResourceKindChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  /** Optional resource-kind options surfaced in the filter dropdown. */
  resourceKindOptions?: ReadonlyArray<{ value: string; label: string }>;
}

export function HistoryPanel({
  entries,
  author,
  onAuthorChange,
  resourceKind,
  onResourceKindChange,
  from,
  onFromChange,
  to,
  onToChange,
  resourceKindOptions,
}: HistoryPanelProps) {
  const groups = useMemo(() => groupByDay(entries), [entries]);

  return (
    <section className={PANEL_CLASS} aria-label="History">
      <header className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-of-border">
        <h2 className="text-of-16 font-of-semibold text-of-text">History</h2>
        <span className="text-of-13 text-of-text-muted tabular-nums">
          {entries.length}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <FilterField label="User">
            <input
              type="text"
              value={author}
              onChange={(event) => onAuthorChange(event.target.value)}
              placeholder="all"
              className="w-28 bg-transparent border-0 outline-none text-of-12 text-of-text placeholder:text-of-text-soft"
            />
          </FilterField>
          <FilterField label="Resource">
            <select
              value={resourceKind}
              onChange={(event) => onResourceKindChange(event.target.value)}
              className="bg-transparent border-0 outline-none text-of-12 text-of-text appearance-none pr-2"
            >
              <option value="">All</option>
              {(resourceKindOptions ?? DEFAULT_RESOURCE_KINDS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Glyph name="chevron-down" size={11} tone="var(--of-text-muted)" />
          </FilterField>
          <FilterField label="From">
            <input
              type="date"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
              className="bg-transparent border-0 outline-none text-of-12 text-of-text"
            />
          </FilterField>
          <FilterField label="To">
            <input
              type="date"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
              className="bg-transparent border-0 outline-none text-of-12 text-of-text"
            />
          </FilterField>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-of-13 text-of-text-muted text-center">
          No history entries match the filters.
        </p>
      ) : (
        <ol className="list-none p-4 m-0 flex flex-col gap-4">
          {groups.map((group) => (
            <li key={group.key} className="flex gap-4">
              <DayMarker label={group.label} />
              <ol className="list-none p-0 m-0 flex flex-col gap-2 flex-1 min-w-0">
                {group.entries.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm",
        "border border-of-border bg-of-surface-raised text-of-12 text-of-text",
      ].join(" ")}
    >
      <span className="text-of-text-muted">{label}:</span>
      {children}
    </span>
  );
}

function DayMarker({ label }: { label: string }) {
  return (
    <div className="shrink-0 w-24 pt-0.5 text-of-12 text-of-text-muted text-right">
      {label}
    </div>
  );
}

function HistoryRow({ entry }: { entry: OntologyHistoryEntry }) {
  const time = new Date(entry.saved_at);
  const timeLabel = Number.isNaN(time.getTime())
    ? "—"
    : time.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
  return (
    <li
      className={[
        "flex flex-col gap-1.5 p-3",
        "bg-of-surface border border-of-border rounded-of-sm",
      ].join(" ")}
    >
      <header className="flex items-center gap-2 flex-wrap">
        <span className="text-of-13 font-of-semibold text-of-text">
          {entry.author || "Unknown"}
        </span>
        <span className="text-of-12 text-of-text-muted">{timeLabel}</span>
        <HistoryStatusBadge status={entry.status} />
        <span className="ml-auto text-of-12 text-of-text-muted">
          {entry.changes_count} change{entry.changes_count === 1 ? "" : "s"}
        </span>
      </header>
      {entry.note ? (
        <p className="text-of-13 text-of-text m-0">{entry.note}</p>
      ) : null}
      <ResourceChips resources={entry.visible_resources} />
      {entry.restricted_details_count > 0 ? (
        <p className="text-of-12 text-of-text-muted m-0">
          {entry.restricted_details_count} resource
          {entry.restricted_details_count === 1 ? " is" : "s are"} hidden by
          permissions.
        </p>
      ) : null}
    </li>
  );
}

function HistoryStatusBadge({ status }: { status: string }) {
  const palette = (() => {
    switch (status) {
      case "approved":
      case "merged":
        return { bg: "#e8f6ec", fg: "#1d8348" };
      case "rejected":
      case "failed":
        return { bg: "#fde7e7", fg: "#b42318" };
      case "in_review":
      case "draft":
      case "pending":
        return { bg: "#fff3df", fg: "#9a5b00" };
      default:
        return { bg: "#eef0f3", fg: "#5f6b7c" };
    }
  })();
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm text-of-12 font-of-medium"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ResourceChips({
  resources,
}: {
  resources: ReadonlyArray<OntologyHistoryResourceSummary>;
}) {
  if (resources.length === 0) {
    return (
      <p className="text-of-12 text-of-text-muted m-0">No visible resources.</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {resources.slice(0, 6).map((resource, index) => (
        <span
          key={`${resource.kind}:${resource.id ?? index}`}
          className={[
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-of-sm",
            "border border-of-border bg-of-surface-raised text-of-12 text-of-text",
          ].join(" ")}
          title={resource.label}
        >
          <span className="text-of-text-muted">{resource.kind}</span>
          <span className="truncate max-w-[200px]">{resource.label}</span>
        </span>
      ))}
      {resources.length > 6 ? (
        <span className="text-of-12 text-of-text-muted self-center">
          +{resources.length - 6} more
        </span>
      ) : null}
    </div>
  );
}

interface HistoryGroup {
  key: string;
  label: string;
  entries: OntologyHistoryEntry[];
}

function groupByDay(entries: ReadonlyArray<OntologyHistoryEntry>): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>();
  for (const entry of entries) {
    const date = new Date(entry.saved_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const label = date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const group = map.get(key);
    if (group) {
      group.entries.push(entry);
    } else {
      map.set(key, { key, label, entries: [entry] });
    }
  }
  /* Sort newest day first; entries within a day stay in their source order. */
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

const DEFAULT_RESOURCE_KINDS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "object_type", label: "Object types" },
  { value: "link_type", label: "Link types" },
  { value: "action_type", label: "Action types" },
  { value: "interface", label: "Interfaces" },
  { value: "shared_property_type", label: "Shared properties" },
  { value: "object_type_group", label: "Groups" },
  { value: "value_type", label: "Value types" },
];
