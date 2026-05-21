// User-grant matrix for the PoC demo personas. DECLARATIVE — the
// seed does NOT apply these grants because the user RIDs live in
// identity-federation-service and don't exist at this service's boot
// time. Operators apply them in a separate step (Item 5 / demo prep)
// once Keycloak users are seeded.
//
// Sofía Gómez (analyst) holds ALL 8 markings — she's the broad-
// clearance demo persona. Marcos Fernández (compliance) holds 6:
// MISSING OFAC + ENRICHED-PII so the demo "switch users" flow shows
// the redaction surface working end-to-end (an OFAC-tagged row
// disappears from object-explorer + lineage + the AIP response when
// Marcos is the caller).
//
// The grant matrix encodes the **principle of least surprise**: if
// the demo claims "Marcos has narrower clearance", reviewers should
// be able to verify the exact subset in code, not in a slide deck.

package geopolitica

func UserGrants() []UserGrant {
	allSlugs := allMarkingSlugs()
	marcosSlugs := make([]string, 0, len(allSlugs))
	excluded := map[string]struct{}{
		"ofac":         {},
		"enriched-pii": {},
	}
	for _, slug := range allSlugs {
		if _, drop := excluded[slug]; drop {
			continue
		}
		marcosSlugs = append(marcosSlugs, slug)
	}

	return []UserGrant{
		{
			UserEmail:    "sofia.gomez@acme-intel.demo",
			Role:         "analyst",
			MarkingSlugs: allSlugs,
		},
		{
			UserEmail:    "marcos.fernandez@acme-intel.demo",
			Role:         "compliance",
			MarkingSlugs: marcosSlugs,
		},
	}
}

func allMarkingSlugs() []string {
	out := make([]string, 0, expectedMarkings)
	for _, m := range Markings() {
		out = append(out, m.Slug)
	}
	return out
}
