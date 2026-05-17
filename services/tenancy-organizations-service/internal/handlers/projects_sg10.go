// projects_sg10.go: SG.10 — permission checking and access graph.
//
// This layer deliberately composes the SG.8 effective-access resolver
// instead of re-implementing project/folder role inheritance. SG.10
// adds the Foundry-style explanation around that role answer:
// organization boundary, mandatory markings, scoped-session
// intersection, restricted-view requirements, and lineage-derived
// marking requirements.

package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/models"
)

// CheckProjectPermission handles POST /api/v1/projects/{id}/permission-check.
func (h *ProjectsHandlers) CheckProjectPermission(w http.ResponseWriter, r *http.Request) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	projectID, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}

	var body models.PermissionCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.UserID == uuid.Nil {
		writeJSONErr(w, http.StatusBadRequest, "user_id is required")
		return
	}
	scopeKind := strings.TrimSpace(body.ScopeKind)
	if scopeKind == "" {
		scopeKind = models.ProjectGrantScopeProject
	}
	if !isAllowedGrantScopeKind(scopeKind) {
		writeJSONErr(w, http.StatusBadRequest, "scope_kind must be 'project' or 'folder'")
		return
	}
	if scopeKind == models.ProjectGrantScopeFolder && body.ScopeID == nil {
		writeJSONErr(w, http.StatusBadRequest, "scope_id is required for scope_kind 'folder'")
		return
	}
	requiredRole := models.OntologyProjectRoleViewer
	if body.RequiredRole != nil {
		parsed, err := models.ParseOntologyProjectRole(string(*body.RequiredRole))
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
		requiredRole = parsed
	}

	project, err := loadProject(r.Context(), h.Pool, projectID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if project == nil {
		writeJSONErr(w, http.StatusNotFound, "ontology project not found")
		return
	}
	if err := ensurePermissionCheckVisible(project, claims, body.UserID); err != nil {
		writeJSONErr(w, http.StatusForbidden, err.Error())
		return
	}

	effective, err := resolveEffectiveAccess(
		r.Context(),
		h,
		projectID,
		body.UserID,
		scopeKind,
		body.ScopeID,
		body.GroupIDs,
	)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	projectOrgID, err := loadProjectOrganizationID(r.Context(), h, project)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if body.OrganizationID != nil {
		projectOrgID = body.OrganizationID
	}

	projectMarkings, err := loadProjectPermissionMarkings(r.Context(), h, projectID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	accessMarkings := append([]models.PermissionMarkingRequirement{}, projectMarkings...)
	accessMarkings = append(accessMarkings, body.RequiredMarkings...)

	session := permissionSessionForRequest(claims, body.UserID, body.Session)
	satisfiedMarkings := satisfiedMarkingTokens(claims, body.UserID, body.SatisfiedMarkings)
	userOrgIDs := userOrganizationIDsForRequest(claims, body.UserID, body.UserOrganizationIDs)

	lineageReqs, lineageExplanations := evaluateLineageRequirements(body.LineageRequirements, satisfiedMarkings)
	allMarkingsForSession := append([]models.PermissionMarkingRequirement{}, accessMarkings...)
	for _, lr := range body.LineageRequirements {
		allMarkingsForSession = append(allMarkingsForSession, lineageRequirementMarking(lr))
	}

	orgRequirement := evaluateOrganizationRequirement(projectOrgID, userOrgIDs, claims, body.UserID)
	markingRequirement := evaluateMarkingRequirement(
		models.PermissionRequirementMarking,
		"Mandatory markings",
		accessMarkings,
		satisfiedMarkings,
	)
	roleRequirement := evaluateRoleRequirement(requiredRole, effective)
	restrictedViewRequirement := evaluateRestrictedViewRequirement(
		body.RestrictedViewRequirements,
		session,
		satisfiedMarkings,
	)
	scopedSessionRequirement := evaluateScopedSessionRequirement(
		session,
		body.ActionMethod,
		body.RequestPath,
		projectOrgID,
		allMarkingsForSession,
		body.RestrictedViewRequirements,
	)

	accessRequirements := []models.PermissionRequirementResult{
		orgRequirement,
		markingRequirement,
		scopedSessionRequirement,
		roleRequirement,
		restrictedViewRequirement,
	}
	additionalDataRequirements := []models.PermissionRequirementResult{lineageReqs}

	graph, err := buildProjectAccessGraph(r.Context(), h, project, &body)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	resourceAllowed := requirementsSatisfied(accessRequirements)
	dataAllowed := resourceAllowed && requirementsSatisfied(additionalDataRequirements)
	resp := models.ProjectPermissionCheckResponse{
		UserID:                     body.UserID,
		ProjectID:                  projectID,
		ResourceKind:               strings.TrimSpace(body.ResourceKind),
		ResourceID:                 body.ResourceID,
		RequiredRole:               requiredRole,
		ResourceAccessAllowed:      resourceAllowed,
		DataAccessAllowed:          dataAllowed,
		AccessRequirements:         accessRequirements,
		AdditionalDataRequirements: additionalDataRequirements,
		LineageExplanations:        lineageExplanations,
		EffectiveAccess:            effective,
		Graph:                      graph,
		CheckedAt:                  time.Now().UTC(),
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetProjectAccessGraph handles GET /api/v1/projects/{id}/access-graph.
func (h *ProjectsHandlers) GetProjectAccessGraph(w http.ResponseWriter, r *http.Request) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	projectID, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	project, err := loadProject(r.Context(), h.Pool, projectID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if project == nil {
		writeJSONErr(w, http.StatusNotFound, "ontology project not found")
		return
	}
	if err := ensureProjectOwnerOrAdmin(project, claims); err != nil {
		writeJSONErr(w, http.StatusForbidden, err.Error())
		return
	}

	var subject *models.PermissionCheckRequest
	if raw := strings.TrimSpace(r.URL.Query().Get("user_id")); raw != "" {
		userID, err := uuid.Parse(raw)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "user_id must be a uuid")
			return
		}
		subject = &models.PermissionCheckRequest{UserID: userID}
		if groups, err := parseUUIDListParam(r.URL.Query().Get("group_ids"), "group_ids"); err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		} else {
			subject.GroupIDs = groups
		}
	}

	graph, err := buildProjectAccessGraph(r.Context(), h, project, subject)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, graph)
}

