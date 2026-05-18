// Package retentionpolicy ports the retention-policy subsystem 1:1
// from `services/audit-compliance-service/src/retention_policy/`.
//
// The Rust source is split into:
//
//   - models/retention.rs   — wire types (now in internal/models)
//   - domain/retention.rs   — filter / apply_update / resolve_applicable / run_preview
//   - handlers/retention.rs — CRUD + applicable-policies + retention-preview
//   - metrics.rs            — Prometheus counters
//
// The Go package consolidates the domain layer here; handlers live in
// `handlers.go`.
package retentionpolicy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/audit-compliance-service/internal/models"
)

const policySelect = `SELECT id, org_id, name, scope, target_kind, retention_days,
        legal_hold, purge_mode, rules, updated_by, active, is_system, selector,
        criteria, grace_period_minutes, last_applied_at, next_run_at,
        created_at, updated_at, policy_type, space_id,
        legacy_deprecation_status, legacy_config_yaml, dataset_selectors,
        transaction_selectors, allow_latest_view_deletion, abort_open_transactions,
        danger_acknowledgement
        FROM retention_policies`

const (
	RetentionPolicyTypeRecommended = "recommended"
	RetentionPolicyTypeCustom      = "custom"
	RetentionPolicyTypeLegacy      = "legacy"

	RetentionDangerAcknowledgement = "DELETE_CURRENT_DATA"

	maxCustomPoliciesPerSpace = 50
)

// OrgScope describes the tenant boundary a caller may act under.
//
// Non-admin callers always carry OrgID == claims.OrgID (AllOrgs=false);
// reads then become `WHERE org_id = $N OR is_system = TRUE` so system
// policies stay visible across tenants.
//
// Admin callers set AllOrgs=true to bypass scoping (cross-org reads).
// For writes, admins still pass a concrete OrgID (which may be nil to
// keep a policy global).
type OrgScope struct {
	OrgID   *uuid.UUID
	AllOrgs bool
}

// PinnedToOrg reports whether the caller is restricted to a single
// (non-nil) tenant.
func (s OrgScope) PinnedToOrg() bool {
	return !s.AllOrgs && s.OrgID != nil
}

// appendOrgFilter appends `(org_id = $N OR is_system = TRUE)` to the
// running args slice when the scope is pinned to a single org, and
// returns the SQL fragment plus the updated arg list. AllOrgs returns
// an empty fragment (no extra filter).
func (s OrgScope) appendOrgFilter(args []any) (string, []any) {
	if s.AllOrgs {
		return "", args
	}
	args = append(args, s.OrgID)
	return fmt.Sprintf("(org_id = $%d OR is_system = TRUE)", len(args)), args
}

