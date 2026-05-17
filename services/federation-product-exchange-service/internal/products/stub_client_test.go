package products

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// stubResourceClient is the in-memory ResourceClient used by the
// publish/install tests. It pre-seeds known resources for Fetch and
// records every Create call so assertions can verify the install
// path (a) saw the bundle's payload bytes and (b) honoured the
// target_workspace_rid scope.
type stubResourceClient struct {
	mu       sync.Mutex
	store    map[stubKey]json.RawMessage // type/ref → fetched JSON
	created  []stubCreated
	failFetch map[stubKey]error
	failCreate map[models.ProductResourceType]error
}

type stubKey struct {
	Type models.ProductResourceType
	Ref  string
}

type stubCreated struct {
	Type      models.ProductResourceType
	Workspace string
	Body      json.RawMessage
	NewRID    string
}

func newStubClient() *stubResourceClient {
	return &stubResourceClient{
		store:      map[stubKey]json.RawMessage{},
		failFetch:  map[stubKey]error{},
		failCreate: map[models.ProductResourceType]error{},
	}
}

// seed registers payload as the body that Fetch returns for (kind, ref).
func (s *stubResourceClient) seed(kind models.ProductResourceType, ref string, payload json.RawMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.store[stubKey{Type: kind, Ref: ref}] = append(json.RawMessage(nil), payload...)
}

func (s *stubResourceClient) Fetch(_ context.Context, kind models.ProductResourceType, ref string) (json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err, ok := s.failFetch[stubKey{Type: kind, Ref: ref}]; ok {
		return nil, err
	}
	body, ok := s.store[stubKey{Type: kind, Ref: ref}]
	if !ok {
		return nil, fmt.Errorf("stub: no resource %s/%s", kind, ref)
	}
	cloned := make(json.RawMessage, len(body))
	copy(cloned, body)
	return cloned, nil
}

func (s *stubResourceClient) Create(_ context.Context, kind models.ProductResourceType, workspace string, body json.RawMessage) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err, ok := s.failCreate[kind]; ok {
		return "", err
	}
	newRID := fmt.Sprintf("ri.installed.%s.%s", kind, uuid.NewString())
	s.created = append(s.created, stubCreated{
		Type:      kind,
		Workspace: workspace,
		Body:      append(json.RawMessage(nil), body...),
		NewRID:    newRID,
	})
	return newRID, nil
}

// createdCalls returns a snapshot of every Create invocation.
func (s *stubResourceClient) createdCalls() []stubCreated {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]stubCreated, len(s.created))
	copy(out, s.created)
	return out
}

// failFetchFor configures Fetch to return err for (kind, ref).
func (s *stubResourceClient) failFetchFor(kind models.ProductResourceType, ref string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.failFetch[stubKey{Type: kind, Ref: ref}] = err
}

// failCreateFor configures Create to return err for kind.
func (s *stubResourceClient) failCreateFor(kind models.ProductResourceType, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.failCreate[kind] = err
}

// Ensure stubResourceClient satisfies the interface even when only the
// embedded fields move.
var _ ResourceClient = (*stubResourceClient)(nil)

// errStubBoom is a canned error used by tests that want to assert the
// install path persisted the failure_reason verbatim.
var errStubBoom = errors.New("stub: boom")
