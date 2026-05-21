// The 8 markings the PoC requires. Slugs are lowercase + hyphen-
// separated per Foundry convention; the marking's DisplayName is
// what the demo script shows ("MARKING:OFAC" etc.) and what the
// connector seed wrote into source attribution metadata.
//
// Mapping back to the connector seed
// ----------------------------------
//   services/connector-management-service/internal/seed/geopolitica/sources.go
// declares Markings: []string{"MARKING:GDELT-RAW", "MARKING:OFAC", …}
// — those strings are the DisplayName values here; conversion
// to slug is mechanical (lower + trim "MARKING:" prefix).

package geopolitica

func Markings() []SeedMarking {
	return []SeedMarking{
		// ── compartment-source ─────────────────────────────────────
		{
			Slug:         "gdelt-raw",
			CategorySlug: "compartment-source",
			DisplayName:  "GDELT-RAW",
			Description:  "GDELT bronze rows — raw event + GKG payloads pre-enrichment.",
		},
		{
			Slug:         "open-source",
			CategorySlug: "compartment-source",
			DisplayName:  "OPEN-SOURCE",
			Description:  "Permissive baseline marking — any analyst can read.",
		},
		{
			Slug:         "wikidata",
			CategorySlug: "compartment-source",
			DisplayName:  "WIKIDATA",
			Description:  "Wikidata-enriched Actor rows — open data but flagged for source attribution.",
		},
		{
			Slug:         "enriched-pii",
			CategorySlug: "compartment-source",
			DisplayName:  "ENRICHED-PII",
			Description: "Tradecraft-enriched rows that may contain inferred PII " +
				"(place of birth, family relations). Restricted to senior analysts.",
		},

		// ── compartment-sanctions ──────────────────────────────────
		{
			Slug:         "sanctions-list",
			CategorySlug: "compartment-sanctions",
			DisplayName:  "SANCTIONS-LIST",
			Description:  "Umbrella marking for any sanctions-derived row regardless of jurisdiction.",
		},
		{
			Slug:         "ofac",
			CategorySlug: "compartment-sanctions",
			DisplayName:  "OFAC",
			Description: "US Treasury OFAC SDN-derived rows. Compliance and senior analyst roles see these; " +
				"default analyst clearance does NOT.",
		},
		{
			Slug:         "eu",
			CategorySlug: "compartment-sanctions",
			DisplayName:  "EU",
			Description:  "EU Consolidated sanctions-derived rows.",
		},
		{
			Slug:         "opensanctions",
			CategorySlug: "compartment-sanctions",
			DisplayName:  "OPENSANCTIONS",
			Description:  "OpenSanctions consolidated list — broader PEP coverage.",
		},
	}
}
