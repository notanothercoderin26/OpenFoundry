package token

import (
	"strings"
	"testing"
)

func TestHashIsDeterministic(t *testing.T) {
	t.Parallel()
	a := Hash("secret")
	b := Hash("secret")
	if a != b {
		t.Fatalf("hash mismatch: %s vs %s", a, b)
	}
	if len(a) != 64 {
		t.Fatalf("hash length: %d, want 64", len(a))
	}
}

func TestDistinctTokensHaveDistinctHashes(t *testing.T) {
	t.Parallel()
	if Hash("a") == Hash("b") {
		t.Fatal("distinct inputs hashed to the same digest")
	}
}

func TestMintProducesOftyPrefix(t *testing.T) {
	t.Parallel()
	raw, hash, hint, err := Mint()
	if err != nil {
		t.Fatalf("Mint: %v", err)
	}
	if !strings.HasPrefix(raw, "ofty_") {
		t.Fatalf("raw missing prefix: %s", raw)
	}
	if got := Hash(raw); got != hash {
		t.Fatalf("hash drift: %s vs %s", got, hash)
	}
	if !strings.HasSuffix(raw, hint) || len(hint) != 4 {
		t.Fatalf("hint mismatch: raw=%s hint=%s", raw, hint)
	}
}

func TestHasOftyPrefix(t *testing.T) {
	t.Parallel()
	if !HasOftyPrefix("ofty_abc") {
		t.Fatal("expected true for ofty_*")
	}
	if HasOftyPrefix("eyJh.jwt.shape") {
		t.Fatal("expected false for jwt-shaped token")
	}
	if HasOftyPrefix("ofty_") {
		t.Fatal("expected false for empty body")
	}
}
