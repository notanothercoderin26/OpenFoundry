// Catalog aggregators — keep all 14 object types + 13 link types
// together so the seed walks them deterministically and tests can
// assert the count.

package geopolitica

// ObjectTypes returns the 14 SeedObjectType entries in the canonical
// load order: Actor family first (so sub-types exist before bindings
// are attached), then Event family, geo, sanctions, governance.
//
// Order matters for two reasons:
//   1. Link types reference source/target object types by name; later
//      link-type creation must find them.
//   2. Interface bindings (Person/Organization/ArmedGroup/GovernmentBody
//      → IActor) need the sub-Actor types resolved first.
//
// Returns a fresh slice every call so callers can mutate without
// poisoning package state.
func ObjectTypes() []SeedObjectType {
	return []SeedObjectType{
		actorObjectType(),
		personObjectType(),
		organizationObjectType(),
		armedGroupObjectType(),
		governmentBodyObjectType(),

		eventObjectType(),
		newsArticleObjectType(),

		locationObjectType(),
		countryObjectType(),

		sanctionsEntryObjectType(),

		watchlistObjectType(),
		investigationCaseObjectType(),
		actorAlertObjectType(),
		actionLogObjectType(),
	}
}

// LinkTypes returns the 13 SeedLinkType entries. Naming is UPPER_SNAKE
// per the PoC contract; cardinality strings match the link_types table
// CHECK constraint (`one_to_one|one_to_many|many_to_one|many_to_many`).
func LinkTypes() []SeedLinkType {
	return []SeedLinkType{
		{Name: "MENTIONED_IN", DisplayName: "Mentioned in", SourceName: "Actor", TargetName: "NewsArticle", Cardinality: "many_to_many"},
		{Name: "INVOLVED_IN", DisplayName: "Involved in", SourceName: "Actor", TargetName: "Event", Cardinality: "many_to_many"},
		{Name: "OCCURRED_AT", DisplayName: "Occurred at", SourceName: "Event", TargetName: "Location", Cardinality: "many_to_one"},
		{Name: "LOCATED_IN", DisplayName: "Located in", SourceName: "Location", TargetName: "Country", Cardinality: "many_to_one"},
		{Name: "SANCTIONED_BY", DisplayName: "Sanctioned by", SourceName: "Actor", TargetName: "SanctionsEntry", Cardinality: "many_to_many"},
		{Name: "MEMBER_OF", DisplayName: "Member of", SourceName: "Person", TargetName: "Organization", Cardinality: "many_to_many"},
		{Name: "AFFILIATED_WITH", DisplayName: "Affiliated with", SourceName: "Organization", TargetName: "Organization", Cardinality: "many_to_many"},
		{Name: "CITIZEN_OF", DisplayName: "Citizen of", SourceName: "Person", TargetName: "Country", Cardinality: "many_to_many"},
		{Name: "ASSOCIATED_WITH", DisplayName: "Associated with", SourceName: "Actor", TargetName: "Actor", Cardinality: "many_to_many"},
		{Name: "ON_WATCHLIST", DisplayName: "On watchlist", SourceName: "Watchlist", TargetName: "Actor", Cardinality: "many_to_many"},
		{Name: "INVESTIGATES", DisplayName: "Investigates", SourceName: "InvestigationCase", TargetName: "Actor", Cardinality: "many_to_many"},
		{Name: "RAISED_FOR", DisplayName: "Raised for", SourceName: "ActorAlert", TargetName: "Actor", Cardinality: "many_to_one"},
		{Name: "EVIDENCE_OF", DisplayName: "Evidence of", SourceName: "Event", TargetName: "InvestigationCase", Cardinality: "many_to_many"},
	}
}