func ensurePermissionCheckVisible(project *models.OntologyProject, claims *authmw.Claims, userID uuid.UUID) error {
	if claims.Sub == userID || claims.HasRole("admin") || project.OwnerID == claims.Sub {
		return nil
	}
	return errors.New("forbidden: only the inspected user, project owner, or platform admin can request permission checks")
}

func loadProjectOrganizationID(
	ctx context.Context,
	h *ProjectsHandlers,
	project *models.OntologyProject,
) (*uuid.UUID, error) {
	if project.WorkspaceSlug == nil || strings.TrimSpace(*project.WorkspaceSlug) == "" {
		return nil, nil
	}
	row := h.Pool.QueryRow(ctx,
		`SELECT organization_id
		 FROM tenancy_spaces
		 WHERE slug = $1 AND status = 'active'
		 ORDER BY created_at DESC
		 LIMIT 1`,
		*project.WorkspaceSlug,
	)
	var orgID uuid.UUID
	if err := row.Scan(&orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("load project organization: %w", err)
	}
	return &orgID, nil
}

func loadProjectPermissionMarkings(
	ctx context.Context,
	h *ProjectsHandlers,
	projectID uuid.UUID,
) ([]models.PermissionMarkingRequirement, error) {
	rows, err := h.Pool.Query(ctx,
		`SELECT marking_id, marking_name
		 FROM ontology_project_required_markings
		 WHERE project_id = $1
		 ORDER BY marking_name ASC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.PermissionMarkingRequirement, 0)
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		source := "project_required_marking"
		requiredFor := "resource_access"
		out = append(out, models.PermissionMarkingRequirement{
			MarkingID:   &id,
			MarkingName: name,
			Source:      source,
			RequiredFor: requiredFor,
		})
	}
	return out, rows.Err()
}

func evaluateOrganizationRequirement(
	requiredOrgID *uuid.UUID,
	userOrgIDs []uuid.UUID,
	claims *authmw.Claims,
	userID uuid.UUID,
) models.PermissionRequirementResult {
	if requiredOrgID == nil {
		return notApplicableRequirement(
			models.PermissionRequirementOrganization,
			"Organization boundary",
			"Project is not bound to an organization/space in tenancy metadata.",
		)
	}
	required := []string{requiredOrgID.String()}
	present := uuidStrings(userOrgIDs)
	passed := containsUUID(userOrgIDs, *requiredOrgID)
	if !passed && claims.Sub == userID && claims.HasRole("admin") {
		passed = true
		present = appendUniqueString(present, "admin")
	}
	status := models.PermissionRequirementStatusFailed
	detail := "User is not in the required organization boundary."
	if passed {
		status = models.PermissionRequirementStatusPassed
		detail = "User satisfies the organization boundary."
	}
	return models.PermissionRequirementResult{
		Kind:      models.PermissionRequirementOrganization,
		Label:     "Organization boundary",
		Status:    status,
		Satisfied: passed,
		Required:  required,
		Present:   present,
		Missing:   missingStrings(required, present),
		Detail:    detail,
	}
}

func evaluateRoleRequirement(
	required models.OntologyProjectRole,
	effective *models.EffectiveAccessResponse,
) models.PermissionRequirementResult {
	present := "(none)"
	passed := false
	if effective != nil && effective.ResolvedRole != nil {
		present = string(*effective.ResolvedRole)
		passed = effective.ResolvedRole.Rank() >= required.Rank()
	}
	status := models.PermissionRequirementStatusFailed
	detail := fmt.Sprintf("Resolved role %s is below required role %s.", present, required)
	if passed {
		status = models.PermissionRequirementStatusPassed
		detail = fmt.Sprintf("Resolved role %s satisfies required role %s.", present, required)
	}
	return models.PermissionRequirementResult{
		Kind:      models.PermissionRequirementRole,
		Label:     "Project/folder role",
		Status:    status,
		Satisfied: passed,
		Required:  []string{string(required)},
		Present:   []string{present},
		Detail:    detail,
	}
}

func evaluateMarkingRequirement(
	kind, label string,
	required []models.PermissionMarkingRequirement,
	satisfied map[string]struct{},
) models.PermissionRequirementResult {
	if len(required) == 0 {
		return notApplicableRequirement(kind, label, "No marking requirements were supplied.")
	}
	requiredLabels := make([]string, 0, len(required))
	missing := make([]string, 0)
	sources := make([]string, 0)
	for _, req := range required {
		label := markingRequirementLabel(req)
		requiredLabels = append(requiredLabels, label)
		if req.Source != "" {
			sources = appendUniqueString(sources, req.Source)
		}
		if !markingRequirementSatisfied(req, satisfied) {
			missing = append(missing, label)
		}
	}
	passed := len(missing) == 0
	status := models.PermissionRequirementStatusFailed
	detail := "User is missing one or more mandatory markings."
	if passed {
		status = models.PermissionRequirementStatusPassed
		detail = "User satisfies every mandatory marking requirement."
	}
	return models.PermissionRequirementResult{
		Kind:      kind,
		Label:     label,
		Status:    status,
		Satisfied: passed,
		Required:  requiredLabels,
		Present:   sortedSetStrings(satisfied),
		Missing:   missing,
		Detail:    detail,
		Sources:   sources,
	}
}

func evaluateScopedSessionRequirement(
	session *models.PermissionCheckSessionInput,
	actionMethod, requestPath string,
	requiredOrgID *uuid.UUID,
	requiredMarkings []models.PermissionMarkingRequirement,
	restrictedViews []models.PermissionRestrictedViewRequirement,
) models.PermissionRequirementResult {
	if session == nil || sessionIsEmpty(session) {
		return notApplicableRequirement(
			models.PermissionRequirementScopedSession,
			"Scoped session",
			"No scoped-session limits were supplied for the inspected user.",
		)
	}
	missing := make([]string, 0)
	present := make([]string, 0)
	if len(session.AllowedMethods) > 0 {
		present = append(present, "methods:"+strings.Join(session.AllowedMethods, ","))
		if actionMethod != "" && !containsFoldOrStar(session.AllowedMethods, actionMethod) {
			missing = append(missing, "method:"+actionMethod)
		}
	}
	if len(session.AllowedPathPrefixes) > 0 {
		present = append(present, "paths:"+strings.Join(session.AllowedPathPrefixes, ","))
		if requestPath != "" && !pathAllowed(session.AllowedPathPrefixes, requestPath) {
			missing = append(missing, "path:"+requestPath)
		}
	}
	if len(session.AllowedOrgIDs) > 0 {
		present = append(present, "orgs:"+strings.Join(uuidStrings(session.AllowedOrgIDs), ","))
		if requiredOrgID != nil && !containsUUID(session.AllowedOrgIDs, *requiredOrgID) {
			missing = append(missing, "org:"+requiredOrgID.String())
		}
	}
	if len(session.AllowedMarkings) > 0 {
		present = append(present, "markings:"+strings.Join(session.AllowedMarkings, ","))
		allowed := stringTokenSet(session.AllowedMarkings)
		for _, req := range requiredMarkings {
			if !markingRequirementSatisfied(req, allowed) {
				missing = append(missing, "marking:"+markingRequirementLabel(req))
			}
		}
	}
	if len(session.RestrictedViewIDs) > 0 {
		present = append(present, "restricted_views:"+strings.Join(uuidStrings(session.RestrictedViewIDs), ","))
		for _, req := range restrictedViews {
			if !containsUUID(session.RestrictedViewIDs, req.RestrictedViewID) {
				missing = append(missing, "restricted_view:"+req.RestrictedViewID.String())
			}
		}
	}
	if session.ConsumerMode {
		present = append(present, "consumer_mode:true")
	}
	passed := len(missing) == 0
	status := models.PermissionRequirementStatusFailed
	detail := "Scoped session removes at least one required capability."
	if passed {
		status = models.PermissionRequirementStatusPassed
		detail = "Scoped session keeps every checked capability active."
	}
	return models.PermissionRequirementResult{
		Kind:      models.PermissionRequirementScopedSession,
		Label:     "Scoped session",
		Status:    status,
		Satisfied: passed,
		Present:   present,
		Missing:   missing,
		Detail:    detail,
	}
}

func evaluateRestrictedViewRequirement(
	required []models.PermissionRestrictedViewRequirement,
	session *models.PermissionCheckSessionInput,
	satisfiedMarkings map[string]struct{},
) models.PermissionRequirementResult {
	if len(required) == 0 {
		return notApplicableRequirement(
			models.PermissionRequirementRestrictedView,
			"Restricted views",
			"No restricted-view requirements were supplied.",
		)
	}
	requiredLabels := make([]string, 0, len(required))
	missing := make([]string, 0)
	for _, req := range required {
		label := req.RestrictedViewID.String()
		if req.Label != "" {
			label = req.Label + " (" + req.RestrictedViewID.String() + ")"
		}
		requiredLabels = append(requiredLabels, label)
		if session != nil && len(session.RestrictedViewIDs) > 0 && !containsUUID(session.RestrictedViewIDs, req.RestrictedViewID) {
			missing = append(missing, "session:"+req.RestrictedViewID.String())
		}
		for _, m := range req.RequiredMarkings {
			if !markingRequirementSatisfied(m, satisfiedMarkings) {
				missing = append(missing, "marking:"+markingRequirementLabel(m))
			}
		}
	}
	passed := len(missing) == 0
	status := models.PermissionRequirementStatusFailed
	detail := "User/session does not satisfy every restricted-view constraint."
	if passed {
		status = models.PermissionRequirementStatusPassed
		detail = "Restricted-view constraints are satisfied by supplied session and marking facts."
	}
	return models.PermissionRequirementResult{
		Kind:      models.PermissionRequirementRestrictedView,
		Label:     "Restricted views",
		Status:    status,
		Satisfied: passed,
		Required:  requiredLabels,
		Missing:   missing,
		Detail:    detail,
	}
}

func evaluateLineageRequirements(
	required []models.PermissionLineageRequirement,
	satisfiedMarkings map[string]struct{},
) (models.PermissionRequirementResult, []models.PermissionLineageExplanation) {
	if len(required) == 0 {
		return notApplicableRequirement(
			models.PermissionRequirementLineageMarking,
			"Lineage-derived data markings",
			"No lineage-derived marking requirements were supplied.",
		), nil
	}
	missing := make([]string, 0)
	requiredLabels := make([]string, 0, len(required))
	explanations := make([]models.PermissionLineageExplanation, 0, len(required))
	for _, req := range required {
		markingReq := lineageRequirementMarking(req)
		label := markingRequirementLabel(markingReq)
		requiredLabels = append(requiredLabels, label)
		passed := markingRequirementSatisfied(markingReq, satisfiedMarkings)
		status := models.PermissionRequirementStatusPassed
		detail := "Lineage-derived marking is satisfied."
		var miss []string
		if !passed {
			status = models.PermissionRequirementStatusFailed
			detail = "Lineage-derived marking is missing; resource metadata may be visible while dataset data is blocked."
			missing = append(missing, label)
			miss = []string{label}
		}
		explanations = append(explanations, models.PermissionLineageExplanation{
			SourceResourceKind: req.SourceResourceKind,
			SourceResourceID:   req.SourceResourceID,
			TargetResourceKind: req.TargetResourceKind,
			TargetResourceID:   req.TargetResourceID,
			RelationKind:       req.RelationKind,
			MarkingID:          req.MarkingID,
			MarkingName:        req.MarkingName,
			Status:             status,
			Satisfied:          passed,
			Missing:            miss,
			Path:               req.Path,
			Detail:             detail,
		})
	}
	passed := len(missing) == 0
	status := models.PermissionRequirementStatusFailed
	detail := "User is missing at least one lineage-derived data marking."
	if passed {
		status = models.PermissionRequirementStatusPassed
		detail = "User satisfies all lineage-derived data markings."
	}
	return models.PermissionRequirementResult{
		Kind:      models.PermissionRequirementLineageMarking,
		Label:     "Lineage-derived data markings",
		Status:    status,
		Satisfied: passed,
		Required:  requiredLabels,
		Present:   sortedSetStrings(satisfiedMarkings),
		Missing:   missing,
		Detail:    detail,
		Sources:   []string{"lineage"},
	}, explanations
}

func notApplicableRequirement(kind, label, detail string) models.PermissionRequirementResult {
	return models.PermissionRequirementResult{
		Kind:      kind,
		Label:     label,
		Status:    models.PermissionRequirementStatusNotApplicable,
		Satisfied: true,
		Detail:    detail,
	}
}

func requirementsSatisfied(items []models.PermissionRequirementResult) bool {
	for _, item := range items {
		if !item.Satisfied {
			return false
		}
	}
	return true
}

func permissionSessionForRequest(
	claims *authmw.Claims,
	userID uuid.UUID,
	input *models.PermissionCheckSessionInput,
) *models.PermissionCheckSessionInput {
	if input != nil {
		return input
	}
	if claims.Sub != userID || claims.SessionScope == nil {
		return nil
	}
	return &models.PermissionCheckSessionInput{
		AllowedMethods:      append([]string{}, claims.SessionScope.AllowedMethods...),
		AllowedPathPrefixes: append([]string{}, claims.SessionScope.AllowedPathPrefixes...),
		AllowedOrgIDs:       append([]uuid.UUID{}, claims.SessionScope.AllowedOrgIDs...),
		AllowedMarkings:     append([]string{}, claims.SessionScope.AllowedMarkings...),
		RestrictedViewIDs:   append([]uuid.UUID{}, claims.SessionScope.RestrictedViewIDs...),
		ConsumerMode:        claims.SessionScope.ConsumerMode,
	}
}

func userOrganizationIDsForRequest(
	claims *authmw.Claims,
	userID uuid.UUID,
	input []uuid.UUID,
) []uuid.UUID {
	out := append([]uuid.UUID{}, input...)
	if claims.Sub == userID && claims.OrgID != nil {
		out = appendUniqueUUID(out, *claims.OrgID)
	}
	return out
}

func satisfiedMarkingTokens(
	claims *authmw.Claims,
	userID uuid.UUID,
	input []string,
) map[string]struct{} {
	values := append([]string{}, input...)
	if claims.Sub == userID {
		values = append(values, claims.AllowedMarkings()...)
	}
	return stringTokenSet(values)
}

func stringTokenSet(values []string) map[string]struct{} {
	out := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		out[strings.ToLower(trimmed)] = struct{}{}
	}
	return out
}

func markingRequirementSatisfied(req models.PermissionMarkingRequirement, satisfied map[string]struct{}) bool {
	if len(satisfied) == 0 {
		return false
	}
	if req.MarkingID != nil {
		if _, ok := satisfied[strings.ToLower(req.MarkingID.String())]; ok {
			return true
		}
	}
	if strings.TrimSpace(req.MarkingName) != "" {
		_, ok := satisfied[strings.ToLower(strings.TrimSpace(req.MarkingName))]
		return ok
	}
	return false
}

func markingRequirementLabel(req models.PermissionMarkingRequirement) string {
	if req.MarkingName != "" && req.MarkingID != nil {
		return req.MarkingName + " (" + req.MarkingID.String() + ")"
	}
	if req.MarkingName != "" {
		return req.MarkingName
	}
	if req.MarkingID != nil {
		return req.MarkingID.String()
	}
	return "(unnamed marking)"
}

func lineageRequirementMarking(req models.PermissionLineageRequirement) models.PermissionMarkingRequirement {
	requiredFor := "data_access"
	return models.PermissionMarkingRequirement{
		MarkingID:          req.MarkingID,
		MarkingName:        req.MarkingName,
		Source:             "lineage",
		SourceResourceKind: req.SourceResourceKind,
		SourceResourceID:   &req.SourceResourceID,
		RequiredFor:        requiredFor,
	}
}

func sessionIsEmpty(session *models.PermissionCheckSessionInput) bool {
	return len(session.AllowedMethods) == 0 &&
		len(session.AllowedPathPrefixes) == 0 &&
		len(session.AllowedOrgIDs) == 0 &&
		len(session.AllowedMarkings) == 0 &&
		len(session.RestrictedViewIDs) == 0 &&
		!session.ConsumerMode
}

func containsFoldOrStar(values []string, want string) bool {
	for _, value := range values {
		if value == "*" || strings.EqualFold(value, want) {
			return true
		}
	}
	return false
}

func pathAllowed(prefixes []string, path string) bool {
	for _, prefix := range prefixes {
		if prefix == "*" || strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

func parseUUIDListParam(raw, label string) ([]uuid.UUID, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	out := make([]uuid.UUID, 0)
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := uuid.Parse(part)
		if err != nil {
			return nil, fmt.Errorf("%s must be a comma-separated list of uuids", label)
		}
		out = append(out, id)
	}
	return out, nil
}

func uuidStrings(values []uuid.UUID) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, value.String())
	}
	sort.Strings(out)
	return out
}

func missingStrings(required, present []string) []string {
	presentSet := stringTokenSet(present)
	out := make([]string, 0)
	for _, value := range required {
		if _, ok := presentSet[strings.ToLower(value)]; !ok {
			out = append(out, value)
		}
	}
	return out
}

func sortedSetStrings(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for value := range set {
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func appendUniqueString(values []string, value string) []string {
	if value == "" {
		return values
	}
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func appendUniqueUUID(values []uuid.UUID, value uuid.UUID) []uuid.UUID {
	if containsUUID(values, value) {
		return values
	}
	return append(values, value)
}

// ─── access graph builder ─────────────────────────────────────────

type accessGraphBuilder struct {
	nodes map[string]models.AccessGraphNode
	edges map[string]models.AccessGraphEdge
	order []string
}

func newAccessGraphBuilder() *accessGraphBuilder {
	return &accessGraphBuilder{
		nodes: make(map[string]models.AccessGraphNode),
		edges: make(map[string]models.AccessGraphEdge),
		order: make([]string, 0),
	}
}

func (b *accessGraphBuilder) addNode(node models.AccessGraphNode) {
	if node.ID == "" {
		return
	}
	if _, exists := b.nodes[node.ID]; exists {
		return
	}
	if node.Metadata == nil {
		node.Metadata = map[string]any{}
	}
	b.nodes[node.ID] = node
	b.order = append(b.order, node.ID)
}

func (b *accessGraphBuilder) addEdge(source, target, kind, label string, metadata map[string]any) {
	if source == "" || target == "" || kind == "" {
		return
	}
	id := source + "|" + kind + "|" + target
	if _, exists := b.edges[id]; exists {
		return
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	b.edges[id] = models.AccessGraphEdge{
		ID:       id,
		Source:   source,
		Target:   target,
		Kind:     kind,
		Label:    label,
		Metadata: metadata,
	}
}

func (b *accessGraphBuilder) response(projectID uuid.UUID) *models.AccessGraphResponse {
	nodes := make([]models.AccessGraphNode, 0, len(b.nodes))
	for _, id := range b.order {
		nodes = append(nodes, b.nodes[id])
	}
	edgeIDs := make([]string, 0, len(b.edges))
	for id := range b.edges {
		edgeIDs = append(edgeIDs, id)
	}
	sort.Strings(edgeIDs)
	edges := make([]models.AccessGraphEdge, 0, len(edgeIDs))
	for _, id := range edgeIDs {
		edges = append(edges, b.edges[id])
	}
	return &models.AccessGraphResponse{
		ProjectID: projectID,
		Nodes:     nodes,
		Edges:     edges,
		CheckedAt: time.Now().UTC(),
	}
}

func buildProjectAccessGraph(
	ctx context.Context,
	h *ProjectsHandlers,
	project *models.OntologyProject,
	subject *models.PermissionCheckRequest,
) (*models.AccessGraphResponse, error) {
	b := newAccessGraphBuilder()
	projectNode := graphProjectNodeID(project.ID)
	b.addNode(models.AccessGraphNode{
		ID:         projectNode,
		Kind:       models.AccessGraphNodeProject,
		Label:      project.DisplayName,
		ResourceID: &project.ID,
		Metadata: map[string]any{
			"slug":         project.Slug,
			"default_role": project.DefaultRole,
			"workspace":    project.WorkspaceSlug,
		},
	})

	ownerNode := graphUserNodeID(project.OwnerID)
	b.addNode(models.AccessGraphNode{ID: ownerNode, Kind: models.AccessGraphNodeUser, Label: "owner " + project.OwnerID.String(), ResourceID: &project.OwnerID})
	b.addEdge(ownerNode, projectRoleNodeID(project.ID, models.OntologyProjectRoleOwner), models.AccessGraphEdgeHasRole, "owns project", nil)
	addRoleNodeAndEdge(b, project.ID, projectRoleNodeID(project.ID, models.OntologyProjectRoleOwner), string(models.OntologyProjectRoleOwner), projectNode)
	b.addEdge(ownerNode, projectNode, models.AccessGraphEdgeOwns, "owns", nil)

	if subject != nil && subject.UserID != uuid.Nil {
		userNode := graphUserNodeID(subject.UserID)
		b.addNode(models.AccessGraphNode{ID: userNode, Kind: models.AccessGraphNodeUser, Label: "subject " + subject.UserID.String(), ResourceID: &subject.UserID})
		for _, gid := range subject.GroupIDs {
			groupNode := graphGroupNodeID(gid)
			b.addNode(models.AccessGraphNode{ID: groupNode, Kind: models.AccessGraphNodeGroup, Label: "group " + gid.String(), ResourceID: &gid})
			b.addEdge(userNode, groupNode, models.AccessGraphEdgeMemberOf, "supplied group fact", nil)
		}
	}

	if err := graphProjectOrganization(ctx, h, project, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectMemberships(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectGroups(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectFolders(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectResources(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectResourceGrants(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectRequiredMarkings(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	if err := graphProjectAccessGroupSettings(ctx, h, project.ID, b, projectNode); err != nil {
		return nil, err
	}
	graphProjectReferences(project, b, projectNode)
	if subject != nil {
		graphSubjectRequirements(subject, b, projectNode)
	}
	return b.response(project.ID), nil
}

func graphProjectOrganization(ctx context.Context, h *ProjectsHandlers, project *models.OntologyProject, b *accessGraphBuilder, projectNode string) error {
	orgID, err := loadProjectOrganizationID(ctx, h, project)
	if err != nil || orgID == nil {
		return err
	}
	orgNode := graphOrganizationNodeID(*orgID)
	b.addNode(models.AccessGraphNode{ID: orgNode, Kind: models.AccessGraphNodeOrganization, Label: "organization " + orgID.String(), ResourceID: orgID})
	b.addEdge(projectNode, orgNode, models.AccessGraphEdgeInOrganization, "workspace organization", nil)
	return nil
}

func graphProjectMemberships(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT user_id, role
		 FROM ontology_project_memberships
		 WHERE project_id = $1
		 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var userID uuid.UUID
		var role string
		if err := rows.Scan(&userID, &role); err != nil {
			return err
		}
		userNode := graphUserNodeID(userID)
		roleNode := projectRoleNodeID(projectID, models.OntologyProjectRole(role))
		b.addNode(models.AccessGraphNode{ID: userNode, Kind: models.AccessGraphNodeUser, Label: "user " + userID.String(), ResourceID: &userID})
		addRoleNodeAndEdge(b, projectID, roleNode, role, projectNode)
		b.addEdge(userNode, roleNode, models.AccessGraphEdgeHasRole, "direct project role", map[string]any{"role": role})
	}
	return rows.Err()
}

func graphProjectGroups(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT group_id, role
		 FROM ontology_project_group_memberships
		 WHERE project_id = $1
		 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var groupID uuid.UUID
		var role string
		if err := rows.Scan(&groupID, &role); err != nil {
			return err
		}
		groupNode := graphGroupNodeID(groupID)
		roleNode := projectRoleNodeID(projectID, models.OntologyProjectRole(role))
		b.addNode(models.AccessGraphNode{ID: groupNode, Kind: models.AccessGraphNodeGroup, Label: "group " + groupID.String(), ResourceID: &groupID})
		addRoleNodeAndEdge(b, projectID, roleNode, role, projectNode)
		b.addEdge(groupNode, roleNode, models.AccessGraphEdgeHasRole, "group project role", map[string]any{"role": role})
	}
	return rows.Err()
}

func graphProjectFolders(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT id, parent_folder_id, name
		 FROM ontology_project_folders
		 WHERE project_id = $1 AND is_deleted = FALSE
		 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var parentID *uuid.UUID
		var name string
		if err := rows.Scan(&id, &parentID, &name); err != nil {
			return err
		}
		folderNode := graphFolderNodeID(id)
		b.addNode(models.AccessGraphNode{ID: folderNode, Kind: models.AccessGraphNodeFolder, Label: name, ResourceID: &id})
		parentNode := projectNode
		if parentID != nil {
			parentNode = graphFolderNodeID(*parentID)
		}
		b.addEdge(parentNode, folderNode, models.AccessGraphEdgeContains, "contains folder", nil)
	}
	return rows.Err()
}

func graphProjectResources(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT resource_kind, resource_id
		 FROM ontology_project_resources
		 WHERE project_id = $1
		 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var id uuid.UUID
		if err := rows.Scan(&kind, &id); err != nil {
			return err
		}
		resourceNode := graphResourceNodeID(kind, id)
		b.addNode(models.AccessGraphNode{ID: resourceNode, Kind: models.AccessGraphNodeResource, Label: kind + " " + id.String(), ResourceID: &id, Metadata: map[string]any{"resource_kind": kind}})
		b.addEdge(projectNode, resourceNode, models.AccessGraphEdgeContains, "contains resource", nil)
	}
	return rows.Err()
}

func graphProjectResourceGrants(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT id, scope_kind, scope_id, principal_kind, principal_id, role
		 FROM ontology_project_resource_grants
		 WHERE project_id = $1
		 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var grantID uuid.UUID
		var scopeKind string
		var scopeID *uuid.UUID
		var principalKind string
		var principalID uuid.UUID
		var role string
		if err := rows.Scan(&grantID, &scopeKind, &scopeID, &principalKind, &principalID, &role); err != nil {
			return err
		}
		principalNode := graphUserNodeID(principalID)
		nodeKind := models.AccessGraphNodeUser
		label := "user " + principalID.String()
		if principalKind == models.ProjectGrantPrincipalGroup {
			principalNode = graphGroupNodeID(principalID)
			nodeKind = models.AccessGraphNodeGroup
			label = "group " + principalID.String()
		}
		b.addNode(models.AccessGraphNode{ID: principalNode, Kind: nodeKind, Label: label, ResourceID: &principalID})
		targetNode := projectNode
		roleNode := projectRoleNodeID(projectID, models.OntologyProjectRole(role))
		if scopeKind == models.ProjectGrantScopeFolder && scopeID != nil {
			targetNode = graphFolderNodeID(*scopeID)
			roleNode = folderRoleNodeID(*scopeID, models.OntologyProjectRole(role))
		}
		addRoleNodeAndEdge(b, projectID, roleNode, role, targetNode)
		b.addEdge(principalNode, roleNode, models.AccessGraphEdgeResourceGrant, "direct resource grant", map[string]any{
			"grant_id":   grantID.String(),
			"scope_kind": scopeKind,
			"scope_id":   scopeID,
			"role":       role,
		})
	}
	return rows.Err()
}

func graphProjectRequiredMarkings(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT marking_id, marking_name
		 FROM ontology_project_required_markings
		 WHERE project_id = $1
		 ORDER BY marking_name ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var markingID uuid.UUID
		var name string
		if err := rows.Scan(&markingID, &name); err != nil {
			return err
		}
		markingNode := graphMarkingNodeID(&markingID, name)
		b.addNode(models.AccessGraphNode{ID: markingNode, Kind: models.AccessGraphNodeMarking, Label: name, ResourceID: &markingID})
		b.addEdge(projectNode, markingNode, models.AccessGraphEdgeRequiresMarking, "project required marking", nil)
	}
	return rows.Err()
}

func graphProjectAccessGroupSettings(ctx context.Context, h *ProjectsHandlers, projectID uuid.UUID, b *accessGraphBuilder, projectNode string) error {
	rows, err := h.Pool.Query(ctx,
		`SELECT group_id, COALESCE(request_role, 'viewer'), group_kind, excluded_from_request_forms, group_display_name
		 FROM ontology_project_access_group_settings
		 WHERE project_id = $1
		 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var groupID uuid.UUID
		var role string
		var groupKind string
		var excluded bool
		var displayName *string
		if err := rows.Scan(&groupID, &role, &groupKind, &excluded, &displayName); err != nil {
			return err
		}
		groupNode := graphGroupNodeID(groupID)
		label := "requestable group " + groupID.String()
		if displayName != nil && strings.TrimSpace(*displayName) != "" {
			label = *displayName
		}
		roleNode := projectRoleNodeID(projectID, models.OntologyProjectRole(role))
		b.addNode(models.AccessGraphNode{ID: groupNode, Kind: models.AccessGraphNodeGroup, Label: label, ResourceID: &groupID, Metadata: map[string]any{"group_kind": groupKind}})
		addRoleNodeAndEdge(b, projectID, roleNode, role, projectNode)
		b.addEdge(groupNode, roleNode, models.AccessGraphEdgeRequestableGroupRole, "access-request group", map[string]any{
			"group_kind":                  groupKind,
			"excluded_from_request_forms": excluded,
		})
	}
	return rows.Err()
}

