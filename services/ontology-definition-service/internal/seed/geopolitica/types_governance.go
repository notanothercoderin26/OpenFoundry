// Governance family — Sanctions + Watchlist + InvestigationCase +
// ActorAlert + ActionLog. These types are the case-management surface
// the analyst interacts with via the 8 action types; PoC contract
// makes them first-class ontology objects rather than implementation
// details so the Action Log + workflow steps remain queryable.

package geopolitica

func sanctionsEntryObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "SanctionsEntry",
		DisplayName:   "Sanctions Entry",
		Description:   "One row per (program, listed entity, jurisdiction) — converged from OFAC + EU + OpenSanctions.",
		PrimaryKey:    "entry_id",
		TitleProperty: "listed_entity_name",
		Icon:          "alert",
		Properties: []SeedProperty{
			{Name: "entry_id", DisplayName: "Entry ID", PropertyType: "string", Required: true},
			{Name: "program", DisplayName: "Program", PropertyType: "string"},
			{Name: "jurisdiction", DisplayName: "Jurisdiction", PropertyType: "string"},
			{Name: "listed_entity_name", DisplayName: "Listed name", PropertyType: "string"},
			{Name: "listed_at", DisplayName: "Listed at", PropertyType: "date"},
			{Name: "delisted_at", DisplayName: "Delisted at", PropertyType: "date"},
			{Name: "source_dataset", DisplayName: "Source", PropertyType: "string"},
			{Name: "resolved_actor_id", DisplayName: "Resolved actor ID", PropertyType: "string"},
		},
	}
}

func watchlistObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "Watchlist",
		DisplayName:   "Watchlist",
		Description:   "Analyst-curated set of actors. Members emit ActorAlert rows when matched against new activity.",
		PrimaryKey:    "watchlist_id",
		TitleProperty: "name",
		Icon:          "bookmark",
		Properties: []SeedProperty{
			{Name: "watchlist_id", DisplayName: "Watchlist ID", PropertyType: "string", Required: true},
			{Name: "name", DisplayName: "Name", PropertyType: "string"},
			{Name: "description", DisplayName: "Description", PropertyType: "string"},
			{Name: "created_by_user_id", DisplayName: "Created by", PropertyType: "string"},
			{Name: "created_at_utc", DisplayName: "Created (UTC)", PropertyType: "timestamp"},
			{Name: "priority", DisplayName: "Priority", PropertyType: "string"},
			{Name: "member_count", DisplayName: "Members", PropertyType: "integer"},
		},
	}
}

func investigationCaseObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "InvestigationCase",
		DisplayName:   "Investigation Case",
		Description:   "Case-management object created by the open-investigation-case action; carries the SLA + assignee + summary.",
		PrimaryKey:    "case_id",
		TitleProperty: "title",
		Icon:          "folder",
		Properties: []SeedProperty{
			{Name: "case_id", DisplayName: "Case ID", PropertyType: "string", Required: true},
			{Name: "title", DisplayName: "Title", PropertyType: "string"},
			{Name: "status", DisplayName: "Status", PropertyType: "string"}, // OPEN | IN_REVIEW | CLOSED_NO_ACTION | ESCALATED
			{Name: "priority", DisplayName: "Priority", PropertyType: "string"},
			{Name: "opened_by_user_id", DisplayName: "Opened by", PropertyType: "string"},
			{Name: "assigned_to_user_id", DisplayName: "Assigned to", PropertyType: "string"},
			{Name: "opened_at_utc", DisplayName: "Opened (UTC)", PropertyType: "timestamp"},
			{Name: "closed_at_utc", DisplayName: "Closed (UTC)", PropertyType: "timestamp"},
			{Name: "summary", DisplayName: "Summary", PropertyType: "text"},
			{Name: "subject_actor_ids", DisplayName: "Subject actor IDs", PropertyType: "text"},
		},
	}
}

func actorAlertObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "ActorAlert",
		DisplayName:   "Actor Alert",
		Description:   "Alert raised by the watchlist→alert workflow when a watchlisted actor appears in new activity.",
		PrimaryKey:    "alert_id",
		TitleProperty: "alert_id",
		Icon:          "bell",
		Properties: []SeedProperty{
			{Name: "alert_id", DisplayName: "Alert ID", PropertyType: "string", Required: true},
			{Name: "watchlist_id", DisplayName: "Watchlist ID", PropertyType: "string"},
			{Name: "subject_actor_id", DisplayName: "Subject actor", PropertyType: "string"},
			{Name: "triggering_event_id", DisplayName: "Triggering event", PropertyType: "string"},
			{Name: "raised_at_utc", DisplayName: "Raised (UTC)", PropertyType: "timestamp"},
			{Name: "acknowledged_at_utc", DisplayName: "Acknowledged (UTC)", PropertyType: "timestamp"},
			{Name: "acknowledged_by_user_id", DisplayName: "Acknowledged by", PropertyType: "string"},
		},
	}
}

func actionLogObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "ActionLog",
		DisplayName:   "Action Log",
		Description:   "Per-submission audit record; queryable via the AIP and the governance dashboard.",
		PrimaryKey:    "log_id",
		TitleProperty: "action_type_id",
		Icon:          "history",
		Properties: []SeedProperty{
			{Name: "log_id", DisplayName: "Log ID", PropertyType: "string", Required: true},
			{Name: "action_type_id", DisplayName: "Action type", PropertyType: "string"},
			{Name: "actor_user_id", DisplayName: "Submitter", PropertyType: "string"},
			{Name: "submitted_at_utc", DisplayName: "Submitted (UTC)", PropertyType: "timestamp"},
			{Name: "target_object_type", DisplayName: "Target object type", PropertyType: "string"},
			{Name: "target_object_id", DisplayName: "Target object ID", PropertyType: "string"},
			{Name: "parameters", DisplayName: "Parameters", PropertyType: "json"},
			{Name: "outcome", DisplayName: "Outcome", PropertyType: "string"}, // SUCCESS | VALIDATION_REJECT | POLICY_REJECT | SIDE_EFFECT_FAIL
			{Name: "produced_edits", DisplayName: "Produced edits", PropertyType: "text"},
		},
	}
}
