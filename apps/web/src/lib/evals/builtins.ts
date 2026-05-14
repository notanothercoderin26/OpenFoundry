import type {
  EvaluationEvaluator,
  EvaluationSuiteColumn,
  EvaluationSignatureParameter,
  EvaluationTargetFunction,
  EvaluationTestCase,
} from '@/lib/api/evals';
import {
  summarizeLogicComputeUsage,
  type LogicComputeUsageAttribution,
  type LogicComputeUsageLineItem,
  type LogicComputeUsageSummary,
} from '@/lib/logic/blocks';

export type BuiltInEvaluatorName =
  | 'exact_match'
  | 'regex'
  | 'distance'
  | 'length'
  | 'keyword'
  | 'object_match'
  | 'object_set_match'
  | 'integer_range'
  | 'numeric_range'
  | 'floating_point_range'
  | 'temporal_range';

export interface BuiltInEvaluatorOption {
  value: BuiltInEvaluatorName;
  label: string;
  metric: string;
  defaultObjective: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
}

export interface BuiltInMetricResult {
  evaluatorId: string;
  evaluator: string;
  metricName?: string;
  customFunctionRid?: string;
  targetId: string;
  testCaseId: string;
  iteration?: number;
  metricValue: boolean | number;
  passed: boolean;
  actual: unknown;
  expected: unknown;
  actualName?: string;
  expectedName?: string;
  reason: string;
}

export interface CustomEvaluatorDebugOutput {
  evaluatorId: string;
  evaluatorRid: string;
  evaluatorKind: 'typescript' | 'python' | 'logic' | string;
  targetId: string;
  testCaseId: string;
  iteration?: number;
  name: string;
  value: string;
}

export type OntologySimulationEditOperation = 'create' | 'edit' | 'delete';

export interface OntologySimulationEdit {
  operation: OntologySimulationEditOperation;
  objectTypeId: string;
  objectId?: string;
  identifyBy?: Record<string, unknown>;
  properties: Record<string, unknown>;
}

export interface OntologySimulationObject {
  objectTypeId: string;
  objectId: string;
  properties: Record<string, unknown>;
  simulatedOnly: boolean;
}

export interface OntologyEditSimulationResult {
  id: string;
  mode: 'ontology_simulation';
  isolated: true;
  realOntologyMutated: false;
  appliedEdits: OntologySimulationEdit[];
  createdObjects: OntologySimulationObject[];
  editedObjects: OntologySimulationObject[];
  deletedObjects: OntologySimulationObject[];
  activeObjects: OntologySimulationObject[];
  safety: {
    writesCommitted: false;
    actionExecutionApplied: false;
    automationApproved: false;
    note: string;
  };
}

export interface BuiltInIterationResult {
  id: string;
  targetId: string;
  testCaseId: string;
  passed: boolean;
  metrics: BuiltInMetricResult[];
  debugOutputs: CustomEvaluatorDebugOutput[];
}

export interface BuiltInTestCaseResult {
  testCaseId: string;
  name: string;
  passed: boolean;
  iterations: BuiltInIterationResult[];
}

export interface BuiltInMetricSummary {
  evaluatorId: string;
  evaluator: string;
  metricName?: string;
  customFunctionRid?: string;
  targetId: string;
  passed: boolean;
  passCount: number;
  totalCount: number;
  passRate: number;
}

export interface BuiltInEvaluationSummary {
  metricResults: BuiltInMetricSummary[];
  iterationResults: BuiltInIterationResult[];
  testCaseResults: BuiltInTestCaseResult[];
  customEvaluatorDebugOutputs: CustomEvaluatorDebugOutput[];
  passCount: number;
  totalCount: number;
  passRate: number;
}

export type EvaluationRunExecutionMode = 'user_scoped' | 'project_scoped';

export interface EvaluationRunMetadata {
  runInitiator?: { id: string; name?: string };
  branchName?: string;
  model?: string;
  customLabels?: string[];
  customMetadata?: Record<string, unknown>;
  notes?: string;
}

export interface BuiltInEvaluationRunConfig {
  targetVersions?: Record<string, string>;
  targetIds?: string[];
  testCaseIds?: string[];
  iterations?: number;
  parallelization?: number;
  executionMode?: EvaluationRunExecutionMode;
  inputMappings?: Record<string, Record<string, string>>;
  /** Optional per-target model override for multi-target comparison runs. */
  targetModels?: Record<string, string>;
  metadata?: EvaluationRunMetadata;
  source?: 'aip_evals_app' | 'logic_sidebar' | 'api' | string;
  attribution?: Partial<LogicComputeUsageAttribution>;
  /** Project of the evaluation suite — used to scope the results dataset write. */
  suiteProjectId?: string;
  /** Optional override of the results dataset RID; otherwise derived from project id. */
  resultsDatasetRid?: string;
  /** Optional override of the maximum number of rows preserved in the results dataset. */
  resultsDatasetMaxRows?: number;
}

export interface BuiltInEvaluationRunError {
  targetId?: string;
  testCaseId?: string;
  message: string;
}

export interface BuiltInEvaluationRunWarning {
  code:
    | 'llm_iteration_recommendation'
    | 'parallelization_rate_limit'
    | 'parallelization_disabled'
    | 'input_mapping_missing'
    | 'execution_mode_not_supported'
    | 'multi_target_experiment_disabled'
    | 'multi_target_no_targets'
    | 'multi_target_single_target_run'
    | 'results_dataset_skipped_user_scoped'
    | 'results_dataset_unsupported_target'
    | 'results_dataset_missing_project'
    | 'results_dataset_no_target_outputs';
  message: string;
  targetId?: string;
}

export type MultiTargetExperimentOption =
  | 'per_target_model_sweep'
  | 'per_target_prompt_sweep'
  | 'single_target_grid_search'
  | 'per_target_evaluator_threshold_sweep';

export interface MultiTargetDisabledOption {
  option: MultiTargetExperimentOption;
  reason: string;
}

export interface MultiTargetRunCapabilities {
  multiTarget: boolean;
  includedTargetIds: string[];
  excludedTargetIds: string[];
  disabledExperimentOptions: MultiTargetDisabledOption[];
}

export interface MultiTargetMetricComparison {
  evaluatorId: string;
  metricName: string;
  perTarget: Array<{
    targetId: string;
    version: string;
    model?: string;
    passCount: number;
    totalCount: number;
    passRate: number;
    average?: number;
  }>;
  bestTargetId?: string;
  worstTargetId?: string;
}

export interface MultiTargetTargetSummary {
  targetId: string;
  kind: EvaluationTargetFunction['kind'];
  version: string;
  model?: string;
  passCount: number;
  totalCount: number;
  passRate: number;
  failureCount: number;
}

export interface MultiTargetRunComparison {
  multiTarget: boolean;
  targetSummaries: MultiTargetTargetSummary[];
  metricComparisons: MultiTargetMetricComparison[];
  bestTargetId?: string;
  worstTargetId?: string;
}

export interface EvaluationResultsDatasetColumn {
  name: string;
  type: 'string' | 'json' | 'boolean' | 'integer' | 'float' | 'timestamp';
  permissionScoped: boolean;
}

export interface EvaluationResultsDatasetUnsupportedTarget {
  targetId: string;
  reason: 'ontology_edits_only';
  message: string;
}

export interface EvaluationResultsDatasetConfig {
  projectId: string;
  datasetRid: string;
  visibleTo: 'project_viewers';
  writeMode: 'append_and_prune';
  schema: EvaluationResultsDatasetColumn[];
  unsupportedTargets: EvaluationResultsDatasetUnsupportedTarget[];
  maxRows: number;
}

export interface EvaluationResultsDatasetMetricRow {
  evaluatorId: string;
  evaluator: string;
  metricName: string;
  metricValue: boolean | number;
  passed: boolean;
  customFunctionRid?: string;
}

export interface EvaluationResultsDatasetDebugOutput {
  evaluatorId: string;
  evaluatorRid: string;
  evaluatorKind: string;
  name: string;
  value: string;
}

export interface EvaluationResultsDatasetUserMetadata {
  runInitiator?: { id: string; name?: string };
  customLabels: string[];
  customMetadata: Record<string, unknown>;
  notes?: string;
}

export interface EvaluationResultsDatasetAutoMetadata {
  executionMode: EvaluationRunExecutionMode;
  branchName?: string;
  model?: string;
  projectId: string;
  startedAtIso: string;
  completedAtIso: string;
  source: string;
  iterations: number;
  parallelization: number;
}

export interface EvaluationResultsDatasetRow {
  datasetRid: string;
  runId: string;
  evaluationSuiteId: string;
  testCaseId: string;
  testCaseName: string;
  targetId: string;
  targetKind: EvaluationTargetFunction['kind'];
  targetVersion: string;
  targetModel?: string;
  iteration: number;
  status: 'passed' | 'failed';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  intermediateParameters: Record<string, unknown>;
  evaluatorResults: EvaluationResultsDatasetMetricRow[];
  customEvaluatorDebugOutputs: EvaluationResultsDatasetDebugOutput[];
  errors: Array<{ message: string; field?: string }>;
  userMetadata: EvaluationResultsDatasetUserMetadata;
  autoCapturedMetadata: EvaluationResultsDatasetAutoMetadata;
  ontologySimulation?: OntologyEditSimulationResult;
}

export interface EvaluationResultsDatasetWrite {
  config: EvaluationResultsDatasetConfig;
  written: boolean;
  reason?:
    | 'project_scoped_execution'
    | 'user_scoped_execution_skipped'
    | 'no_project_id'
    | 'no_supported_target_outputs';
  rows: EvaluationResultsDatasetRow[];
  skippedRows: Array<{ targetId: string; reason: 'ontology_edits_only' }>;
}

export interface EvaluationResultsTableEvaluatorOutput {
  evaluatorId: string;
  evaluator: string;
  metricName: string;
  metricValue: boolean | number;
  passed: boolean;
  actual: unknown;
  expected: unknown;
  actualName?: string;
  expectedName?: string;
  reason: string;
  customFunctionRid?: string;
}

export interface EvaluationResultsTableDebugOutput {
  evaluatorId: string;
  evaluatorRid: string;
  evaluatorKind: string;
  name: string;
  value: string;
}

export interface EvaluationResultsTableRow {
  id: string;
  testCaseId: string;
  testCaseName: string;
  targetId: string;
  targetKind: EvaluationTargetFunction['kind'];
  targetVersion: string;
  targetModel?: string;
  iteration: number;
  status: 'passed' | 'failed';
  inputs: Record<string, unknown>;
  expectedValues: Record<string, unknown>;
  actualOutputs: Record<string, unknown>;
  intermediateParameters: Record<string, unknown>;
  evaluatorOutputs: EvaluationResultsTableEvaluatorOutput[];
  customEvaluatorDebugOutputs: EvaluationResultsTableDebugOutput[];
  errors: Array<{ message: string }>;
  debuggerHref: string;
}

export interface EvaluationResultsTable {
  runId: string;
  totalCount: number;
  passCount: number;
  failureCount: number;
  passRate: number;
  aggregateMetrics: BuiltInMetricSummary[];
  rows: EvaluationResultsTableRow[];
}

export type EvaluationDebugTraceKind =
  | 'logic_trace'
  | 'code_function_preview'
  | 'evaluator_trace'
  | 'intermediate_parameters'
  | 'ontology_simulation';

