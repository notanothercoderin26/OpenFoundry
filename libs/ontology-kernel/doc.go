// Package ontologykernel hosts the shared ontology domain, models, and
// HTTP handler layer reused by every ontology-* and
// object-database-service binary.
//
// Layout:
//
//	libs/ontology-kernel/
//	├── doc.go               (this file)
//	├── appstate.go          (AppState dependency container)
//	├── config/              (env-driven configuration)
//	├── metrics/             (Prometheus registration)
//	├── models/              (wire types)
//	├── domain/              (pure logic + invariants)
//	├── handlers/            (HTTP handlers, grouped by bounded context)
//	└── stores/              (storage interface + Postgres / in-memory impls)
//
// Wire-compat is the prime invariant: every JSON shape, default value,
// enum token, and ordering rule has a Go test that pins it. SDKs and
// frontend types depend on these — do not rename fields casually.
package ontologykernel
