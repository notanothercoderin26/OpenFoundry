package rid_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/libs/core-models/rid"
)

func TestMinterReservesRID(t *testing.T) {
	t.Parallel()

	store := &fakeReservationStore{}
	minter, err := rid.NewMinter(
		"foundry",
		rid.DefaultInstance,
		"dataset",
		store,
		rid.WithUUIDGenerator(sequenceUUIDs(
			"018f2f1c-aaaa-7bbb-8ccc-000000000001",
		)),
	)
	require.NoError(t, err)

	minted, err := minter.Mint(context.Background())
	require.NoError(t, err)

	assert.Equal(t, "ri.foundry.main.dataset.018f2f1c-aaaa-7bbb-8ccc-000000000001", minted.String())
	require.Len(t, store.seen, 1)
	assert.Equal(t, minted, store.seen[0])
}

func TestMinterRetriesCollision(t *testing.T) {
	t.Parallel()

	store := &fakeReservationStore{collisions: 1}
	minter, err := rid.NewMinter(
		"foundry",
		rid.DefaultInstance,
		"dataset",
		store,
		rid.WithUUIDGenerator(sequenceUUIDs(
			"018f2f1c-aaaa-7bbb-8ccc-000000000001",
			"018f2f1c-aaaa-7bbb-8ccc-000000000002",
		)),
	)
	require.NoError(t, err)

	minted, err := minter.Mint(context.Background())
	require.NoError(t, err)

	assert.Equal(t, "ri.foundry.main.dataset.018f2f1c-aaaa-7bbb-8ccc-000000000002", minted.String())
	require.Len(t, store.seen, 2)
	assert.Equal(t, "018f2f1c-aaaa-7bbb-8ccc-000000000001", store.seen[0].Locator)
	assert.Equal(t, "018f2f1c-aaaa-7bbb-8ccc-000000000002", store.seen[1].Locator)
}

func TestMinterExhaustsCollisions(t *testing.T) {
	t.Parallel()

	store := &fakeReservationStore{collisions: 3}
	minter, err := rid.NewMinter(
		"foundry",
		rid.DefaultInstance,
		"dataset",
		store,
		rid.WithMaxAttempts(2),
		rid.WithUUIDGenerator(sequenceUUIDs(
			"018f2f1c-aaaa-7bbb-8ccc-000000000001",
			"018f2f1c-aaaa-7bbb-8ccc-000000000002",
		)),
	)
	require.NoError(t, err)

	_, err = minter.Mint(context.Background())
	require.Error(t, err)
	assert.True(t, errors.Is(err, rid.ErrCollision))
	var exhausted *rid.CollisionExhaustedError
	assert.True(t, errors.As(err, &exhausted))
	assert.Equal(t, 2, exhausted.Attempts)
	assert.Equal(t, 2, len(store.seen))
}

func TestMinterReturnsStoreError(t *testing.T) {
	t.Parallel()

	storeErr := errors.New("registry down")
	store := &fakeReservationStore{err: storeErr}
	minter, err := rid.NewMinter(
		"foundry",
		rid.DefaultInstance,
		"dataset",
		store,
		rid.WithUUIDGenerator(sequenceUUIDs(
			"018f2f1c-aaaa-7bbb-8ccc-000000000001",
		)),
	)
	require.NoError(t, err)

	_, err = minter.Mint(context.Background())
	assert.ErrorIs(t, err, storeErr)
}

func TestMinterRequiresReservationStore(t *testing.T) {
	t.Parallel()

	_, err := rid.NewMinter("foundry", rid.DefaultInstance, "dataset", nil)
	assert.ErrorIs(t, err, rid.ErrReservationStoreRequired)
}

type fakeReservationStore struct {
	collisions int
	err        error
	seen       []rid.ResourceIdentifier
}

func (s *fakeReservationStore) ReserveRID(_ context.Context, candidate rid.ResourceIdentifier) error {
	s.seen = append(s.seen, candidate)
	if s.err != nil {
		return s.err
	}
	if s.collisions > 0 {
		s.collisions--
		return rid.ErrCollision
	}
	return nil
}

func sequenceUUIDs(values ...string) rid.UUIDGenerator {
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		ids = append(ids, uuid.MustParse(value))
	}
	i := 0
	return func() uuid.UUID {
		if i >= len(ids) {
			return ids[len(ids)-1]
		}
		out := ids[i]
		i++
		return out
	}
}