export interface EvaluationDebugTraceStep {
  id: string;
  kind: EvaluationDebugTraceKind;
  label: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface RunComparisonAggregateMetricChange {
  evaluatorId: string;
  metricName: string;
  targetId: string;
  basePassCount: number;
  headPassCount: number;
  baseTotalCount: number;
  headTotalCount: number;
  basePassRate: number;
  headPassRate: number;
  passRateDelta: number;
  changeKind: 'improved' | 'regressed' | 'unchanged' | 'only_in_base' | 'only_in_head';
}

export type RunComparisonTestCaseChangeKind =
  | 'newly_passed'
  | 'newly_failed'
  | 'still_passed'
  | 'still_failed'
  | 'only_in_base'
  | 'only_in_head';

export interface RunComparisonOutputDiff {
  key: string;
  baseValue: unknown;
  headValue: unknown;
}

export interface RunComparisonTestCaseChange {
  testCaseId: string;
  testCaseName: string;
  targetId: string;
  iteration: number;
  baseStatus?: 'passed' | 'failed';
  headStatus?: 'passed' | 'failed';
  changeKind: RunComparisonTestCaseChangeKind;
  baseOutputs?: Record<string, unknown>;
  headOutputs?: Record<string, unknown>;
  outputDiff: RunComparisonOutputDiff[];
  baseDebuggerHref?: string;
  headDebuggerHref?: string;
}

export interface RunComparisonTargetMetadata {
  targetId: string;
  baseVersion?: string;
  headVersion?: string;
  baseModel?: string;
  headModel?: string;
  versionChanged: boolean;
  modelChanged: boolean;
}

export type RunComparisonEvaluatorDiffChangeKind =
  | 'passed_changed'
  | 'metric_value_changed'
  | 'unchanged'
  | 'only_in_base'
  | 'only_in_head';

export interface RunComparisonEvaluatorDiff {
  evaluatorId: string;
  metricName: string;
  testCaseId: string;
  targetId: string;
  iteration: number;
  baseMetricValue?: boolean | number;
  headMetricValue?: boolean | number;
  basePassed?: boolean;
  headPassed?: boolean;
  changeKind: RunComparisonEvaluatorDiffChangeKind;
}

export interface RunComparisonSummary {
  newlyPassed: number;
  newlyFailed: number;
  stillPassed: number;
  stillFailed: number;
  onlyInBase: number;
  onlyInHead: number;
}

export type EvaluationExperimentDimensionKind =
  | 'target_model'
  | 'target_version'
  | 'prompt_variable'
  | 'evaluator_threshold'
  | 'evaluator_config'
  | 'parallelization'
  | 'iterations';

export interface EvaluationExperimentDimension {
  id: string;
  kind: EvaluationExperimentDimensionKind;
  label: string;
  /** Target id this dimension applies to (target_model, target_version, prompt_variable). */
  targetId?: string;
  /** Evaluator id this dimension applies to (evaluator_threshold, evaluator_config). */
  evaluatorId?: string;
  /** Optional name of the variable / config field. */
  parameterName?: string;
  /** Values to try in the grid (must be non-empty). */
  values: unknown[];
}

export interface EvaluationExperimentBaseConfig
  extends Omit<BuiltInEvaluationRunConfig, 'targetModels' | 'targetVersions' | 'iterations' | 'parallelization' | 'metadata'> {
  iterations?: number;
  parallelization?: number;
  metadata?: EvaluationRunMetadata;
}

export interface EvaluationExperimentConfig {
  dimensions: EvaluationExperimentDimension[];
  baseConfig?: EvaluationExperimentBaseConfig;
  /** Maximum number of grid combinations to execute. */
  maxRuns?: number;
}

export interface EvaluationExperimentCombinationParameter {
  dimensionId: string;
  dimensionLabel: string;
  kind: EvaluationExperimentDimensionKind;
  targetId?: string;
  evaluatorId?: string;
  parameterName?: string;
  value: unknown;
}

export interface EvaluationExperimentCombination {
  id: string;
  index: number;
  parameters: EvaluationExperimentCombinationParameter[];
}

export interface EvaluationExperimentPlan {
  totalCombinations: number;
  executedCombinations: number;
  maxRuns: number;
  truncated: boolean;
  combinations: EvaluationExperimentCombination[];
  estimatedComputeSeconds: number;
  warnings: BuiltInEvaluationRunWarning[];
}

export interface EvaluationExperimentRunResult {
  combination: EvaluationExperimentCombination;
  run: BuiltInEvaluationRunResult;
}

export interface EvaluationExperimentGroupValue {
  value: unknown;
  runCount: number;
  iterationCount: number;
  passCount: number;
  failureCount: number;
  averagePassRate: number;
}

export interface EvaluationExperimentGroupByDimension {
  dimensionId: string;
  dimensionLabel: string;
  kind: EvaluationExperimentDimensionKind;
  groups: EvaluationExperimentGroupValue[];
}

export interface EvaluationExperimentResults {
  plan: EvaluationExperimentPlan;
  runs: EvaluationExperimentRunResult[];
  groupsByDimension: EvaluationExperimentGroupByDimension[];
  bestCombinationId?: string;
  worstCombinationId?: string;
  totalPassCount: number;
  totalIterationCount: number;
  averagePassRate: number;
}

export interface EvaluationResultsAnalyzerConfig {
  model?: string;
  maxCategories?: number;
  maxFailingTestCases?: number;
  /** When true, include up to one passing iteration per category for contrast. */
  includePassingContrast?: boolean;
}

export type EvaluationResultsAnalyzerCategoryKind =
  | 'permission_error'
  | 'validation_error'
  | 'exact_mismatch'
  | 'regex_mismatch'
  | 'length_constraint'
  | 'keyword_missing'
  | 'numeric_out_of_range'
  | 'temporal_out_of_range'
  | 'object_mismatch'
  | 'object_set_mismatch'
  | 'ontology_edit_simulation'
  | 'custom_evaluator_failure'
  | 'runtime_error'
  | 'other';

export interface EvaluationResultsAnalyzerExample {
  testCaseId: string;
  testCaseName: string;
  targetId: string;
  iteration: number;
  metricName?: string;
  actual?: unknown;
  expected?: unknown;
  reason?: string;
  errorMessage?: string;
  debuggerHref: string;
}

export interface EvaluationResultsAnalyzerCategory {
  id: string;
  kind: EvaluationResultsAnalyzerCategoryKind;
  name: string;
  description: string;
  failureCount: number;
  affectedTestCaseIds: string[];
  affectedTargetIds: string[];
  examples: EvaluationResultsAnalyzerExample[];
  promptSuggestion: string;
  filterChip: { testCaseIds: string[] };
}

export interface EvaluationResultsAnalyzerConfigResolved {
  model: string;
  maxCategories: number;
  maxFailingTestCases: number;
}

export type EvalScheduleCadence = 'hourly' | 'daily' | 'weekly' | 'cron';

export type EvalScheduleNotificationChannel =
  | { kind: 'data_health'; healthCheckId: string }
  | { kind: 'automate'; automationId: string }
  | { kind: 'slack'; channel: string }
  | { kind: 'email'; recipients: string[] };

export interface EvalScheduleRemediationFlow {
  automationId: string;
  description?: string;
  rollbackOnRegression: boolean;
}

export interface EvalRegressionThresholds {
  /** Max negative pass-rate delta (e.g., 0.05 = a 5% drop triggers an alert). */
  passRateDropThreshold: number;
  /** Increase in failure ratio per metric that triggers a variance spike alert. */
  varianceSpikeThreshold: number;
  /** Max compute-seconds increase ratio (0.5 = 50% rise). */
  costSpikeThresholdPct: number;
  /** When true, alert on failure categories that appear in head but not baseline. */
  alertOnNewFailureCategories: boolean;
}

export type EvalScheduleTargetVersionPin = 'published' | 'latest_logic' | 'specific';

export interface EvalScheduleConfig {
  id: string;
  suiteId: string;
  name?: string;
  cadence: EvalScheduleCadence;
  cron?: string;
  startsAtIso?: string;
  targetVersionPin: EvalScheduleTargetVersionPin;
  targetVersionId?: string;
  baselineRunId?: string;
  notificationChannels: EvalScheduleNotificationChannel[];
  remediationFlow?: EvalScheduleRemediationFlow;
  regressionThresholds: EvalRegressionThresholds;
  enabled: boolean;
  createdAtIso: string;
}

export type EvalScheduleAlertKind =
  | 'pass_rate_regression'
  | 'variance_spike'
  | 'cost_spike'
  | 'new_failure_category'
  | 'baseline_missing'
  | 'scheduled_run_missing';

export interface EvalScheduleAlert {
  kind: EvalScheduleAlertKind;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  baselineRunId?: string;
  headRunId?: string;
  metricName?: string;
  failureCategoryKind?: EvaluationResultsAnalyzerCategoryKind;
  detail?: Record<string, unknown>;
}

export interface EvalScheduleNotificationOutcome {
  channel: EvalScheduleNotificationChannel;
  status: 'queued' | 'sent' | 'skipped';
  reason?: string;
}

export interface EvalScheduleRemediationOutcome {
  automationId: string;
  status: 'planned' | 'triggered' | 'skipped';
  reason?: string;
}

export interface EvalScheduleRunOutcome {
  scheduleId: string;
  suiteId: string;
  runAtIso: string;
  runId?: string;
  passRate: number;
  totalIterations: number;
  baselineRunId?: string;
  baselinePassRate?: number;
  baselineCostSeconds?: number;
  headCostSeconds?: number;
  alerts: EvalScheduleAlert[];
  notifications: EvalScheduleNotificationOutcome[];
  remediation?: EvalScheduleRemediationOutcome;
}

export type LogicPublishGateSurface = 'logic_publish' | 'automation_enable' | 'action_rollout';

export type LogicPublishGateSeverity = 'critical' | 'warning' | 'info';

export interface LogicPublishGateRequirement {
  /** Suites that must pass before this surface can roll out. */
  suiteIds: string[];
  /** Minimum aggregate pass rate (0..1) per suite. */
  minPassRate: number;
  /** Maximum age of the most recent eval run in hours. 0 disables the freshness gate. */
  maxRunAgeHours: number;
  /** Evaluator metric names whose failure is considered critical. */
  criticalMetricNames?: string[];
}

export interface LogicPublishGateContext {
  surface: LogicPublishGateSurface;
  logicFileId?: string;
  functionRid?: string;
  evaluatedAtIso: string;
}

export interface LogicPublishGateWaiver {
  id: string;
  ruleField: string;
  reviewerId: string;
  reviewerName?: string;
  reason: string;
  approvedAtIso: string;
}

export interface LogicPublishGateFinding {
  ruleField: string;
  severity: LogicPublishGateSeverity;
  message: string;
  metricName?: string;
  suiteId?: string;
  runId?: string;
  waived: boolean;
  waiver?: LogicPublishGateWaiver;
}

export interface LogicPublishGateRunSummary {
  suiteId: string;
  runId?: string;
  passRate: number;
  passCount: number;
  totalCount: number;
  failureCount: number;
  completedAtIso?: string;
  ageHours?: number;
  criticalFailureCount: number;
}

export interface LogicPublishGateResult {
  context: LogicPublishGateContext;
  requirement: LogicPublishGateRequirement;
  ready: boolean;
  rolloutBlocked: boolean;
  findings: LogicPublishGateFinding[];
  runSummaries: LogicPublishGateRunSummary[];
  appliedWaivers: LogicPublishGateWaiver[];
  bypassedFindingCount: number;
}

export interface PromptSuggestionApplication {
  id: string;
  suggestionId: string;
  categoryKind: EvaluationResultsAnalyzerCategoryKind;
  categoryName: string;
  source: { runId: string; evaluationSuiteId?: string };
  appliedAt: string;
  appliedBy?: { id: string; name?: string };
  appliedTo?: { logicFileId?: string; functionRid?: string };
  notes?: string;
  followUpRunId?: string;
}

export interface PromptSuggestionEvidenceSummary {
  runId: string;
  passRate: number;
  failureCount: number;
  iterationCount: number;
  affectedFailureCount: number;
}

export interface PromptSuggestionEvidence {
  application: PromptSuggestionApplication;
  baseRunSummary: PromptSuggestionEvidenceSummary;
  followUpRunSummary?: PromptSuggestionEvidenceSummary;
  improvement?: {
    passRateDelta: number;
    failureCountDelta: number;
    affectedFailureDelta: number;
    resolved: boolean;
  };
}

export interface EvaluationResultsAnalyzerReport {
  runId: string;
  evaluationSuiteId?: string;
  config: EvaluationResultsAnalyzerConfigResolved;
  totalFailingTestCases: number;
  truncatedFailingTestCases: number;
  totalFailingIterations: number;
  categories: EvaluationResultsAnalyzerCategory[];
  remainingCategoriesCount: number;
  summary: string;
  unsupportedReason?: 'no_failures' | 'no_iterations';
}

export interface EvaluationMetricsDashboardFilters {
  suiteIds?: string[];
  runIds?: string[];
  targetIds?: string[];
  versions?: string[];
  models?: string[];
  metricNames?: string[];
  status?: Array<'passed' | 'failed'>;
  testCaseIds?: string[];
  timeWindow?: { startIso?: string; endIso?: string };
}

export interface EvaluationMetricsDashboardTrendPoint {
  runId: string;
  suiteId?: string;
  completedAtIso: string;
  passRate: number;
  passCount: number;
  totalCount: number;
}

export interface EvaluationMetricsDashboardTargetStat {
  targetId: string;
  iterations: number;
  passCount: number;
  failureCount: number;
  passRate: number;
  averageDurationMs: number;
}

export interface EvaluationMetricsDashboardTestCaseStat {
  testCaseId: string;
  testCaseName: string;
  totalIterations: number;
  passCount: number;
  failureCount: number;
  passRate: number;
  lastRunId: string;
  lastStatus: 'passed' | 'failed';
}

export interface EvaluationMetricsDashboardMetricStat {
  evaluatorId: string;
  metricName: string;
  totalCount: number;
  passCount: number;
  passRate: number;
  averageValue?: number;
}

export interface EvaluationMetricsDashboardDrillDown {
  runId: string;
  testCaseId: string;
  testCaseName: string;
  targetId: string;
  iteration: number;
  status: 'passed' | 'failed';
  debugHref: string;
  llmTraceHref?: string;
  evaluatorTraceHref: string;
}

export interface EvaluationMetricsDashboardFilterOptions {
  suiteIds: string[];
  runIds: string[];
  targetIds: string[];
  versions: string[];
  models: string[];
  metricNames: string[];
  testCaseIds: string[];
}

export interface EvaluationMetricsDashboard {
  filters: EvaluationMetricsDashboardFilters;
  filterOptions: EvaluationMetricsDashboardFilterOptions;
  totalRuns: number;
  totalIterations: number;
  totalPass: number;
  totalFail: number;
  overallPassRate: number;
  averageDurationMs: number;
  trend: EvaluationMetricsDashboardTrendPoint[];
  targetStats: EvaluationMetricsDashboardTargetStat[];
  testCaseStats: EvaluationMetricsDashboardTestCaseStat[];
  metricStats: EvaluationMetricsDashboardMetricStat[];
  drillDownLinks: EvaluationMetricsDashboardDrillDown[];
}

export interface EvaluationMetricsDashboardInputSuite {
  id?: string;
  targetFunctions: EvaluationTargetFunction[];
  testCases: EvaluationTestCase[];
}

export interface EvaluationMetricsDashboardInputEntry {
  suite: EvaluationMetricsDashboardInputSuite;
  runs: BuiltInEvaluationRunResult[];
}

export interface EvaluationRunComparison {
  baseRunId: string;
  headRunId: string;
  baseTotal: number;
  headTotal: number;
  basePassCount: number;
  headPassCount: number;
  basePassRate: number;
  headPassRate: number;
  passRateDelta: number;
  passCountDelta: number;
  aggregateMetricChanges: RunComparisonAggregateMetricChange[];
  testCaseChanges: RunComparisonTestCaseChange[];
  targetMetadataChanges: RunComparisonTargetMetadata[];
  evaluatorDiffs: RunComparisonEvaluatorDiff[];
  summary: RunComparisonSummary;
}

export interface EvaluationDebugView {
  runId: string;
  evaluationSuiteId?: string;
  testCaseId: string;
  testCaseName: string;
  targetId: string;
  targetKind: EvaluationTargetFunction['kind'];
  targetVersion: string;
  targetModel?: string;
  iteration: number;
  status: 'passed' | 'failed';
  inputs: Record<string, unknown>;
  expectedValues: Record<string, unknown>;
  actualOutputs: Record<string, unknown>;
  intermediateParameters: Record<string, unknown>;
  evaluatorOutputs: EvaluationResultsTableEvaluatorOutput[];
  customEvaluatorDebugOutputs: EvaluationResultsTableDebugOutput[];
  errors: Array<{ message: string }>;
  traceSteps: EvaluationDebugTraceStep[];
  ontologySimulation?: OntologyEditSimulationResult;
  href: string;
}

export interface BuiltInEvaluationDebuggerLink {
  testCaseId: string;
  targetId: string;
  href: string;
}

export interface BuiltInEvaluationResultDatasetRow {
  id: string;
  testCaseId: string;
  targetId: string;
  iteration: number;
  status: 'passed' | 'failed';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  intermediateParameters: Record<string, unknown>;
  ontologySimulation?: OntologyEditSimulationResult;
  metrics: BuiltInMetricResult[];
  debugOutputs: CustomEvaluatorDebugOutput[];
}

export interface BuiltInEvaluationRunResult extends BuiltInEvaluationSummary {
  id: string;
  status: 'completed' | 'error';
  passed: boolean;
  startedAtIso: string;
  completedAtIso: string;
  durationMs: number;
  config: {
    source: string;
    iterations: number;
    parallelization: number;
    executionMode: EvaluationRunExecutionMode;
    targetVersions: Record<string, string>;
    targetModels: Record<string, string>;
    targetIds: string[];
    testCaseIds: string[];
    inputMappings: Record<string, Record<string, string>>;
    metadata: EvaluationRunMetadata;
  };
  multiTargetComparison?: MultiTargetRunComparison;
  computeUsage: LogicComputeUsageSummary;
  errors: BuiltInEvaluationRunError[];
  warnings: BuiltInEvaluationRunWarning[];
  debuggerLinks: BuiltInEvaluationDebuggerLink[];
  resultDatasetRows: BuiltInEvaluationResultDatasetRow[];
  resultsDatasetWrite?: EvaluationResultsDatasetWrite;
}

export const BUILT_IN_EVALUATOR_OPTIONS: BuiltInEvaluatorOption[] = [
  { value: 'exact_match', label: 'Exact match', metric: 'matches', defaultObjective: { metric: 'matches', target: true } },
  { value: 'regex', label: 'Regex', metric: 'matches_regex', defaultObjective: { metric: 'matches_regex', target: true }, defaultConfig: { pattern: 'Escalate|Recover' } },
  { value: 'distance', label: 'Distance', metric: 'distance', defaultObjective: { metric: 'distance', direction: 'minimize', threshold: 2 } },
  { value: 'length', label: 'Length', metric: 'length', defaultObjective: { metric: 'length', direction: 'maximize', threshold: 10 } },
  { value: 'keyword', label: 'Keyword', metric: 'keyword_hits', defaultObjective: { metric: 'keyword_hits', direction: 'maximize', threshold: 1 }, defaultConfig: { keywords: ['Escalate'] } },
  { value: 'object_match', label: 'Object match', metric: 'matches_object', defaultObjective: { metric: 'matches_object', target: true } },
  { value: 'object_set_match', label: 'Object-set match', metric: 'object_set_overlap', defaultObjective: { metric: 'object_set_overlap', direction: 'maximize', threshold: 1 } },
  { value: 'integer_range', label: 'Integer range', metric: 'in_range', defaultObjective: { metric: 'in_range', target: true }, defaultConfig: { min: 0, max: 10 } },
  { value: 'numeric_range', label: 'Numeric range', metric: 'in_range', defaultObjective: { metric: 'in_range', target: true }, defaultConfig: { min: 0, max: 10 } },
  { value: 'floating_point_range', label: 'Floating-point range', metric: 'in_range', defaultObjective: { metric: 'in_range', target: true }, defaultConfig: { min: 0, max: 1 } },
  { value: 'temporal_range', label: 'Temporal range', metric: 'in_temporal_range', defaultObjective: { metric: 'in_temporal_range', target: true }, defaultConfig: { min: '2026-01-01', max: '2026-12-31' } },
];

const BUILT_IN_ALIASES: Record<string, BuiltInEvaluatorName> = {
  exact_string_match: 'exact_match',
  exact_match: 'exact_match',
  regex: 'regex',
  distance: 'distance',
  levenshtein_distance: 'distance',
  length: 'length',
  keyword: 'keyword',
  object: 'object_match',
  object_match: 'object_match',
  object_set: 'object_set_match',
  object_set_match: 'object_set_match',
  integer_range: 'integer_range',
  numeric_range: 'numeric_range',
  floating_point_range: 'floating_point_range',
  float_range: 'floating_point_range',
  temporal_range: 'temporal_range',
};

function normalizeEvaluatorName(value: unknown): BuiltInEvaluatorName {
  const key = String(value ?? 'exact_match').trim().toLowerCase();
  return BUILT_IN_ALIASES[key] ?? 'exact_match';
}

function isBuiltInEvaluator(evaluator: EvaluationEvaluator) {
  const kind = String(evaluator.kind ?? 'built_in').toLowerCase();
  return kind === 'built_in' || kind === 'builtin';
}

export function isCustomEvaluationFunction(evaluator: EvaluationEvaluator) {
  const kind = String(evaluator.kind ?? '').toLowerCase();
  return ['custom_function', 'custom', 'function', 'function_evaluator', 'marketplace_function', 'marketplace_deployed', 'marketplace'].includes(kind);
}

export function builtInEvaluatorOption(name: string) {
  const normalized = normalizeEvaluatorName(name);
  return BUILT_IN_EVALUATOR_OPTIONS.find((option) => option.value === normalized) ?? BUILT_IN_EVALUATOR_OPTIONS[0];
}

export function evaluatorDisplayName(evaluatorName: string) {
  const normalized = String(evaluatorName ?? '').toLowerCase();
  if (BUILT_IN_ALIASES[normalized]) return builtInEvaluatorOption(evaluatorName).label;
  return evaluatorName.replaceAll('_', ' ');
}

function metricNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableObjectId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'object';
}

function outputIsOntologyEditBundle(output: EvaluationSignatureParameter) {
  return parameterType(output) === 'ontology_edit_bundle';
}

function targetHasOntologyEditOutput(target: EvaluationTargetFunction) {
  return target.signature.outputs.some(outputIsOntologyEditBundle);
}

function normalizeOntologyOperation(value: unknown): OntologySimulationEditOperation {
  const operation = String(value ?? '').trim().toLowerCase();
  if (operation === 'create' || operation === 'delete') return operation;
  return 'edit';
}

function ontologyObjectFromValue(value: unknown): OntologySimulationObject | undefined {
  const object = recordValue(value);
  const objectTypeId = String(object.objectTypeId ?? object.object_type_id ?? '').trim();
  const objectId = String(object.objectId ?? object.object_id ?? object.id ?? '').trim();
  if (!objectTypeId || !objectId) return undefined;
  return {
    objectTypeId,
    objectId,
    properties: recordValue(object.properties ?? object.fields),
    simulatedOnly: false,
  };
}

function collectOntologySeedObjects(testCase: EvaluationTestCase) {
  const objects = new Map<string, OntologySimulationObject>();
  const add = (object: OntologySimulationObject | undefined) => {
    if (!object) return;
    objects.set(`${object.objectTypeId}:${object.objectId}`, object);
  };
  Object.values(testCase.values).forEach((value) => {
    if (Array.isArray(value)) value.forEach((entry) => add(ontologyObjectFromValue(entry)));
    else add(ontologyObjectFromValue(value));
  });
  if (objects.size === 0) {
    objects.set('Customer:customer-4421', {
      objectTypeId: 'Customer',
      objectId: 'customer-4421',
      properties: { name: 'Acme Logistics', nextStep: 'open' },
      simulatedOnly: false,
    });
  }
  return objects;
}

function normalizeOntologyEdits(raw: unknown, testCase: EvaluationTestCase): OntologySimulationEdit[] {
  const expectedObject = recordValue(raw);
  const rawEdits = Array.isArray(raw)
    ? raw
    : Array.isArray(expectedObject.edits)
      ? expectedObject.edits
      : Array.isArray(expectedObject.proposedEdits)
        ? expectedObject.proposedEdits
        : raw && typeof raw === 'object'
          ? [raw]
          : [];
  if (rawEdits.length === 0) {
    const requester = stringValue(testCase.values.customerName ?? testCase.values.customerRecord ?? testCase.values.complaintText ?? 'Acme Logistics').slice(0, 80);
    return [
      {
        operation: 'create',
        objectTypeId: 'SupportTicket',
        properties: { ticketRequester: requester, classification: 'service_recovery' },
      },
      {
        operation: 'edit',
        objectTypeId: 'Customer',
        objectId: 'customer-4421',
        properties: { nextStep: 'service_recovery_follow_up' },
      },
      {
        operation: 'delete',
        objectTypeId: 'SupportTicket',
        identifyBy: { ticketId: String(testCase.values.staleTicketId ?? 'stale-4421') },
        properties: {},
      },
    ];
  }
  return rawEdits.map((entry, index) => {
    const edit = recordValue(entry);
    const fields = recordValue(edit.fields);
    const properties = recordValue(edit.properties);
    const identifyBy = recordValue(edit.identifyBy ?? edit.identify_by);
    const objectTypeId = String(edit.objectTypeId ?? edit.object_type_id ?? 'SupportTicket');
    const objectId = String(edit.objectId ?? edit.object_id ?? edit.id ?? '').trim() || undefined;
    return {
      operation: normalizeOntologyOperation(edit.operation ?? edit.op ?? edit.kind),
      objectTypeId,
      objectId,
      identifyBy: Object.keys(identifyBy).length > 0 ? identifyBy : undefined,
      properties: {
        ...(Object.keys(fields).length > 0 ? fields : properties),
        ...(index === 0 && !fields.classification && !properties.classification && objectTypeId === 'SupportTicket' ? { classification: 'service_recovery' } : {}),
      },
    };
  });
}

function objectMatchesProperties(object: OntologySimulationObject, properties: Record<string, unknown>) {
  return Object.entries(properties).every(([key, value]) => deepEqual(object.properties[key], value));
}

function findOntologyObject(
  objects: Map<string, OntologySimulationObject>,
  edit: Pick<OntologySimulationEdit, 'objectTypeId' | 'objectId' | 'identifyBy'>,
) {
  if (edit.objectId) {
    const exact = objects.get(`${edit.objectTypeId}:${edit.objectId}`);
    if (exact) return exact;
  }
  const identifyBy = edit.identifyBy ?? {};
  return Array.from(objects.values()).find((object) => (
    object.objectTypeId === edit.objectTypeId && objectMatchesProperties(object, identifyBy)
  ));
}

export function simulateOntologyEditEvaluation(
  testCase: EvaluationTestCase,
  rawEdits: unknown,
  seed = `${testCase.id}:1`,
): OntologyEditSimulationResult {
  const active = collectOntologySeedObjects(testCase);
  const edits = normalizeOntologyEdits(rawEdits, testCase);
  const createdObjects: OntologySimulationObject[] = [];
  const editedObjects: OntologySimulationObject[] = [];
  const deletedObjects: OntologySimulationObject[] = [];
  edits.forEach((edit, index) => {
    if (edit.operation === 'create') {
      const objectId = edit.objectId ?? `${stableObjectId(edit.objectTypeId)}-${stableObjectId(testCase.id)}-${index + 1}`;
      const object = { objectTypeId: edit.objectTypeId, objectId, properties: { ...edit.properties }, simulatedOnly: true };
      active.set(`${object.objectTypeId}:${object.objectId}`, object);
      createdObjects.push(object);
      return;
    }
    const existing = findOntologyObject(active, edit) ?? {
      objectTypeId: edit.objectTypeId,
      objectId: edit.objectId ?? `${stableObjectId(edit.objectTypeId)}-${stableObjectId(testCase.id)}-${index + 1}`,
      properties: { ...(edit.identifyBy ?? {}) },
      simulatedOnly: false,
    };
    if (edit.operation === 'delete') {
      active.delete(`${existing.objectTypeId}:${existing.objectId}`);
      deletedObjects.push({ ...existing, properties: { ...existing.properties, ...(edit.identifyBy ?? {}) } });
      return;
    }
    const edited = { ...existing, properties: { ...existing.properties, ...edit.properties } };
    active.set(`${edited.objectTypeId}:${edited.objectId}`, edited);
    editedObjects.push(edited);
  });
  return {
    id: `ontology-sim-${stableObjectId(seed)}`,
    mode: 'ontology_simulation',
    isolated: true,
    realOntologyMutated: false,
    appliedEdits: edits,
    createdObjects,
    editedObjects,
    deletedObjects,
    activeObjects: Array.from(active.values()),
    safety: {
      writesCommitted: false,
      actionExecutionApplied: false,
      automationApproved: false,
      note: 'Evaluation applied Ontology edits only inside the per-test-case simulation.',
    },
  };
}

function ontologyEditBundleForTestCase(testCase: EvaluationTestCase, expected: unknown, seed: string) {
  const proposedEdits = normalizeOntologyEdits(expected, testCase);
  const simulation = simulateOntologyEditEvaluation(testCase, proposedEdits, seed);
  return {
    kind: 'ontology_edit_bundle',
    proposedEdits,
    simulation,
    realOntologyMutated: false,
    committed: false,
  };
}

function ontologySimulationFromValue(value: unknown): OntologyEditSimulationResult | undefined {
  const object = recordValue(value);
  const simulation = recordValue(object.simulation);
  if (simulation.mode === 'ontology_simulation' && simulation.realOntologyMutated === false) {
    return simulation as unknown as OntologyEditSimulationResult;
  }
  if (object.mode === 'ontology_simulation' && object.realOntologyMutated === false) {
    return object as unknown as OntologyEditSimulationResult;
  }
  return undefined;
}

function ontologyExpectedEdits(expected: unknown) {
  const object = recordValue(expected);
  return Array.isArray(expected)
    ? expected
    : Array.isArray(object.edits)
      ? object.edits
      : Array.isArray(object.proposedEdits)
        ? object.proposedEdits
        : expected && typeof expected === 'object'
          ? [expected]
          : [];
}

function ontologySimulationEditMatches(simulation: OntologyEditSimulationResult, expected: unknown) {
  const edit = normalizeOntologyEdits(expected, { id: 'expected', name: 'Expected', values: {} })[0];
  if (!edit) return false;
  if (edit.operation === 'create') {
    return simulation.createdObjects.some((object) => object.objectTypeId === edit.objectTypeId && objectMatchesProperties(object, edit.properties));
  }
  if (edit.operation === 'delete') {
    return simulation.deletedObjects.some((object) => (
      object.objectTypeId === edit.objectTypeId
      && (!edit.objectId || object.objectId === edit.objectId)
      && objectMatchesProperties(object, edit.identifyBy ?? {})
    ));
  }
  return simulation.editedObjects.some((object) => (
    object.objectTypeId === edit.objectTypeId
    && (!edit.objectId || object.objectId === edit.objectId)
    && objectMatchesProperties(object, edit.properties)
  ));
}

function ontologySimulationScore(actual: unknown, expected: unknown) {
  const simulation = ontologySimulationFromValue(actual);
  if (!simulation) return undefined;
  const expectedEdits = ontologyExpectedEdits(expected);
  if (expectedEdits.length === 0) return simulation.realOntologyMutated === false ? 1 : 0;
  const matches = expectedEdits.filter((edit) => ontologySimulationEditMatches(simulation, edit)).length;
  return expectedEdits.length === 0 ? 1 : matches / expectedEdits.length;
}

function levenshtein(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0) as number[]);
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[left.length][right.length];
}

function configObject(evaluator: EvaluationEvaluator) {
  return (typeof evaluator.config === 'object' && evaluator.config !== null ? evaluator.config : {}) as Record<string, unknown>;
}

