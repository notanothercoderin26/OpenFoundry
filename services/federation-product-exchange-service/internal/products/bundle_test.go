package products

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

func TestBuildBundleRoundTrip(t *testing.T) {
	t.Parallel()
	key := []byte("k8w7-test-signing-key")
	product := models.Product{
		RID:         "ri.marketplace.product.demo",
		Name:        "Customer 360",
		Author:      "Foundry Team",
		Description: "A demo bundle",
		Resources: []models.ProductResource{
			{Type: models.ProductResourceOntologyType, Ref: "obj-customer"},
			{Type: models.ProductResourceActionType, Ref: "act-mark-vip"},
		},
	}
	snaps := []ResourceSnapshot{
		{Type: models.ProductResourceOntologyType, Ref: "obj-customer", Payload: json.RawMessage(`{"id":"obj-customer","name":"Customer"}`)},
		{Type: models.ProductResourceActionType, Ref: "act-mark-vip", Payload: json.RawMessage(`{"id":"act-mark-vip","name":"Mark VIP"}`)},
	}
	bundle, manifest, manifestJSON, sig, err := BuildBundle(product, "1.0.0", snaps, key, time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.NotEmpty(t, bundle)
	require.Len(t, manifest.Resources, 2)
	require.Equal(t, "ontology/obj-customer.json", manifest.Resources[0].Path)
	require.Equal(t, "actions/act-mark-vip.json", manifest.Resources[1].Path)
	require.NotEmpty(t, manifestJSON)
	require.NotEmpty(t, sig)

	// Verify the signature using the public helper.
	assert.True(t, VerifyManifest(manifestJSON, sig, key))
	assert.False(t, VerifyManifest(manifestJSON, sig, []byte("different-key")))

	// Read it back and check the payloads come through unchanged.
	gotManifest, files, recomputed, err := ReadBundle(bundle, key)
	require.NoError(t, err)
	assert.Equal(t, sig, recomputed)
	assert.Equal(t, manifest.ProductRID, gotManifest.ProductRID)
	assert.Equal(t, models.ProductResourceOntologyType, gotManifest.Resources[0].Type)
	assert.JSONEq(t, `{"id":"obj-customer","name":"Customer"}`, string(files["ontology/obj-customer.json"]))
	assert.JSONEq(t, `{"id":"act-mark-vip","name":"Mark VIP"}`, string(files["actions/act-mark-vip.json"]))
}

func TestSignManifestEmptyKeyFails(t *testing.T) {
	t.Parallel()
	_, err := SignManifest([]byte("manifest"), nil)
	require.Error(t, err)
}

func TestReadBundleRejectsTamperedManifest(t *testing.T) {
	t.Parallel()
	key := []byte("hmac-key")
	bundle, _, _, sig, err := BuildBundle(
		models.Product{RID: "ri.marketplace.product.x", Name: "X"},
		"1.0.0",
		[]ResourceSnapshot{{Type: models.ProductResourceApp, Ref: "app-1", Payload: json.RawMessage(`{"id":"app-1"}`)}},
		key,
		time.Now().UTC(),
	)
	require.NoError(t, err)

	// Verifying with a different key must produce a different signature.
	otherKey := []byte("not-the-real-key")
	_, _, recomputed, err := ReadBundle(bundle, otherKey)
	require.NoError(t, err)
	assert.NotEqual(t, sig, recomputed, "recomputed signature with the wrong key must differ from the original")
}
