//go:build integration

// Integration coverage for the PgStore against a real Postgres
// (testcontainers). Validates the new B04 columns + filters survive a
// round-trip through SQL and the migrations apply cleanly to an
// empty database.
//
// Run with `make test-integration PKG=./services/llm-catalog-service/...`.

package repo

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
)

func bootPgStore(t *testing.T) *PgStore {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	h := testingx.BootPostgres(ctx, t)
	require.NoError(t, Migrate(ctx, h.Pool))
	return &PgStore{Pool: h.Pool}
}

func TestIntegration_PgStore_RoundTripsQuotasAndFeatures(t *testing.T) {
	s := bootPgStore(t)
	ctx := context.Background()

	quotas := models.Quotas{
		RequestsPerMinute:      60,
		TokensPerMinute:        120000,
		MaxConcurrentRequests:  4,
		DailyTokenBudget:       4000000,
		DailyCostBudgetUSDCent: 50000,
	}
	m, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderAzure, ModelID: "gpt-4o", DisplayName: "GPT-4o",
		Capabilities:       []models.Capability{models.CapabilityChat, models.CapabilityVision},
		Quotas:             &quotas,
		EnabledForFeatures: []string{"aip-chatbot", "document-ai"},
	})
	require.NoError(t, err)

	got, err := s.Get(ctx, m.RID)
	require.NoError(t, err)
	assert.Equal(t, quotas, got.Quotas)
	assert.Equal(t, []string{"aip-chatbot", "document-ai"}, got.EnabledForFeatures)
	assert.ElementsMatch(t, []models.Capability{models.CapabilityChat, models.CapabilityVision}, got.Capabilities)
}

func TestIntegration_PgStore_ListFiltersByCapabilityAndFeature(t *testing.T) {
	s := bootPgStore(t)
	ctx := context.Background()

	llama, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOllama, ModelID: "llama-3.1-70b",
		Capabilities:       []models.Capability{models.CapabilityChat, models.CapabilityTools},
		EnabledForFeatures: []string{"aip-chatbot"},
	})
	require.NoError(t, err)
	_, err = s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOpenAI, ModelID: "embed-3-small",
		Capabilities:       []models.Capability{models.CapabilityText},
		EnabledForFeatures: []string{"knowledge-base"},
	})
	require.NoError(t, err)
	gpt, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderAzure, ModelID: "gpt-4o",
		Capabilities:       []models.Capability{models.CapabilityChat, models.CapabilityVision},
		EnabledForFeatures: []string{"document-ai", "aip-chatbot"},
	})
	require.NoError(t, err)

	// CHAT + aip-chatbot → llama + gpt
	out, err := s.List(ctx, ListFilter{Capability: models.CapabilityChat, Feature: "aip-chatbot"})
	require.NoError(t, err)
	require.Len(t, out, 2)
	rids := []uuid.UUID{out[0].RID, out[1].RID}
	assert.ElementsMatch(t, []uuid.UUID{llama.RID, gpt.RID}, rids)

	// VISION → only gpt
	out, err = s.List(ctx, ListFilter{Capability: models.CapabilityVision})
	require.NoError(t, err)
	require.Len(t, out, 1)
	assert.Equal(t, gpt.RID, out[0].RID)

	// Feature only, no capability → llama + gpt
	out, err = s.List(ctx, ListFilter{Feature: "aip-chatbot"})
	require.NoError(t, err)
	assert.Len(t, out, 2)
}

func TestIntegration_PgStore_PatchPartialFields(t *testing.T) {
	s := bootPgStore(t)
	ctx := context.Background()

	m, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOllama, ModelID: "llama-3.1-70b", DisplayName: "Original",
		ContextWindow: 131072,
		Capabilities:  []models.Capability{models.CapabilityChat},
	})
	require.NoError(t, err)

	newName := "renamed"
	disabled := false
	updated, err := s.Update(ctx, m.RID, models.UpdateModelRequest{
		DisplayName: &newName,
		Enabled:     &disabled,
	})
	require.NoError(t, err)
	assert.Equal(t, newName, updated.DisplayName)
	assert.False(t, updated.Enabled)
	assert.Equal(t, int32(131072), updated.ContextWindow)

	got, err := s.Get(ctx, m.RID)
	require.NoError(t, err)
	assert.False(t, got.Enabled, "PATCH must persist to disk")
}

func TestIntegration_PgStore_SeedMigrationLandsDemoModels(t *testing.T) {
	s := bootPgStore(t)
	ctx := context.Background()

	out, err := s.List(ctx, ListFilter{})
	require.NoError(t, err)
	byKey := map[string]models.Model{}
	for _, m := range out {
		byKey[string(m.Provider)+"/"+m.ModelID] = m
	}
	ollama, ok := byKey["OLLAMA/llama-3.1-70b"]
	require.True(t, ok, "seed must register OLLAMA/llama-3.1-70b")
	azure, ok := byKey["AZURE/gpt-4o"]
	require.True(t, ok, "seed must register AZURE/gpt-4o")
	assert.True(t, ollama.Enabled)
	assert.True(t, azure.Enabled)
	assert.Contains(t, ollama.EnabledForFeatures, "aip-chatbot")
	assert.Contains(t, azure.EnabledForFeatures, "aip-chatbot")
	assert.Contains(t, azure.Capabilities, models.CapabilityVision)
	// Re-running the seed migration must be idempotent.
	require.NoError(t, Migrate(ctx, s.Pool))
	again, err := s.List(ctx, ListFilter{})
	require.NoError(t, err)
	assert.Equal(t, len(out), len(again), "re-applied seed must not insert duplicates")
}
