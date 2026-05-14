// Package controlbus is the OpenFoundry control-plane event bus
// (NATS JetStream).
//
// What this package owns
//
//   - Connect          — open a NATS connection + JetStream context.
//   - Publisher        — typed event publishing with the canonical
//     Event<T> envelope.
//   - EnsureStream     — idempotent stream creation with conservative
//     defaults (LimitsPolicy retention, 1M msgs, 7d).
//   - CreateConsumer   — durable pull consumer.
//   - Subjects/Streams — well-known constants (`of.auth`, `of.datasets`,
//     `OF_EVENTS`, …).
//
// Wire compatibility: Event<T> is JSON-serialised with a stable shape
// so publishers and consumers in any language round-trip the envelope
// unchanged.
package controlbus
