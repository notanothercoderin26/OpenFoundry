// The 8 PoC action types. Order is the canonical load order — keep
// alphabetical-by-name for review-friendliness and easy diff against
// the YAML asset under PoC/geopolitica/assets/ontology-geopolitica.yaml.

package geopolitica

// ActionTypes returns the 8 SeedActionType entries the PoC contract
// requires. The list is materialised fresh on every call so callers
// can mutate without poisoning package state.
//
// Foundry-native notes per entry:
//
//   - `confirmation_required=true` matches the AIP Chatbot Studio
//     rule that write actions invoked by the agent must surface a
//     confirmation prompt to the user. See action-types/use-actions
//     reference.
//   - `permission_key` follows the existing `role:<name>` convention
//     consumed by `authorization-policy-service`. Roles are seeded
//     separately as part of the markings/identity bootstrap (Item 3).
//   - `propose-sanctions-extension` is declared with `operation_kind
//     = create` but is gated to branch contexts via the workflow
//     layer (Item 9), not via the action-type schema. The PoC demo
//     script must say so explicitly.
func ActionTypes() []SeedActionType {
	return []SeedActionType{
		{
			Name:                 "acknowledge-alert",
			DisplayName:          "Acknowledge alert",
			Description:          "Mark an ActorAlert as acknowledged. Skip confirmation — analyst is acting in real-time.",
			TargetObjectTypeName: "ActorAlert",
			OperationKind:        "modify",
			ConfirmationRequired: false,
			PermissionKey:        "role:analyst",
		},
		{
			Name:                 "add-to-watchlist",
			DisplayName:          "Add to watchlist",
			Description:          "Add an Actor to a Watchlist (creates a new Watchlist if `watchlist_id` is null).",
			TargetObjectTypeName: "Watchlist",
			OperationKind:        "modify",
			ConfirmationRequired: true,
			PermissionKey:        "role:analyst",
		},
		{
			Name:                 "assign-investigation",
			DisplayName:          "Assign investigation",
			Description:          "Set the assignee on an InvestigationCase.",
			TargetObjectTypeName: "InvestigationCase",
			OperationKind:        "modify",
			ConfirmationRequired: false,
			PermissionKey:        "role:compliance",
		},
		{
			Name:                 "close-investigation-case",
			DisplayName:          "Close investigation case",
			Description:          "Freeze an InvestigationCase with an outcome (CLOSED_NO_ACTION or ESCALATED).",
			TargetObjectTypeName: "InvestigationCase",
			OperationKind:        "modify",
			ConfirmationRequired: true,
			PermissionKey:        "role:compliance",
		},
		{
			Name:                 "flag-actor",
			DisplayName:          "Flag actor",
			Description:          "Mark an Actor as flagged + raise an ActorAlert if the actor is on any active watchlist.",
			TargetObjectTypeName: "Actor",
			OperationKind:        "modify",
			ConfirmationRequired: true,
			PermissionKey:        "role:analyst",
		},
		{
			Name:                 "merge-actors",
			DisplayName:          "Merge actors",
			Description:          "Merge two Actor rows into the canonical golden record (post-ER manual correction).",
			TargetObjectTypeName: "Actor",
			OperationKind:        "modify",
			ConfirmationRequired: true,
			PermissionKey:        "role:senior-analyst",
		},
		{
			Name:                 "open-investigation-case",
			DisplayName:          "Open investigation case",
			Description:          "Create a new InvestigationCase + link the subject Actor + trigger the case-opened workflow.",
			TargetObjectTypeName: "InvestigationCase",
			OperationKind:        "create",
			ConfirmationRequired: true,
			PermissionKey:        "role:compliance",
		},
		{
			Name:                 "propose-sanctions-extension",
			DisplayName:          "Propose sanctions extension",
			Description:          "Create candidate SanctionsEntry rows on a Global Branch only. Senior approval required to merge.",
			TargetObjectTypeName: "SanctionsEntry",
			OperationKind:        "create",
			ConfirmationRequired: true,
			PermissionKey:        "role:compliance",
		},
	}
}
