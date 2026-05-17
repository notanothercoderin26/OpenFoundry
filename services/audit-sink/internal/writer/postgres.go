package writer

import (
	"context"

	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/envelope"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/repo"
)

// PostgresWriter is the hot-store sink. It appends each batch to the
// `audit_events` table behind the AuditService query surface.
//
// Iceberg remains the durable analytic tier; this writer is used either
// standalone (queryable-only deployments) or composed with the Iceberg
// writer via MultiWriter so both tiers receive every batch.
type PostgresWriter struct {
	Repo *repo.Repo
}

func NewPostgresWriter(r *repo.Repo) *PostgresWriter { return &PostgresWriter{Repo: r} }

func (p *PostgresWriter) Append(ctx context.Context, batch []envelope.AuditEnvelope) error {
	if len(batch) == 0 {
		return nil
	}
	_, err := p.Repo.InsertBatch(ctx, batch)
	return err
}

func (p *PostgresWriter) Close() error { return nil }

// MultiWriter fans each batch out to every wrapped Writer in order.
// First error short-circuits — at-least-once guarantees that a later
// success after a partial-batch failure is the supervisor's job.
type MultiWriter struct {
	Writers []Writer
}

func NewMultiWriter(ws ...Writer) *MultiWriter { return &MultiWriter{Writers: ws} }

func (m *MultiWriter) Append(ctx context.Context, batch []envelope.AuditEnvelope) error {
	for _, w := range m.Writers {
		if err := w.Append(ctx, batch); err != nil {
			return err
		}
	}
	return nil
}

func (m *MultiWriter) Close() error {
	var firstErr error
	for _, w := range m.Writers {
		if err := w.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