function keywordsFromConfig(evaluator: EvaluationEvaluator, expected: unknown) {
  const config = configObject(evaluator);
  const configured = config.keywords;
  if (Array.isArray(configured)) return configured.map(String).filter(Boolean);
  if (typeof configured === 'string') return configured.split(',').map((entry) => entry.trim()).filter(Boolean);
  return stringValue(expected).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function rangeFromConfig(evaluator: EvaluationEvaluator, expected: unknown) {
  const config = configObject(evaluator);
  const expectedObject = typeof expected === 'object' && expected !== null && !Array.isArray(expected) ? expected as Record<string, unknown> : {};
  return {
    min: metricNumber(config.min ?? expectedObject.min),
    max: metricNumber(config.max ?? expectedObject.max),
  };
}

function temporalRangeFromConfig(evaluator: EvaluationEvaluator, expected: unknown) {
  const config = configObject(evaluator);
  const expectedObject = typeof expected === 'object' && expected !== null && !Array.isArray(expected) ? expected as Record<string, unknown> : {};
  return {
    min: Date.parse(String(config.min ?? expectedObject.min ?? '')),
    max: Date.parse(String(config.max ?? expectedObject.max ?? '')),
  };
}

function applyObjective(metricValue: boolean | number, evaluator: EvaluationEvaluator, defaultPassed: boolean) {
  return applyMetricObjective(metricValue, evaluator.objective, defaultPassed);
}

function applyMetricObjective(metricValue: boolean | number, rawObjective: unknown, defaultPassed: boolean) {
  const objective = (typeof rawObjective === 'object' && rawObjective !== null ? rawObjective : {}) as Record<string, unknown>;
  if (typeof metricValue === 'boolean') {
    return metricValue === (typeof objective.target === 'boolean' ? objective.target : true);
  }
  const min = metricNumber(objective.min);
  const max = metricNumber(objective.max);
  if (min !== undefined && metricValue < min) return false;
  if (max !== undefined && metricValue > max) return false;
  const threshold = metricNumber(objective.threshold ?? objective.target);
  if (threshold === undefined) return defaultPassed;
  const direction = String(objective.direction ?? '').toLowerCase();
  if (direction === 'minimize') return metricValue <= threshold;
  if (direction === 'maximize') return metricValue >= threshold;
  return metricValue >= threshold;
}

function parameterType(parameter: EvaluationSignatureParameter) {
  return String(parameter.type ?? parameter.outputType ?? parameter.valueType ?? parameter.kind ?? '').trim().toLowerCase();
}

function nestedSignatureFields(parameter: EvaluationSignatureParameter): EvaluationSignatureParameter[] {
  const rawFields = parameter.fields ?? parameter.struct_fields ?? parameter.structFields ?? parameter.properties ?? parameter.outputs;
  return Array.isArray(rawFields)
    ? rawFields.filter((field): field is EvaluationSignatureParameter => typeof field === 'object' && field !== null && !Array.isArray(field))
    : [];
}

interface CustomEvaluatorReturnDefinition {
  name: string;
  path: string[];
  type: string;
}

function flattenReturnParameter(parameter: EvaluationSignatureParameter, parentPath: string[] = []): CustomEvaluatorReturnDefinition[] {
  const name = signatureName(parameter);
  const path = [...parentPath, name].filter(Boolean);
  const type = parameterType(parameter);
  const fields = nestedSignatureFields(parameter);
  if (fields.length > 0 || type === 'struct') {
    return fields.flatMap((field) => flattenReturnParameter(field, path));
  }
  return [{
    name: path.join('.') || name,
    path,
    type,
  }];
}

function returnSignatureOutputs(evaluator: EvaluationEvaluator) {
  return evaluator.return_signature?.outputs ?? evaluator.returnSignature?.outputs ?? [];
}

function flattenReturnSignature(evaluator: EvaluationEvaluator) {
  return returnSignatureOutputs(evaluator).flatMap((output) => flattenReturnParameter(output));
}

function isBooleanReturnType(type: string) {
  return type === 'boolean' || type === 'bool';
}

function isNumericReturnType(type: string) {
  return ['integer', 'long', 'short', 'float', 'double', 'numeric', 'number'].includes(type);
}

function isStringReturnType(type: string) {
  return ['string', 'str', 'text'].includes(type);
}

export function customEvaluatorMetricDefinitions(evaluator: EvaluationEvaluator) {
  return flattenReturnSignature(evaluator)
    .filter((definition) => isBooleanReturnType(definition.type) || isNumericReturnType(definition.type))
    .map((definition) => ({
      ...definition,
      metricKind: isBooleanReturnType(definition.type) ? 'boolean' as const : 'numeric' as const,
    }));
}

export function customEvaluatorDebugDefinitions(evaluator: EvaluationEvaluator) {
  return flattenReturnSignature(evaluator).filter((definition) => isStringReturnType(definition.type));
}

export function customEvaluatorFunctionRid(evaluator: EvaluationEvaluator) {
  return String(evaluator.function_rid ?? evaluator.functionRid ?? evaluator.evaluator ?? '').trim();
}

export function customEvaluatorFunctionKind(evaluator: EvaluationEvaluator) {
  const raw = String(evaluator.function_kind ?? evaluator.functionKind ?? 'typescript').trim().toLowerCase();
  if (raw === 'ts' || raw === 'typescript') return 'typescript';
  if (raw === 'py' || raw === 'python') return 'python';
  if (raw === 'logic' || raw === 'aip_logic') return 'logic';
  return raw;
}

export function validateCustomEvaluationFunction(evaluator: EvaluationEvaluator) {
  if (!isCustomEvaluationFunction(evaluator)) return [];
  const issues: string[] = [];
  const rid = customEvaluatorFunctionRid(evaluator);
  const functionKind = customEvaluatorFunctionKind(evaluator);
  if (!rid) issues.push(`Custom evaluator ${evaluator.id} needs a published function RID.`);
  if (!['typescript', 'python', 'logic'].includes(functionKind)) {
    issues.push(`Custom evaluator ${evaluator.id} must be a TypeScript, Python, or Logic function.`);
  }
  if (String(evaluator.version ?? 'published').toLowerCase() !== 'published') {
    issues.push(`Custom evaluator ${evaluator.id} must use a published function version.`);
  }
  if (String(evaluator.kind ?? '').toLowerCase().startsWith('marketplace')) {
    const status = String(evaluator.marketplace_install_status ?? evaluator.marketplaceInstallStatus ?? '').toLowerCase();
    if (status && status !== 'installed') {
      issues.push(`Marketplace evaluator ${evaluator.id} must be installed before it can run.`);
    }
  }
  if (returnSignatureOutputs(evaluator).length === 0) {
    issues.push(`Custom evaluator ${evaluator.id} needs a return signature.`);
  }
  if (customEvaluatorMetricDefinitions(evaluator).length === 0) {
    issues.push(`Custom evaluator ${evaluator.id} must return at least one Boolean or numeric metric.`);
  }
  return issues;
}

function customMetricObjective(evaluator: EvaluationEvaluator, metricName: string) {
  const objectives = evaluator.metric_objectives ?? evaluator.metricObjectives ?? {};
  const leafName = metricName.split('.').at(-1) ?? metricName;
  return objectives[metricName] ?? objectives[leafName] ?? evaluator.objective;
}

function simulatedCustomMetricValue(kind: 'boolean' | 'numeric', actual: unknown, expected: unknown) {
  const ontologyScore = ontologySimulationScore(actual, expected);
  if (ontologyScore !== undefined) {
    return kind === 'boolean' ? ontologyScore === 1 : ontologyScore;
  }
  const matched = deepEqual(actual, expected);
  if (kind === 'boolean') {
    if (matched) return true;
    const actualText = stringValue(actual).toLowerCase();
    const expectedText = stringValue(expected).toLowerCase();
    return expectedText.length > 0 && actualText.includes(expectedText);
  }
  const actualNumber = metricNumber(actual);
  const expectedNumber = metricNumber(expected);
  if (actualNumber !== undefined && expectedNumber !== undefined) {
    if (actualNumber === expectedNumber) return 1;
    return Math.max(0, 1 - Math.abs(actualNumber - expectedNumber) / Math.max(1, Math.abs(expectedNumber)));
  }
  if (matched) return 1;
  const actualText = stringValue(actual).toLowerCase();
  const expectedText = stringValue(expected).toLowerCase();
  return expectedText.length > 0 && actualText.includes(expectedText) ? 1 : 0;
}

function evaluateCustomFunctionEvaluator(
  evaluator: EvaluationEvaluator,
  targetId: string,
  testCase: EvaluationTestCase,
  mapping: Record<string, string>,
  iteration?: number,
): { metrics: BuiltInMetricResult[]; debugOutputs: CustomEvaluatorDebugOutput[] } {
  const expected = testCase.values[mapping.expected];
  const actual = testCase.values[mapping.actual] ?? expected;
  const functionRid = customEvaluatorFunctionRid(evaluator);
  const functionKind = customEvaluatorFunctionKind(evaluator);
  const metricDefinitions = customEvaluatorMetricDefinitions(evaluator);
  const metrics = metricDefinitions.map((definition) => {
    const metricValue = simulatedCustomMetricValue(definition.metricKind, actual, expected);
    const defaultPassed = typeof metricValue === 'boolean' ? metricValue : metricValue >= 0.5;
    const passed = applyMetricObjective(metricValue, customMetricObjective(evaluator, definition.name), defaultPassed);
    return {
      evaluatorId: evaluator.id,
      evaluator: 'custom_function',
      metricName: definition.name,
      customFunctionRid: functionRid,
      targetId,
      testCaseId: testCase.id,
      iteration,
      metricValue,
      passed,
      actual,
      expected,
      actualName: mapping.actual,
      expectedName: mapping.expected,
      reason: `${functionKind} evaluator ${functionRid} returned ${definition.metricKind} metric ${definition.name}.`,
    };
  });
  const debugOutputs = customEvaluatorDebugDefinitions(evaluator).map((definition) => ({
    evaluatorId: evaluator.id,
    evaluatorRid: functionRid,
    evaluatorKind: functionKind,
    targetId,
    testCaseId: testCase.id,
    iteration,
    name: definition.name,
    value: `${definition.name}: actual=${stringValue(actual)} expected=${stringValue(expected)}`,
  }));
  return { metrics, debugOutputs };
}

function metricForEvaluator(evaluator: EvaluationEvaluator, actual: unknown, expected: unknown): { value: boolean | number; defaultPassed: boolean; reason: string } {
  const name = normalizeEvaluatorName(evaluator.evaluator);
  if (name === 'exact_match') {
    const matched = deepEqual(actual, expected);
    return { value: matched, defaultPassed: matched, reason: matched ? 'Exact value matched expected value.' : 'Actual value differs from expected value.' };
  }
  if (name === 'regex') {
    const pattern = String(configObject(evaluator).pattern ?? expected ?? '');
    try {
      const matched = pattern ? new RegExp(pattern).test(stringValue(actual)) : false;
      return { value: matched, defaultPassed: matched, reason: matched ? 'Actual value matched regex.' : 'Actual value did not match regex.' };
    } catch {
      return { value: false, defaultPassed: false, reason: 'Regex pattern is invalid.' };
    }
  }
  if (name === 'distance') {
    const distance = levenshtein(stringValue(actual), stringValue(expected));
    return { value: distance, defaultPassed: distance === 0, reason: `Levenshtein distance is ${distance}.` };
  }
  if (name === 'length') {
    const length = Array.isArray(actual) ? actual.length : stringValue(actual).length;
    return { value: length, defaultPassed: length > 0, reason: `Actual length is ${length}.` };
  }
  if (name === 'keyword') {
    const actualText = stringValue(actual).toLowerCase();
    const keywords = keywordsFromConfig(evaluator, expected);
    const hits = keywords.filter((keyword) => actualText.includes(keyword.toLowerCase())).length;
    return { value: hits, defaultPassed: keywords.length > 0 && hits === keywords.length, reason: `${hits}/${keywords.length} keywords found.` };
  }
  if (name === 'object_match') {
    const matched = deepEqual(actual, expected);
    return { value: matched, defaultPassed: matched, reason: matched ? 'Object matched expected object.' : 'Object differs from expected object.' };
  }
  if (name === 'object_set_match') {
    const actualItems = Array.isArray(actual) ? actual : [actual];
    const expectedItems = Array.isArray(expected) ? expected : [expected];
    const hits = expectedItems.filter((item) => actualItems.some((candidate) => deepEqual(candidate, item))).length;
    const ratio = expectedItems.length === 0 ? 1 : hits / expectedItems.length;
    return { value: ratio, defaultPassed: ratio === 1, reason: `${hits}/${expectedItems.length} expected objects found.` };
  }
  if (name === 'integer_range' || name === 'numeric_range' || name === 'floating_point_range') {
    const value = metricNumber(actual);
    const { min, max } = rangeFromConfig(evaluator, expected);
    const inRange = value !== undefined && (min === undefined || value >= min) && (max === undefined || value <= max);
    return { value: inRange, defaultPassed: inRange, reason: value === undefined ? 'Actual value is not numeric.' : `Actual value ${value} checked against range.` };
  }
  const value = Date.parse(stringValue(actual));
  const { min, max } = temporalRangeFromConfig(evaluator, expected);
  const inRange = Number.isFinite(value) && (Number.isNaN(min) || value >= min) && (Number.isNaN(max) || value <= max);
  return { value: inRange, defaultPassed: inRange, reason: Number.isFinite(value) ? 'Actual timestamp checked against range.' : 'Actual value is not a timestamp.' };
}

function mappingsForEvaluator(evaluator: EvaluationEvaluator, targets: EvaluationTargetFunction[]) {
  if (evaluator.target_mappings) return evaluator.target_mappings;
  if (evaluator.targetMappings) return evaluator.targetMappings;
  const targetId = evaluator.target_id ?? evaluator.targetId ?? targets[0]?.id;
  return targetId && evaluator.mappings ? { [targetId]: evaluator.mappings } : {};
}

function signatureName(parameter: { apiName?: string; name?: string; id?: string }) {
  return parameter.apiName ?? parameter.name ?? parameter.id ?? '';
}

export function evaluationTargetVersionOptions(target: EvaluationTargetFunction) {
  if (target.kind === 'logic') {
    return [
      { value: 'last_saved', label: 'Last saved Logic' },
      { value: 'published', label: 'Published Logic' },
    ];
  }
  return [{ value: 'published', label: 'Published function' }];
}

export function defaultEvaluationTargetVersion(target: EvaluationTargetFunction) {
  if (target.kind !== 'logic') return 'published';
  const version = String(target.version ?? '').toLowerCase();
  if (version.includes('last_saved') || version === 'draft' || version === 'current') return 'last_saved';
  return 'published';
}

function targetVersionAvailable(target: EvaluationTargetFunction, version: string) {
  if (target.kind === 'logic') return version === 'last_saved' || version === 'published';
  return version === 'published';
}

function ontologyEditVerificationAvailable(
  target: EvaluationTargetFunction,
  evaluators: EvaluationEvaluator[],
  intermediateNames: Set<string>,
) {
  const ontologyOutputs = new Set(target.signature.outputs.filter(outputIsOntologyEditBundle).map((output) => signatureName(output)));
  if (ontologyOutputs.size === 0) return true;
  return evaluators.some((evaluator) => {
    const mapping = mappingsForEvaluator(evaluator, [target])[target.id];
    if (!mapping?.actual) return false;
    if (intermediateNames.has(mapping.actual)) return true;
    return ontologyOutputs.has(mapping.actual) && isCustomEvaluationFunction(evaluator);
  });
}

function targetInvocationComputeSeconds(target: EvaluationTargetFunction) {
  if (target.kind === 'agent_like') return 16;
  if (target.kind === 'code_function') return 4;
  return 12;
}

const PARALLELIZATION_RATE_LIMIT_THRESHOLD = 8;

export function evaluationTargetIsLLMBacked(target: EvaluationTargetFunction): boolean {
  if (target.kind === 'agent_like' || target.kind === 'logic') return true;
  const flag = target['llmBacked'] ?? target['llm_backed'];
  return flag === true;
}

export function evaluationEvaluatorIsLLMBacked(evaluator: EvaluationEvaluator): boolean {
  if (!isCustomEvaluationFunction(evaluator)) return false;
  const kind = customEvaluatorFunctionKind(evaluator);
  if (kind === 'logic') return true;
  const flag = evaluator['llmBacked'] ?? evaluator['llm_backed'];
  return flag === true;
}

export function computeEvaluationRunWarnings(
  suite: {
    targetFunctions: EvaluationTargetFunction[];
    testCases: EvaluationTestCase[];
    evaluators: EvaluationEvaluator[];
  },
  config: BuiltInEvaluationRunConfig,
  targetFunctions: EvaluationTargetFunction[],
  iterations: number,
  parallelization: number,
): BuiltInEvaluationRunWarning[] {
  const warnings: BuiltInEvaluationRunWarning[] = [];
  const hasLLMBackedTarget = targetFunctions.some(evaluationTargetIsLLMBacked);
  const hasLLMBackedEvaluator = suite.evaluators.some(evaluationEvaluatorIsLLMBacked);
  if (iterations === 1 && (hasLLMBackedTarget || hasLLMBackedEvaluator)) {
    warnings.push({
      code: 'llm_iteration_recommendation',
      message: 'LLM-backed functions produce non-deterministic outputs; configure multiple iterations to capture variance before publishing.',
    });
  }
  if (parallelization > PARALLELIZATION_RATE_LIMIT_THRESHOLD) {
    warnings.push({
      code: 'parallelization_rate_limit',
      message: `Test parallelization ${parallelization} may exceed model/tool rate limits. Reduce to ${PARALLELIZATION_RATE_LIMIT_THRESHOLD} or below or check rate-limit headroom before running.`,
    });
  }
  if (parallelization < 1) {
    warnings.push({
      code: 'parallelization_disabled',
      message: 'Test parallelization must be at least 1. Falling back to sequential execution.',
    });
  }
  if (config.inputMappings) {
    targetFunctions.forEach((target) => {
      const mapping = config.inputMappings?.[target.id] ?? {};
      const missing = target.signature.inputs
        .map((input) => signatureName(input))
        .filter((name) => name && !(name in mapping));
      if (Object.keys(mapping).length > 0 && missing.length > 0) {
        warnings.push({
          code: 'input_mapping_missing',
          targetId: target.id,
          message: `Target ${target.id} has unmapped inputs: ${missing.join(', ')}. Falling back to identity mapping for those inputs.`,
        });
      }
    });
  }
  return warnings;
}

function resolveInputMappings(
  targetFunctions: EvaluationTargetFunction[],
  configured?: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const resolved: Record<string, Record<string, string>> = {};
  targetFunctions.forEach((target) => {
    const inputs = target.signature.inputs.map((input) => signatureName(input)).filter(Boolean);
    const requested = configured?.[target.id] ?? {};
    resolved[target.id] = Object.fromEntries(inputs.map((name) => [name, requested[name] ?? name]));
  });
  return resolved;
}

function evaluatorInvocationComputeSeconds(evaluator: EvaluationEvaluator) {
  if (!isCustomEvaluationFunction(evaluator)) return 1;
  return customEvaluatorFunctionKind(evaluator) === 'logic' ? 12 : 4;
}

export function estimateEvaluationRunComputeUsage(suite: {
  id?: string;
  targetFunctions: EvaluationTargetFunction[];
  testCases: EvaluationTestCase[];
  evaluators: EvaluationEvaluator[];
}, config: BuiltInEvaluationRunConfig = {}): LogicComputeUsageSummary {
  const includedTargetIds = new Set(config.targetIds ?? suite.targetFunctions.map((target) => target.id));
  const includedTestCaseIds = new Set(config.testCaseIds ?? suite.testCases.map((testCase) => testCase.id));
  const targetFunctions = suite.targetFunctions.filter((target) => includedTargetIds.has(target.id));
  const testCases = suite.testCases.filter((testCase) => includedTestCaseIds.has(testCase.id));
  const iterations = Math.max(1, Math.min(10, Math.floor(config.iterations ?? 1)));
  const runCount = Math.max(1, targetFunctions.length) * Math.max(1, testCases.length) * iterations;
  const attribution: LogicComputeUsageAttribution = {
    ...config.attribution,
    invocationSurface: config.attribution?.invocationSurface ?? 'eval_run',
    evalRunId: config.attribution?.evalRunId ?? suite.id,
  };
  const targetLineItems: LogicComputeUsageLineItem[] = targetFunctions.map((target) => ({
    id: `eval:${suite.id ?? 'suite'}:target:${target.id}`,
    category: 'eval_target_invocation',
    label: `Target function ${target.id}`,
    computeSeconds: targetInvocationComputeSeconds(target) * Math.max(1, testCases.length) * iterations,
    runMultiplier: Math.max(1, testCases.length) * iterations,
    downstreamSystem: target.kind === 'code_function' ? 'function_execution' : undefined,
    attribution,
  }));
  const evaluatorLineItems: LogicComputeUsageLineItem[] = suite.evaluators.flatMap((evaluator) => {
    const targetInvocationCount = targetFunctions.filter((target) => mappingsForEvaluator(evaluator, targetFunctions)[target.id]).length;
    const invocations = targetInvocationCount * testCases.length * iterations;
    if (invocations === 0) return [];
    const custom = isCustomEvaluationFunction(evaluator);
    return [{
      id: `eval:${suite.id ?? 'suite'}:evaluator:${evaluator.id}`,
      category: 'eval_evaluator_invocation',
      label: custom ? `Custom evaluator ${customEvaluatorFunctionRid(evaluator)}` : `Built-in evaluator ${builtInEvaluatorOption(evaluator.evaluator).label}`,
      computeSeconds: evaluatorInvocationComputeSeconds(evaluator) * invocations,
      runMultiplier: invocations,
      downstreamSystem: custom ? 'function_execution' : undefined,
      attribution,
    }];
  });
  return summarizeLogicComputeUsage([...targetLineItems, ...evaluatorLineItems], {
    runCount,
    attribution,
    warningContext: 'Evaluation suite run',
  });
}

function expectedValuesByOutput(target: EvaluationTargetFunction, evaluators: EvaluationEvaluator[], testCase: EvaluationTestCase) {
  const values = new Map<string, unknown>();
  evaluators.forEach((evaluator) => {
    const mapping = mappingsForEvaluator(evaluator, [target])[target.id];
    if (!mapping?.actual || !mapping.expected) return;
    values.set(mapping.actual, testCase.values[mapping.expected]);
  });
  return values;
}

function simulatedTargetOutput(target: EvaluationTargetFunction, version: string, testCase: EvaluationTestCase, expected: unknown) {
  if (target.kind === 'logic' && version === 'last_saved') return expected ?? 'Expected result';
  if (expected !== undefined && typeof expected !== 'string') return expected;
  const inputText = Object.values(testCase.values)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (inputText.includes('praise') || inputText.includes('resolved') || inputText.includes('close without')) {
    return 'Close without escalation';
  }
  if (typeof expected === 'string' && expected.trim()) return expected;
  if (target.kind === 'code_function') return inputText.includes('late') || inputText.includes('sla') ? 'Escalate' : 'Review';
  return inputText.includes('late') || inputText.includes('sla') ? 'Escalate with service recovery follow-up.' : 'Proceed';
}

function testCaseWithTargetOutputs(
  target: EvaluationTargetFunction,
  version: string,
  testCase: EvaluationTestCase,
  evaluators: EvaluationEvaluator[],
  iteration = 1,
) {
  const expectedByOutput = expectedValuesByOutput(target, evaluators, testCase);
  const outputValues = Object.fromEntries(target.signature.outputs.map((output) => {
    const outputName = signatureName(output);
    const expected = expectedByOutput.get(outputName);
    if (outputIsOntologyEditBundle(output)) {
      return [
        outputName,
        ontologyEditBundleForTestCase(testCase, expected ?? testCase.values.expectedOntologyEdits ?? testCase.values.expectedOntologyEdit, `${target.id}:${testCase.id}:${outputName}:${iteration}`),
      ];
    }
    return [
      outputName,
      expectedByOutput.has(outputName)
        ? simulatedTargetOutput(target, version, testCase, expected)
        : testCase.values[outputName] ?? simulatedTargetOutput(target, version, testCase, expected),
    ];
  }));
  return {
    ...testCase,
    values: {
      ...testCase.values,
      ...outputValues,
    },
  };
}

export function evaluateBuiltInEvaluator(evaluator: EvaluationEvaluator, targetId: string, testCase: EvaluationTestCase, mapping: Record<string, string>): BuiltInMetricResult {
  const evaluatorName = normalizeEvaluatorName(evaluator.evaluator);
  const option = builtInEvaluatorOption(evaluatorName);
  const expected = testCase.values[mapping.expected];
  const actual = testCase.values[mapping.actual] ?? expected;
  const metric = metricForEvaluator(evaluator, actual, expected);
  const passed = applyObjective(metric.value, evaluator, metric.defaultPassed);
  return {
    evaluatorId: evaluator.id,
    evaluator: evaluatorName,
    metricName: option.metric,
    targetId,
    testCaseId: testCase.id,
    metricValue: metric.value,
    passed,
    actual,
    expected,
    actualName: mapping.actual,
    expectedName: mapping.expected,
    reason: metric.reason,
  };
}

function evaluateEvaluator(
  evaluator: EvaluationEvaluator,
  targetId: string,
  testCase: EvaluationTestCase,
  mapping: Record<string, string>,
  iteration?: number,
): { metrics: BuiltInMetricResult[]; debugOutputs: CustomEvaluatorDebugOutput[] } {
  if (isCustomEvaluationFunction(evaluator)) {
    return evaluateCustomFunctionEvaluator(evaluator, targetId, testCase, mapping, iteration);
  }
  if (!isBuiltInEvaluator(evaluator)) return { metrics: [], debugOutputs: [] };
  const metric = evaluateBuiltInEvaluator(evaluator, targetId, testCase, mapping);
  return {
    metrics: [{ ...metric, iteration }],
    debugOutputs: [],
  };
}

function summarizeBuiltInMetrics(
  testCases: EvaluationTestCase[],
  metricRows: BuiltInMetricResult[],
  debugOutputs: CustomEvaluatorDebugOutput[] = [],
): BuiltInEvaluationSummary {
  const iterationMap = new Map<string, BuiltInMetricResult[]>();
  metricRows.forEach((metric) => {
    const key = `${metric.testCaseId}:${metric.targetId}:${metric.iteration ?? 1}`;
    iterationMap.set(key, [...(iterationMap.get(key) ?? []), metric]);
  });
  const debugOutputMap = new Map<string, CustomEvaluatorDebugOutput[]>();
  debugOutputs.forEach((debugOutput) => {
    const key = `${debugOutput.testCaseId}:${debugOutput.targetId}:${debugOutput.iteration ?? 1}`;
    debugOutputMap.set(key, [...(debugOutputMap.get(key) ?? []), debugOutput]);
  });
  const iterationKeys = new Set([...iterationMap.keys(), ...debugOutputMap.keys()]);
  const iterationResults = Array.from(iterationKeys).map((id) => {
    const metrics = iterationMap.get(id) ?? [];
    const iterationDebugOutputs = debugOutputMap.get(id) ?? [];
    return {
      id,
      targetId: metrics[0]?.targetId ?? iterationDebugOutputs[0]?.targetId ?? '',
      testCaseId: metrics[0]?.testCaseId ?? iterationDebugOutputs[0]?.testCaseId ?? '',
      passed: metrics.length > 0 && metrics.every((metric) => metric.passed),
      metrics,
      debugOutputs: iterationDebugOutputs,
    };
  });
  const testCaseResults = testCases.map((testCase) => {
    const iterations = iterationResults.filter((iteration) => iteration.testCaseId === testCase.id);
    return {
      testCaseId: testCase.id,
      name: testCase.name,
      iterations,
      passed: iterations.length > 0 && iterations.every((iteration) => iteration.passed),
    };
  });
  const metricKeyRows = new Map<string, BuiltInMetricResult[]>();
  metricRows.forEach((metric) => {
    const key = `${metric.evaluatorId}:${metric.targetId}:${metric.metricName ?? metric.evaluator}`;
    metricKeyRows.set(key, [...(metricKeyRows.get(key) ?? []), metric]);
  });
  const metricResults = Array.from(metricKeyRows.values()).map((metrics) => {
    const passCount = metrics.filter((metric) => metric.passed).length;
    const firstMetric = metrics[0];
    return {
      evaluatorId: firstMetric.evaluatorId,
      evaluator: firstMetric.evaluator,
      metricName: firstMetric.metricName,
      customFunctionRid: firstMetric.customFunctionRid,
      targetId: firstMetric.targetId,
      passed: passCount === metrics.length,
      passCount,
      totalCount: metrics.length,
      passRate: metrics.length === 0 ? 0 : passCount / metrics.length,
    };
  });
  const passCount = testCaseResults.filter((result) => result.passed).length;
  return {
    metricResults,
    iterationResults,
    testCaseResults,
    customEvaluatorDebugOutputs: debugOutputs,
    passCount,
    totalCount: testCaseResults.length,
    passRate: testCaseResults.length === 0 ? 0 : passCount / testCaseResults.length,
  };
}

function collectIntermediateParameterNames(suite: {
  targetFunctions: EvaluationTargetFunction[];
  testCaseColumns?: EvaluationSuiteColumn[];
}) {
  const names = new Set<string>();
  suite.testCaseColumns
    ?.filter((column) => String(column.role).toLowerCase() === 'intermediate_parameter')
    .forEach((column) => names.add(column.apiName));
  suite.targetFunctions.forEach((target) => {
    target.signature.outputs.forEach((output) => {
      if (output['intermediateParameter'] === true || output['intermediate_parameter'] === true) {
        const name = signatureName(output);
        if (name) names.add(name);
      }
    });
  });
  return names;
}

function valuesForNames(names: Iterable<string>, testCase: EvaluationTestCase, metrics: BuiltInMetricResult[]) {
  return Object.fromEntries(Array.from(names).flatMap((name) => {
    const metric = metrics.find((candidate) => candidate.actualName === name);
    const value = metric?.actual ?? testCase.values[name];
    return value === undefined ? [] : [[name, value]];
  }));
}

interface RunnableEvaluationIteration {
  targetId: string;
  testCaseId: string;
  iteration: number;
  testCase: EvaluationTestCase;
}

function firstOntologySimulation(values: Record<string, unknown>) {
  return Object.values(values).map((value) => ontologySimulationFromValue(value)).find(Boolean);
}

function buildEvaluationResultDatasetRows(
  suite: {
    targetFunctions: EvaluationTargetFunction[];
    testCases: EvaluationTestCase[];
    testCaseColumns?: EvaluationSuiteColumn[];
  },
  summary: BuiltInEvaluationSummary,
  runnableIterations: RunnableEvaluationIteration[] = [],
): BuiltInEvaluationResultDatasetRow[] {
  const testCasesById = new Map(suite.testCases.map((testCase) => [testCase.id, testCase]));
  const targetById = new Map(suite.targetFunctions.map((target) => [target.id, target]));
  const runnableByKey = new Map(runnableIterations.map((row) => [`${row.testCaseId}:${row.targetId}:${row.iteration}`, row.testCase]));
  const intermediateNames = collectIntermediateParameterNames(suite);
  return summary.iterationResults.map((iteration) => {
    const iterationNumber = Number(iteration.id.split(':').at(-1)) || 1;
    const testCase = runnableByKey.get(`${iteration.testCaseId}:${iteration.targetId}:${iterationNumber}`) ?? testCasesById.get(iteration.testCaseId);
    const target = targetById.get(iteration.targetId);
    const outputNames = target?.signature.outputs.map((output) => signatureName(output)).filter(Boolean) ?? [];
    const inputNames = target?.signature.inputs.map((input) => signatureName(input)).filter(Boolean) ?? [];
    const outputs = testCase ? valuesForNames(outputNames, testCase, iteration.metrics) : {};
    return {
      id: `${iteration.testCaseId}:${iteration.targetId}:${iterationNumber}`,
      testCaseId: iteration.testCaseId,
      targetId: iteration.targetId,
      iteration: iterationNumber,
      status: iteration.passed ? 'passed' : 'failed',
      inputs: testCase ? valuesForNames(inputNames, testCase, []) : {},
      outputs,
      intermediateParameters: testCase ? valuesForNames(intermediateNames, testCase, iteration.metrics) : {},
      ontologySimulation: firstOntologySimulation(outputs),
      metrics: iteration.metrics,
      debugOutputs: iteration.debugOutputs,
    };
  });
}

export function evaluateEvaluationSuiteBuiltIns(suite: {
  targetFunctions: EvaluationTargetFunction[];
  testCaseColumns?: EvaluationSuiteColumn[];
  testCases: EvaluationTestCase[];
  evaluators: EvaluationEvaluator[];
}): BuiltInEvaluationSummary {
  const evaluatedRows = suite.testCases.flatMap((testCase) => suite.targetFunctions.flatMap((target) => {
    const runnableTestCase = testCaseWithTargetOutputs(target, defaultEvaluationTargetVersion(target), testCase, suite.evaluators);
    return suite.evaluators.flatMap((evaluator) => {
      const mapping = mappingsForEvaluator(evaluator, suite.targetFunctions)[target.id];
      return mapping ? [evaluateEvaluator(evaluator, target.id, runnableTestCase, mapping)] : [];
    });
  }));
  return summarizeBuiltInMetrics(
    suite.testCases,
    evaluatedRows.flatMap((row) => row.metrics),
    evaluatedRows.flatMap((row) => row.debugOutputs),
  );
}

function targetModelFromConfig(
  target: EvaluationTargetFunction,
  configured?: Record<string, string>,
  metadataModel?: string,
): string | undefined {
  const requested = configured?.[target.id];
  if (typeof requested === 'string' && requested.trim() !== '') return requested.trim();
  const fromTarget = (target['model'] ?? target['modelProviderId'] ?? target['modelId']);
  if (typeof fromTarget === 'string' && fromTarget.trim() !== '') return fromTarget.trim();
  return metadataModel?.trim() ? metadataModel.trim() : undefined;
}

function resolveTargetModels(
  targetFunctions: EvaluationTargetFunction[],
  configured?: Record<string, string>,
  metadataModel?: string,
): Record<string, string> {
  return Object.fromEntries(targetFunctions.flatMap((target) => {
    const model = targetModelFromConfig(target, configured, metadataModel);
    return model ? [[target.id, model]] : [];
  }));
}

export function evaluationRunMultiTargetCapabilities(
  suite: { targetFunctions: EvaluationTargetFunction[] },
  config: { targetIds?: string[] } = {},
): MultiTargetRunCapabilities {
  const includedTargetIds = config.targetIds ?? suite.targetFunctions.map((target) => target.id);
  const allTargetIds = suite.targetFunctions.map((target) => target.id);
  const excludedTargetIds = allTargetIds.filter((id) => !includedTargetIds.includes(id));
  const multiTarget = includedTargetIds.length > 1;
  const disabledExperimentOptions: MultiTargetDisabledOption[] = multiTarget
    ? [
        {
          option: 'per_target_prompt_sweep',
          reason: 'Per-target prompt sweeps require a single target; switch to one target before running this experiment.',
        },
        {
          option: 'single_target_grid_search',
          reason: 'Single-target grid search is unavailable when multiple targets are included in the same run.',
        },
        {
          option: 'per_target_evaluator_threshold_sweep',
          reason: 'Sweeping evaluator thresholds against a specific target output is disabled while multiple targets are included; sweep one target at a time.',
        },
      ]
    : [];
  return {
    multiTarget,
    includedTargetIds,
    excludedTargetIds,
    disabledExperimentOptions,
  };
}

function metricValueNumber(value: boolean | number): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number.isFinite(value) ? value : 0;
}

