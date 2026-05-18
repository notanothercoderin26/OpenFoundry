// Package pythonsidecar manages a Python subprocess that exposes the
// runtime gRPC service defined in proto/runtime/python_runtime.proto.
//
// Three Go services rely on this lib to replace the Rust pyo3 embedded
// interpreter without losing parity:
//
//   - libs/ontology-kernel    — inline Python ontology functions
//   - pipeline-build-service  — Python pipeline transforms
//   - notebook-runtime-service — notebook cell execution (stateful)
//
// Lifecycle: callers construct a [Manager] with [New], call Start with
// a long-lived context to spawn the sidecar (the manager picks a Unix
// socket under TempDir and blocks until the gRPC health check reports
// SERVING, bounded by cfg.StartupTimeout), pass Client() to downstream
// code, and call Close (or Stop) on shutdown. The supervisor goroutine
// is parented on the Start context, so cancelling it also unwinds the
// supervisor — Close is still required to reap the subprocess and the
// gRPC connection.
//
// The manager owns the gRPC connection. It restarts the sidecar with
// exponential backoff after three consecutive failed health probes.
package pythonsidecar
