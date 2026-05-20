package repo

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
)

func TestMemoryStore_Register_PopulatesQuotasAndFeatures(t *testing.T) {
	t.Parallel()
	s := NewMemoryStore()
	quotas := models.Quotas{RequestsPerMinute: 60, TokensPerMinute: 120000, DailyCostBudgetUSDCent: 50000}
	m, err := s.Register(context.Background(), models.RegisterModelRequest{
		Provider: models.ProviderAzure, ModelID: "gpt-4o", DisplayName: "GPT-4o",
		Capabilities:       []models.Capability{models.CapabilityChat, models.CapabilityVision},
		Quotas:             &quotas,
		EnabledForFeatures: []string{"aip-chatbot", "document-ai"},
	})
	require.NoError(t, err)
	assert.Equal(t, quotas, m.Quotas)
	assert.Equal(t, []string{"aip-chatbot", "document-ai"}, m.EnabledForFeatures)
}

func TestMemoryStore_List_FiltersByCapabilityAndFeature(t *testing.T) {
	t.Parallel()
	s := NewMemoryStore()
	ctx := context.Background()
	chatModel, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOllama, ModelID: "llama-3.1-70b",
		Capabilities: []models.Capability{models.CapabilityChat, models.CapabilityTools}, EnabledForFeatures: []string{"aip-chatbot"},
	})
	require.NoError(t, err)
	_, err = s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOpenAI, ModelID: "embed-3-small",
		Capabilities: []models.Capability{models.CapabilityText}, EnabledForFeatures: []string{"knowledge-base"},
	})
	require.NoError(t, err)
	_, err = s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderAzure, ModelID: "gpt-4o",
		Capabilities: []models.Capability{models.CapabilityChat, models.CapabilityVision}, EnabledForFeatures: []string{"document-ai"},
	})
	require.NoError(t, err)

	// CHAT + aip-chatbot → 1
	out, err := s.List(ctx, ListFilter{Capability: models.CapabilityChat, Feature: "aip-chatbot"})
	require.NoError(t, err)
	require.Len(t, out, 1)
	assert.Equal(t, chatModel.RID, out[0].RID)
	// CHAT alone → 2 (Ollama + Azure)
	out, err = s.List(ctx, ListFilter{Capability: models.CapabilityChat})
	require.NoError(t, err)
	assert.Len(t, out, 2)
	// feature only → 1
	out, err = s.List(ctx, ListFilter{Feature: "knowledge-base"})
	require.NoError(t, err)
	assert.Len(t, out, 1)
	// unknown capability → 0
	out, err = s.List(ctx, ListFilter{Capability: "TELEPATHY"})
	require.NoError(t, err)
	assert.Empty(t, out)
}

func TestMemoryStore_Update_PartialFieldsLeavesOthersIntact(t *testing.T) {
	t.Parallel()
	s := NewMemoryStore()
	ctx := context.Background()
	m, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOllama, ModelID: "llama-3.1-70b", DisplayName: "Original",
		ContextWindow: 131072, Capabilities: []models.Capability{models.CapabilityChat},
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
	assert.Equal(t, int32(131072), updated.ContextWindow, "untouched fields keep their value")
	assert.Equal(t, []models.Capability{models.CapabilityChat}, updated.Capabilities)
}

func TestMemoryStore_Update_QuotasAndFeaturesReplaceWholeValue(t *testing.T) {
	t.Parallel()
	s := NewMemoryStore()
	ctx := context.Background()
	q := models.Quotas{RequestsPerMinute: 10}
	m, err := s.Register(ctx, models.RegisterModelRequest{
		Provider: models.ProviderOllama, ModelID: "llama-3.1-70b",
		Capabilities: []models.Capability{models.CapabilityChat}, Quotas: &q, EnabledForFeatures: []string{"old-feature"},
	})
	require.NoError(t, err)

	newQuotas := models.Quotas{RequestsPerMinute: 100, TokensPerMinute: 200000}
	updated, err := s.Update(ctx, m.RID, models.UpdateModelRequest{
		Quotas:             &newQuotas,
		EnabledForFeatures: []string{"new-feature"},
	})
	require.NoError(t, err)
	assert.Equal(t, newQuotas, updated.Quotas)
	assert.Equal(t, []string{"new-feature"}, updated.EnabledForFeatures)
}

func TestMemoryStore_Update_404ForUnknownRID(t *testing.T) {
	t.Parallel()
	s := NewMemoryStore()
	_, err := s.Update(context.Background(), uuid.New(), models.UpdateModelRequest{})
	assert.ErrorIs(t, err, ErrModelNotFound)
}