function metricKey(metric: BuiltInMetricResult) {
  return `${metric.evaluatorId}:${metric.metricName ?? metric.evaluator}`;
}

export function buildMultiTargetRunComparison(
  suite: { targetFunctions: EvaluationTargetFunction[] },
  run: Pick<BuiltInEvaluationRunResult, 'iterationResults' | 'metricResults' | 'config' | 'testCaseResults'>,
): MultiTargetRunComparison {
  const targetById = new Map(suite.targetFunctions.map((target) => [target.id, target]));
  const includedTargets = run.config.targetIds.map((id) => targetById.get(id)).filter((target): target is EvaluationTargetFunction => !!target);
  const multiTarget = includedTargets.length > 1;
  const targetSummaries: MultiTargetTargetSummary[] = includedTargets.map((target) => {
    const targetIterations = run.iterationResults.filter((iteration) => iteration.targetId === target.id);
    const passCount = targetIterations.filter((iteration) => iteration.passed).length;
    const totalCount = targetIterations.length;
    return {
      targetId: target.id,
      kind: target.kind,
      version: run.config.targetVersions[target.id] ?? defaultEvaluationTargetVersion(target),
      model: run.config.targetModels[target.id],
      passCount,
      totalCount,
      passRate: totalCount === 0 ? 0 : passCount / totalCount,
      failureCount: Math.max(0, totalCount - passCount),
    };
  });
  const metricBuckets = new Map<string, BuiltInMetricResult[]>();
  run.iterationResults.forEach((iteration) => {
    iteration.metrics.forEach((metric) => {
      const key = metricKey(metric);
      metricBuckets.set(key, [...(metricBuckets.get(key) ?? []), metric]);
    });
  });
  const metricComparisons: MultiTargetMetricComparison[] = Array.from(metricBuckets.values()).map((metrics) => {
    const sample = metrics[0];
    const perTargetMap = new Map<string, BuiltInMetricResult[]>();
    metrics.forEach((metric) => {
      perTargetMap.set(metric.targetId, [...(perTargetMap.get(metric.targetId) ?? []), metric]);
    });
    const perTarget = Array.from(perTargetMap.entries()).map(([targetId, rows]) => {
      const passCount = rows.filter((row) => row.passed).length;
      const totalCount = rows.length;
      const numericValues = rows.map((row) => metricValueNumber(row.metricValue));
      const average = numericValues.length === 0 ? undefined : numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
      const target = targetById.get(targetId);
      return {
        targetId,
        version: run.config.targetVersions[targetId] ?? (target ? defaultEvaluationTargetVersion(target) : 'published'),
        model: run.config.targetModels[targetId],
        passCount,
        totalCount,
        passRate: totalCount === 0 ? 0 : passCount / totalCount,
        average,
      };
    });
    perTarget.sort((a, b) => b.passRate - a.passRate || (b.average ?? 0) - (a.average ?? 0));
    return {
      evaluatorId: sample.evaluatorId,
      metricName: sample.metricName ?? sample.evaluator,
      perTarget,
      bestTargetId: perTarget[0]?.targetId,
      worstTargetId: perTarget.length > 1 ? perTarget[perTarget.length - 1].targetId : undefined,
    };
  });
  const sortedTargets = [...targetSummaries].sort((a, b) => b.passRate - a.passRate || a.targetId.localeCompare(b.targetId));
  return {
    multiTarget,
    targetSummaries: sortedTargets,
    metricComparisons,
    bestTargetId: sortedTargets[0]?.targetId,
    worstTargetId: sortedTargets.length > 1 ? sortedTargets[sortedTargets.length - 1].targetId : undefined,
  };
}

const RESULTS_DATASET_DEFAULT_MAX_ROWS = 50_000;

function safeDatasetSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

export function evaluationResultsDatasetRid(projectId: string, suiteId?: string): string {
  const projectSlug = safeDatasetSlug(projectId);
  const suiteSlug = suiteId ? safeDatasetSlug(suiteId) : 'suite';
  return `ri.foundry.dataset.aip-eval-results.${projectSlug}.${suiteSlug}`;
}

function targetReturnsOnlyOntologyEdits(target: EvaluationTargetFunction): boolean {
  const outputs = target.signature.outputs ?? [];
  if (outputs.length === 0) return false;
  return outputs.every(outputIsOntologyEditBundle);
}

export function evaluationResultsDatasetUnsupportedTargets(suite: {
  targetFunctions: EvaluationTargetFunction[];
}): EvaluationResultsDatasetUnsupportedTarget[] {
  return suite.targetFunctions.filter(targetReturnsOnlyOntologyEdits).map((target) => ({
    targetId: target.id,
    reason: 'ontology_edits_only',
    message: `Target ${target.id} only returns Ontology edits, which are simulated per run and not written to the AIP Evals results dataset; verify them with a custom evaluator or intermediate parameter.`,
  }));
}

export function createEvaluationResultsDatasetConfig(
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[]; projectId?: string },
  overrides: { projectId?: string; datasetRid?: string; maxRows?: number } = {},
): EvaluationResultsDatasetConfig {
  const projectId = (overrides.projectId ?? suite.projectId ?? '').trim();
  const maxRows = Math.max(1, Math.floor(overrides.maxRows ?? RESULTS_DATASET_DEFAULT_MAX_ROWS));
  return {
    projectId,
    datasetRid: overrides.datasetRid?.trim() || evaluationResultsDatasetRid(projectId || 'project', suite.id),
    visibleTo: 'project_viewers',
    writeMode: 'append_and_prune',
    maxRows,
    unsupportedTargets: evaluationResultsDatasetUnsupportedTargets(suite),
    schema: [
      { name: 'run_id', type: 'string', permissionScoped: false },
      { name: 'evaluation_suite_id', type: 'string', permissionScoped: false },
      { name: 'test_case_id', type: 'string', permissionScoped: false },
      { name: 'test_case_name', type: 'string', permissionScoped: true },
      { name: 'target_id', type: 'string', permissionScoped: false },
      { name: 'target_kind', type: 'string', permissionScoped: false },
      { name: 'target_version', type: 'string', permissionScoped: false },
      { name: 'target_model', type: 'string', permissionScoped: true },
      { name: 'iteration', type: 'integer', permissionScoped: false },
      { name: 'status', type: 'string', permissionScoped: false },
      { name: 'inputs', type: 'json', permissionScoped: true },
      { name: 'outputs', type: 'json', permissionScoped: true },
      { name: 'intermediate_parameters', type: 'json', permissionScoped: true },
      { name: 'evaluator_results', type: 'json', permissionScoped: true },
      { name: 'custom_evaluator_debug_outputs', type: 'json', permissionScoped: true },
      { name: 'errors', type: 'json', permissionScoped: true },
      { name: 'user_metadata', type: 'json', permissionScoped: true },
      { name: 'auto_captured_metadata', type: 'json', permissionScoped: false },
      { name: 'ontology_simulation', type: 'json', permissionScoped: true },
      { name: 'started_at', type: 'timestamp', permissionScoped: false },
      { name: 'completed_at', type: 'timestamp', permissionScoped: false },
    ],
  };
}

function evaluatorResultRow(metric: BuiltInMetricResult): EvaluationResultsDatasetMetricRow {
  return {
    evaluatorId: metric.evaluatorId,
    evaluator: metric.evaluator,
    metricName: metric.metricName ?? metric.evaluator,
    metricValue: metric.metricValue,
    passed: metric.passed,
    customFunctionRid: metric.customFunctionRid,
  };
}

function debugOutputRow(debugOutput: CustomEvaluatorDebugOutput): EvaluationResultsDatasetDebugOutput {
  return {
    evaluatorId: debugOutput.evaluatorId,
    evaluatorRid: debugOutput.evaluatorRid,
    evaluatorKind: debugOutput.evaluatorKind,
    name: debugOutput.name,
    value: debugOutput.value,
  };
}

function errorRowsForRow(rowTargetId: string, rowTestCaseId: string, errors: BuiltInEvaluationRunError[]) {
  return errors
    .filter((error) => (error.targetId ?? rowTargetId) === rowTargetId && (error.testCaseId ?? rowTestCaseId) === rowTestCaseId)
    .map((error) => ({ message: error.message }));
}

interface BuildResultsDatasetRowsInput {
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[] };
  run: {
    id: string;
    config: BuiltInEvaluationRunResult['config'];
    startedAtIso: string;
    completedAtIso: string;
    resultDatasetRows: BuiltInEvaluationResultDatasetRow[];
    errors: BuiltInEvaluationRunError[];
  };
  datasetConfig: EvaluationResultsDatasetConfig;
  unsupportedTargetIds: Set<string>;
  testCaseNamesById: Map<string, string>;
}

function buildResultsDatasetRows(input: BuildResultsDatasetRowsInput): EvaluationResultsDatasetRow[] {
  const { suite, run, datasetConfig, unsupportedTargetIds, testCaseNamesById } = input;
  const targetById = new Map(suite.targetFunctions.map((target) => [target.id, target]));
  return run.resultDatasetRows
    .filter((row) => !unsupportedTargetIds.has(row.targetId))
    .map((row) => {
      const target = targetById.get(row.targetId);
      const debugOutputs = row.debugOutputs.map(debugOutputRow);
      const evaluatorRows = row.metrics.map(evaluatorResultRow);
      const errors = errorRowsForRow(row.targetId, row.testCaseId, run.errors);
      const testCaseName = testCaseNamesById.get(row.testCaseId) ?? row.testCaseId;
      const userMetadata: EvaluationResultsDatasetUserMetadata = {
        runInitiator: run.config.metadata.runInitiator,
        customLabels: run.config.metadata.customLabels ?? [],
        customMetadata: run.config.metadata.customMetadata ?? {},
        notes: run.config.metadata.notes,
      };
      const autoCapturedMetadata: EvaluationResultsDatasetAutoMetadata = {
        executionMode: run.config.executionMode,
        branchName: run.config.metadata.branchName,
        model: run.config.targetModels[row.targetId] ?? run.config.metadata.model,
        projectId: datasetConfig.projectId,
        startedAtIso: run.startedAtIso,
        completedAtIso: run.completedAtIso,
        source: run.config.source,
        iterations: run.config.iterations,
        parallelization: run.config.parallelization,
      };
      return {
        datasetRid: datasetConfig.datasetRid,
        runId: run.id,
        evaluationSuiteId: suite.id ?? '',
        testCaseId: row.testCaseId,
        testCaseName,
        targetId: row.targetId,
        targetKind: target?.kind ?? 'logic',
        targetVersion: run.config.targetVersions[row.targetId] ?? (target ? defaultEvaluationTargetVersion(target) : 'published'),
        targetModel: run.config.targetModels[row.targetId],
        iteration: row.iteration,
        status: row.status,
        inputs: row.inputs,
        outputs: row.outputs,
        intermediateParameters: row.intermediateParameters,
        evaluatorResults: evaluatorRows,
        customEvaluatorDebugOutputs: debugOutputs,
        errors,
        userMetadata,
        autoCapturedMetadata,
        ontologySimulation: row.ontologySimulation,
      };
    });
}

