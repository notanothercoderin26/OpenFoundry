// Event family — Event + NewsArticle. Both are time-indexed and
// link-heavy; properties mirror the GDELT/ACLED column families.

package geopolitica

func eventObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "Event",
		DisplayName:   "Event",
		Description:   "Geopolitical event with CAMEO/ACLED classification, location, and actor links.",
		PrimaryKey:    "event_id",
		TitleProperty: "event_id",
		Icon:          "zap",
		Properties: []SeedProperty{
			{Name: "event_id", DisplayName: "Event ID", PropertyType: "string", Required: true},
			{Name: "source", DisplayName: "Source", PropertyType: "string"}, // GDELT | ACLED | SYNTH
			{Name: "event_datetime_utc", DisplayName: "Event time (UTC)", PropertyType: "timestamp"},
			{Name: "cameo_event_code", DisplayName: "CAMEO code", PropertyType: "string"},
			{Name: "cameo_quad_class", DisplayName: "CAMEO quad class", PropertyType: "string"},
			{Name: "acled_event_type", DisplayName: "ACLED event type", PropertyType: "string"},
			{Name: "acled_sub_event_type", DisplayName: "ACLED sub event type", PropertyType: "string"},
			{Name: "fatalities", DisplayName: "Fatalities", PropertyType: "integer"},
			{Name: "tone", DisplayName: "Tone", PropertyType: "double"},
			{Name: "goldstein_scale", DisplayName: "Goldstein scale", PropertyType: "double"},
			{Name: "actor1_id", DisplayName: "Actor1", PropertyType: "string"},
			{Name: "actor2_id", DisplayName: "Actor2", PropertyType: "string"},
			{Name: "location_id", DisplayName: "Location", PropertyType: "string"},
			{Name: "country_iso2", DisplayName: "Country ISO2", PropertyType: "string"},
			// source_url is marking-restricted at row level per the PoC
			// contract — that enforcement lives in authorization-policy-
			// service, not in the property definition. Documenting here
			// for reviewers.
			{Name: "source_url", DisplayName: "Source URL", PropertyType: "string"},
		},
	}
}

func newsArticleObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "NewsArticle",
		DisplayName:   "News Article",
		Description:   "Per-article record from GDELT GKG; carries themes + actor mentions for retrieval-context tools.",
		PrimaryKey:    "article_id",
		TitleProperty: "title",
		Icon:          "news",
		Properties: []SeedProperty{
			{Name: "article_id", DisplayName: "Article ID", PropertyType: "string", Required: true},
			{Name: "url", DisplayName: "URL", PropertyType: "string"},
			{Name: "publish_datetime_utc", DisplayName: "Published (UTC)", PropertyType: "timestamp"},
			{Name: "language", DisplayName: "Language", PropertyType: "string"},
			{Name: "domain", DisplayName: "Domain", PropertyType: "string"},
			{Name: "title", DisplayName: "Title", PropertyType: "string"},
			{Name: "outlet", DisplayName: "Outlet", PropertyType: "string"},
			{Name: "themes", DisplayName: "Themes", PropertyType: "text"},
			{Name: "tone", DisplayName: "Tone", PropertyType: "double"},
			{Name: "actors_mentioned", DisplayName: "Actors mentioned", PropertyType: "text"},
		},
	}
}
