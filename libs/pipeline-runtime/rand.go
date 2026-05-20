package pipelineruntime

import "crypto/rand"

// randRead is a thin wrapper over crypto/rand so the lineage writer's
// runID generator stays test-overridable without exposing crypto
// internals.
func randRead(buf []byte) (int, error) { return rand.Read(buf) }