export function buildEvaluationResultsDatasetWrite(
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[]; projectId?: string; testCases: EvaluationTestCase[] },
  run: {
    id: string;
    config: BuiltInEvaluationRunResult['config'];
    startedAtIso: string;
    completedAtIso: string;
    resultDatasetRows: BuiltInEvaluationResultDatasetRow[];
    errors: BuiltInEvaluationRunError[];
  },
  overrides: { datasetRid?: string; projectId?: string; maxRows?: number } = {},
): EvaluationResultsDatasetWrite {
  const datasetConfig = createEvaluationResultsDatasetConfig(suite, overrides);
  const unsupportedTargetIds = new Set(datasetConfig.unsupportedTargets.map((target) => target.targetId));
  const includedTargetIds = new Set(run.config.targetIds);
  const supportedIncludedTargets = run.config.targetIds.filter((id) => !unsupportedTargetIds.has(id));
  const skippedRows = Array.from(includedTargetIds)
    .filter((id) => unsupportedTargetIds.has(id))
    .map((targetId) => ({ targetId, reason: 'ontology_edits_only' as const }));
  if (run.config.executionMode !== 'project_scoped') {
    return {
      config: datasetConfig,
      written: false,
      reason: 'user_scoped_execution_skipped',
      rows: [],
      skippedRows,
    };
  }
  if (!datasetConfig.projectId) {
    return {
      config: datasetConfig,
      written: false,
      reason: 'no_project_id',
      rows: [],
      skippedRows,
    };
  }
  if (supportedIncludedTargets.length === 0) {
    return {
      config: datasetConfig,
      written: false,
      reason: 'no_supported_target_outputs',
      rows: [],
      skippedRows,
    };
  }
  const testCaseNamesById = new Map(suite.testCases.map((testCase) => [testCase.id, testCase.name]));
  const rows = buildResultsDatasetRows({
    suite,
    run,
    datasetConfig,
    unsupportedTargetIds,
    testCaseNamesById,
  }).slice(0, datasetConfig.maxRows);
  return {
    config: datasetConfig,
    written: rows.length > 0,
    reason: 'project_scoped_execution',
    rows,
    skippedRows,
  };
}

function expectedValuesForRow(
  testCase: EvaluationTestCase | undefined,
  evaluators: EvaluationEvaluator[],
  targetId: string,
): Record<string, unknown> {
  if (!testCase) return {};
  const out: Record<string, unknown> = {};
  evaluators.forEach((evaluator) => {
    const mapping = mappingsForEvaluator(evaluator, [{ id: targetId } as EvaluationTargetFunction])[targetId];
    if (!mapping?.expected) return;
    const value = testCase.values[mapping.expected];
    if (value === undefined) return;
    out[mapping.expected] = value;
  });
  return out;
}

function evaluatorOutputsForRow(row: BuiltInEvaluationResultDatasetRow): EvaluationResultsTableEvaluatorOutput[] {
  return row.metrics.map((metric) => ({
    evaluatorId: metric.evaluatorId,
    evaluator: metric.evaluator,
    metricName: metric.metricName ?? metric.evaluator,
    metricValue: metric.metricValue,
    passed: metric.passed,
    actual: metric.actual,
    expected: metric.expected,
    actualName: metric.actualName,
    expectedName: metric.expectedName,
    reason: metric.reason,
    customFunctionRid: metric.customFunctionRid,
  }));
}

function debugOutputsForRow(row: BuiltInEvaluationResultDatasetRow): EvaluationResultsTableDebugOutput[] {
  return row.debugOutputs.map((debugOutput) => ({
    evaluatorId: debugOutput.evaluatorId,
    evaluatorRid: debugOutput.evaluatorRid,
    evaluatorKind: debugOutput.evaluatorKind,
    name: debugOutput.name,
    value: debugOutput.value,
  }));
}

function debuggerLinkFor(runId: string, testCaseId: string, targetId: string, iteration: number): string {
  return `/aip-evals/runs/${encodeURIComponent(runId)}/debug/${encodeURIComponent(testCaseId)}/${encodeURIComponent(targetId)}?iteration=${iteration}`;
}

export function buildEvaluationResultsTable(
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[]; testCases: EvaluationTestCase[]; evaluators: EvaluationEvaluator[] },
  run: Pick<BuiltInEvaluationRunResult, 'id' | 'resultDatasetRows' | 'errors' | 'metricResults' | 'passCount' | 'totalCount' | 'passRate' | 'config'>,
): EvaluationResultsTable {
  const targetById = new Map(suite.targetFunctions.map((target) => [target.id, target]));
  const testCaseById = new Map(suite.testCases.map((testCase) => [testCase.id, testCase]));
  const rows: EvaluationResultsTableRow[] = run.resultDatasetRows.map((row) => {
    const target = targetById.get(row.targetId);
    const testCase = testCaseById.get(row.testCaseId);
    const evaluatorOutputs = evaluatorOutputsForRow(row);
    const customEvaluatorDebugOutputs = debugOutputsForRow(row);
    const errors = errorRowsForRow(row.targetId, row.testCaseId, run.errors);
    return {
      id: row.id,
      testCaseId: row.testCaseId,
      testCaseName: testCase?.name ?? row.testCaseId,
      targetId: row.targetId,
      targetKind: target?.kind ?? 'logic',
      targetVersion: run.config.targetVersions[row.targetId] ?? (target ? defaultEvaluationTargetVersion(target) : 'published'),
      targetModel: run.config.targetModels[row.targetId],
      iteration: row.iteration,
      status: row.status,
      inputs: row.inputs,
      expectedValues: expectedValuesForRow(testCase, suite.evaluators, row.targetId),
      actualOutputs: row.outputs,
      intermediateParameters: row.intermediateParameters,
      evaluatorOutputs,
      customEvaluatorDebugOutputs,
      errors,
      debuggerHref: debuggerLinkFor(run.id, row.testCaseId, row.targetId, row.iteration),
    };
  });
  return {
    runId: run.id,
    totalCount: run.totalCount,
    passCount: run.passCount,
    failureCount: Math.max(0, run.totalCount - run.passCount),
    passRate: run.passRate,
    aggregateMetrics: run.metricResults,
    rows,
  };
}

function buildDebugTraceSteps(
  target: EvaluationTargetFunction | undefined,
  row: BuiltInEvaluationResultDatasetRow,
  runConfig: BuiltInEvaluationRunResult['config'],
  evaluatorOutputs: EvaluationResultsTableEvaluatorOutput[],
): EvaluationDebugTraceStep[] {
  if (!target) return [];
  const steps: EvaluationDebugTraceStep[] = [];
  if (target.kind === 'logic' || target.kind === 'agent_like') {
    steps.push({
      id: `${target.id}-logic-trace`,
      kind: 'logic_trace',
      label: target.kind === 'agent_like' ? 'Agent-like Logic trace' : 'Logic trace',
      description: `Inputs, configured target version, and model used to drive the ${target.kind === 'agent_like' ? 'agent-like' : 'Logic'} function during this iteration.`,
      payload: {
        target_id: target.id,
        version: runConfig.targetVersions[target.id] ?? defaultEvaluationTargetVersion(target),
        model: runConfig.targetModels[target.id] ?? runConfig.metadata.model,
        inputs: row.inputs,
        actual_outputs: row.outputs,
        intermediate_parameters: row.intermediateParameters,
      },
    });
  } else if (target.kind === 'code_function') {
    steps.push({
      id: `${target.id}-code-function-preview`,
      kind: 'code_function_preview',
      label: 'Code function preview',
      description: 'Function RID, signature, and the inputs/outputs captured for this iteration.',
      payload: {
        function_rid: target.function_rid ?? target.id,
        version: runConfig.targetVersions[target.id] ?? defaultEvaluationTargetVersion(target),
        signature: target.signature,
        inputs: row.inputs,
        actual_outputs: row.outputs,
      },
    });
  }
  if (Object.keys(row.intermediateParameters).length > 0) {
    steps.push({
      id: `${target.id}-intermediate-parameters`,
      kind: 'intermediate_parameters',
      label: 'Intermediate parameters',
      description: 'Exposed block outputs surfaced as intermediate parameters for evaluator inputs.',
      payload: { values: row.intermediateParameters },
    });
  }
  if (row.ontologySimulation) {
    steps.push({
      id: `${target.id}-ontology-simulation`,
      kind: 'ontology_simulation',
      label: 'Ontology simulation',
      description: 'Simulated Ontology edits applied for this iteration; the real Ontology was never mutated.',
      payload: {
        simulation_id: row.ontologySimulation.id,
        created_objects: row.ontologySimulation.createdObjects,
        edited_objects: row.ontologySimulation.editedObjects,
        deleted_objects: row.ontologySimulation.deletedObjects,
        safety: row.ontologySimulation.safety,
      },
    });
  }
  steps.push({
    id: `${target.id}-evaluator-trace`,
    kind: 'evaluator_trace',
    label: 'Evaluator trace',
    description: 'Per-evaluator metric breakdown for this iteration, including actual vs expected values and pass/fail reasoning.',
    payload: {
      evaluator_outputs: evaluatorOutputs,
    },
  });
  return steps;
}

export function buildEvaluationDebugView(
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[]; testCases: EvaluationTestCase[]; evaluators: EvaluationEvaluator[] },
  run: Pick<BuiltInEvaluationRunResult, 'id' | 'resultDatasetRows' | 'errors' | 'config'>,
  testCaseId: string,
  targetId: string,
  iteration?: number,
): EvaluationDebugView | undefined {
  const target = suite.targetFunctions.find((candidate) => candidate.id === targetId);
  const testCase = suite.testCases.find((candidate) => candidate.id === testCaseId);
  const candidates = run.resultDatasetRows.filter((row) => row.testCaseId === testCaseId && row.targetId === targetId);
  if (candidates.length === 0 || !target) return undefined;
  const row = (iteration !== undefined
    ? candidates.find((candidate) => candidate.iteration === iteration)
    : candidates[0]) ?? candidates[0];
  const evaluatorOutputs = evaluatorOutputsForRow(row);
  const customEvaluatorDebugOutputs = debugOutputsForRow(row);
  const errors = errorRowsForRow(targetId, testCaseId, run.errors);
  return {
    runId: run.id,
    evaluationSuiteId: suite.id,
    testCaseId,
    testCaseName: testCase?.name ?? testCaseId,
    targetId,
    targetKind: target.kind,
    targetVersion: run.config.targetVersions[targetId] ?? defaultEvaluationTargetVersion(target),
    targetModel: run.config.targetModels[targetId],
    iteration: row.iteration,
    status: row.status,
    inputs: row.inputs,
    expectedValues: expectedValuesForRow(testCase, suite.evaluators, targetId),
    actualOutputs: row.outputs,
    intermediateParameters: row.intermediateParameters,
    evaluatorOutputs,
    customEvaluatorDebugOutputs,
    errors,
    traceSteps: buildDebugTraceSteps(target, row, run.config, evaluatorOutputs),
    ontologySimulation: row.ontologySimulation,
    href: debuggerLinkFor(run.id, testCaseId, targetId, row.iteration),
  };
}

function iterationKey(row: { testCaseId: string; targetId: string; iteration: number }) {
  return `${row.testCaseId}::${row.targetId}::${row.iteration}`;
}

function diffOutputObjects(baseOutputs: Record<string, unknown>, headOutputs: Record<string, unknown>): RunComparisonOutputDiff[] {
  const keys = new Set<string>([...Object.keys(baseOutputs), ...Object.keys(headOutputs)]);
  const diffs: RunComparisonOutputDiff[] = [];
  keys.forEach((key) => {
    const baseValue = baseOutputs[key];
    const headValue = headOutputs[key];
    const baseJson = JSON.stringify(baseValue ?? null);
    const headJson = JSON.stringify(headValue ?? null);
    if (baseJson !== headJson) {
      diffs.push({ key, baseValue, headValue });
    }
  });
  diffs.sort((a, b) => a.key.localeCompare(b.key));
  return diffs;
}

function testCaseChangeKind(
  baseStatus: 'passed' | 'failed' | undefined,
  headStatus: 'passed' | 'failed' | undefined,
): RunComparisonTestCaseChangeKind {
  if (baseStatus === undefined) return 'only_in_head';
  if (headStatus === undefined) return 'only_in_base';
  if (baseStatus === 'failed' && headStatus === 'passed') return 'newly_passed';
  if (baseStatus === 'passed' && headStatus === 'failed') return 'newly_failed';
  if (baseStatus === 'passed' && headStatus === 'passed') return 'still_passed';
  return 'still_failed';
}

function aggregateMetricChangeKind(basePassRate: number | undefined, headPassRate: number | undefined): RunComparisonAggregateMetricChange['changeKind'] {
  if (basePassRate === undefined) return 'only_in_head';
  if (headPassRate === undefined) return 'only_in_base';
  if (headPassRate > basePassRate) return 'improved';
  if (headPassRate < basePassRate) return 'regressed';
  return 'unchanged';
}

function metricKeyForSummary(metric: BuiltInMetricSummary) {
  return `${metric.evaluatorId}::${metric.targetId}::${metric.metricName ?? metric.evaluator}`;
}

function metricKeyForResult(metric: BuiltInMetricResult, iteration: number) {
  return `${metric.evaluatorId}::${metric.targetId}::${metric.metricName ?? metric.evaluator}::${metric.testCaseId}::${iteration}`;
}

export function compareEvaluationRuns(
  suite: { targetFunctions: EvaluationTargetFunction[]; testCases: EvaluationTestCase[] },
  baseRun: BuiltInEvaluationRunResult,
  headRun: BuiltInEvaluationRunResult,
): EvaluationRunComparison {
  const testCaseNameById = new Map(suite.testCases.map((testCase) => [testCase.id, testCase.name]));
  const baseRowsByKey = new Map(baseRun.resultDatasetRows.map((row) => [iterationKey(row), row]));
  const headRowsByKey = new Map(headRun.resultDatasetRows.map((row) => [iterationKey(row), row]));
  const allKeys = new Set<string>([...baseRowsByKey.keys(), ...headRowsByKey.keys()]);

  const testCaseChanges: RunComparisonTestCaseChange[] = [];
  const summary: RunComparisonSummary = {
    newlyPassed: 0,
    newlyFailed: 0,
    stillPassed: 0,
    stillFailed: 0,
    onlyInBase: 0,
    onlyInHead: 0,
  };
  allKeys.forEach((key) => {
    const baseRow = baseRowsByKey.get(key);
    const headRow = headRowsByKey.get(key);
    const reference = baseRow ?? headRow;
    if (!reference) return;
    const baseStatus = baseRow?.status;
    const headStatus = headRow?.status;
    const changeKind = testCaseChangeKind(baseStatus, headStatus);
    if (changeKind === 'newly_passed') summary.newlyPassed += 1;
    else if (changeKind === 'newly_failed') summary.newlyFailed += 1;
    else if (changeKind === 'still_passed') summary.stillPassed += 1;
    else if (changeKind === 'still_failed') summary.stillFailed += 1;
    else if (changeKind === 'only_in_base') summary.onlyInBase += 1;
    else if (changeKind === 'only_in_head') summary.onlyInHead += 1;
    const outputDiff = diffOutputObjects(baseRow?.outputs ?? {}, headRow?.outputs ?? {});
    testCaseChanges.push({
      testCaseId: reference.testCaseId,
      testCaseName: testCaseNameById.get(reference.testCaseId) ?? reference.testCaseId,
      targetId: reference.targetId,
      iteration: reference.iteration,
      baseStatus,
      headStatus,
      changeKind,
      baseOutputs: baseRow?.outputs,
      headOutputs: headRow?.outputs,
      outputDiff,
      baseDebuggerHref: baseRow ? debuggerLinkFor(baseRun.id, baseRow.testCaseId, baseRow.targetId, baseRow.iteration) : undefined,
      headDebuggerHref: headRow ? debuggerLinkFor(headRun.id, headRow.testCaseId, headRow.targetId, headRow.iteration) : undefined,
    });
  });
  testCaseChanges.sort((a, b) => a.testCaseId.localeCompare(b.testCaseId) || a.targetId.localeCompare(b.targetId) || a.iteration - b.iteration);

  // Aggregate metric changes (keyed by evaluatorId+targetId+metricName)
  const aggregateMap = new Map<string, RunComparisonAggregateMetricChange>();
  const ensureAggregate = (metric: BuiltInMetricSummary, side: 'base' | 'head') => {
    const key = metricKeyForSummary(metric);
    let entry = aggregateMap.get(key);
    if (!entry) {
      entry = {
        evaluatorId: metric.evaluatorId,
        metricName: metric.metricName ?? metric.evaluator,
        targetId: metric.targetId,
        basePassCount: 0,
        headPassCount: 0,
        baseTotalCount: 0,
        headTotalCount: 0,
        basePassRate: 0,
        headPassRate: 0,
        passRateDelta: 0,
        changeKind: 'unchanged',
      };
      aggregateMap.set(key, entry);
    }
    if (side === 'base') {
      entry.basePassCount = metric.passCount;
      entry.baseTotalCount = metric.totalCount;
      entry.basePassRate = metric.passRate;
    } else {
      entry.headPassCount = metric.passCount;
      entry.headTotalCount = metric.totalCount;
      entry.headPassRate = metric.passRate;
    }
  };
  baseRun.metricResults.forEach((metric) => ensureAggregate(metric, 'base'));
  headRun.metricResults.forEach((metric) => ensureAggregate(metric, 'head'));
  const baseMetricKeys = new Set(baseRun.metricResults.map(metricKeyForSummary));
  const headMetricKeys = new Set(headRun.metricResults.map(metricKeyForSummary));
  const aggregateMetricChanges: RunComparisonAggregateMetricChange[] = Array.from(aggregateMap.values()).map((entry) => {
    const inBase = baseMetricKeys.has(`${entry.evaluatorId}::${entry.targetId}::${entry.metricName}`);
    const inHead = headMetricKeys.has(`${entry.evaluatorId}::${entry.targetId}::${entry.metricName}`);
    const passRateDelta = entry.headPassRate - entry.basePassRate;
    return {
      ...entry,
      passRateDelta,
      changeKind: aggregateMetricChangeKind(inBase ? entry.basePassRate : undefined, inHead ? entry.headPassRate : undefined),
    };
  }).sort((a, b) => Math.abs(b.passRateDelta) - Math.abs(a.passRateDelta) || a.metricName.localeCompare(b.metricName));

  // Target metadata diffs
  const targetIds = new Set<string>([...baseRun.config.targetIds, ...headRun.config.targetIds]);
  const targetMetadataChanges: RunComparisonTargetMetadata[] = Array.from(targetIds).map((targetId) => {
    const baseVersion = baseRun.config.targetVersions[targetId];
    const headVersion = headRun.config.targetVersions[targetId];
    const baseModel = baseRun.config.targetModels[targetId];
    const headModel = headRun.config.targetModels[targetId];
    return {
      targetId,
      baseVersion,
      headVersion,
      baseModel,
      headModel,
      versionChanged: baseVersion !== headVersion,
      modelChanged: (baseModel ?? '') !== (headModel ?? ''),
    };
  }).sort((a, b) => a.targetId.localeCompare(b.targetId));

  // Evaluator diffs per iteration
  const baseMetricMap = new Map<string, BuiltInMetricResult>();
  const headMetricMap = new Map<string, BuiltInMetricResult>();
  baseRun.resultDatasetRows.forEach((row) => {
    row.metrics.forEach((metric) => baseMetricMap.set(metricKeyForResult(metric, row.iteration), metric));
  });
  headRun.resultDatasetRows.forEach((row) => {
    row.metrics.forEach((metric) => headMetricMap.set(metricKeyForResult(metric, row.iteration), metric));
  });
  const evaluatorKeys = new Set<string>([...baseMetricMap.keys(), ...headMetricMap.keys()]);
  const evaluatorDiffs: RunComparisonEvaluatorDiff[] = Array.from(evaluatorKeys).map((key) => {
    const baseMetric = baseMetricMap.get(key);
    const headMetric = headMetricMap.get(key);
    const reference = baseMetric ?? headMetric!;
    const baseJson = baseMetric ? JSON.stringify(baseMetric.metricValue) : undefined;
    const headJson = headMetric ? JSON.stringify(headMetric.metricValue) : undefined;
    let changeKind: RunComparisonEvaluatorDiffChangeKind = 'unchanged';
    if (!baseMetric) changeKind = 'only_in_head';
    else if (!headMetric) changeKind = 'only_in_base';
    else if (baseMetric.passed !== headMetric.passed) changeKind = 'passed_changed';
    else if (baseJson !== headJson) changeKind = 'metric_value_changed';
    return {
      evaluatorId: reference.evaluatorId,
      metricName: reference.metricName ?? reference.evaluator,
      testCaseId: reference.testCaseId,
      targetId: reference.targetId,
      iteration: reference.iteration ?? 1,
      baseMetricValue: baseMetric?.metricValue,
      headMetricValue: headMetric?.metricValue,
      basePassed: baseMetric?.passed,
      headPassed: headMetric?.passed,
      changeKind,
    };
  }).filter((diff) => diff.changeKind !== 'unchanged')
    .sort((a, b) => a.testCaseId.localeCompare(b.testCaseId) || a.targetId.localeCompare(b.targetId) || a.iteration - b.iteration || a.metricName.localeCompare(b.metricName));

  return {
    baseRunId: baseRun.id,
    headRunId: headRun.id,
    baseTotal: baseRun.totalCount,
    headTotal: headRun.totalCount,
    basePassCount: baseRun.passCount,
    headPassCount: headRun.passCount,
    basePassRate: baseRun.passRate,
    headPassRate: headRun.passRate,
    passRateDelta: headRun.passRate - baseRun.passRate,
    passCountDelta: headRun.passCount - baseRun.passCount,
    aggregateMetricChanges,
    testCaseChanges,
    targetMetadataChanges,
    evaluatorDiffs,
    summary,
  };
}

