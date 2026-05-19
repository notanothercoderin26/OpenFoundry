// Slice D — Edit with AIP. Routes the editor's text transforms behind
// an `AIPTransformer` port so the handler stays implementation-free.
//
// The default `MockAIPTransformer` ships deterministic behaviour for
// the two ops where a stub can mirror the real product behaviour
// (`fix_grammar`, `shorten`); the remaining ops (`change_style`,
// `translate`, `custom_prompt`, `function`) return the input wrapped
// with a clearly-labelled mock annotation so reviewers can tell that
// the real LLM is not yet wired in. Pointing `State.AIPTransformer`
// at an agent-runtime-service client is the only change required to
// promote AIP from mock to live.
package notepad

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

// ErrAIPTextRequired is returned when /aip/transform is called with
// empty selection text.
var ErrAIPTextRequired = errors.New("notepad: text is required for AIP transforms")

// ErrAIPUnsupportedOp is returned for ops outside the documented set.
var ErrAIPUnsupportedOp = errors.New("notepad: unsupported AIP op")

// AIPTransformer is the port the AIP handler talks to. Default impl
// is MockAIPTransformer; real implementations route to upstream LLM
// services (agent-runtime-service, ai-evaluation-service, …).
type AIPTransformer interface {
	Transform(ctx context.Context, req models.AIPTransformRequest) (models.AIPTransformResult, error)
}

// MockAIPTransformer ships with the service. `fix_grammar` and
// `shorten` produce real, deterministic output; the LLM-bound ops
// return the input wrapped with a mock annotation so reviewers can
// tell the real service is not yet wired in.
type MockAIPTransformer struct{}

// NewMockAIPTransformer is the no-arg constructor.
func NewMockAIPTransformer() *MockAIPTransformer { return &MockAIPTransformer{} }

func (m *MockAIPTransformer) Transform(_ context.Context, req models.AIPTransformRequest) (models.AIPTransformResult, error) {
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return models.AIPTransformResult{}, ErrAIPTextRequired
	}
	out := models.AIPTransformResult{
		Op:         req.Op,
		SourceText: req.Text,
		Provider:   "deterministic",
	}
	switch req.Op {
	case models.AIPTransformFixGrammar:
		out.Result = fixGrammar(req.Text)
		out.Annotation = "Original text → Fix spelling / grammar"
	case models.AIPTransformShorten:
		out.Result = shortenText(req.Text)
		out.Annotation = "Original text → Shorten"
	case models.AIPTransformChangeStyle:
		style := strings.ToLower(strings.TrimSpace(req.Options["style"]))
		if style != "professional" && style != "confident" {
			style = "professional"
		}
		out.Result = req.Text
		out.Annotation = fmt.Sprintf("Original text → Change writing style (%s) — mock until agent-runtime-service is wired", title(style))
		out.Provider = "mock"
	case models.AIPTransformTranslate:
		lang := strings.TrimSpace(req.Options["target_lang"])
		if lang == "" {
			lang = "French"
		}
		out.Result = req.Text
		out.Annotation = fmt.Sprintf("Original text → Translate (%s) — mock until agent-runtime-service is wired", lang)
		out.Provider = "mock"
	case models.AIPTransformCustomPrompt:
		prompt := strings.TrimSpace(req.Prompt)
		if prompt == "" {
			return models.AIPTransformResult{}, fmt.Errorf("custom_prompt requires a non-empty prompt")
		}
		out.Result = req.Text
		out.Annotation = fmt.Sprintf("Custom prompt: %q — mock until agent-runtime-service is wired", prompt)
		out.Provider = "mock"
	case models.AIPTransformFunction:
		fn := strings.TrimSpace(req.Options["function_id"])
		if fn == "" {
			return models.AIPTransformResult{}, fmt.Errorf("function op requires options.function_id")
		}
		out.Result = req.Text
		out.Annotation = fmt.Sprintf("Function %q — mock until ai-evaluation-service function dispatch is wired", fn)
		out.Provider = "mock"
	default:
		return models.AIPTransformResult{}, ErrAIPUnsupportedOp
	}
	return out, nil
}

// ── deterministic helpers ────────────────────────────────────────────

// fixGrammar capitalises sentence starts, collapses runs of whitespace
// and ensures the trailing punctuation is one of `.!?`. Not as good
// as a real LLM, but the corrections are honest and reproducible.
func fixGrammar(in string) string {
	if in == "" {
		return ""
	}
	// Collapse internal whitespace.
	collapsed := collapseSpaces(in)
	// Capitalise after `.`, `!`, `?`, and at start of string.
	runes := []rune(collapsed)
	atStart := true
	for i, r := range runes {
		if unicode.IsSpace(r) {
			continue
		}
		if atStart && unicode.IsLetter(r) {
			runes[i] = unicode.ToUpper(r)
			atStart = false
			continue
		}
		if r == '.' || r == '!' || r == '?' {
			atStart = true
		} else if !unicode.IsSpace(r) {
			atStart = false
		}
	}
	out := strings.TrimSpace(string(runes))
	if out == "" {
		return out
	}
	last := out[len(out)-1]
	if last != '.' && last != '!' && last != '?' {
		out += "."
	}
	return out
}

// shortenText returns the first half of the sentences (rounded up).
// Stop on `.`, `!`, `?` followed by whitespace or end-of-string.
func shortenText(in string) string {
	sentences := splitSentences(in)
	if len(sentences) == 0 {
		return ""
	}
	if len(sentences) == 1 {
		// One sentence: keep the first ~60% of characters, snap to
		// the nearest word boundary so we don't cut mid-word.
		runes := []rune(strings.TrimSpace(sentences[0]))
		cut := (len(runes) * 6) / 10
		if cut < 1 {
			cut = len(runes)
		}
		for cut < len(runes) && !unicode.IsSpace(runes[cut]) {
			cut++
		}
		out := strings.TrimRight(string(runes[:cut]), " \t,;:")
		if !strings.HasSuffix(out, ".") && !strings.HasSuffix(out, "!") && !strings.HasSuffix(out, "?") {
			out += "…"
		}
		return out
	}
	keep := (len(sentences) + 1) / 2
	return strings.Join(sentences[:keep], " ")
}

func splitSentences(in string) []string {
	out := []string{}
	current := strings.Builder{}
	for i, r := range in {
		current.WriteRune(r)
		if r == '.' || r == '!' || r == '?' {
			next := i + 1
			if next >= len(in) || unicode.IsSpace(rune(in[next])) {
				out = append(out, strings.TrimSpace(current.String()))
				current.Reset()
			}
		}
	}
	if remaining := strings.TrimSpace(current.String()); remaining != "" {
		out = append(out, remaining)
	}
	return out
}

func collapseSpaces(in string) string {
	out := strings.Builder{}
	prevSpace := false
	for _, r := range in {
		if unicode.IsSpace(r) {
			if !prevSpace {
				out.WriteRune(' ')
			}
			prevSpace = true
			continue
		}
		prevSpace = false
		out.WriteRune(r)
	}
	return out.String()
}

func title(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