func graphProjectReferences(project *models.OntologyProject, b *accessGraphBuilder, projectNode string) {
	for _, ref := range project.References {
		target := graphResourceNodeID(ref.Kind, ref.ID)
		label := ref.Kind + " " + ref.ID.String()
		if ref.Label != "" {
			label = ref.Label
		}
		b.addNode(models.AccessGraphNode{ID: target, Kind: models.AccessGraphNodeResource, Label: label, ResourceID: &ref.ID, Metadata: map[string]any{"resource_kind": ref.Kind, "reference": true}})
		b.addEdge(projectNode, target, models.AccessGraphEdgeReferences, "project reference", map[string]any{"reference_kind": ref.Kind})
	}
}

func graphSubjectRequirements(subject *models.PermissionCheckRequest, b *accessGraphBuilder, projectNode string) {
	for _, orgID := range subject.UserOrganizationIDs {
		orgNode := graphOrganizationNodeID(orgID)
		userNode := graphUserNodeID(subject.UserID)
		b.addNode(models.AccessGraphNode{ID: orgNode, Kind: models.AccessGraphNodeOrganization, Label: "organization " + orgID.String(), ResourceID: &orgID})
		b.addEdge(userNode, orgNode, models.AccessGraphEdgeInOrganization, "supplied organization fact", nil)
	}
	for _, m := range subject.RequiredMarkings {
		markingNode := graphMarkingNodeID(m.MarkingID, m.MarkingName)
		b.addNode(models.AccessGraphNode{ID: markingNode, Kind: models.AccessGraphNodeMarking, Label: markingRequirementLabel(m), ResourceID: m.MarkingID})
		target := projectNode
		if m.SourceResourceID != nil {
			target = graphResourceNodeID(m.SourceResourceKind, *m.SourceResourceID)
		}
		b.addEdge(target, markingNode, models.AccessGraphEdgeRequiresMarking, "supplied marking requirement", map[string]any{"source": m.Source})
	}
	for _, rv := range subject.RestrictedViewRequirements {
		viewNode := graphRestrictedViewNodeID(rv.RestrictedViewID)
		b.addNode(models.AccessGraphNode{ID: viewNode, Kind: models.AccessGraphNodeRestrictedView, Label: restrictedViewLabel(rv), ResourceID: &rv.RestrictedViewID})
		b.addEdge(projectNode, viewNode, models.AccessGraphEdgeRequiresView, "restricted view", map[string]any{"policy_summary": rv.PolicySummary})
		for _, m := range rv.RequiredMarkings {
			markingNode := graphMarkingNodeID(m.MarkingID, m.MarkingName)
			b.addNode(models.AccessGraphNode{ID: markingNode, Kind: models.AccessGraphNodeMarking, Label: markingRequirementLabel(m), ResourceID: m.MarkingID})
			b.addEdge(viewNode, markingNode, models.AccessGraphEdgeRequiresMarking, "restricted-view marking", nil)
		}
	}
	for _, lr := range subject.LineageRequirements {
		sourceNode := graphResourceNodeID(lr.SourceResourceKind, lr.SourceResourceID)
		targetNode := projectNode
		if lr.TargetResourceID != nil {
			targetNode = graphResourceNodeID(lr.TargetResourceKind, *lr.TargetResourceID)
		}
		b.addNode(models.AccessGraphNode{ID: sourceNode, Kind: models.AccessGraphNodeResource, Label: lr.SourceResourceKind + " " + lr.SourceResourceID.String(), ResourceID: &lr.SourceResourceID, Metadata: map[string]any{"resource_kind": lr.SourceResourceKind}})
		if lr.TargetResourceID != nil {
			b.addNode(models.AccessGraphNode{ID: targetNode, Kind: models.AccessGraphNodeResource, Label: lr.TargetResourceKind + " " + lr.TargetResourceID.String(), ResourceID: lr.TargetResourceID, Metadata: map[string]any{"resource_kind": lr.TargetResourceKind}})
		}
		b.addEdge(sourceNode, targetNode, models.AccessGraphEdgeInheritedMarking, "lineage marking propagation", map[string]any{
			"relation_kind": lr.RelationKind,
			"marking_name":  lr.MarkingName,
			"marking_id":    lr.MarkingID,
			"path":          lr.Path,
		})
		markingNode := graphMarkingNodeID(lr.MarkingID, lr.MarkingName)
		b.addNode(models.AccessGraphNode{ID: markingNode, Kind: models.AccessGraphNodeMarking, Label: markingRequirementLabel(lineageRequirementMarking(lr)), ResourceID: lr.MarkingID})
		b.addEdge(targetNode, markingNode, models.AccessGraphEdgeRequiresMarking, "lineage-derived marking", map[string]any{"source": "lineage"})
	}
}