// LoadPolicies mirrors `domain::retention::load_policies`, scoped to
// the caller's [OrgScope]. Non-admin callers always see their own org
// plus the global `is_system` rows; admins (AllOrgs=true) get every
// policy.
func LoadPolicies(ctx context.Context, db *pgxpool.Pool, scope OrgScope) ([]models.RetentionPolicy, error) {
	where, args := scope.appendOrgFilter(nil)
	sql := policySelect
	if where != "" {
		sql += " WHERE " + where
	}
	sql += " ORDER BY updated_at DESC"
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.RetentionPolicy, 0)
	for rows.Next() {
		v, err := scanPolicy(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

// LoadPolicy returns a single policy or nil. Non-admin callers can
// only fetch policies that belong to their org (or system policies).
func LoadPolicy(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, scope OrgScope) (*models.RetentionPolicy, error) {
	args := []any{id}
	sql := policySelect + ` WHERE id = $1`
	if extra, updated := scope.appendOrgFilter(args); extra != "" {
		sql += " AND " + extra
		args = updated
	}
	row := db.QueryRow(ctx, sql, args...)
	v, err := scanPolicy(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

type rowLikeT interface {
	Scan(dest ...any) error
}

func scanPolicy(r rowLikeT) (*models.RetentionPolicy, error) {
	v := &models.RetentionPolicy{}
	var datasetSelectors json.RawMessage
	var transactionSelectors json.RawMessage
	if err := r.Scan(&v.ID, &v.OrgID, &v.Name, &v.Scope, &v.TargetKind, &v.RetentionDays,
		&v.LegalHold, &v.PurgeMode, &v.Rules, &v.UpdatedBy, &v.Active,
		&v.IsSystem, &v.Selector, &v.Criteria, &v.GracePeriodMinutes,
		&v.LastAppliedAt, &v.NextRunAt, &v.CreatedAt, &v.UpdatedAt,
		&v.PolicyType, &v.SpaceID, &v.LegacyDeprecationStatus,
		&v.LegacyConfigYAML, &datasetSelectors, &transactionSelectors,
		&v.AllowLatestViewDeletion, &v.AbortOpenTransactions,
		&v.DangerAcknowledgement); err != nil {
		return nil, err
	}
	selectors, err := datasetSelectorsFromRaw(datasetSelectors)
	if err != nil {
		return nil, err
	}
	txSelectors, err := transactionSelectorsFromRaw(transactionSelectors)
	if err != nil {
		return nil, err
	}
	v.DatasetSelectors = selectors
	v.TransactionSelectors = txSelectors
	v.PolicyType = normalizePolicyType(v.PolicyType, v.IsSystem)
	if v.PolicyType == RetentionPolicyTypeLegacy && v.LegacyDeprecationStatus == "" {
		v.LegacyDeprecationStatus = "deprecated"
	}
	v.Warnings = RetentionPolicyWarnings(v)
	return v, nil
}

// FilterPolicies mirrors `domain::retention::filter_policies`. AND-
// combines selector / project_id / marking_id / active / system_only.
func FilterPolicies(policies []models.RetentionPolicy, query *models.ListRetentionPoliciesQuery) []models.RetentionPolicy {
	out := make([]models.RetentionPolicy, 0, len(policies))
	for i := range policies {
		if matchesQuery(&policies[i], query) {
			out = append(out, policies[i])
		}
	}
	return out
}

func matchesQuery(policy *models.RetentionPolicy, query *models.ListRetentionPoliciesQuery) bool {
	if query.Active != nil && policy.Active != *query.Active {
		return false
	}
	if query.SystemOnly != nil && *query.SystemOnly && !policy.IsSystem {
		return false
	}
	anySelector := query.DatasetRid != nil || query.ProjectID != nil || query.MarkingID != nil || query.SpaceID != nil
	if !anySelector {
		return true
	}
	if query.SpaceID != nil && policy.SpaceID != nil && *policy.SpaceID == *query.SpaceID {
		return true
	}
	if query.DatasetRid != nil && datasetSelectorsMatchDataset(policy.DatasetSelectors, *query.DatasetRid) {
		return true
	}
	selector, err := models.SelectorFromRaw(policy.Selector)
	if err != nil {
		return false
	}
	if selector.AllDatasets {
		return true
	}
	if query.DatasetRid != nil && selector.DatasetRid != nil && *selector.DatasetRid == *query.DatasetRid {
		return true
	}
	if query.ProjectID != nil && selector.ProjectID != nil && *selector.ProjectID == *query.ProjectID {
		return true
	}
	if query.MarkingID != nil && selector.MarkingID != nil && *selector.MarkingID == *query.MarkingID {
		return true
	}
	return false
}

// ResolvedPolicies mirrors `domain::retention::ResolvedPolicies`.
type ResolvedPolicies struct {
	Inherited models.InheritedPolicies
	Explicit  []models.RetentionPolicy
	Effective *models.RetentionPolicy
	Conflicts []models.PolicyConflict
}

// ResolveApplicable mirrors `domain::retention::resolve_applicable`.
//
// Iterates the (active) policies and assigns each to the first
// matching bucket: explicit > project > space (marking_id ==
// ctx.marking_id || ctx.space_id) > org (all_datasets).
func ResolveApplicable(policies []models.RetentionPolicy, rid string, ctx *models.ResolutionContext) ResolvedPolicies {
	out := ResolvedPolicies{}
	for i := range policies {
		policy := policies[i]
		if !policy.Active {
			continue
		}
		selector, err := models.SelectorFromRaw(policy.Selector)
		if err != nil {
			continue
		}
		if selector.DatasetRid != nil && *selector.DatasetRid == rid {
			out.Explicit = append(out.Explicit, policy)
			continue
		}
		if datasetSelectorsExplicitlyMatchDataset(policy.DatasetSelectors, rid) {
			out.Explicit = append(out.Explicit, policy)
			continue
		}
		if ctx.ProjectID != nil && selector.ProjectID != nil && *selector.ProjectID == *ctx.ProjectID {
			out.Inherited.Project = append(out.Inherited.Project, policy)
			continue
		}
		if ctx.SpaceID != nil && policy.SpaceID != nil && *policy.SpaceID == *ctx.SpaceID {
			out.Inherited.Space = append(out.Inherited.Space, policy)
			continue
		}
		if selector.MarkingID != nil {
			if (ctx.MarkingID != nil && *selector.MarkingID == *ctx.MarkingID) ||
				(ctx.SpaceID != nil && *selector.MarkingID == *ctx.SpaceID) {
				out.Inherited.Space = append(out.Inherited.Space, policy)
				continue
			}
		}
		if selector.AllDatasets || datasetSelectorsSelectAll(policy.DatasetSelectors) {
			out.Inherited.Org = append(out.Inherited.Org, policy)
		}
	}
	out.Effective, out.Conflicts = pickEffective(&out)
	return out
}

func pickEffective(resolved *ResolvedPolicies) (*models.RetentionPolicy, []models.PolicyConflict) {
	type candidate struct {
		level  uint8
		policy models.RetentionPolicy
	}
	candidates := make([]candidate, 0)
	for _, p := range resolved.Explicit {
		candidates = append(candidates, candidate{0, p})
	}
	for _, p := range resolved.Inherited.Project {
		candidates = append(candidates, candidate{1, p})
	}
	for _, p := range resolved.Inherited.Space {
		candidates = append(candidates, candidate{2, p})
	}
	for _, p := range resolved.Inherited.Org {
		candidates = append(candidates, candidate{3, p})
	}
	if len(candidates) == 0 {
		return nil, nil
	}
	score := func(c candidate) (uint8, int32, time.Time) {
		legalHold := uint8(1)
		if c.policy.LegalHold {
			legalHold = 0
		}
		bias := int32(c.level) << 24
		return legalHold, c.policy.RetentionDays + bias, c.policy.CreatedAt
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b, c := score(candidates[i])
		x, y, z := score(candidates[j])
		if a != x {
			return a < x
		}
		if b != y {
			return b < y
		}
		return c.Before(z)
	})
	winner := candidates[0].policy
	conflicts := make([]models.PolicyConflict, 0, len(candidates)-1)
	for _, c := range candidates[1:] {
		reason := "winner_has_higher_specificity"
		if winner.LegalHold && !c.policy.LegalHold {
			reason = "winner_has_legal_hold"
		} else if winner.RetentionDays < c.policy.RetentionDays {
			reason = "winner_has_lower_retention_days"
		}
		conflicts = append(conflicts, models.PolicyConflict{
			WinnerID: winner.ID,
			LoserID:  c.policy.ID,
			Reason:   reason,
		})
	}
	return &winner, conflicts
}

// ApplyUpdate mirrors `domain::retention::apply_update`. Mutates the
// passed policy in place.
func ApplyUpdate(current *models.RetentionPolicy, update *UpdateRetentionPolicyRequest) {
	if update.Name != nil {
		current.Name = *update.Name
	}
	if update.Scope != nil {
		current.Scope = *update.Scope
	}
	if update.TargetKind != nil {
		current.TargetKind = *update.TargetKind
	}
	if update.RetentionDays != nil {
		current.RetentionDays = *update.RetentionDays
	}
	if update.LegalHold != nil {
		current.LegalHold = *update.LegalHold
	}
	if update.PurgeMode != nil {
		current.PurgeMode = *update.PurgeMode
	}
	if update.Rules != nil {
		raw, _ := json.Marshal(*update.Rules)
		current.Rules = raw
	}
	if update.UpdatedBy != nil {
		current.UpdatedBy = *update.UpdatedBy
	}
	if update.Active != nil {
		current.Active = *update.Active
	}
	if update.Selector != nil {
		raw, _ := json.Marshal(update.Selector)
		current.Selector = raw
	}
	if update.Criteria != nil {
		raw, _ := json.Marshal(update.Criteria)
		current.Criteria = raw
	}
	if update.GracePeriodMinutes != nil {
		current.GracePeriodMinutes = *update.GracePeriodMinutes
	}
	if update.PolicyType != nil {
		current.PolicyType = normalizePolicyType(*update.PolicyType, current.IsSystem)
	}
	if update.SpaceID != nil {
		current.SpaceID = update.SpaceID
	}
	if update.LegacyDeprecationStatus != nil {
		current.LegacyDeprecationStatus = strings.TrimSpace(*update.LegacyDeprecationStatus)
	}
	if update.LegacyConfigYAML != nil {
		current.LegacyConfigYAML = strings.TrimSpace(*update.LegacyConfigYAML)
	}
	if update.DatasetSelectors != nil {
		current.DatasetSelectors = normalizeDatasetSelectors(*update.DatasetSelectors)
	}
	if update.TransactionSelectors != nil {
		current.TransactionSelectors = normalizeTransactionSelectors(*update.TransactionSelectors)
	}
	if update.AllowLatestViewDeletion != nil {
		current.AllowLatestViewDeletion = *update.AllowLatestViewDeletion
	}
	if update.AbortOpenTransactions != nil {
		current.AbortOpenTransactions = *update.AbortOpenTransactions
	}
	if update.DangerAcknowledgement != nil {
		current.DangerAcknowledgement = strings.TrimSpace(*update.DangerAcknowledgement)
	}
	current.Warnings = RetentionPolicyWarnings(current)
}

// CreateRetentionPolicyRequest mirrors `models::retention::CreateRetentionPolicyRequest`.
type CreateRetentionPolicyRequest struct {
	Name                    string                                `json:"name"`
	Scope                   string                                `json:"scope,omitempty"`
	TargetKind              string                                `json:"target_kind"`
	RetentionDays           int32                                 `json:"retention_days"`
	LegalHold               bool                                  `json:"legal_hold,omitempty"`
	PurgeMode               string                                `json:"purge_mode"`
	Rules                   []string                              `json:"rules,omitempty"`
	UpdatedBy               string                                `json:"updated_by"`
	Active                  *bool                                 `json:"active,omitempty"`
	Selector                *models.RetentionSelector             `json:"selector,omitempty"`
	Criteria                *models.RetentionCriteria             `json:"criteria,omitempty"`
	GracePeriodMinutes      *int32                                `json:"grace_period_minutes,omitempty"`
	PolicyType              string                                `json:"policy_type,omitempty"`
	SpaceID                 *uuid.UUID                            `json:"space_id,omitempty"`
	LegacyDeprecationStatus string                                `json:"legacy_deprecation_status,omitempty"`
	LegacyConfigYAML        string                                `json:"legacy_config_yaml,omitempty"`
	DatasetSelectors        []models.RetentionDatasetSelector     `json:"dataset_selectors,omitempty"`
	TransactionSelectors    []models.RetentionTransactionSelector `json:"transaction_selectors,omitempty"`
	AllowLatestViewDeletion bool                                  `json:"allow_latest_view_deletion,omitempty"`
	AbortOpenTransactions   bool                                  `json:"abort_open_transactions,omitempty"`
	DangerAcknowledgement   string                                `json:"danger_acknowledgement,omitempty"`
}

// EffectiveActive applies the Rust default of true.
func (r *CreateRetentionPolicyRequest) EffectiveActive() bool {
	if r.Active == nil {
		return true
	}
	return *r.Active
}

// EffectiveGrace applies the Rust default of 60 minutes.
func (r *CreateRetentionPolicyRequest) EffectiveGrace() int32 {
	if r.GracePeriodMinutes == nil {
		return 60
	}
	return *r.GracePeriodMinutes
}

// UpdateRetentionPolicyRequest mirrors the Rust struct of the same name.
type UpdateRetentionPolicyRequest struct {
	Name                    *string                                `json:"name,omitempty"`
	Scope                   *string                                `json:"scope,omitempty"`
	TargetKind              *string                                `json:"target_kind,omitempty"`
	RetentionDays           *int32                                 `json:"retention_days,omitempty"`
	LegalHold               *bool                                  `json:"legal_hold,omitempty"`
	PurgeMode               *string                                `json:"purge_mode,omitempty"`
	Rules                   *[]string                              `json:"rules,omitempty"`
	UpdatedBy               *string                                `json:"updated_by,omitempty"`
	Active                  *bool                                  `json:"active,omitempty"`
	Selector                *models.RetentionSelector              `json:"selector,omitempty"`
	Criteria                *models.RetentionCriteria              `json:"criteria,omitempty"`
	GracePeriodMinutes      *int32                                 `json:"grace_period_minutes,omitempty"`
	PolicyType              *string                                `json:"policy_type,omitempty"`
	SpaceID                 *uuid.UUID                             `json:"space_id,omitempty"`
	LegacyDeprecationStatus *string                                `json:"legacy_deprecation_status,omitempty"`
	LegacyConfigYAML        *string                                `json:"legacy_config_yaml,omitempty"`
	DatasetSelectors        *[]models.RetentionDatasetSelector     `json:"dataset_selectors,omitempty"`
	TransactionSelectors    *[]models.RetentionTransactionSelector `json:"transaction_selectors,omitempty"`
	AllowLatestViewDeletion *bool                                  `json:"allow_latest_view_deletion,omitempty"`
	AbortOpenTransactions   *bool                                  `json:"abort_open_transactions,omitempty"`
	DangerAcknowledgement   *string                                `json:"danger_acknowledgement,omitempty"`
}

// CreatePolicy mirrors `handlers::retention::create_policy`. The
// policy is persisted under `orgID` (may be nil only when the caller
// is an admin creating a global/system-equivalent row).
func CreatePolicy(ctx context.Context, db *pgxpool.Pool, request *CreateRetentionPolicyRequest, orgID *uuid.UUID) (*models.RetentionPolicy, error) {
	if strings.TrimSpace(request.Name) == "" {
		return nil, errors.New("name is required")
	}
	if strings.TrimSpace(request.TargetKind) == "" {
		return nil, errors.New("target_kind is required")
	}
	if strings.TrimSpace(request.UpdatedBy) == "" {
		return nil, errors.New("updated_by is required")
	}
	if request.Rules == nil {
		request.Rules = []string{}
	}
	policyType := normalizePolicyType(request.PolicyType, false)
	if policyType == RetentionPolicyTypeRecommended {
		return nil, ErrPolicyManagedByPlatform
	}
	datasetSelectors := normalizeDatasetSelectors(request.DatasetSelectors)
	if len(datasetSelectors) == 0 && request.Selector != nil {
		datasetSelectors = datasetSelectorsFromLegacySelector(*request.Selector)
	}
	transactionSelectors := normalizeTransactionSelectors(request.TransactionSelectors)
	criteria := orZeroCriteria(request.Criteria)
	criteria = criteriaWithTransactionSelectors(criteria, transactionSelectors)
	legacyStatus := strings.TrimSpace(request.LegacyDeprecationStatus)
	if policyType == RetentionPolicyTypeLegacy && legacyStatus == "" {
		legacyStatus = "deprecated"
	}
	draft := &models.RetentionPolicy{
		Name:                    strings.TrimSpace(request.Name),
		Scope:                   strings.TrimSpace(request.Scope),
		TargetKind:              normalizeTargetKind(request.TargetKind),
		RetentionDays:           request.RetentionDays,
		LegalHold:               request.LegalHold,
		PurgeMode:               strings.TrimSpace(request.PurgeMode),
		Rules:                   nil,
		UpdatedBy:               strings.TrimSpace(request.UpdatedBy),
		Active:                  request.EffectiveActive(),
		PolicyType:              policyType,
		SpaceID:                 request.SpaceID,
		LegacyDeprecationStatus: legacyStatus,
		LegacyConfigYAML:        strings.TrimSpace(request.LegacyConfigYAML),
		DatasetSelectors:        datasetSelectors,
		TransactionSelectors:    transactionSelectors,
		AllowLatestViewDeletion: request.AllowLatestViewDeletion,
		AbortOpenTransactions:   request.AbortOpenTransactions,
		DangerAcknowledgement:   strings.TrimSpace(request.DangerAcknowledgement),
	}
	if err := ValidateRetentionPolicyShape(draft); err != nil {
		return nil, err
	}
	if err := enforceCustomPolicyLimit(ctx, db, orgID, nil, draft.SpaceID, draft.PolicyType); err != nil {
		return nil, err
	}
	rulesJSON, err := json.Marshal(request.Rules)
	if err != nil {
		return nil, err
	}
	selectorJSON, err := json.Marshal(orZeroSelector(request.Selector))
	if err != nil {
		return nil, err
	}
	criteriaJSON, err := json.Marshal(criteria)
	if err != nil {
		return nil, err
	}
	datasetSelectorsJSON, err := json.Marshal(datasetSelectors)
	if err != nil {
		return nil, err
	}
	transactionSelectorsJSON, err := json.Marshal(transactionSelectors)
	if err != nil {
		return nil, err
	}

	row := db.QueryRow(ctx,
		`INSERT INTO retention_policies (id, org_id, name, scope, target_kind, retention_days,
		       legal_hold, purge_mode, rules, updated_by, active, selector, criteria,
		       grace_period_minutes, policy_type, space_id, legacy_deprecation_status,
		       legacy_config_yaml, dataset_selectors, transaction_selectors,
		       allow_latest_view_deletion, abort_open_transactions, danger_acknowledgement)
		    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14,
		            $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21, $22, $23)
		    RETURNING id, org_id, name, scope, target_kind, retention_days, legal_hold,
		              purge_mode, rules, updated_by, active, is_system, selector,
		              criteria, grace_period_minutes, last_applied_at, next_run_at,
		              created_at, updated_at, policy_type, space_id,
		              legacy_deprecation_status, legacy_config_yaml, dataset_selectors,
		              transaction_selectors, allow_latest_view_deletion, abort_open_transactions,
		              danger_acknowledgement`,
		uuid.New(), orgID, draft.Name, draft.Scope, draft.TargetKind, draft.RetentionDays,
		draft.LegalHold, draft.PurgeMode, rulesJSON, draft.UpdatedBy,
		draft.Active, selectorJSON, criteriaJSON, request.EffectiveGrace(),
		draft.PolicyType, draft.SpaceID, draft.LegacyDeprecationStatus,
		draft.LegacyConfigYAML, datasetSelectorsJSON, transactionSelectorsJSON,
		draft.AllowLatestViewDeletion, draft.AbortOpenTransactions,
		draft.DangerAcknowledgement,
	)
	return scanPolicy(row)
}

// UpdatePolicy mirrors `handlers::retention::update_policy`. Returns
// nil + nil error when the policy id does not exist or is invisible
// to the caller's [OrgScope]. The org_id column is never mutated —
// re-homing a policy to another tenant is intentionally not supported.
func UpdatePolicy(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, request *UpdateRetentionPolicyRequest, scope OrgScope) (*models.RetentionPolicy, error) {
	current, err := LoadPolicy(ctx, db, id, scope)
	if err != nil || current == nil {
		return current, err
	}
	if current.IsSystem || current.PolicyType == RetentionPolicyTypeRecommended {
		return nil, ErrPolicyManagedByPlatform
	}
	ApplyUpdate(current, request)
	if current.PolicyType == RetentionPolicyTypeRecommended {
		return nil, ErrPolicyManagedByPlatform
	}
	if current.PolicyType == RetentionPolicyTypeLegacy && current.LegacyDeprecationStatus == "" {
		current.LegacyDeprecationStatus = "deprecated"
	}
	criteria, err := models.CriteriaFromRaw(current.Criteria)
	if err != nil {
		return nil, err
	}
	criteria = criteriaWithTransactionSelectors(criteria, current.TransactionSelectors)
	criteriaJSON, err := json.Marshal(criteria)
	if err != nil {
		return nil, err
	}
	current.Criteria = criteriaJSON
	if err := ValidateRetentionPolicyShape(current); err != nil {
		return nil, err
	}
	if err := enforceCustomPolicyLimit(ctx, db, scope.OrgID, &id, current.SpaceID, current.PolicyType); err != nil {
		return nil, err
	}
	rules, err := MaterialiseRules(current.Rules)
	if err != nil {
		return nil, err
	}
	rulesJSON, err := json.Marshal(rules)
	if err != nil {
		return nil, err
	}
	datasetSelectorsJSON, err := json.Marshal(current.DatasetSelectors)
	if err != nil {
		return nil, err
	}
	transactionSelectorsJSON, err := json.Marshal(current.TransactionSelectors)
	if err != nil {
		return nil, err
	}
	// Re-apply the org filter on the UPDATE so a concurrent owner
	// change can't bypass tenant isolation between LoadPolicy and the
	// write.
	args := []any{
		id, current.Name, current.Scope, current.TargetKind, current.RetentionDays,
		current.LegalHold, current.PurgeMode, rulesJSON, current.UpdatedBy, current.Active,
		current.Selector, current.Criteria, current.GracePeriodMinutes,
		current.PolicyType, current.SpaceID, current.LegacyDeprecationStatus,
		current.LegacyConfigYAML, datasetSelectorsJSON, transactionSelectorsJSON,
		current.AllowLatestViewDeletion, current.AbortOpenTransactions,
		current.DangerAcknowledgement,
	}
	sql := `UPDATE retention_policies
		    SET name = $2, scope = $3, target_kind = $4, retention_days = $5,
		        legal_hold = $6, purge_mode = $7, rules = $8::jsonb,
		        updated_by = $9, active = $10, selector = $11::jsonb,
		        criteria = $12::jsonb, grace_period_minutes = $13,
		        policy_type = $14, space_id = $15, legacy_deprecation_status = $16,
		        legacy_config_yaml = $17, dataset_selectors = $18::jsonb,
		        transaction_selectors = $19::jsonb, allow_latest_view_deletion = $20,
		        abort_open_transactions = $21, danger_acknowledgement = $22,
		        updated_at = NOW()
		  WHERE id = $1`
	if extra, updated := scope.appendOrgFilter(args); extra != "" {
		sql += " AND " + extra
		args = updated
	}
	sql += `
		  RETURNING id, org_id, name, scope, target_kind, retention_days, legal_hold,
		            purge_mode, rules, updated_by, active, is_system, selector,
		            criteria, grace_period_minutes, last_applied_at, next_run_at,
		            created_at, updated_at, policy_type, space_id,
		            legacy_deprecation_status, legacy_config_yaml, dataset_selectors,
		            transaction_selectors, allow_latest_view_deletion, abort_open_transactions,
		            danger_acknowledgement`
	row := db.QueryRow(ctx, sql, args...)
	v, err := scanPolicy(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

// DeletePolicy mirrors `handlers::retention::delete_policy`. Returns
// `ErrPolicyIsSystem` when the row carries `is_system = true`, and
// `ErrPolicyNotFound` when the row is missing OR invisible to the
// caller's [OrgScope].
func DeletePolicy(ctx context.Context, db *pgxpool.Pool, id uuid.UUID, scope OrgScope) error {
	current, err := LoadPolicy(ctx, db, id, scope)
	if err != nil {
		return err
	}
	if current == nil {
		return ErrPolicyNotFound
	}
	if current.IsSystem || current.PolicyType == RetentionPolicyTypeRecommended {
		return ErrPolicyIsSystem
	}
	args := []any{id}
	sql := `DELETE FROM retention_policies WHERE id = $1`
	if extra, updated := scope.appendOrgFilter(args); extra != "" {
		sql += " AND " + extra
		args = updated
	}
	if _, err := db.Exec(ctx, sql, args...); err != nil {
		return err
	}
	return nil
}

// ErrPolicyNotFound is returned by helpers when the row id is missing.
var ErrPolicyNotFound = errors.New("retention policy not found")

// ErrPolicyIsSystem is returned by DeletePolicy when the row is built-in.
var ErrPolicyIsSystem = errors.New("system policies cannot be deleted")

// ErrPolicyManagedByPlatform is returned when callers attempt to create
// or mutate recommended platform-managed retention policies.
var ErrPolicyManagedByPlatform = errors.New("recommended retention policies are platform-managed")

// ErrMaxCustomPoliciesPerSpace mirrors the documented maximum number
// of custom policies that can be configured for a space.
var ErrMaxCustomPoliciesPerSpace = errors.New("a space can have at most 50 custom retention policies")

// MaterialiseRules decodes the JSONB rules column into a string slice.
func MaterialiseRules(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return []string{}, nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// RunJob mirrors `domain::retention::run_job`. The job is rejected
// when the policy is invisible to the caller's [OrgScope] (same
// shape as `ErrPolicyNotFound`).
func RunJob(ctx context.Context, db *pgxpool.Pool, request *models.RunRetentionJobRequest, scope OrgScope) (*models.RetentionJob, error) {
	policy, err := LoadPolicy(ctx, db, request.PolicyID, scope)
	if err != nil {
		return nil, err
	}
	if policy == nil {
		return nil, ErrPolicyNotFound
	}
	target := "policy scope"
	if request.TargetDatasetID != nil {
		target = fmt.Sprintf("dataset %s", *request.TargetDatasetID)
	} else if request.TargetTransactionID != nil {
		target = fmt.Sprintf("transaction %s", *request.TargetTransactionID)
	}
	actionSummary := fmt.Sprintf(
		"Applied %s retention (%d days, purge mode %s) to %s",
		policy.TargetKind, policy.RetentionDays, policy.PurgeMode, target)
	affected := int32(3)
	if request.TargetTransactionID != nil {
		affected = 1
	}
	now := time.Now().UTC()
	row := db.QueryRow(ctx,
		`INSERT INTO retention_jobs (id, policy_id, target_dataset_id,
		       target_transaction_id, status, action_summary, affected_record_count,
		       created_at, completed_at)
		    VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8)
		    RETURNING id, policy_id, target_dataset_id, target_transaction_id, status,
		              action_summary, affected_record_count, created_at, completed_at`,
		uuid.New(), request.PolicyID, request.TargetDatasetID, request.TargetTransactionID,
		actionSummary, affected, now, now,
	)
	out := models.RetentionJob{}
	if err := row.Scan(&out.ID, &out.PolicyID, &out.TargetDatasetID,
		&out.TargetTransactionID, &out.Status, &out.ActionSummary,
		&out.AffectedRecordCount, &out.CreatedAt, &out.CompletedAt); err != nil {
		return nil, err
	}
	return &out, nil
}

func orZeroSelector(s *models.RetentionSelector) models.RetentionSelector {
	if s == nil {
		return models.RetentionSelector{}
	}
	return *s
}

func orZeroCriteria(c *models.RetentionCriteria) models.RetentionCriteria {
	if c == nil {
		return models.RetentionCriteria{}
	}
	return *c
}

func normalizePolicyType(value string, system bool) string {
	if system {
		return RetentionPolicyTypeRecommended
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", RetentionPolicyTypeCustom:
		return RetentionPolicyTypeCustom
	case RetentionPolicyTypeRecommended:
		return RetentionPolicyTypeRecommended
	case RetentionPolicyTypeLegacy:
		return RetentionPolicyTypeLegacy
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func normalizeTargetKind(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "dataset":
		return "dataset"
	case "transaction":
		return "transaction"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func normalizeDatasetSelectors(selectors []models.RetentionDatasetSelector) []models.RetentionDatasetSelector {
	out := make([]models.RetentionDatasetSelector, 0, len(selectors))
	for _, selector := range selectors {
		mode := strings.ToLower(strings.TrimSpace(selector.Mode))
		if mode == "" {
			mode = "select"
		}
		kind := strings.ToLower(strings.TrimSpace(selector.Kind))
		out = append(out, models.RetentionDatasetSelector{
			Mode:        mode,
			Kind:        kind,
			DatasetRIDs: normalizeStringSet(selector.DatasetRIDs),
			FolderRIDs:  normalizeStringSet(selector.FolderRIDs),
			WorkerTypes: normalizeStringSet(selector.WorkerTypes),
		})
	}
	return out
}

func normalizeTransactionSelectors(selectors []models.RetentionTransactionSelector) []models.RetentionTransactionSelector {
	out := make([]models.RetentionTransactionSelector, 0, len(selectors))
	for _, selector := range selectors {
		out = append(out, models.RetentionTransactionSelector{
			Kind:             strings.ToLower(strings.TrimSpace(selector.Kind)),
			Branch:           strings.TrimSpace(selector.Branch),
			Count:            selector.Count,
			DurationSeconds:  selector.DurationSeconds,
			TransactionTypes: normalizeStringSet(selector.TransactionTypes),
		})
	}
	return out
}

func datasetSelectorsFromRaw(raw json.RawMessage) ([]models.RetentionDatasetSelector, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return []models.RetentionDatasetSelector{}, nil
	}
	var out []models.RetentionDatasetSelector
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return normalizeDatasetSelectors(out), nil
}

func transactionSelectorsFromRaw(raw json.RawMessage) ([]models.RetentionTransactionSelector, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return []models.RetentionTransactionSelector{}, nil
	}
	var out []models.RetentionTransactionSelector
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return normalizeTransactionSelectors(out), nil
}

func datasetSelectorsFromLegacySelector(selector models.RetentionSelector) []models.RetentionDatasetSelector {
	if selector.AllDatasets {
		return []models.RetentionDatasetSelector{{Mode: "select", Kind: "all"}}
	}
	if selector.DatasetRid != nil && strings.TrimSpace(*selector.DatasetRid) != "" {
		return []models.RetentionDatasetSelector{{Mode: "select", Kind: "dataset_rids", DatasetRIDs: []string{strings.TrimSpace(*selector.DatasetRid)}}}
	}
	// Project and marking selectors are inherited-policy selectors in
	// the old model. Keep the structured list empty and retain the
	// original selector JSON for compatibility with resolution.
	return []models.RetentionDatasetSelector{}
}

func datasetSelectorsMatchDataset(selectors []models.RetentionDatasetSelector, rid string) bool {
	if datasetSelectorExcludesDataset(selectors, rid) {
		return false
	}
	return datasetSelectorsExplicitlyMatchDataset(selectors, rid) || datasetSelectorsSelectAll(selectors)
}

func datasetSelectorsExplicitlyMatchDataset(selectors []models.RetentionDatasetSelector, rid string) bool {
	rid = strings.TrimSpace(rid)
	if rid == "" || datasetSelectorExcludesDataset(selectors, rid) {
		return false
	}
	for _, selector := range selectors {
		if selector.Mode != "select" || selector.Kind != "dataset_rids" {
			continue
		}
		if containsString(selector.DatasetRIDs, rid) {
			return true
		}
	}
	return false
}

func datasetSelectorsSelectAll(selectors []models.RetentionDatasetSelector) bool {
	for _, selector := range selectors {
		if selector.Mode == "select" && selector.Kind == "all" {
			return true
		}
	}
	return false
}

func datasetSelectorExcludesDataset(selectors []models.RetentionDatasetSelector, rid string) bool {
	for _, selector := range selectors {
		if selector.Mode != "exclude" {
			continue
		}
		if selector.Kind == "all" {
			return true
		}
		if selector.Kind == "dataset_rids" && containsString(selector.DatasetRIDs, rid) {
			return true
		}
	}
	return false
}

func criteriaWithTransactionSelectors(criteria models.RetentionCriteria, selectors []models.RetentionTransactionSelector) models.RetentionCriteria {
	for _, selector := range selectors {
		switch selector.Kind {
		case "older_than", "only_present_in_views_older_than":
			if selector.DurationSeconds > 0 && criteria.TransactionAgeSeconds == nil {
				seconds := selector.DurationSeconds
				criteria.TransactionAgeSeconds = &seconds
			}
		case "aborted":
			if criteria.TransactionState == nil {
				state := "ABORTED"
				criteria.TransactionState = &state
			}
		}
	}
	return criteria
}

func containsString(values []string, needle string) bool {
	needle = strings.TrimSpace(needle)
	for _, value := range values {
		if strings.TrimSpace(value) == needle {
			return true
		}
	}
	return false
}

// ValidateRetentionPolicyShape validates the SG.36 policy model before
// it is persisted. It intentionally allows empty dataset selectors for
// compatibility with older API clients; the returned policy warnings
// make that non-matching state visible to operators.
func ValidateRetentionPolicyShape(policy *models.RetentionPolicy) error {
	if policy == nil {
		return errors.New("retention policy is required")
	}
	switch normalizePolicyType(policy.PolicyType, policy.IsSystem) {
	case RetentionPolicyTypeCustom, RetentionPolicyTypeLegacy:
	case RetentionPolicyTypeRecommended:
		return ErrPolicyManagedByPlatform
	default:
		return fmt.Errorf("policy_type must be recommended, custom, or legacy")
	}
	if strings.TrimSpace(policy.Name) == "" {
		return errors.New("name is required")
	}
	if policy.RetentionDays < 0 {
		return errors.New("retention_days must be >= 0")
	}
	if kind := normalizeTargetKind(policy.TargetKind); kind != "dataset" && kind != "transaction" {
		return errors.New("target_kind must be dataset or transaction")
	}
	if strings.TrimSpace(policy.PurgeMode) == "" {
		return errors.New("purge_mode is required")
	}
	if policy.PolicyType == RetentionPolicyTypeLegacy && strings.TrimSpace(policy.LegacyDeprecationStatus) == "" {
		return errors.New("legacy_deprecation_status is required for legacy policies")
	}
	if (policy.AllowLatestViewDeletion || policy.AbortOpenTransactions) && !dangerAcknowledged(policy.DangerAcknowledgement) {
		return fmt.Errorf("danger_acknowledgement must be %q before deleting current/latest-view transactions or aborting open transactions", RetentionDangerAcknowledgement)
	}
	for _, selector := range policy.DatasetSelectors {
		if err := validateDatasetSelector(selector); err != nil {
			return err
		}
	}
	for _, selector := range policy.TransactionSelectors {
		if err := validateTransactionSelector(selector); err != nil {
			return err
		}
	}
	return nil
}

func validateDatasetSelector(selector models.RetentionDatasetSelector) error {
	if selector.Mode != "select" && selector.Mode != "exclude" {
		return fmt.Errorf("dataset selector mode must be select or exclude")
	}
	switch selector.Kind {
	case "all", "derived", "trash":
		return nil
	case "dataset_rids":
		if len(selector.DatasetRIDs) == 0 {
			return fmt.Errorf("dataset_rids selector requires dataset_rids")
		}
	case "folder_rids":
		if len(selector.FolderRIDs) == 0 {
			return fmt.Errorf("folder_rids selector requires folder_rids")
		}
	default:
		return fmt.Errorf("dataset selector kind is not supported")
	}
	return nil
}

func validateTransactionSelector(selector models.RetentionTransactionSelector) error {
	switch selector.Kind {
	case "only_branch", "not_branch":
		if strings.TrimSpace(selector.Branch) == "" {
			return fmt.Errorf("%s transaction selector requires branch", selector.Kind)
		}
	case "transaction_count", "view_count":
		if selector.Count < 0 {
			return fmt.Errorf("%s transaction selector count must be >= 0", selector.Kind)
		}
	case "older_than", "only_present_in_views_older_than":
		if selector.DurationSeconds <= 0 {
			return fmt.Errorf("%s transaction selector requires duration_seconds > 0", selector.Kind)
		}
	case "has_been_projected", "no_files_in_active_view", "is_derived", "aborted":
		return nil
	case "":
		return fmt.Errorf("transaction selector kind is required")
	default:
		return fmt.Errorf("transaction selector kind is not supported")
	}
	return nil
}

func RetentionPolicyWarnings(policy *models.RetentionPolicy) []models.RetentionPolicyWarning {
	warnings := []models.RetentionPolicyWarning{}
	if policy == nil {
		return warnings
	}
	if normalizePolicyType(policy.PolicyType, policy.IsSystem) == RetentionPolicyTypeRecommended {
		warnings = append(warnings, models.RetentionPolicyWarning{
			Code:     "recommended-policy-managed",
			Severity: "info",
			Message:  "Recommended retention policies are platform-managed and cannot be edited or deleted.",
		})
	}
	if policy.PolicyType == RetentionPolicyTypeLegacy {
		status := strings.TrimSpace(policy.LegacyDeprecationStatus)
		if status == "" {
			status = "deprecated"
		}
		warnings = append(warnings, models.RetentionPolicyWarning{
			Code:     "legacy-retention-policy-deprecated",
			Severity: "warning",
			Message:  "Legacy YAML-style retention policies are deprecated; migrate to structured selectors.",
		})
	}
	hasSelect := false
	for _, selector := range policy.DatasetSelectors {
		if selector.Mode == "select" {
			hasSelect = true
			break
		}
	}
	if !hasSelect {
		warnings = append(warnings, models.RetentionPolicyWarning{
			Code:     "no-select-dataset-selector",
			Severity: "warning",
			Message:  "No structured Select dataset selector is configured; the policy may only apply through legacy selector compatibility.",
		})
	}
	if policy.AllowLatestViewDeletion {
		warnings = append(warnings, models.RetentionPolicyWarning{
			Code:     "current-view-transaction-deletion",
			Severity: "critical",
			Message:  "This policy may delete transactions visible in current/latest views; verify downstream consumers before running retention.",
		})
	}
	if policy.AbortOpenTransactions {
		warnings = append(warnings, models.RetentionPolicyWarning{
			Code:     "abort-open-transactions",
			Severity: "critical",
			Message:  "This policy may abort open transactions; only use after confirming writers will not resume those transactions.",
		})
	}
	return warnings
}

func dangerAcknowledged(value string) bool {
	return strings.EqualFold(strings.TrimSpace(value), RetentionDangerAcknowledgement)
}

func enforceCustomPolicyLimit(ctx context.Context, db *pgxpool.Pool, orgID *uuid.UUID, excludeID *uuid.UUID, spaceID *uuid.UUID, policyType string) error {
	if policyType != RetentionPolicyTypeCustom || spaceID == nil {
		return nil
	}
	args := []any{spaceID}
	sql := `SELECT COUNT(*) FROM retention_policies WHERE policy_type = 'custom' AND space_id = $1`
	if orgID != nil {
		args = append(args, orgID)
		sql += fmt.Sprintf(" AND org_id = $%d", len(args))
	}
	if excludeID != nil {
		args = append(args, excludeID)
		sql += fmt.Sprintf(" AND id <> $%d", len(args))
	}
	var count int
	if err := db.QueryRow(ctx, sql, args...).Scan(&count); err != nil {
		return err
	}
	if count >= maxCustomPoliciesPerSpace {
		return ErrMaxCustomPoliciesPerSpace
	}
	return nil
}

func normalizeStringSet(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
