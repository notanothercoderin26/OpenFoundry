// The 2 marking categories the PoC requires. Visibility=visible so
// any analyst can SEE the existence of the category (and therefore
// understand why a row is redacted). Membership of individual
// markings within the category is what gates access — managed via
// `marking_category_permissions` + `marking_permissions` tables.

package geopolitica

func Categories() []SeedMarkingCategory {
	return []SeedMarkingCategory{
		{
			Slug:        "compartment-source",
			DisplayName: "Source compartment",
			Description: "Groups markings that compartmentalise data by upstream source. " +
				"Each ingested row carries one of these markings so analysts without the matching grant " +
				"cannot see the source-attributed rows in Workshop / AIP / lineage / object-explorer.",
			Visibility: "visible",
		},
		{
			Slug:        "compartment-sanctions",
			DisplayName: "Sanctions compartment",
			Description: "Groups markings for the three sanctions sources (OFAC, EU, OpenSanctions). " +
				"The umbrella SANCTIONS-LIST marking covers all three; row-level marking carries the specific source.",
			Visibility: "visible",
		},
	}
}
