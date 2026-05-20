package handlers

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSplitIntoChunks_RoundTripsSmallContent(t *testing.T) {
	t.Parallel()
	out := splitIntoChunks("hello world", 1200)
	assert.Equal(t, []string{"hello world"}, out)
}

func TestSplitIntoChunks_BreaksOnWhitespace(t *testing.T) {
	t.Parallel()
	content := strings.Repeat("the quick brown fox ", 100) // 2000 chars
	out := splitIntoChunks(content, 400)
	assert.Greater(t, len(out), 1, "long content must split")
	for _, c := range out {
		assert.LessOrEqual(t, len(c), 400, "no chunk exceeds the window")
		assert.False(t, strings.HasPrefix(c, " "), "chunks don't start with whitespace")
	}
	// Re-joining the chunks reproduces the same words (whitespace is
	// the only thing we collapse).
	joined := strings.Join(out, " ")
	assert.Equal(t, len(wordsOf(content)), len(wordsOf(joined)))
}

func TestEmbed_DeterministicAndUnit(t *testing.T) {
	t.Parallel()
	a := embed("schedule maintenance for aircraft N12345")
	b := embed("schedule maintenance for aircraft N12345")
	assert.Equal(t, a, b)
	var norm float64
	for _, v := range a {
		norm += v * v
	}
	assert.InDelta(t, 1.0, norm, 0.001, "embedding must be unit length")
}

func TestCosine_SameVectorIsOne(t *testing.T) {
	t.Parallel()
	v := embed("hello world")
	assert.InDelta(t, 1.0, cosine(v, v), 0.001)
}

func TestCosine_OrthogonalIsLessThanOne(t *testing.T) {
	t.Parallel()
	a := embed("aircraft maintenance schedule")
	b := embed("quantum entanglement bell inequality")
	// Hash collisions in a 15-dim space make exact zero unlikely; we
	// just want clear separation.
	assert.Less(t, cosine(a, b), 0.5)
}

func TestLexicalBoost_MatchesIncreaseScore(t *testing.T) {
	t.Parallel()
	q := wordsOf("aircraft maintenance N12345")
	with := lexicalBoost(q, "the aircraft maintenance log shows N12345 due for a B-check")
	without := lexicalBoost(q, "completely unrelated content")
	assert.Greater(t, with, without)
}

func TestSortByScoreDesc(t *testing.T) {
	t.Parallel()
	hits := []SearchHit{
		{Content: "a", Score: 0.1},
		{Content: "b", Score: 0.9},
		{Content: "c", Score: 0.5},
	}
	sortByScoreDesc(hits)
	assert.Equal(t, "b", hits[0].Content)
	assert.Equal(t, "c", hits[1].Content)
	assert.Equal(t, "a", hits[2].Content)
}
