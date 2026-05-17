package rid

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/core-models/ids"
)

const (
	// DefaultMintMaxAttempts bounds retry loops if a registry reports RID
	// collisions. UUID collisions should be fantastically rare, so repeated
	// collisions usually indicate a broken generator or registry adapter.
	DefaultMintMaxAttempts = 8
)

var (
	// ErrCollision is returned by a ReservationStore when its atomic insert
	// detects that the candidate RID already exists in the resource registry.
	ErrCollision = errors.New("rid collision")
	// ErrReservationStoreRequired is returned when a Minter is created without
	// the registry adapter required for collision detection.
	ErrReservationStoreRequired = errors.New("rid reservation store is required")
)

// ReservationStore atomically reserves a RID in the resource registry.
//
// Implementations should translate their unique-constraint violation on the
// registry's `rid` key to ErrCollision so Minter can retry with a fresh UUID.
// Any nil error means the RID is now reserved and must not be handed out again.
type ReservationStore interface {
	ReserveRID(ctx context.Context, candidate ResourceIdentifier) error
}

// UUIDGenerator produces UUID locators for new RIDs.
type UUIDGenerator func() uuid.UUID

// Minter creates and reserves UUID-backed RIDs for one resource namespace.
type Minter struct {
	service      string
	instance     string
	resourceType string
	store        ReservationStore
	newUUID      UUIDGenerator
	maxAttempts  int
}

// MinterOption customizes a Minter.
type MinterOption func(*Minter)

// WithUUIDGenerator injects a UUID generator. It is intended for deterministic
// tests; production callers should use the default UUID v7 generator.
func WithUUIDGenerator(generator UUIDGenerator) MinterOption {
	return func(m *Minter) {
		if generator != nil {
			m.newUUID = generator
		}
	}
}

// WithMaxAttempts sets the collision retry budget.
func WithMaxAttempts(maxAttempts int) MinterOption {
	return func(m *Minter) {
		if maxAttempts > 0 {
			m.maxAttempts = maxAttempts
		}
	}
}

// NewMinter validates a namespace and returns a minter that reserves every RID
// before handing it to callers.
func NewMinter(service, instance, resourceType string, store ReservationStore, opts ...MinterOption) (*Minter, error) {
	if store == nil {
		return nil, ErrReservationStoreRequired
	}
	namespace, err := New(service, instance, resourceType, "0")
	if err != nil {
		return nil, err
	}
	minter := &Minter{
		service:      namespace.Service,
		instance:     namespace.Instance,
		resourceType: namespace.ResourceType,
		store:        store,
		newUUID:      ids.New,
		maxAttempts:  DefaultMintMaxAttempts,
	}
	for _, opt := range opts {
		if opt != nil {
			opt(minter)
		}
	}
	return minter, nil
}

// Mint creates a UUID-locator RID and atomically reserves it in the registry.
// It retries on ErrCollision until the configured attempt budget is exhausted.
func (m *Minter) Mint(ctx context.Context) (ResourceIdentifier, error) {
	if m == nil || m.store == nil {
		return ResourceIdentifier{}, ErrReservationStoreRequired
	}
	var last ResourceIdentifier
	for attempt := 1; attempt <= m.maxAttempts; attempt++ {
		candidate, err := NewUUID(m.service, m.instance, m.resourceType, m.newUUID())
		if err != nil {
			return ResourceIdentifier{}, err
		}
		last = candidate
		if err := m.store.ReserveRID(ctx, candidate); err != nil {
			if errors.Is(err, ErrCollision) {
				continue
			}
			return ResourceIdentifier{}, err
		}
		return candidate, nil
	}
	return ResourceIdentifier{}, &CollisionExhaustedError{
		Service:      m.service,
		Instance:     m.instance,
		ResourceType: m.resourceType,
		Attempts:     m.maxAttempts,
		Last:         last,
	}
}

// CollisionExhaustedError is returned when every mint attempt collided.
type CollisionExhaustedError struct {
	Service      string
	Instance     string
	ResourceType string
	Attempts     int
	Last         ResourceIdentifier
}

func (e *CollisionExhaustedError) Error() string {
	return fmt.Sprintf(
		"rid mint exhausted after %d collision(s) for ri.%s.%s.%s.<uuid>",
		e.Attempts,
		e.Service,
		e.Instance,
		e.ResourceType,
	)
}

// Unwrap lets callers check errors.Is(err, ErrCollision).
func (e *CollisionExhaustedError) Unwrap() error {
	return ErrCollision
}
