// Slice G — template instantiation. The substitution engine walks
// every text-bearing field of a NotepadTemplate (the markdown
// `content`, the ProseMirror `content_doc`, and the `widgets`
// metadata) replacing `{{input.<key>}}` tokens with the values
// provided at instantiate time. Tokens without a matching input are
// left untouched so reviewers can spot a missing variable instead of
// silently shipping a half-rendered doc.
package notepad

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

// ErrTemplateMissingRequiredInput is returned when an instantiate
// request omits a value for a required input field.
var ErrTemplateMissingRequiredInput = errors.New("notepad: template instantiation missing required input")

// tokenRe matches `{{input.<key>}}` with the same key character class
// the docs use (alphanumeric + underscore + hyphen).
var tokenRe = regexp.MustCompile(`\{\{\s*input\.([a-zA-Z0-9_-]+)\s*\}\}`)

// ValidateInputs returns an error when a required input is missing
// from the user-provided map and applies defaults so the substitution
// engine never sees an empty value for an input that has one.
func ValidateInputs(schema []models.NotepadTemplateInput, inputs map[string]string) (map[string]string, error) {
	resolved := make(map[string]string, len(schema))
	for _, field := range schema {
		v, ok := inputs[field.Key]
		if !ok || strings.TrimSpace(v) == "" {
			if field.Default != "" {
				resolved[field.Key] = field.Default
				continue
			}
			if field.Required {
				return nil, fmt.Errorf("%w: %s", ErrTemplateMissingRequiredInput, field.Key)
			}
			continue
		}
		resolved[field.Key] = v
	}
	// Allow unknown inputs through (the engine will simply not find
	// them referenced in the body); rejecting them surprises callers
	// that send extras for forward-compat.
	for k, v := range inputs {
		if _, present := resolved[k]; !present {
			resolved[k] = v
		}
	}
	return resolved, nil
}

// SubstituteTokens replaces every `{{input.<key>}}` occurrence in a
// plain string with the matching value. Unknown keys are kept as-is.
func SubstituteTokens(s string, inputs map[string]string) string {
	return tokenRe.ReplaceAllStringFunc(s, func(match string) string {
		key := tokenRe.FindStringSubmatch(match)[1]
		if v, ok := inputs[key]; ok {
			return v
		}
		return match
	})
}

// SubstituteJSON walks any JSON value, replacing tokens inside string
// leaves. Used for `content_doc` (ProseMirror) and `widgets` so the
// rich-text layer participates in templating without TipTap having
// to know about the substitution syntax.
func SubstituteJSON(raw json.RawMessage, inputs map[string]string) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return raw, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return raw, err
	}
	walked := walkJSON(value, inputs)
	out, err := json.Marshal(walked)
	if err != nil {
		return raw, err
	}
	return out, nil
}

func walkJSON(v any, inputs map[string]string) any {
	switch node := v.(type) {
	case map[string]any:
		for k, val := range node {
			node[k] = walkJSON(val, inputs)
		}
		return node
	case []any:
		for i := range node {
			node[i] = walkJSON(node[i], inputs)
		}
		return node
	case string:
		return SubstituteTokens(node, inputs)
	}
	return v
}

// Instantiate fully resolves a template against the user inputs and
// returns the body fields ready to write into a fresh NotepadDocument.
// Failures (missing required input, malformed content_doc) surface
// as errors so the handler can respond 4xx without partial writes.
func Instantiate(tpl *models.NotepadTemplate, rawInputs map[string]string) (string, json.RawMessage, json.RawMessage, error) {
	inputs, err := ValidateInputs(tpl.InputsSchema, rawInputs)
	if err != nil {
		return "", nil, nil, err
	}
	content := SubstituteTokens(tpl.Content, inputs)
	contentDoc, err := SubstituteJSON(tpl.ContentDoc, inputs)
	if err != nil {
		return "", nil, nil, fmt.Errorf("substitute content_doc: %w", err)
	}
	widgets, err := SubstituteJSON(tpl.Widgets, inputs)
	if err != nil {
		return "", nil, nil, fmt.Errorf("substitute widgets: %w", err)
	}
	return content, contentDoc, widgets, nil
}
