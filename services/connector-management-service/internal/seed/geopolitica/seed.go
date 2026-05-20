// Package geopolitica holds the Foundry-native Data Connection seed
// catalog for the geopolitical intelligence PoC documented under
// `PoC/geopolitica/`.
//
// **Foundry-native pattern**: this package does NOT introduce six new
// adapter types for GDELT / ACLED / OFAC / EU / OpenSanctions /
// Wikidata. Palantir Foundry does not ship a "GDELT connector" either
// — the public docs only confirm generic adapter families (rest_api,
// file/csv, jdbc, kafka, ...). Per the PoC contract §"Gaps that must
// not be oversold":
//
//   "Implement as a custom Data Connection / external transform; do
//    not claim out-of-the-box connector parity."
//
// So each PoC source is registered as a CONNECTION instance bound to
// an existing adapter type. The format-specific work (gunzip + tab
// parsing for GDELT, XML decoding for OFAC / EU Consolidated, SPARQL
// JSON unpacking for Wikidata) lives in downstream pipeline-builder
// transforms — Foundry's "External transforms" extensibility pattern.
// Per-source documentation in the SeedConnection.DownstreamPipelineDoc
// field names the bronze → silver → gold transforms the pipeline
// graph must carry for the PoC demo.
//
// **Markings**: each seed declares the `MARKING:*` value the source
// is expected to write at ingest time. Palantir's public docs DO NOT
// confirm per-row marking application at sync time — column-level and
// dataset-level only. The PoC contract treats source-level markings
// as OpenFoundry emulation; the demo script must say so. We keep the
// markings on the seed so the downstream pipeline transform has a
// declarative source of truth for what marking each row should carry.
//
// **Idempotency**: Load() is intentionally additive — it inserts only
// names that are missing for the given owner. Reseeding after a
// connection has been edited in the UI will NOT clobber the live
// row; operators delete the row first if they want a hard reset.

package geopolitica

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/models"
)

// SeedConnection is one geopolitical PoC source declared as a Foundry-
// native Data Connection.
//
// Name, ConnectorType, and Config map 1-to-1 onto the columns the
// `connections` table backs (see services/connector-management-service
// internal/models/models.go::Connection). Markings + Notes +
// DownstreamPipelineDoc are seed-only metadata used by the loader's
// audit log + by reviewers reading this file as the PoC contract's
// living reference; they do NOT flow into the row.
type SeedConnection struct {
	// Name is the human-readable display name. The loader's
	// idempotency check matches on this string per ownerID.
	Name string

	// ConnectorType pins the adapter from
	// services/connector-management-service/internal/adapters/registry.go.
	// Validate-time check: registry.Has(ConnectorType) must be true.
	ConnectorType string

	// Config is the raw JSON merged into Connection.Config. It MUST
	// be valid against the adapter's ValidateConfig. We keep this as
	// json.RawMessage instead of a typed struct because every adapter
	// owns its own config shape and the seed declares all six adapters
	// in one place.
	Config json.RawMessage

	// Markings is the source-level marking the bronze loader should
	// stamp on every row. OpenFoundry emulation — Foundry public docs
	// do not confirm row-level markings at sync time. Naming follows
	// the PoC's `MARKING:*` convention.
	Markings []string

	// Notes is free-form operator-facing context (refresh cadence,
	// upstream contract, attribution requirements). Surfaced in the
	// LoadResult.Skipped reasons + in seed audit logs.
	Notes string

	// DownstreamPipelineDoc names the bronze → silver → gold
	// pipeline-builder transforms the demo needs downstream of this
	// connection. The transforms themselves live as follow-up work
	// in `pipeline-build-service` and are NOT created by Load().
	DownstreamPipelineDoc string
}

// LoadResult is returned from Load and tells the operator (or the
// agent driving the seed CLI) exactly what was created vs skipped.
type LoadResult struct {
	Created []uuid.UUID  // ids of newly inserted connections
	Skipped []SkipReason // reasons keyed by seed name
}

// SkipReason captures why a particular seed was not inserted. The
// most common case is "name already exists" during reseed.
type SkipReason struct {
	Name   string
	Reason string
}

// ConnectionSink is the minimal repo surface Load needs. The real
// implementation in `repo.Repo` already satisfies this; tests inject
// an in-memory fake.
type ConnectionSink interface {
	ListConnections(ctx context.Context, ownerID *uuid.UUID) ([]models.Connection, error)
	CreateConnection(ctx context.Context, body *models.CreateConnectionRequest, ownerID uuid.UUID) (*models.Connection, error)
}

// Validator is the per-adapter ValidateConfig signature the seed
// package depends on. Production wires this to a function that
// dispatches to the right adapter package; tests inject a permissive
// stub.
type Validator func(connectorType string, config json.RawMessage) error

// Load applies the geopolitica seed against the provided sink. The
// returned LoadResult records every name and the action taken.
//
// Each entry is validated against the adapter contract before any
// write is attempted; a validator failure short-circuits the entire
// load so an operator does not end up with a half-seeded environment.
//
// validate may be nil — in that case the loader skips contract checks
// (used in unit tests that don't want to wire the adapter registry).
func Load(
	ctx context.Context,
	sink ConnectionSink,
	ownerID uuid.UUID,
	validate Validator,
) (LoadResult, error) {
	seeds := Seeds()
	// Step 1: validate every config up front. We fail fast — a bad
	// seed is a code bug and should never partially seed prod.
	if validate != nil {
		for _, s := range seeds {
			if err := validate(s.ConnectorType, s.Config); err != nil {
				return LoadResult{}, fmt.Errorf("geopolitica seed %q (%s): %w",
					s.Name, s.ConnectorType, err)
			}
		}
	}

	// Step 2: pull existing connection names for this owner so we
	// can skip the ones that already exist.
	existing, err := sink.ListConnections(ctx, &ownerID)
	if err != nil {
		return LoadResult{}, fmt.Errorf("list existing connections: %w", err)
	}
	existingByName := make(map[string]struct{}, len(existing))
	for _, c := range existing {
		existingByName[c.Name] = struct{}{}
	}

	// Step 3: insert anything missing.
	out := LoadResult{}
	for _, s := range seeds {
		if _, ok := existingByName[s.Name]; ok {
			out.Skipped = append(out.Skipped, SkipReason{
				Name:   s.Name,
				Reason: "already exists for owner",
			})
			continue
		}
		created, err := sink.CreateConnection(ctx, &models.CreateConnectionRequest{
			Name:          s.Name,
			ConnectorType: s.ConnectorType,
			Config:        s.Config,
		}, ownerID)
		if err != nil {
			return out, fmt.Errorf("create connection %q: %w", s.Name, err)
		}
		if created == nil {
			return out, errors.New("create connection returned nil")
		}
		out.Created = append(out.Created, created.ID)
	}
	return out, nil
}

// SeedNames returns the canonical name list, alphabetically sorted —
// handy for tests + debug pages that want to assert the seed catalog
// shape without invoking Load.
func SeedNames() []string {
	seeds := Seeds()
	out := make([]string, len(seeds))
	for i, s := range seeds {
		out[i] = s.Name
	}
	sort.Strings(out)
	return out
}

// Seeds returns the canonical six PoC connections. The slice is built
// fresh on every call so callers can mutate it without poisoning the
// package state.
func Seeds() []SeedConnection {
	return []SeedConnection{
		gdeltEventsSeed(),
		gdeltGkgSeed(),
		acledSeed(),
		ofacSdnSeed(),
		euConsolidatedSeed(),
		openSanctionsSeed(),
		wikidataSeed(),
	}
}
