// Geo family — Location + Country. Country uses ISO 3166-1 alpha-2 as
// primary key per the PoC spec.

package geopolitica

func locationObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "Location",
		DisplayName:   "Location",
		Description:   "Geocoded place: city / admin region / coordinates with precision tag.",
		PrimaryKey:    "location_id",
		TitleProperty: "name",
		Icon:          "map-pin",
		Properties: []SeedProperty{
			{Name: "location_id", DisplayName: "Location ID", PropertyType: "string", Required: true},
			{Name: "name", DisplayName: "Name", PropertyType: "string"},
			{Name: "lat", DisplayName: "Latitude", PropertyType: "double"},
			{Name: "lon", DisplayName: "Longitude", PropertyType: "double"},
			{Name: "country_iso2", DisplayName: "Country ISO2", PropertyType: "string"},
			{Name: "admin1_name", DisplayName: "Admin1", PropertyType: "string"},
			{Name: "admin2_name", DisplayName: "Admin2", PropertyType: "string"},
			{Name: "precision", DisplayName: "Precision", PropertyType: "string"}, // COUNTRY | ADMIN1 | CITY | GEOPOINT
		},
	}
}

func countryObjectType() SeedObjectType {
	return SeedObjectType{
		Name:          "Country",
		DisplayName:   "Country",
		Description:   "ISO 3166-1 country.",
		PrimaryKey:    "iso2",
		TitleProperty: "name",
		Icon:          "flag",
		Properties: []SeedProperty{
			{Name: "iso2", DisplayName: "ISO2", PropertyType: "string", Required: true},
			{Name: "iso3", DisplayName: "ISO3", PropertyType: "string"},
			{Name: "name", DisplayName: "Name", PropertyType: "string"},
			{Name: "region", DisplayName: "Region", PropertyType: "string"},
			{Name: "subregion", DisplayName: "Subregion", PropertyType: "string"},
		},
	}
}
