// Actor family — the canonical umbrella + 4 sub-types implementing
// IActor. Every actor row shares the 12 common properties; sub-types
// add their own. The 12 common properties live in `commonActorProps`
// so the 5 type literals stay readable.

package geopolitica

// commonActorProps is the 12-property contract from
// PoC/geopolitica/05-ontologia-geopolitica.md §"`Actor` (interface)".
// Every concrete sub-type (Person, Organization, ArmedGroup,
// GovernmentBody) carries all 12 so a uniform pivot from a saved
// `Actor` object set works regardless of which sub-type backs the row.
//
// IActor interface declares the same 12 — keeping the YAML asset and
// this slice in sync is enforced by tests at the binding level.
var commonActorProps = []SeedProperty{
	{Name: "actor_id", DisplayName: "Actor ID", PropertyType: "string", Required: true},
	{Name: "display_name", DisplayName: "Display name", PropertyType: "string", Required: true},
	{Name: "aliases", DisplayName: "Aliases", PropertyType: "text"},
	{Name: "kind", DisplayName: "Kind", PropertyType: "string"}, // PERSON | ORG | ARMED_GROUP | GOV
	{Name: "wikidata_qid", DisplayName: "Wikidata QID", PropertyType: "string"},
	{Name: "country_iso2", DisplayName: "Country ISO2", PropertyType: "string"},
	{Name: "is_sanctioned", DisplayName: "Sanctioned", PropertyType: "boolean"},
	{Name: "last_seen_at_utc", DisplayName: "Last seen (UTC)", PropertyType: "timestamp"},
	{Name: "event_count_30d", DisplayName: "Events (30d)", PropertyType: "integer"},
	{Name: "reliability_score", DisplayName: "Reliability score", PropertyType: "double"},
	{Name: "tradecraft_tags", DisplayName: "Tradecraft tags", PropertyType: "text"},
	{Name: "source_ids", DisplayName: "Source IDs", PropertyType: "json"},
}

func actorObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "Actor",
		DisplayName:   "Actor",
		Description:   "Canonical actor row produced by the ER transform. One per unique actor across all sources.",
		PrimaryKey:    "actor_id",
		TitleProperty: "display_name",
		Icon:          "people",
		Properties:    commonActorProps,
		// `Actor` is itself the umbrella; it does NOT implement IActor —
		// the 4 sub-types do.
	}
}

func personObjectType() SeedObjectType {
	props := append([]SeedProperty{}, commonActorProps...)
	props = append(props,
		SeedProperty{Name: "date_of_birth", DisplayName: "Date of birth", PropertyType: "date"},
		SeedProperty{Name: "place_of_birth", DisplayName: "Place of birth", PropertyType: "string"},
		SeedProperty{Name: "position_held", DisplayName: "Position held", PropertyType: "text"},
		SeedProperty{Name: "pep_class", DisplayName: "PEP class", PropertyType: "string"},
	)
	return SeedObjectType{
		Name:             "Person",
		DisplayName:      "Person",
		Description:      "Natural person — IActor implementer.",
		PrimaryKey:       "actor_id",
		TitleProperty:    "display_name",
		Icon:             "person",
		Properties:       props,
		ImplementsIActor: true,
	}
}

func organizationObjectType() SeedObjectType {
	props := append([]SeedProperty{}, commonActorProps...)
	props = append(props,
		SeedProperty{Name: "founded_year", DisplayName: "Founded year", PropertyType: "integer"},
		SeedProperty{Name: "industry_codes", DisplayName: "Industry codes", PropertyType: "text"},
		SeedProperty{Name: "parent_organization_id", DisplayName: "Parent org ID", PropertyType: "string"},
		SeedProperty{Name: "headquarters_location_id", DisplayName: "HQ location ID", PropertyType: "string"},
	)
	return SeedObjectType{
		Name:             "Organization",
		DisplayName:      "Organization",
		Description:      "Non-state organization (company, NGO, criminal network) — IActor implementer.",
		PrimaryKey:       "actor_id",
		TitleProperty:    "display_name",
		Icon:             "building",
		Properties:       props,
		ImplementsIActor: true,
	}
}

func armedGroupObjectType() SeedObjectType {
	props := append([]SeedProperty{}, commonActorProps...)
	props = append(props,
		SeedProperty{Name: "acled_actor_type", DisplayName: "ACLED actor type", PropertyType: "string"},
		SeedProperty{Name: "parent_group_id", DisplayName: "Parent group ID", PropertyType: "string"},
	)
	return SeedObjectType{
		Name:             "ArmedGroup",
		DisplayName:      "Armed Group",
		Description:      "Non-state armed faction (per ACLED schema) — IActor implementer.",
		PrimaryKey:       "actor_id",
		TitleProperty:    "display_name",
		Icon:             "shield",
		Properties:       props,
		ImplementsIActor: true,
	}
}

func governmentBodyObjectType() SeedObjectType {
	props := append([]SeedProperty{}, commonActorProps...)
	props = append(props,
		SeedProperty{Name: "branch_of_government", DisplayName: "Branch of government", PropertyType: "string"},
	)
	return SeedObjectType{
		Name:             "GovernmentBody",
		DisplayName:      "Government Body",
		Description:      "Ministry, agency, or executive office — IActor implementer.",
		PrimaryKey:       "actor_id",
		TitleProperty:    "display_name",
		Icon:             "government",
		Properties:       props,
		ImplementsIActor: true,
	}
}
