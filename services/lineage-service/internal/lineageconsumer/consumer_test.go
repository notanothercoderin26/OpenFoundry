package lineageconsumer

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	databus "github.com/openfoundry/openfoundry-go/libs/event-bus-data"
)

// fakeSub is a minimal Subscriber that hands out a pre-recorded
// sequence of poll results and records commit calls.
type fakeSub struct {
	pollOut chan *databus.DataMessage
	pollErr chan error
	commits chan []*databus.DataMessage
}

func newFakeSub() *fakeSub {
	return &fakeSub{
		pollOut: make(chan *databus.DataMessage, 16),
		pollErr: make(chan error, 16),
		commits: make(chan []*databus.DataMessage, 16),
	}
}

func (f *fakeSub) Poll(ctx context.Context) (*databus.DataMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case err := <-f.pollErr:
		return nil, err
	case msg := <-f.pollOut:
		return msg, nil
	}
}

func (f *fakeSub) CommitMessages(_ context.Context, msgs []*databus.DataMessage) error {
	f.commits <- msgs
	return nil
}

func (f *fakeSub) Close() error { return nil }

// TestRun_poisonPillIsCommitted — a malformed event must not stall the
// partition. We feed an invalid payload and then ctx-cancel; the
// commit channel should have observed the bad message so the offset
// advances past it.
func TestRun_poisonPillIsCommitted(t *testing.T) {
	sub := newFakeSub()
	sub.pollOut <- &databus.DataMessage{Topic: Topic, Partition: 0, Offset: 1, Value: []byte("not-json")}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	go func() { done <- Run(ctx, sub, nil, log) }()

	select {
	case <-sub.commits:
		// good — poison pill was committed past
	case err := <-done:
		t.Fatalf("Run exited early: %v", err)
	}
	cancel()
	<-done
}

// TestRun_pollErrorBackoffRespectsCtx — a poll error triggers a 500ms
// backoff, but ctx cancel must unblock immediately.
func TestRun_pollErrorBackoffRespectsCtx(t *testing.T) {
	sub := newFakeSub()
	sub.pollErr <- errors.New("broker dropped")

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	go func() { done <- Run(ctx, sub, nil, log) }()

	cancel()
	err := <-done
	if err != nil {
		t.Fatalf("Run exited with error after cancel: %v", err)
	}
}