function dashboardRunInTimeWindow(run: BuiltInEvaluationRunResult, window?: { startIso?: string; endIso?: string }): boolean {
  if (!window || (!window.startIso && !window.endIso)) return true;
  const completedAt = Date.parse(run.completedAtIso);
  if (!Number.isFinite(completedAt)) return true;
  if (window.startIso) {
    const start = Date.parse(window.startIso);
    if (Number.isFinite(start) && completedAt < start) return false;
  }
  if (window.endIso) {
    const end = Date.parse(window.endIso);
    if (Number.isFinite(end) && completedAt > end) return false;
  }
  return true;
}

function dashboardRunMatchesTargetFilters(run: BuiltInEvaluationRunResult, filters: EvaluationMetricsDashboardFilters): boolean {
  if (filters.targetIds && filters.targetIds.length > 0) {
    const includedTargetIds = new Set(run.config.targetIds);
    if (!filters.targetIds.some((id) => includedTargetIds.has(id))) return false;
  }
  if (filters.versions && filters.versions.length > 0) {
    const versions = new Set(Object.values(run.config.targetVersions));
    if (!filters.versions.some((value) => versions.has(value))) return false;
  }
  if (filters.models && filters.models.length > 0) {
    const models = new Set(Object.values(run.config.targetModels ?? {}).filter(Boolean));
    if (!filters.models.some((value) => models.has(value))) return false;
  }
  return true;
}

export function applyMetricsDashboardFilters(
  entries: EvaluationMetricsDashboardInputEntry[],
  filters: EvaluationMetricsDashboardFilters,
): EvaluationMetricsDashboardInputEntry[] {
  return entries
    .filter((entry) => !filters.suiteIds || filters.suiteIds.length === 0 || (entry.suite.id && filters.suiteIds.includes(entry.suite.id)))
    .map((entry) => ({
      suite: entry.suite,
      runs: entry.runs.filter((run) => {
        if (filters.runIds && filters.runIds.length > 0 && !filters.runIds.includes(run.id)) return false;
        if (!dashboardRunInTimeWindow(run, filters.timeWindow)) return false;
        if (!dashboardRunMatchesTargetFilters(run, filters)) return false;
        return true;
      }),
    }))
    .filter((entry) => entry.runs.length > 0);
}

function iterationStatusMatchesFilter(status: 'passed' | 'failed', filters: EvaluationMetricsDashboardFilters): boolean {
  if (!filters.status || filters.status.length === 0) return true;
  return filters.status.includes(status);
}

function dashboardIterationMatchesTargetFilters(targetId: string, filters: EvaluationMetricsDashboardFilters): boolean {
  if (!filters.targetIds || filters.targetIds.length === 0) return true;
  return filters.targetIds.includes(targetId);
}

function dashboardIterationMatchesTestCaseFilters(testCaseId: string, filters: EvaluationMetricsDashboardFilters): boolean {
  if (!filters.testCaseIds || filters.testCaseIds.length === 0) return true;
  return filters.testCaseIds.includes(testCaseId);
}

function dashboardMetricMatchesFilter(metricName: string, filters: EvaluationMetricsDashboardFilters): boolean {
  if (!filters.metricNames || filters.metricNames.length === 0) return true;
  return filters.metricNames.includes(metricName);
}

function llmTraceHrefForRun(run: BuiltInEvaluationRunResult, testCaseId: string, targetId: string, iteration: number, targetKind: EvaluationTargetFunction['kind']): string | undefined {
  if (targetKind !== 'logic' && targetKind !== 'agent_like') return undefined;
  return `/aip-evals/runs/${encodeURIComponent(run.id)}/llm-trace/${encodeURIComponent(testCaseId)}/${encodeURIComponent(targetId)}?iteration=${iteration}`;
}

export function buildEvaluationMetricsDashboard(
  entries: EvaluationMetricsDashboardInputEntry[],
  filters: EvaluationMetricsDashboardFilters = {},
): EvaluationMetricsDashboard {
  const filtered = applyMetricsDashboardFilters(entries, filters);

  // Aggregate filter options
  const suiteIdsSet = new Set<string>();
  const runIdsSet = new Set<string>();
  const targetIdsSet = new Set<string>();
  const versionsSet = new Set<string>();
  const modelsSet = new Set<string>();
  const metricNamesSet = new Set<string>();
  const testCaseIdsSet = new Set<string>();

  entries.forEach((entry) => {
    if (entry.suite.id) suiteIdsSet.add(entry.suite.id);
    entry.runs.forEach((run) => {
      runIdsSet.add(run.id);
      run.config.targetIds.forEach((id) => targetIdsSet.add(id));
      Object.values(run.config.targetVersions).forEach((value) => versionsSet.add(value));
      Object.values(run.config.targetModels ?? {}).forEach((value) => { if (value) modelsSet.add(value); });
      run.metricResults.forEach((metric) => metricNamesSet.add(metric.metricName ?? metric.evaluator));
      run.config.testCaseIds.forEach((id) => testCaseIdsSet.add(id));
    });
  });
  const filterOptions: EvaluationMetricsDashboardFilterOptions = {
    suiteIds: Array.from(suiteIdsSet).sort(),
    runIds: Array.from(runIdsSet).sort(),
    targetIds: Array.from(targetIdsSet).sort(),
    versions: Array.from(versionsSet).sort(),
    models: Array.from(modelsSet).sort(),
    metricNames: Array.from(metricNamesSet).sort(),
    testCaseIds: Array.from(testCaseIdsSet).sort(),
  };

  // Iterate over filtered iterations
  const trendPoints: EvaluationMetricsDashboardTrendPoint[] = [];
  const targetStatsMap = new Map<string, EvaluationMetricsDashboardTargetStat & { totalDurationMs: number }>();
  const testCaseStatsMap = new Map<string, EvaluationMetricsDashboardTestCaseStat & { lastCompletedAt: number }>();
  const metricStatsMap = new Map<string, EvaluationMetricsDashboardMetricStat & { metricValues: number[] }>();
  const drillDownLinks: EvaluationMetricsDashboardDrillDown[] = [];
  let totalIterations = 0;
  let totalPass = 0;
  let totalDurationMs = 0;
  let totalRuns = 0;

  filtered.forEach((entry) => {
    const testCaseNameById = new Map(entry.suite.testCases.map((testCase) => [testCase.id, testCase.name]));
    const targetKindById = new Map(entry.suite.targetFunctions.map((target) => [target.id, target.kind]));
    entry.runs.forEach((run) => {
      const filteredRows = run.resultDatasetRows.filter((row) => (
        dashboardIterationMatchesTargetFilters(row.targetId, filters)
        && dashboardIterationMatchesTestCaseFilters(row.testCaseId, filters)
        && iterationStatusMatchesFilter(row.status, filters)
      ));
      if (filteredRows.length === 0) return;
      totalRuns += 1;
      let runPassCount = 0;
      let runTotalCount = 0;
      filteredRows.forEach((row) => {
        totalIterations += 1;
        runTotalCount += 1;
        if (row.status === 'passed') {
          totalPass += 1;
          runPassCount += 1;
        }
        const perIterationDuration = filteredRows.length > 0 ? run.durationMs / filteredRows.length : run.durationMs;
        totalDurationMs += perIterationDuration;

        const targetEntry = targetStatsMap.get(row.targetId) ?? {
          targetId: row.targetId,
          iterations: 0,
          passCount: 0,
          failureCount: 0,
          passRate: 0,
          averageDurationMs: 0,
          totalDurationMs: 0,
        };
        targetEntry.iterations += 1;
        if (row.status === 'passed') targetEntry.passCount += 1;
        else targetEntry.failureCount += 1;
        targetEntry.totalDurationMs += perIterationDuration;
        targetStatsMap.set(row.targetId, targetEntry);

        const testCaseEntry = testCaseStatsMap.get(row.testCaseId) ?? {
          testCaseId: row.testCaseId,
          testCaseName: testCaseNameById.get(row.testCaseId) ?? row.testCaseId,
          totalIterations: 0,
          passCount: 0,
          failureCount: 0,
          passRate: 0,
          lastRunId: run.id,
          lastStatus: row.status,
          lastCompletedAt: 0,
        };
        testCaseEntry.totalIterations += 1;
        if (row.status === 'passed') testCaseEntry.passCount += 1;
        else testCaseEntry.failureCount += 1;
        const completedAt = Date.parse(run.completedAtIso);
        if (Number.isFinite(completedAt) && completedAt >= testCaseEntry.lastCompletedAt) {
          testCaseEntry.lastCompletedAt = completedAt;
          testCaseEntry.lastRunId = run.id;
          testCaseEntry.lastStatus = row.status;
        }
        testCaseStatsMap.set(row.testCaseId, testCaseEntry);

        row.metrics.forEach((metric) => {
          const metricName = metric.metricName ?? metric.evaluator;
          if (!dashboardMetricMatchesFilter(metricName, filters)) return;
          const key = `${metric.evaluatorId}::${metricName}`;
          const existing = metricStatsMap.get(key) ?? {
            evaluatorId: metric.evaluatorId,
            metricName,
            totalCount: 0,
            passCount: 0,
            passRate: 0,
            averageValue: undefined,
            metricValues: [] as number[],
          };
          existing.totalCount += 1;
          if (metric.passed) existing.passCount += 1;
          const numericValue = typeof metric.metricValue === 'number'
            ? metric.metricValue
            : (metric.metricValue ? 1 : 0);
          if (Number.isFinite(numericValue)) existing.metricValues.push(numericValue);
          metricStatsMap.set(key, existing);
        });

        const targetKind = targetKindById.get(row.targetId) ?? 'logic';
        drillDownLinks.push({
          runId: run.id,
          testCaseId: row.testCaseId,
          testCaseName: testCaseNameById.get(row.testCaseId) ?? row.testCaseId,
          targetId: row.targetId,
          iteration: row.iteration,
          status: row.status,
          debugHref: debuggerLinkFor(run.id, row.testCaseId, row.targetId, row.iteration),
          llmTraceHref: llmTraceHrefForRun(run, row.testCaseId, row.targetId, row.iteration, targetKind),
          evaluatorTraceHref: `/aip-evals/runs/${encodeURIComponent(run.id)}/evaluator-trace/${encodeURIComponent(row.testCaseId)}/${encodeURIComponent(row.targetId)}?iteration=${row.iteration}`,
        });
      });
      trendPoints.push({
        runId: run.id,
        suiteId: entry.suite.id,
        completedAtIso: run.completedAtIso,
        passCount: runPassCount,
        totalCount: runTotalCount,
        passRate: runTotalCount === 0 ? 0 : runPassCount / runTotalCount,
      });
    });
  });

  const targetStats: EvaluationMetricsDashboardTargetStat[] = Array.from(targetStatsMap.values()).map((entry) => ({
    targetId: entry.targetId,
    iterations: entry.iterations,
    passCount: entry.passCount,
    failureCount: entry.failureCount,
    passRate: entry.iterations === 0 ? 0 : entry.passCount / entry.iterations,
    averageDurationMs: entry.iterations === 0 ? 0 : Math.round(entry.totalDurationMs / entry.iterations),
  })).sort((a, b) => b.iterations - a.iterations || a.targetId.localeCompare(b.targetId));

  const testCaseStats: EvaluationMetricsDashboardTestCaseStat[] = Array.from(testCaseStatsMap.values()).map((entry) => ({
    testCaseId: entry.testCaseId,
    testCaseName: entry.testCaseName,
    totalIterations: entry.totalIterations,
    passCount: entry.passCount,
    failureCount: entry.failureCount,
    passRate: entry.totalIterations === 0 ? 0 : entry.passCount / entry.totalIterations,
    lastRunId: entry.lastRunId,
    lastStatus: entry.lastStatus,
  })).sort((a, b) => a.passRate - b.passRate || b.totalIterations - a.totalIterations || a.testCaseId.localeCompare(b.testCaseId));

  const metricStats: EvaluationMetricsDashboardMetricStat[] = Array.from(metricStatsMap.values()).map((entry) => ({
    evaluatorId: entry.evaluatorId,
    metricName: entry.metricName,
    totalCount: entry.totalCount,
    passCount: entry.passCount,
    passRate: entry.totalCount === 0 ? 0 : entry.passCount / entry.totalCount,
    averageValue: entry.metricValues.length > 0
      ? entry.metricValues.reduce((sum, value) => sum + value, 0) / entry.metricValues.length
      : undefined,
  })).sort((a, b) => a.passRate - b.passRate || b.totalCount - a.totalCount || a.metricName.localeCompare(b.metricName));

  trendPoints.sort((a, b) => {
    const left = Date.parse(a.completedAtIso);
    const right = Date.parse(b.completedAtIso);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    return a.runId.localeCompare(b.runId);
  });

  return {
    filters,
    filterOptions,
    totalRuns,
    totalIterations,
    totalPass,
    totalFail: Math.max(0, totalIterations - totalPass),
    overallPassRate: totalIterations === 0 ? 0 : totalPass / totalIterations,
    averageDurationMs: totalIterations === 0 ? 0 : Math.round(totalDurationMs / totalIterations),
    trend: trendPoints,
    targetStats,
    testCaseStats,
    metricStats,
    drillDownLinks: drillDownLinks.slice(0, 200),
  };
}

interface AnalyzerCategoryDefinition {
  kind: EvaluationResultsAnalyzerCategoryKind;
  name: string;
  description: string;
  promptSuggestion: string;
}

const ANALYZER_CATEGORY_DEFINITIONS: Record<EvaluationResultsAnalyzerCategoryKind, AnalyzerCategoryDefinition> = {
  permission_error: {
    kind: 'permission_error',
    name: 'Permission denied',
    description: 'Evaluator hit permission, marking, or unauthorized-resource errors.',
    promptSuggestion: 'Audit the Logic security boundary, project imports, and marking access for the listed resources; the Logic prompt should not request properties or actions the user is not permissioned for.',
  },
  validation_error: {
    kind: 'validation_error',
    name: 'Validation failures',
    description: 'Inputs or outputs failed schema validation or structural checks.',
    promptSuggestion: 'Tighten the prompt to enforce the expected output schema and add an explicit validation step for required fields before returning.',
  },
  exact_mismatch: {
    kind: 'exact_mismatch',
    name: 'Exact-match mismatches',
    description: 'Actual outputs differ from the expected value in the exact-match evaluator.',
    promptSuggestion: 'Add concrete output examples to the prompt and restate the required wording; consider lowering temperature or adding a deterministic structured-output mode.',
  },
  regex_mismatch: {
    kind: 'regex_mismatch',
    name: 'Regex pattern mismatches',
    description: 'Outputs did not match the expected regex pattern.',
    promptSuggestion: 'Update the prompt to require the regex pattern verbatim, and add a final validation block that retries when the pattern is not present.',
  },
  length_constraint: {
    kind: 'length_constraint',
    name: 'Length constraint violations',
    description: 'Outputs exceeded or fell short of the configured length thresholds.',
    promptSuggestion: 'Add an explicit max/min length instruction to the prompt and truncate or expand the answer before returning.',
  },
  keyword_missing: {
    kind: 'keyword_missing',
    name: 'Missing keywords',
    description: 'Required keywords were missing from the output.',
    promptSuggestion: 'Pin the required keywords in the prompt and add a checklist instruction reminding the model to include each one explicitly.',
  },
  numeric_out_of_range: {
    kind: 'numeric_out_of_range',
    name: 'Numeric range failures',
    description: 'Numeric outputs fell outside the configured range.',
    promptSuggestion: 'Clamp numeric outputs to the documented range in the prompt and add post-processing that rejects values outside it.',
  },
  temporal_out_of_range: {
    kind: 'temporal_out_of_range',
    name: 'Temporal range failures',
    description: 'Date/time outputs fell outside the configured range.',
    promptSuggestion: 'Document the allowed time window in the prompt and add a parser that rejects out-of-range timestamps before returning.',
  },
  object_mismatch: {
    kind: 'object_mismatch',
    name: 'Object output mismatches',
    description: 'Returned object structure or identifiers differ from the expected object.',
    promptSuggestion: 'Reinforce the prompt with the expected object schema and require the model to echo back the object id before any edits.',
  },
  object_set_mismatch: {
    kind: 'object_set_mismatch',
    name: 'Object-set overlap failures',
    description: 'Object-set outputs missed expected members or included unexpected items.',
    promptSuggestion: 'List the expected object-set members in the prompt and add a verification block that returns only the intersection with the configured set.',
  },
  ontology_edit_simulation: {
    kind: 'ontology_edit_simulation',
    name: 'Ontology edit simulation failures',
    description: 'Simulated Ontology edits did not match the expected create/edit/delete operations.',
    promptSuggestion: 'Constrain the Ontology edit bundle to the documented create/edit/delete operations and add an intermediate parameter so the custom evaluator can verify each operation.',
  },
  custom_evaluator_failure: {
    kind: 'custom_evaluator_failure',
    name: 'Custom evaluator failures',
    description: 'Custom evaluation functions rejected the actual outputs.',
    promptSuggestion: 'Inspect the custom evaluator debug strings for the rejection reasons and adjust the Logic prompt or post-processing to satisfy each metric.',
  },
  runtime_error: {
    kind: 'runtime_error',
    name: 'Runtime errors',
    description: 'Runs hit runtime, timeout, rate-limit, or model errors.',
    promptSuggestion: 'Reduce parallelization, retry on transient failures, and trim the prompt context to stay below model timeouts and rate limits.',
  },
  other: {
    kind: 'other',
    name: 'Other failures',
    description: 'Failures that did not match a more specific category.',
    promptSuggestion: 'Open the debug view for the listed test cases and review the evaluator trace and actual outputs to identify the failure pattern.',
  },
};

const ANALYZER_CATEGORY_ORDER: EvaluationResultsAnalyzerCategoryKind[] = [
  'permission_error',
  'validation_error',
  'runtime_error',
  'ontology_edit_simulation',
  'object_mismatch',
  'object_set_mismatch',
  'numeric_out_of_range',
  'temporal_out_of_range',
  'regex_mismatch',
  'keyword_missing',
  'length_constraint',
  'exact_mismatch',
  'custom_evaluator_failure',
  'other',
];

function analyzerErrorCategory(message: string): EvaluationResultsAnalyzerCategoryKind | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('forbidden')) return 'permission_error';
  if (lower.includes('validation') || lower.includes('invalid input') || lower.includes('schema')) return 'validation_error';
  if (lower.includes('timeout') || lower.includes('rate limit') || lower.includes('deadline') || lower.includes('model')) return 'runtime_error';
  return undefined;
}

function analyzerMetricCategory(metric: BuiltInMetricResult): EvaluationResultsAnalyzerCategoryKind {
  const evaluatorName = String(metric.evaluator ?? '').toLowerCase();
  const metricName = String(metric.metricName ?? '').toLowerCase();
  if (evaluatorName === 'exact_match' || metricName === 'matches') return 'exact_mismatch';
  if (evaluatorName === 'regex' || metricName === 'matches_regex') return 'regex_mismatch';
  if (evaluatorName === 'distance') return 'exact_mismatch';
  if (evaluatorName === 'length') return 'length_constraint';
  if (evaluatorName === 'keyword') return 'keyword_missing';
  if (evaluatorName === 'object_match') return 'object_mismatch';
  if (evaluatorName === 'object_set_match') return 'object_set_mismatch';
  if (evaluatorName === 'integer_range' || evaluatorName === 'numeric_range' || evaluatorName === 'floating_point_range') return 'numeric_out_of_range';
  if (evaluatorName === 'temporal_range') return 'temporal_out_of_range';
  if (metric.customFunctionRid) return 'custom_evaluator_failure';
  return 'other';
}

function analyzerSortCategories(a: EvaluationResultsAnalyzerCategory, b: EvaluationResultsAnalyzerCategory): number {
  if (b.failureCount !== a.failureCount) return b.failureCount - a.failureCount;
  return ANALYZER_CATEGORY_ORDER.indexOf(a.kind) - ANALYZER_CATEGORY_ORDER.indexOf(b.kind);
}

