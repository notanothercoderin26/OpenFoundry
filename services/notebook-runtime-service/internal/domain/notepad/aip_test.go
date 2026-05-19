package notepad

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

func TestFixGrammarCapitalisesAndAddsPeriod(t *testing.T) {
	t.Parallel()
	in := "hello world. this is a test"
	out := fixGrammar(in)
	if out != "Hello world. This is a test." {
		t.Fatalf("fixGrammar drift: %q", out)
	}
}

func TestFixGrammarCollapsesWhitespace(t *testing.T) {
	t.Parallel()
	in := "  one    two   three  "
	out := fixGrammar(in)
	if out != "One two three." {
		t.Fatalf("expected whitespace collapse + capitalisation + period; got %q", out)
	}
}

func TestShortenSingleSentenceTrimsToWordBoundary(t *testing.T) {
	t.Parallel()
	in := "OpenFoundry is a platform for building data-driven applications across the enterprise"
	out := shortenText(in)
	if !strings.HasSuffix(out, "…") {
		t.Fatalf("expected ellipsis on truncated single sentence; got %q", out)
	}
	if strings.Contains(out, "applications across") {
		t.Fatalf("expected sentence to be cut earlier; got %q", out)
	}
}

func TestShortenKeepsFirstHalfOfMultiSentence(t *testing.T) {
	t.Parallel()
	in := "First sentence. Second sentence. Third sentence. Fourth sentence."
	out := shortenText(in)
	// 4 sentences → keep ceil(4/2) = 2
	if !strings.Contains(out, "First sentence.") || !strings.Contains(out, "Second sentence.") {
		t.Fatalf("expected first two sentences; got %q", out)
	}
	if strings.Contains(out, "Third sentence.") {
		t.Fatalf("did not expect third sentence in shortened output; got %q", out)
	}
}

func TestMockTransformFixGrammar(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	out, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:   models.AIPTransformFixGrammar,
		Text: "this is broken text",
	})
	if err != nil {
		t.Fatalf("Transform: %v", err)
	}
	if out.Result != "This is broken text." || out.Provider != "deterministic" {
		t.Fatalf("fix_grammar drift: %+v", out)
	}
}

func TestMockTransformChangeStyleAnnotatesAsMock(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	out, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:      models.AIPTransformChangeStyle,
		Text:    "Q1 results came in below plan.",
		Options: map[string]string{"style": "confident"},
	})
	if err != nil {
		t.Fatalf("Transform: %v", err)
	}
	if out.Provider != "mock" {
		t.Fatalf("expected provider=mock for stubbed op; got %q", out.Provider)
	}
	if !strings.Contains(out.Annotation, "Confident") {
		t.Fatalf("expected style annotation; got %q", out.Annotation)
	}
}

func TestMockTransformTranslateDefaultLang(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	out, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:   models.AIPTransformTranslate,
		Text: "hello",
	})
	if err != nil {
		t.Fatalf("Transform: %v", err)
	}
	if !strings.Contains(out.Annotation, "French") {
		t.Fatalf("expected default lang French in annotation; got %q", out.Annotation)
	}
}

func TestMockTransformCustomPromptRequiresPrompt(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	_, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:   models.AIPTransformCustomPrompt,
		Text: "do something",
	})
	if err == nil || !strings.Contains(err.Error(), "prompt") {
		t.Fatalf("expected error about missing prompt, got %v", err)
	}
}

func TestMockTransformFunctionRequiresFunctionID(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	_, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:   models.AIPTransformFunction,
		Text: "do something",
	})
	if err == nil || !strings.Contains(err.Error(), "function_id") {
		t.Fatalf("expected error about missing function_id, got %v", err)
	}
}

func TestMockTransformRejectsEmptyText(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	_, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:   models.AIPTransformShorten,
		Text: "   ",
	})
	if !errors.Is(err, ErrAIPTextRequired) {
		t.Fatalf("expected ErrAIPTextRequired, got %v", err)
	}
}

func TestMockTransformRejectsUnknownOp(t *testing.T) {
	t.Parallel()
	r := NewMockAIPTransformer()
	_, err := r.Transform(context.Background(), models.AIPTransformRequest{
		Op:   "make_it_pop",
		Text: "hi",
	})
	if !errors.Is(err, ErrAIPUnsupportedOp) {
		t.Fatalf("expected ErrAIPUnsupportedOp, got %v", err)
	}
}