func addRoleNodeAndEdge(b *accessGraphBuilder, projectID uuid.UUID, roleNode, role, targetNode string) {
	b.addNode(models.AccessGraphNode{
		ID:    roleNode,
		Kind:  models.AccessGraphNodeRole,
		Label: role,
		Metadata: map[string]any{
			"project_id": projectID.String(),
			"role":       role,
		},
	})
	b.addEdge(roleNode, targetNode, models.AccessGraphEdgeRoleOn, "role applies to scope", map[string]any{"role": role})
}

func restrictedViewLabel(rv models.PermissionRestrictedViewRequirement) string {
	if rv.Label != "" {
		return rv.Label
	}
	return "restricted view " + rv.RestrictedViewID.String()
}

func graphProjectNodeID(id uuid.UUID) string { return "project:" + id.String() }
func graphUserNodeID(id uuid.UUID) string    { return "user:" + id.String() }
func graphGroupNodeID(id uuid.UUID) string   { return "group:" + id.String() }
func graphFolderNodeID(id uuid.UUID) string  { return "folder:" + id.String() }
func graphOrganizationNodeID(id uuid.UUID) string {
	return "organization:" + id.String()
}
func graphRestrictedViewNodeID(id uuid.UUID) string {
	return "restricted_view:" + id.String()
}
func graphResourceNodeID(kind string, id uuid.UUID) string {
	k := strings.TrimSpace(kind)
	if k == "" {
		k = "resource"
	}
	return "resource:" + k + ":" + id.String()
}
func graphMarkingNodeID(id *uuid.UUID, name string) string {
	if id != nil {
		return "marking:" + id.String()
	}
	return "marking:name:" + strings.ToLower(strings.TrimSpace(name))
}
func projectRoleNodeID(projectID uuid.UUID, role models.OntologyProjectRole) string {
	return "role:project:" + projectID.String() + ":" + string(role)
}
func folderRoleNodeID(folderID uuid.UUID, role models.OntologyProjectRole) string {
	return "role:folder:" + folderID.String() + ":" + string(role)
}