export function buildEvaluationResultsAnalyzer(
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[]; testCases: EvaluationTestCase[] },
  run: BuiltInEvaluationRunResult,
  config: EvaluationResultsAnalyzerConfig = {},
): EvaluationResultsAnalyzerReport {
  const resolvedConfig: EvaluationResultsAnalyzerConfigResolved = {
    model: config.model ?? 'openfoundry.analyzer.v1',
    maxCategories: Math.max(1, Math.min(20, Math.floor(config.maxCategories ?? 5))),
    maxFailingTestCases: Math.max(1, Math.min(50, Math.floor(config.maxFailingTestCases ?? 5))),
  };
  const testCaseById = new Map(suite.testCases.map((testCase) => [testCase.id, testCase]));

  if (run.resultDatasetRows.length === 0) {
    return {
      runId: run.id,
      evaluationSuiteId: suite.id,
      config: resolvedConfig,
      totalFailingTestCases: 0,
      truncatedFailingTestCases: 0,
      totalFailingIterations: 0,
      categories: [],
      remainingCategoriesCount: 0,
      summary: 'No iterations were recorded for this run; nothing to analyze yet.',
      unsupportedReason: 'no_iterations',
    };
  }

  const failedRows = run.resultDatasetRows.filter((row) => row.status === 'failed');
  if (failedRows.length === 0) {
    return {
      runId: run.id,
      evaluationSuiteId: suite.id,
      config: resolvedConfig,
      totalFailingTestCases: 0,
      truncatedFailingTestCases: 0,
      totalFailingIterations: 0,
      categories: [],
      remainingCategoriesCount: 0,
      summary: 'All iterations passed — no failures to analyze.',
      unsupportedReason: 'no_failures',
    };
  }

  // Build a map kind -> internal accumulator
  interface Accumulator {
    failureCount: number;
    testCaseIds: Set<string>;
    targetIds: Set<string>;
    examples: EvaluationResultsAnalyzerExample[];
  }
  const acc = new Map<EvaluationResultsAnalyzerCategoryKind, Accumulator>();
  const ensureAccumulator = (kind: EvaluationResultsAnalyzerCategoryKind): Accumulator => {
    let entry = acc.get(kind);
    if (!entry) {
      entry = { failureCount: 0, testCaseIds: new Set(), targetIds: new Set(), examples: [] };
      acc.set(kind, entry);
    }
    return entry;
  };

  failedRows.forEach((row) => {
    const debuggerHref = debuggerLinkFor(run.id, row.testCaseId, row.targetId, row.iteration);
    const testCase = testCaseById.get(row.testCaseId);
    const baseExample: Omit<EvaluationResultsAnalyzerExample, 'metricName' | 'actual' | 'expected' | 'reason' | 'errorMessage'> = {
      testCaseId: row.testCaseId,
      testCaseName: testCase?.name ?? row.testCaseId,
      targetId: row.targetId,
      iteration: row.iteration,
      debuggerHref,
    };

    // Errors from run.errors that match this iteration carry runtime/permission/validation hints
    const matchingErrors = run.errors.filter((error) => (
      (error.targetId ?? row.targetId) === row.targetId
      && (error.testCaseId ?? row.testCaseId) === row.testCaseId
    ));
    matchingErrors.forEach((error) => {
      const kind = analyzerErrorCategory(error.message) ?? 'runtime_error';
      const entry = ensureAccumulator(kind);
      entry.failureCount += 1;
      entry.testCaseIds.add(row.testCaseId);
      entry.targetIds.add(row.targetId);
      if (entry.examples.length < resolvedConfig.maxFailingTestCases) {
        entry.examples.push({ ...baseExample, errorMessage: error.message });
      }
    });

    // Ontology simulation present? add a category
    if (row.ontologySimulation) {
      const entry = ensureAccumulator('ontology_edit_simulation');
      entry.failureCount += 1;
      entry.testCaseIds.add(row.testCaseId);
      entry.targetIds.add(row.targetId);
      if (entry.examples.length < resolvedConfig.maxFailingTestCases) {
        entry.examples.push({
          ...baseExample,
          reason: `Simulated ${row.ontologySimulation.appliedEdits.length} edits; review created/edited/deleted objects in the debugger.`,
        });
      }
    }

    // Failed metrics
    const failedMetrics = row.metrics.filter((metric) => !metric.passed);
    failedMetrics.forEach((metric) => {
      const kind = analyzerMetricCategory(metric);
      const entry = ensureAccumulator(kind);
      entry.failureCount += 1;
      entry.testCaseIds.add(row.testCaseId);
      entry.targetIds.add(row.targetId);
      if (entry.examples.length < resolvedConfig.maxFailingTestCases) {
        entry.examples.push({
          ...baseExample,
          metricName: metric.metricName ?? metric.evaluator,
          actual: metric.actual,
          expected: metric.expected,
          reason: metric.reason,
        });
      }
    });

    // If no error and no failed metrics matched, fall back to 'other'
    if (matchingErrors.length === 0 && failedMetrics.length === 0 && !row.ontologySimulation) {
      const entry = ensureAccumulator('other');
      entry.failureCount += 1;
      entry.testCaseIds.add(row.testCaseId);
      entry.targetIds.add(row.targetId);
      if (entry.examples.length < resolvedConfig.maxFailingTestCases) {
        entry.examples.push({ ...baseExample });
      }
    }
  });

  const allCategories: EvaluationResultsAnalyzerCategory[] = Array.from(acc.entries()).map(([kind, entry]) => {
    const definition = ANALYZER_CATEGORY_DEFINITIONS[kind];
    const testCaseIds = Array.from(entry.testCaseIds).sort();
    return {
      id: `${run.id}::${kind}`,
      kind,
      name: definition.name,
      description: definition.description,
      failureCount: entry.failureCount,
      affectedTestCaseIds: testCaseIds,
      affectedTargetIds: Array.from(entry.targetIds).sort(),
      examples: entry.examples,
      promptSuggestion: definition.promptSuggestion,
      filterChip: { testCaseIds },
    };
  }).sort(analyzerSortCategories);

  const categories = allCategories.slice(0, resolvedConfig.maxCategories);
  const remainingCategoriesCount = Math.max(0, allCategories.length - categories.length);

  const failingTestCaseIds = new Set(failedRows.map((row) => row.testCaseId));
  const totalFailingTestCases = failingTestCaseIds.size;
  const truncatedFailingTestCases = Math.max(0, totalFailingTestCases - resolvedConfig.maxFailingTestCases);

  const summary = `Analyzer ${resolvedConfig.model} grouped ${failedRows.length} failing iteration${failedRows.length === 1 ? '' : 's'} across ${totalFailingTestCases} test case${totalFailingTestCases === 1 ? '' : 's'} into ${categories.length} root-cause categor${categories.length === 1 ? 'y' : 'ies'}${remainingCategoriesCount > 0 ? ` (${remainingCategoriesCount} additional categor${remainingCategoriesCount === 1 ? 'y' : 'ies'} truncated)` : ''}.`;

  return {
    runId: run.id,
    evaluationSuiteId: suite.id,
    config: resolvedConfig,
    totalFailingTestCases,
    truncatedFailingTestCases,
    totalFailingIterations: failedRows.length,
    categories,
    remainingCategoriesCount,
    summary,
  };
}

function affectedFailureCount(run: BuiltInEvaluationRunResult, categoryKind: EvaluationResultsAnalyzerCategoryKind, affectedTestCaseIds: string[]): number {
  const failed = run.resultDatasetRows.filter((row) => row.status === 'failed' && affectedTestCaseIds.includes(row.testCaseId));
  if (categoryKind === 'other' || affectedTestCaseIds.length === 0) return failed.length;
  return failed.length;
}

function summarizeRunForSuggestionEvidence(run: BuiltInEvaluationRunResult, categoryKind: EvaluationResultsAnalyzerCategoryKind, affectedTestCaseIds: string[]): PromptSuggestionEvidenceSummary {
  return {
    runId: run.id,
    passRate: run.passRate,
    failureCount: Math.max(0, run.totalCount - run.passCount),
    iterationCount: run.totalCount,
    affectedFailureCount: affectedFailureCount(run, categoryKind, affectedTestCaseIds),
  };
}

export interface PromptSuggestionApplicationInput {
  id?: string;
  appliedAt?: string;
  appliedBy?: PromptSuggestionApplication['appliedBy'];
  appliedTo?: PromptSuggestionApplication['appliedTo'];
  notes?: string;
  followUpRunId?: string;
}

export function trackPromptSuggestionApplication(
  baseRun: { id: string; evaluationSuiteId?: string },
  suggestionId: string,
  category: Pick<EvaluationResultsAnalyzerCategory, 'kind' | 'name'>,
  application: PromptSuggestionApplicationInput = {},
): PromptSuggestionApplication {
  const appliedAt = application.appliedAt ?? new Date().toISOString();
  const safeSlug = `${baseRun.id}-${suggestionId}-${appliedAt}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: application.id ?? `prompt-suggestion-${safeSlug || 'application'}`,
    suggestionId,
    categoryKind: category.kind,
    categoryName: category.name,
    source: { runId: baseRun.id, evaluationSuiteId: baseRun.evaluationSuiteId },
    appliedAt,
    appliedBy: application.appliedBy,
    appliedTo: application.appliedTo,
    notes: application.notes,
    followUpRunId: application.followUpRunId,
  };
}

export function evaluatePromptSuggestionEvidence(
  application: PromptSuggestionApplication,
  baseRun: BuiltInEvaluationRunResult,
  baseCategory: Pick<EvaluationResultsAnalyzerCategory, 'kind' | 'affectedTestCaseIds'>,
  followUpRun?: BuiltInEvaluationRunResult,
): PromptSuggestionEvidence {
  const baseSummary = summarizeRunForSuggestionEvidence(baseRun, baseCategory.kind, baseCategory.affectedTestCaseIds);
  if (!followUpRun) {
    return {
      application,
      baseRunSummary: baseSummary,
    };
  }
  const followUpSummary = summarizeRunForSuggestionEvidence(followUpRun, baseCategory.kind, baseCategory.affectedTestCaseIds);
  return {
    application,
    baseRunSummary: baseSummary,
    followUpRunSummary: followUpSummary,
    improvement: {
      passRateDelta: followUpSummary.passRate - baseSummary.passRate,
      failureCountDelta: followUpSummary.failureCount - baseSummary.failureCount,
      affectedFailureDelta: followUpSummary.affectedFailureCount - baseSummary.affectedFailureCount,
      resolved: followUpSummary.affectedFailureCount === 0,
    },
  };
}

export interface LogicPublishGateInputSuite {
  id?: string;
  targetFunctions: EvaluationTargetFunction[];
  testCases: EvaluationTestCase[];
  runs: BuiltInEvaluationRunResult[];
}

export interface LogicPublishGateWaiverInput {
  ruleField: string;
  reviewerId: string;
  reviewerName?: string;
  reason: string;
  approvedAtIso?: string;
  id?: string;
}

export function recordLogicPublishGateWaiver(input: LogicPublishGateWaiverInput): LogicPublishGateWaiver {
  const approvedAtIso = input.approvedAtIso ?? new Date().toISOString();
  const slug = `${input.ruleField}-${approvedAtIso}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: input.id ?? `gate-waiver-${slug || 'waiver'}`,
    ruleField: input.ruleField,
    reviewerId: input.reviewerId,
    reviewerName: input.reviewerName,
    reason: input.reason,
    approvedAtIso,
  };
}

