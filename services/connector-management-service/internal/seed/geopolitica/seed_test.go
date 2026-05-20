package geopolitica

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/models"
)

// --- fake sink -------------------------------------------------------------

type fakeSink struct {
	existing []models.Connection
	created  []models.Connection
}

func (f *fakeSink) ListConnections(_ context.Context, _ *uuid.UUID) ([]models.Connection, error) {
	return f.existing, nil
}

func (f *fakeSink) CreateConnection(_ context.Context, body *models.CreateConnectionRequest, ownerID uuid.UUID) (*models.Connection, error) {
	c := models.Connection{
		ID:            uuid.New(),
		Name:          body.Name,
		ConnectorType: body.ConnectorType,
		Config:        body.Config,
		Status:        "ready",
		OwnerID:       ownerID,
	}
	f.created = append(f.created, c)
	return &c, nil
}

// --- catalog shape ---------------------------------------------------------

func TestSeedsCatalogHasSevenSources(t *testing.T) {
	seeds := Seeds()
	require.Len(t, seeds, 7,
		"PoC contract registers GDELT events + GDELT GKG + ACLED + OFAC + EU + OpenSanctions + Wikidata")
	require.ElementsMatch(t, []string{
		"GDELT 2.0 events (15-min drop)",
		"GDELT 2.0 GKG mentions",
		"ACLED conflict events",
		"OFAC SDN list (US Treasury)",
		"EU Consolidated sanctions",
		"OpenSanctions consolidated",
		"Wikidata SPARQL (geopolitical actors)",
	}, SeedNames())
}

func TestSeedNamesAreSortedAlphabetically(t *testing.T) {
	names := SeedNames()
	for i := 1; i < len(names); i++ {
		require.LessOrEqual(t, names[i-1], names[i], "SeedNames() must return sorted output")
	}
}

func TestSeedsAreFreshOnEveryCall(t *testing.T) {
	a := Seeds()
	a[0].Name = "tampered"
	b := Seeds()
	require.NotEqual(t, "tampered", b[0].Name,
		"Seeds() must not return a shared mutable slice")
}

func TestEverySeedDeclaresMarkingsAndPipelineDoc(t *testing.T) {
	for _, s := range Seeds() {
		require.NotEmpty(t, s.Markings, s.Name+" must declare at least one source-level marking")
		require.NotEmpty(t, s.DownstreamPipelineDoc, s.Name+" must declare its bronze→silver→gold pipeline")
		require.True(t, json.Valid(s.Config), s.Name+" must carry valid JSON config")
		require.NotEmpty(t, s.ConnectorType, s.Name+" must pin a connector_type")
	}
}

func TestEverySeedConnectorTypeIsSupported(t *testing.T) {
	supported := map[string]bool{"rest_api": true, "csv": true}
	for _, s := range Seeds() {
		require.True(t, supported[s.ConnectorType],
			"seed %q uses unsupported connector_type %q — extend DefaultValidator before adding new types",
			s.Name, s.ConnectorType)
	}
}

// --- contract validation ---------------------------------------------------

func TestDefaultValidatorAcceptsEverySeed(t *testing.T) {
	for _, s := range Seeds() {
		err := DefaultValidator(s.ConnectorType, s.Config)
		require.NoError(t, err, "seed %q must pass its adapter's ValidateConfig", s.Name)
	}
}

func TestDefaultValidatorRejectsUnknownConnectorType(t *testing.T) {
	err := DefaultValidator("postgres", json.RawMessage(`{}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "no validator registered")
}

// --- load behaviour --------------------------------------------------------

func TestLoadInsertsEverySeedOnEmptySink(t *testing.T) {
	sink := &fakeSink{}
	out, err := Load(context.Background(), sink, uuid.New(), DefaultValidator)
	require.NoError(t, err)
	require.Len(t, out.Created, 7)
	require.Empty(t, out.Skipped)
	require.Len(t, sink.created, 7)
}

func TestLoadIsIdempotentByName(t *testing.T) {
	owner := uuid.New()
	// Pre-seed the sink with one of the connections so we can
	// confirm Load skips it.
	sink := &fakeSink{
		existing: []models.Connection{{
			ID:            uuid.New(),
			Name:          "GDELT 2.0 events (15-min drop)",
			ConnectorType: "csv",
			OwnerID:       owner,
		}},
	}
	out, err := Load(context.Background(), sink, owner, DefaultValidator)
	require.NoError(t, err)
	require.Len(t, out.Created, 6)
	require.Len(t, out.Skipped, 1)
	require.Equal(t, "GDELT 2.0 events (15-min drop)", out.Skipped[0].Name)
	require.Contains(t, out.Skipped[0].Reason, "already exists")
}

func TestLoadShortCircuitsOnValidatorFailure(t *testing.T) {
	sink := &fakeSink{}
	failingValidator := func(connectorType string, _ json.RawMessage) error {
		// Reject ACLED specifically so we know the loader walks every
		// seed up-front instead of partially seeding.
		if connectorType == "rest_api" {
			return errors.New("forced failure for test")
		}
		return nil
	}
	_, err := Load(context.Background(), sink, uuid.New(), failingValidator)
	require.Error(t, err)
	require.Empty(t, sink.created, "no row should be written when validation fails")
}

func TestLoadAcceptsNilValidator(t *testing.T) {
	sink := &fakeSink{}
	out, err := Load(context.Background(), sink, uuid.New(), nil)
	require.NoError(t, err)
	require.Len(t, out.Created, 7)
}

// --- per-source spot checks -------------------------------------------------

func TestACLEDSeedCarriesAPIKeyHint(t *testing.T) {
	acled := findSeed(t, "ACLED conflict events")
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(acled.Config, &cfg))
	runtime, ok := cfg["runtime"].(map[string]any)
	require.True(t, ok)
	hint, _ := runtime["policy_hint"].(string)
	require.Contains(t, hint, "ACLED_API_KEY",
		"operators must learn from the policy hint where the API key comes from")
}

func TestOFACSeedDeclaresXMLFormatHint(t *testing.T) {
	ofac := findSeed(t, "OFAC SDN list (US Treasury)")
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(ofac.Config, &cfg))
	require.Equal(t, "xml", cfg["format_hint"],
		"XML downstream decoders dispatch on this hint")
}

func TestWikidataSeedSetsUserAgent(t *testing.T) {
	w := findSeed(t, "Wikidata SPARQL (geopolitical actors)")
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(w.Config, &cfg))
	headers, ok := cfg["headers"].(map[string]any)
	require.True(t, ok, "Wikidata etiquette requires a UA")
	ua, _ := headers["User-Agent"].(string)
	require.Contains(t, ua, "OpenFoundry-PoC-Geopolitica")
}

func TestGDELTSeedsShareLastupdatePointer(t *testing.T) {
	events := findSeed(t, "GDELT 2.0 events (15-min drop)")
	gkg := findSeed(t, "GDELT 2.0 GKG mentions")
	var eventsCfg, gkgCfg map[string]any
	require.NoError(t, json.Unmarshal(events.Config, &eventsCfg))
	require.NoError(t, json.Unmarshal(gkg.Config, &gkgCfg))
	require.Equal(t, eventsCfg["url"], gkgCfg["url"],
		"both feeds index off the same lastupdate.txt — the downstream resource_hint selects the file")
	require.Equal(t, "gkg.csv.zip", gkgCfg["resource_hint"])
}

func findSeed(t *testing.T, name string) SeedConnection {
	t.Helper()
	for _, s := range Seeds() {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("seed %q not found in catalog", name)
	return SeedConnection{}
}