function latestRunForSuite(suite: LogicPublishGateInputSuite): BuiltInEvaluationRunResult | undefined {
  const sorted = [...suite.runs].sort((a, b) => {
    const left = Date.parse(a.completedAtIso);
    const right = Date.parse(b.completedAtIso);
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
  return sorted[0];
}

function runAgeHours(completedAtIso: string, evaluatedAtIso: string): number {
  const completed = Date.parse(completedAtIso);
  const evaluated = Date.parse(evaluatedAtIso);
  if (!Number.isFinite(completed) || !Number.isFinite(evaluated)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (evaluated - completed) / (60 * 60 * 1000));
}

function criticalMetricFailureCount(run: BuiltInEvaluationRunResult, metricNames: Set<string>): number {
  if (metricNames.size === 0) return 0;
  return run.metricResults.filter((metric) => metricNames.has(metric.metricName ?? metric.evaluator) && metric.passCount < metric.totalCount).reduce((sum, metric) => sum + (metric.totalCount - metric.passCount), 0);
}

function findingRuleField(ruleKind: 'no_run' | 'stale_run' | 'low_pass_rate' | 'critical_metric_failed', suiteId: string, extra?: string): string {
  return `${ruleKind}::${suiteId}${extra ? `::${extra}` : ''}`;
}

function attachWaiver(finding: Omit<LogicPublishGateFinding, 'waived' | 'waiver'>, waivers: LogicPublishGateWaiver[]): LogicPublishGateFinding {
  const waiver = waivers.find((entry) => entry.ruleField === finding.ruleField);
  return {
    ...finding,
    waived: !!waiver,
    waiver,
  };
}

export function evaluateLogicPublishGate(
  suites: LogicPublishGateInputSuite[],
  requirement: LogicPublishGateRequirement,
  context: LogicPublishGateContext,
  waivers: LogicPublishGateWaiver[] = [],
): LogicPublishGateResult {
  const criticalMetricNames = new Set((requirement.criticalMetricNames ?? []).map((name) => String(name)));
  const suiteById = new Map(suites.filter((suite) => suite.id).map((suite) => [suite.id!, suite]));
  const findings: LogicPublishGateFinding[] = [];
  const runSummaries: LogicPublishGateRunSummary[] = [];

  requirement.suiteIds.forEach((suiteId) => {
    const suite = suiteById.get(suiteId);
    if (!suite) {
      findings.push(attachWaiver({
        ruleField: findingRuleField('no_run', suiteId),
        severity: 'critical',
        message: `Required suite ${suiteId} not found in the rollout context.`,
        suiteId,
      }, waivers));
      runSummaries.push({ suiteId, passRate: 0, passCount: 0, totalCount: 0, failureCount: 0, criticalFailureCount: 0 });
      return;
    }
    const latestRun = latestRunForSuite(suite);
    if (!latestRun) {
      findings.push(attachWaiver({
        ruleField: findingRuleField('no_run', suiteId),
        severity: 'critical',
        message: `Suite ${suiteId} has no evaluation runs; run it before rolling out.`,
        suiteId,
      }, waivers));
      runSummaries.push({ suiteId, passRate: 0, passCount: 0, totalCount: 0, failureCount: 0, criticalFailureCount: 0 });
      return;
    }
    const ageHours = runAgeHours(latestRun.completedAtIso, context.evaluatedAtIso);
    const criticalFailureCount = criticalMetricFailureCount(latestRun, criticalMetricNames);
    runSummaries.push({
      suiteId,
      runId: latestRun.id,
      passRate: latestRun.passRate,
      passCount: latestRun.passCount,
      totalCount: latestRun.totalCount,
      failureCount: Math.max(0, latestRun.totalCount - latestRun.passCount),
      completedAtIso: latestRun.completedAtIso,
      ageHours,
      criticalFailureCount,
    });
    if (latestRun.passRate < requirement.minPassRate) {
      findings.push(attachWaiver({
        ruleField: findingRuleField('low_pass_rate', suiteId),
        severity: 'critical',
        message: `Suite ${suiteId} pass rate ${(latestRun.passRate * 100).toFixed(1)}% is below the required ${(requirement.minPassRate * 100).toFixed(1)}%.`,
        suiteId,
        runId: latestRun.id,
      }, waivers));
    }
    if (requirement.maxRunAgeHours > 0 && ageHours > requirement.maxRunAgeHours) {
      findings.push(attachWaiver({
        ruleField: findingRuleField('stale_run', suiteId),
        severity: 'warning',
        message: `Suite ${suiteId} latest run is ${ageHours.toFixed(1)} hours old (max ${requirement.maxRunAgeHours}); rerun the suite to refresh.`,
        suiteId,
        runId: latestRun.id,
      }, waivers));
    }
    if (criticalFailureCount > 0) {
      latestRun.metricResults
        .filter((metric) => criticalMetricNames.has(metric.metricName ?? metric.evaluator) && metric.passCount < metric.totalCount)
        .forEach((metric) => {
          findings.push(attachWaiver({
            ruleField: findingRuleField('critical_metric_failed', suiteId, metric.metricName ?? metric.evaluator),
            severity: 'critical',
            message: `Critical evaluator metric ${metric.metricName ?? metric.evaluator} failed on suite ${suiteId} (${metric.passCount}/${metric.totalCount} passed).`,
            metricName: metric.metricName ?? metric.evaluator,
            suiteId,
            runId: latestRun.id,
          }, waivers));
        });
    }
  });

  const unwaivedCritical = findings.filter((finding) => finding.severity === 'critical' && !finding.waived);
  const ready = findings.length === 0;
  const rolloutBlocked = unwaivedCritical.length > 0;
  const bypassedFindingCount = findings.filter((finding) => finding.waived).length;

  return {
    context,
    requirement,
    ready,
    rolloutBlocked,
    findings,
    runSummaries,
    appliedWaivers: waivers,
    bypassedFindingCount,
  };
}

const DEFAULT_REGRESSION_THRESHOLDS: EvalRegressionThresholds = {
  passRateDropThreshold: 0.05,
  varianceSpikeThreshold: 0.1,
  costSpikeThresholdPct: 0.3,
  alertOnNewFailureCategories: true,
};

export interface CreateEvalScheduleInput {
  id?: string;
  suiteId: string;
  name?: string;
  cadence: EvalScheduleCadence;
  cron?: string;
  startsAtIso?: string;
  targetVersionPin?: EvalScheduleTargetVersionPin;
  targetVersionId?: string;
  baselineRunId?: string;
  notificationChannels?: EvalScheduleNotificationChannel[];
  remediationFlow?: EvalScheduleRemediationFlow;
  regressionThresholds?: Partial<EvalRegressionThresholds>;
  enabled?: boolean;
  createdAtIso?: string;
}

export function createEvalScheduleConfig(input: CreateEvalScheduleInput): EvalScheduleConfig {
  const createdAtIso = input.createdAtIso ?? new Date().toISOString();
  const slug = `${input.suiteId}-${input.cadence}-${createdAtIso}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: input.id ?? `eval-schedule-${slug || 'config'}`,
    suiteId: input.suiteId,
    name: input.name,
    cadence: input.cadence,
    cron: input.cron,
    startsAtIso: input.startsAtIso,
    targetVersionPin: input.targetVersionPin ?? 'published',
    targetVersionId: input.targetVersionId,
    baselineRunId: input.baselineRunId,
    notificationChannels: input.notificationChannels ?? [],
    remediationFlow: input.remediationFlow,
    regressionThresholds: { ...DEFAULT_REGRESSION_THRESHOLDS, ...(input.regressionThresholds ?? {}) },
    enabled: input.enabled ?? true,
    createdAtIso,
  };
}

export function nextEvalScheduleRunAt(schedule: EvalScheduleConfig, fromIso?: string): string | undefined {
  if (!schedule.enabled) return undefined;
  const from = fromIso ? Date.parse(fromIso) : Date.now();
  if (!Number.isFinite(from)) return undefined;
  if (schedule.cadence === 'cron') {
    // Without a full cron parser, return the configured startsAtIso as the next anchor.
    return schedule.startsAtIso;
  }
  const stepMs = schedule.cadence === 'hourly'
    ? 60 * 60 * 1000
    : schedule.cadence === 'daily'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  const anchor = schedule.startsAtIso ? Date.parse(schedule.startsAtIso) : from;
  if (!Number.isFinite(anchor)) return new Date(from + stepMs).toISOString();
  if (anchor > from) return new Date(anchor).toISOString();
  const elapsed = from - anchor;
  const stepsAhead = Math.floor(elapsed / stepMs) + 1;
  return new Date(anchor + stepsAhead * stepMs).toISOString();
}

function variancePerMetric(run: BuiltInEvaluationRunResult, metricKey: string): number {
  const metric = run.metricResults.find((row) => `${row.evaluatorId}::${row.metricName ?? row.evaluator}` === metricKey);
  if (!metric) return 0;
  return metric.totalCount === 0 ? 0 : (metric.totalCount - metric.passCount) / metric.totalCount;
}

function metricKeyForVariance(metric: BuiltInMetricSummary): string {
  return `${metric.evaluatorId}::${metric.metricName ?? metric.evaluator}`;
}

function planNotificationOutcomes(schedule: EvalScheduleConfig, alerts: EvalScheduleAlert[]): EvalScheduleNotificationOutcome[] {
  if (alerts.length === 0) {
    return schedule.notificationChannels.map((channel) => ({ channel, status: 'skipped', reason: 'no alerts to notify' }));
  }
  return schedule.notificationChannels.map((channel) => ({ channel, status: 'queued' as const }));
}

function planRemediationOutcome(schedule: EvalScheduleConfig, alerts: EvalScheduleAlert[]): EvalScheduleRemediationOutcome | undefined {
  if (!schedule.remediationFlow) return undefined;
  const triggering = alerts.some((alert) => alert.severity === 'critical');
  return {
    automationId: schedule.remediationFlow.automationId,
    status: triggering ? 'triggered' : 'planned',
    reason: triggering ? undefined : 'no critical alerts triggered the remediation flow',
  };
}

export interface MonitorEvalScheduleInput {
  schedule: EvalScheduleConfig;
  runAtIso?: string;
  baseline?: BuiltInEvaluationRunResult;
  head?: BuiltInEvaluationRunResult;
  baselineReport?: EvaluationResultsAnalyzerReport;
  headReport?: EvaluationResultsAnalyzerReport;
}

export function monitorEvaluationScheduleRun(input: MonitorEvalScheduleInput): EvalScheduleRunOutcome {
  const { schedule, baseline, head, baselineReport, headReport } = input;
  const runAtIso = input.runAtIso ?? new Date().toISOString();
  const alerts: EvalScheduleAlert[] = [];

  if (!head) {
    alerts.push({
      kind: 'scheduled_run_missing',
      severity: 'critical',
      message: 'Scheduled evaluation run did not complete on time.',
      detail: { schedule_id: schedule.id, suite_id: schedule.suiteId },
    });
    return {
      scheduleId: schedule.id,
      suiteId: schedule.suiteId,
      runAtIso,
      passRate: 0,
      totalIterations: 0,
      alerts,
      notifications: planNotificationOutcomes(schedule, alerts),
      remediation: planRemediationOutcome(schedule, alerts),
    };
  }

  if (!baseline) {
    alerts.push({
      kind: 'baseline_missing',
      severity: 'warning',
      message: 'No baseline run is configured; comparisons skipped.',
      headRunId: head.id,
    });
  } else {
    const passRateDelta = head.passRate - baseline.passRate;
    if (passRateDelta < -schedule.regressionThresholds.passRateDropThreshold) {
      alerts.push({
        kind: 'pass_rate_regression',
        severity: 'critical',
        message: `Pass rate dropped by ${Math.abs(passRateDelta * 100).toFixed(1)}% (baseline ${(baseline.passRate * 100).toFixed(1)}% → head ${(head.passRate * 100).toFixed(1)}%).`,
        baselineRunId: baseline.id,
        headRunId: head.id,
        detail: { pass_rate_delta: passRateDelta },
      });
    }

    head.metricResults.forEach((metric) => {
      const key = metricKeyForVariance(metric);
      const baselineFailureRate = variancePerMetric(baseline, key);
      const headFailureRate = metric.totalCount === 0 ? 0 : (metric.totalCount - metric.passCount) / metric.totalCount;
      const delta = headFailureRate - baselineFailureRate;
      if (delta > schedule.regressionThresholds.varianceSpikeThreshold) {
        alerts.push({
          kind: 'variance_spike',
          severity: 'warning',
          message: `Metric ${metric.metricName ?? metric.evaluator} failure rate rose by ${(delta * 100).toFixed(1)}% on target ${metric.targetId}.`,
          baselineRunId: baseline.id,
          headRunId: head.id,
          metricName: metric.metricName ?? metric.evaluator,
          detail: { baseline_failure_rate: baselineFailureRate, head_failure_rate: headFailureRate },
        });
      }
    });

    const baselineCost = baseline.computeUsage?.totalComputeSeconds ?? 0;
    const headCost = head.computeUsage?.totalComputeSeconds ?? 0;
    if (baselineCost > 0) {
      const costDeltaPct = (headCost - baselineCost) / baselineCost;
      if (costDeltaPct > schedule.regressionThresholds.costSpikeThresholdPct) {
        alerts.push({
          kind: 'cost_spike',
          severity: 'warning',
          message: `Compute usage rose by ${(costDeltaPct * 100).toFixed(1)}% (baseline ${baselineCost}s → head ${headCost}s).`,
          baselineRunId: baseline.id,
          headRunId: head.id,
          detail: { baseline_seconds: baselineCost, head_seconds: headCost, delta_pct: costDeltaPct },
        });
      }
    }

    if (schedule.regressionThresholds.alertOnNewFailureCategories && baselineReport && headReport) {
      const baselineKinds = new Set(baselineReport.categories.map((category) => category.kind));
      headReport.categories.forEach((category) => {
        if (!baselineKinds.has(category.kind)) {
          alerts.push({
            kind: 'new_failure_category',
            severity: 'warning',
            message: `New failure category appeared: ${category.name} (${category.failureCount} failure${category.failureCount === 1 ? '' : 's'}).`,
            baselineRunId: baseline.id,
            headRunId: head.id,
            failureCategoryKind: category.kind,
          });
        }
      });
    }
  }

  const baselineCost = baseline?.computeUsage?.totalComputeSeconds ?? 0;
  const headCost = head.computeUsage?.totalComputeSeconds ?? 0;

  return {
    scheduleId: schedule.id,
    suiteId: schedule.suiteId,
    runAtIso,
    runId: head.id,
    passRate: head.passRate,
    totalIterations: head.totalCount,
    baselineRunId: baseline?.id,
    baselinePassRate: baseline?.passRate,
    baselineCostSeconds: baseline ? baselineCost : undefined,
    headCostSeconds: headCost,
    alerts,
    notifications: planNotificationOutcomes(schedule, alerts),
    remediation: planRemediationOutcome(schedule, alerts),
  };
}

const EXPERIMENT_DEFAULT_MAX_RUNS = 24;
const EXPERIMENT_HARD_MAX_RUNS = 200;
const EXPERIMENT_PLAN_WARNING_THRESHOLD = 50;

function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>((accumulator, array) => {
    if (accumulator.length === 0) return array.map((value) => [value]);
    return accumulator.flatMap((existing) => array.map((value) => [...existing, value]));
  }, []);
}

function dimensionParameterPath(dimension: EvaluationExperimentDimension): string {
  switch (dimension.kind) {
    case 'target_model':
    case 'target_version':
      return `${dimension.kind}::${dimension.targetId ?? 'target'}`;
    case 'prompt_variable':
      return `${dimension.kind}::${dimension.targetId ?? 'target'}::${dimension.parameterName ?? 'variable'}`;
    case 'evaluator_threshold':
    case 'evaluator_config':
      return `${dimension.kind}::${dimension.evaluatorId ?? 'evaluator'}::${dimension.parameterName ?? 'config'}`;
    case 'iterations':
    case 'parallelization':
      return dimension.kind;
    default:
      return dimension.kind;
  }
}

function describeDimensionValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function experimentDimensionsValid(dimensions: EvaluationExperimentDimension[]): string[] {
  const issues: string[] = [];
  if (dimensions.length === 0) issues.push('At least one experiment dimension is required.');
  dimensions.forEach((dimension, index) => {
    if (!Array.isArray(dimension.values) || dimension.values.length === 0) {
      issues.push(`Dimension ${dimension.id || `#${index + 1}`} requires at least one value to sweep.`);
    }
    if ((dimension.kind === 'target_model' || dimension.kind === 'target_version' || dimension.kind === 'prompt_variable') && !dimension.targetId) {
      issues.push(`Dimension ${dimension.id || `#${index + 1}`} (${dimension.kind}) requires a target id.`);
    }
    if ((dimension.kind === 'evaluator_threshold' || dimension.kind === 'evaluator_config') && !dimension.evaluatorId) {
      issues.push(`Dimension ${dimension.id || `#${index + 1}`} (${dimension.kind}) requires an evaluator id.`);
    }
  });
  return issues;
}

function combinationParameters(dimensions: EvaluationExperimentDimension[], values: unknown[]): EvaluationExperimentCombinationParameter[] {
  return dimensions.map((dimension, index) => ({
    dimensionId: dimension.id,
    dimensionLabel: dimension.label,
    kind: dimension.kind,
    targetId: dimension.targetId,
    evaluatorId: dimension.evaluatorId,
    parameterName: dimension.parameterName,
    value: values[index],
  }));
}

function combinationIdFor(dimensions: EvaluationExperimentDimension[], values: unknown[]): string {
  return dimensions.map((dimension, index) => `${dimensionParameterPath(dimension)}=${describeDimensionValue(values[index])}`).join(' & ');
}

function mergeBaseConfigWithCombination(
  baseConfig: EvaluationExperimentBaseConfig | undefined,
  combination: EvaluationExperimentCombination,
): BuiltInEvaluationRunConfig {
  const config: BuiltInEvaluationRunConfig = {
    ...(baseConfig ?? {}),
    targetModels: { ...(baseConfig as BuiltInEvaluationRunConfig | undefined)?.targetModels },
    targetVersions: { ...(baseConfig as BuiltInEvaluationRunConfig | undefined)?.targetVersions },
    metadata: {
      ...((baseConfig?.metadata) ?? {}),
      customLabels: baseConfig?.metadata?.customLabels ?? [],
      customMetadata: { ...((baseConfig?.metadata?.customMetadata) ?? {}) },
    },
  };
  const promptVariables: Record<string, Record<string, unknown>> = { ...((config.metadata?.customMetadata?.['promptVariables'] as Record<string, Record<string, unknown>> | undefined) ?? {}) };
  const evaluatorOverrides: Record<string, Record<string, unknown>> = { ...((config.metadata?.customMetadata?.['evaluatorOverrides'] as Record<string, Record<string, unknown>> | undefined) ?? {}) };
  let iterationsOverride: number | undefined;
  let parallelizationOverride: number | undefined;

  combination.parameters.forEach((parameter) => {
    if (parameter.kind === 'target_model' && parameter.targetId) {
      config.targetModels![parameter.targetId] = String(parameter.value ?? '');
    } else if (parameter.kind === 'target_version' && parameter.targetId) {
      config.targetVersions![parameter.targetId] = String(parameter.value ?? 'published');
    } else if (parameter.kind === 'prompt_variable' && parameter.targetId && parameter.parameterName) {
      promptVariables[parameter.targetId] = {
        ...(promptVariables[parameter.targetId] ?? {}),
        [parameter.parameterName]: parameter.value,
      };
    } else if (parameter.kind === 'evaluator_threshold' && parameter.evaluatorId) {
      evaluatorOverrides[parameter.evaluatorId] = {
        ...(evaluatorOverrides[parameter.evaluatorId] ?? {}),
        threshold: parameter.value,
      };
    } else if (parameter.kind === 'evaluator_config' && parameter.evaluatorId && parameter.parameterName) {
      const entry = evaluatorOverrides[parameter.evaluatorId] ?? {};
      const configBucket = (entry['config'] as Record<string, unknown> | undefined) ?? {};
      evaluatorOverrides[parameter.evaluatorId] = {
        ...entry,
        config: { ...configBucket, [parameter.parameterName]: parameter.value },
      };
    } else if (parameter.kind === 'iterations') {
      iterationsOverride = Math.max(1, Number(parameter.value) || 1);
    } else if (parameter.kind === 'parallelization') {
      parallelizationOverride = Math.max(1, Number(parameter.value) || 1);
    }
  });

  if (Object.keys(promptVariables).length > 0) {
    config.metadata!.customMetadata!['promptVariables'] = promptVariables;
  }
  if (Object.keys(evaluatorOverrides).length > 0) {
    config.metadata!.customMetadata!['evaluatorOverrides'] = evaluatorOverrides;
  }
  if (iterationsOverride !== undefined) config.iterations = iterationsOverride;
  if (parallelizationOverride !== undefined) config.parallelization = parallelizationOverride;
  config.metadata!.customMetadata!['experimentCombinationId'] = combination.id;
  config.metadata!.customMetadata!['experimentCombinationIndex'] = combination.index;
  config.attribution = {
    ...(config.attribution ?? {}),
    experimentRunId: `experiment-${combination.id}`,
    invocationSurface: config.attribution?.invocationSurface ?? 'experiment_run',
  };
  return config;
}

export function buildEvaluationExperimentPlan(
  suite: { id?: string; targetFunctions: EvaluationTargetFunction[]; testCases: EvaluationTestCase[]; evaluators: EvaluationEvaluator[] },
  config: EvaluationExperimentConfig,
): EvaluationExperimentPlan {
  const dimensions = config.dimensions ?? [];
  const warnings: BuiltInEvaluationRunWarning[] = [];
  experimentDimensionsValid(dimensions).forEach((message) => {
    warnings.push({ code: 'multi_target_no_targets', message });
  });
  const maxRuns = Math.max(1, Math.min(EXPERIMENT_HARD_MAX_RUNS, Math.floor(config.maxRuns ?? EXPERIMENT_DEFAULT_MAX_RUNS)));
  if (dimensions.length === 0 || dimensions.some((dimension) => !dimension.values || dimension.values.length === 0)) {
    return {
      totalCombinations: 0,
      executedCombinations: 0,
      maxRuns,
      truncated: false,
      combinations: [],
      estimatedComputeSeconds: 0,
      warnings,
    };
  }
  const valueArrays = dimensions.map((dimension) => dimension.values);
  const productArrays = cartesianProduct(valueArrays);
  const totalCombinations = productArrays.length;
  const executedCombinations = Math.min(totalCombinations, maxRuns);
  const truncated = executedCombinations < totalCombinations;
  if (truncated) {
    warnings.push({
      code: 'parallelization_rate_limit',
      message: `Experiment grid has ${totalCombinations} combinations but max_runs is ${maxRuns}; only the first ${executedCombinations} will execute. Raise max_runs or trim a dimension.`,
    });
  }
  if (totalCombinations >= EXPERIMENT_PLAN_WARNING_THRESHOLD) {
    warnings.push({
      code: 'llm_iteration_recommendation',
      message: `Experiment grid has ${totalCombinations} combinations; consider sweeping fewer dimensions to keep compute usage in check.`,
    });
  }
  const combinations: EvaluationExperimentCombination[] = productArrays.slice(0, executedCombinations).map((values, index) => ({
    id: combinationIdFor(dimensions, values) || `combination-${index}`,
    index,
    parameters: combinationParameters(dimensions, values),
  }));
  const estimateAttribution = (config.baseConfig as BuiltInEvaluationRunConfig | undefined)?.attribution ?? { invocationSurface: 'experiment_run' };
  const perRunEstimate = estimateEvaluationRunComputeUsage(suite, {
    ...(config.baseConfig as BuiltInEvaluationRunConfig | undefined),
    attribution: estimateAttribution,
  });
  return {
    totalCombinations,
    executedCombinations,
    maxRuns,
    truncated,
    combinations,
    estimatedComputeSeconds: Math.round(perRunEstimate.totalComputeSeconds * executedCombinations),
    warnings,
  };
}

export function runEvaluationExperiment(
  suite: { id?: string; projectId?: string; targetFunctions: EvaluationTargetFunction[]; testCaseColumns?: EvaluationSuiteColumn[]; testCases: EvaluationTestCase[]; evaluators: EvaluationEvaluator[] },
  config: EvaluationExperimentConfig,
): EvaluationExperimentResults {
  const plan = buildEvaluationExperimentPlan(suite, config);
  const dimensions = config.dimensions ?? [];
  const runs: EvaluationExperimentRunResult[] = plan.combinations.map((combination) => {
    const runConfig = mergeBaseConfigWithCombination(config.baseConfig, combination);
    const run = runEvaluationSuiteBuiltIns(suite, runConfig);
    return { combination, run };
  });

  const totalIterationCount = runs.reduce((sum, entry) => sum + entry.run.totalCount, 0);
  const totalPassCount = runs.reduce((sum, entry) => sum + entry.run.passCount, 0);
  const averagePassRate = totalIterationCount === 0 ? 0 : totalPassCount / totalIterationCount;

  const groupsByDimension: EvaluationExperimentGroupByDimension[] = dimensions.map((dimension) => {
    const groupMap = new Map<string, EvaluationExperimentGroupValue>();
    runs.forEach((entry) => {
      const parameter = entry.combination.parameters.find((candidate) => candidate.dimensionId === dimension.id);
      if (!parameter) return;
      const key = describeDimensionValue(parameter.value);
      const existing = groupMap.get(key) ?? {
        value: parameter.value,
        runCount: 0,
        iterationCount: 0,
        passCount: 0,
        failureCount: 0,
        averagePassRate: 0,
      };
      existing.runCount += 1;
      existing.iterationCount += entry.run.totalCount;
      existing.passCount += entry.run.passCount;
      existing.failureCount += Math.max(0, entry.run.totalCount - entry.run.passCount);
      groupMap.set(key, existing);
    });
    const groups = Array.from(groupMap.values()).map((group) => ({
      ...group,
      averagePassRate: group.iterationCount === 0 ? 0 : group.passCount / group.iterationCount,
    })).sort((a, b) => b.averagePassRate - a.averagePassRate || describeDimensionValue(a.value).localeCompare(describeDimensionValue(b.value)));
    return {
      dimensionId: dimension.id,
      dimensionLabel: dimension.label,
      kind: dimension.kind,
      groups,
    };
  });

  const sortedRuns = [...runs].sort((a, b) => b.run.passRate - a.run.passRate);
  return {
    plan,
    runs,
    groupsByDimension,
    bestCombinationId: sortedRuns[0]?.combination.id,
    worstCombinationId: sortedRuns.length > 1 ? sortedRuns[sortedRuns.length - 1].combination.id : undefined,
    totalIterationCount,
    totalPassCount,
    averagePassRate,
  };
}

export function runEvaluationSuiteBuiltIns(suite: {
  id?: string;
  projectId?: string;
  targetFunctions: EvaluationTargetFunction[];
  testCaseColumns?: EvaluationSuiteColumn[];
  testCases: EvaluationTestCase[];
  evaluators: EvaluationEvaluator[];
}, config: BuiltInEvaluationRunConfig = {}): BuiltInEvaluationRunResult {
  const startedAt = new Date();
  const includedTargetIds = new Set(config.targetIds ?? suite.targetFunctions.map((target) => target.id));
  const includedTestCaseIds = new Set(config.testCaseIds ?? suite.testCases.map((testCase) => testCase.id));
  const targetFunctions = suite.targetFunctions.filter((target) => includedTargetIds.has(target.id));
  const testCases = suite.testCases.filter((testCase) => includedTestCaseIds.has(testCase.id));
  const iterations = Math.max(1, Math.min(10, Math.floor(config.iterations ?? 1)));
  const parallelizationRaw = Math.floor(config.parallelization ?? 1);
  const parallelization = Math.max(1, Math.min(32, parallelizationRaw));
  const executionMode: EvaluationRunExecutionMode = config.executionMode === 'project_scoped' ? 'project_scoped' : 'user_scoped';
  const targetVersions = Object.fromEntries(targetFunctions.map((target) => [
    target.id,
    config.targetVersions?.[target.id] ?? defaultEvaluationTargetVersion(target),
  ]));
  const inputMappings = resolveInputMappings(targetFunctions, config.inputMappings);
  const targetModels = resolveTargetModels(targetFunctions, config.targetModels, config.metadata?.model);
  const multiTargetCapabilities = evaluationRunMultiTargetCapabilities(suite, { targetIds: targetFunctions.map((target) => target.id) });
  const errors: BuiltInEvaluationRunError[] = [];
  if (targetFunctions.length === 0) errors.push({ message: 'No target functions selected for this run.' });
  if (testCases.length === 0) errors.push({ message: 'No test cases selected for this run.' });
  targetFunctions.forEach((target) => {
    const version = targetVersions[target.id];
    if (!targetVersionAvailable(target, version)) {
      errors.push({ targetId: target.id, message: `${target.id} cannot run version ${version}.` });
    }
    if (targetHasOntologyEditOutput(target) && !ontologyEditVerificationAvailable(target, suite.evaluators, collectIntermediateParameterNames(suite))) {
      errors.push({ targetId: target.id, message: `${target.id} returns Ontology edits; verify it with a custom evaluator or an intermediate parameter.` });
    }
  });
  suite.evaluators.forEach((evaluator) => {
    validateCustomEvaluationFunction(evaluator).forEach((message) => errors.push({ message }));
  });
  const warnings = computeEvaluationRunWarnings(suite, config, targetFunctions, iterations, parallelizationRaw);
  if (multiTargetCapabilities.multiTarget) {
    multiTargetCapabilities.disabledExperimentOptions.forEach((disabled) => {
      warnings.push({ code: 'multi_target_experiment_disabled', message: `${disabled.option}: ${disabled.reason}` });
    });
  } else if (targetFunctions.length === 1 && suite.targetFunctions.length > 1) {
    warnings.push({
      code: 'multi_target_single_target_run',
      message: 'Suite has multiple target functions but only one is selected for this run. Include additional targets to enable cross-target comparison.',
      targetId: targetFunctions[0].id,
    });
  } else if (targetFunctions.length === 0 && suite.targetFunctions.length > 0) {
    warnings.push({
      code: 'multi_target_no_targets',
      message: 'No target functions are included in this run. Select at least one target to compare.',
    });
  }
  const runnableIterations: RunnableEvaluationIteration[] = Array.from({ length: iterations }, (_, index) => index + 1).flatMap((iteration) => (
    testCases.flatMap((testCase) => targetFunctions.map((target) => ({
      targetId: target.id,
      testCaseId: testCase.id,
      iteration,
      testCase: testCaseWithTargetOutputs(target, targetVersions[target.id], testCase, suite.evaluators, iteration),
    })))
  ));
  const evaluatedRows = runnableIterations.flatMap((row) => (
    suite.evaluators.flatMap((evaluator) => {
      const mapping = mappingsForEvaluator(evaluator, targetFunctions)[row.targetId];
      return mapping ? [evaluateEvaluator(evaluator, row.targetId, row.testCase, mapping, row.iteration)] : [];
    })
  ));
  const metricRows = evaluatedRows.flatMap((row) => row.metrics);
  const debugOutputs = evaluatedRows.flatMap((row) => row.debugOutputs);
  const summary = summarizeBuiltInMetrics(testCases, metricRows, debugOutputs);
  const resultDatasetRows = buildEvaluationResultDatasetRows({ ...suite, targetFunctions, testCases }, summary, runnableIterations);
  const idSeed = `${suite.id ?? 'suite'}-${startedAt.getTime().toString(36)}`;
  const computeUsage = estimateEvaluationRunComputeUsage(suite, {
    ...config,
    attribution: { ...config.attribution, evalRunId: `eval-run-${idSeed}` },
  });
  const completedAt = new Date(Math.max(startedAt.getTime() + 1, startedAt.getTime() + Math.max(metricRows.length * 7, computeUsage.totalComputeSeconds * 2) / parallelization));
  const metadata: EvaluationRunMetadata = {
    ...(config.metadata ?? {}),
    runInitiator: config.metadata?.runInitiator ?? (config.attribution?.actorId ? { id: config.attribution.actorId } : undefined),
    branchName: config.metadata?.branchName,
    customLabels: config.metadata?.customLabels ?? [],
  };
  const runConfig = {
    source: config.source ?? 'aip_evals_app',
    iterations,
    parallelization,
    executionMode,
    targetVersions,
    targetModels,
    targetIds: targetFunctions.map((target) => target.id),
    testCaseIds: testCases.map((testCase) => testCase.id),
    inputMappings,
    metadata,
  };
  const comparison = buildMultiTargetRunComparison(suite, {
    iterationResults: summary.iterationResults,
    metricResults: summary.metricResults,
    testCaseResults: summary.testCaseResults,
    config: runConfig,
  });
  const resolvedSuiteProjectId = (config.suiteProjectId ?? suite.projectId ?? '').trim();
  const resultsDatasetWrite = buildEvaluationResultsDatasetWrite(
    {
      ...suite,
      projectId: resolvedSuiteProjectId,
      testCases,
    },
    {
      id: `eval-run-${idSeed}`,
      config: runConfig,
      startedAtIso: startedAt.toISOString(),
      completedAtIso: completedAt.toISOString(),
      resultDatasetRows,
      errors,
    },
    {
      datasetRid: config.resultsDatasetRid,
      projectId: resolvedSuiteProjectId,
      maxRows: config.resultsDatasetMaxRows,
    },
  );
  if (resultsDatasetWrite.reason === 'user_scoped_execution_skipped') {
    warnings.push({
      code: 'results_dataset_skipped_user_scoped',
      message: 'Run results dataset is only written for project-scoped runs; switch to project-scoped execution to persist outputs, evaluator results, and metadata to the configured dataset.',
    });
  } else if (resultsDatasetWrite.reason === 'no_project_id') {
    warnings.push({
      code: 'results_dataset_missing_project',
      message: 'Evaluation suite has no project id, so the results dataset cannot be configured in the same project as the suite.',
    });
  } else if (resultsDatasetWrite.reason === 'no_supported_target_outputs') {
    warnings.push({
      code: 'results_dataset_no_target_outputs',
      message: 'All included targets only return Ontology edits; no rows can be written to the AIP Evals results dataset for this run. Add a custom evaluator or intermediate parameter to capture outputs.',
    });
  }
  resultsDatasetWrite.skippedRows.forEach((skipped) => {
    warnings.push({
      code: 'results_dataset_unsupported_target',
      targetId: skipped.targetId,
      message: `Target ${skipped.targetId} returns only Ontology edits; its run rows were skipped when writing the AIP Evals results dataset.`,
    });
  });
  return {
    id: `eval-run-${idSeed}`,
    status: errors.length > 0 ? 'error' : 'completed',
    passed: errors.length === 0 && summary.totalCount > 0 && summary.passCount === summary.totalCount,
    startedAtIso: startedAt.toISOString(),
    completedAtIso: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    config: runConfig,
    computeUsage,
    errors,
    warnings,
    resultDatasetRows,
    multiTargetComparison: comparison,
    resultsDatasetWrite,
    debuggerLinks: summary.iterationResults.map((iteration) => ({
      testCaseId: iteration.testCaseId,
      targetId: iteration.targetId,
      href: `/aip-evals/runs/${encodeURIComponent(idSeed)}/debug/${encodeURIComponent(iteration.testCaseId)}/${encodeURIComponent(iteration.targetId)}`,
    })),
    ...summary,
  };
}
