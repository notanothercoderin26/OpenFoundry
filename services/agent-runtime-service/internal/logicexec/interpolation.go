package logicexec

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// promptInjectionRe mirrors PROMPT_INJECTION_PATTERN in the TS
// authoring layer (apps/web/src/lib/logic/blocks.ts:618). When a
// substituted value looks like a fake role tag we neutralise the
// triggering colon so the LLM can't be tricked into treating user
// data as a system instruction.
var promptInjectionRe = regexp.MustCompile(`(?im)(^|\n)\s*(system|assistant|developer)\s*:`)

// varRe matches `{{ name }}` with surrounding whitespace, identical
// to substituteFragments in the TS layer.
var varRe = regexp.MustCompile(`\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}`)

// renderTemplate substitutes {{name}} references in template using the
// inputs map. Values are escaped to neutralise prompt-injection
// fragments. Unknown references are left as-is so the LLM sees the
// original token (matches TS behaviour).
func renderTemplate(template string, inputs map[string]any) string {
	if template == "" {
		return ""
	}
	return varRe.ReplaceAllStringFunc(template, func(match string) string {
		name := varRe.FindStringSubmatch(match)[1]
		value, ok := inputs[name]
		if !ok {
			return match
		}
		return escapePromptValue(value)
	})
}

// escapePromptValue neutralises common prompt-injection vectors. The
// frontend ships the same set of escapes; keep them in sync.
func escapePromptValue(value any) string {
	if value == nil {
		return ""
	}
	var s string
	switch v := value.(type) {
	case string:
		s = v
	default:
		b, err := json.Marshal(v)
		if err != nil {
			s = fmt.Sprint(v)
		} else {
			s = string(b)
		}
	}
	s = strings.ReplaceAll(s, "```", "` ``")
	s = strings.ReplaceAll(s, "<|system|>", "<system>")
	s = strings.ReplaceAll(s, "<|assistant|>", "<assistant>")
	s = strings.ReplaceAll(s, "<| system |>", "<system>")
	s = strings.ReplaceAll(s, "<| assistant |>", "<assistant>")
	if promptInjectionRe.MatchString(s) {
		s = promptInjectionRe.ReplaceAllString(s, "$1 $2 -")
	}
	return s
}

// resolveParameterMappings expands a Foundry-style parameterMappings
// object into the concrete args dictionary the downstream tool
// expects. Two mapping shapes are supported, matching the frontend:
//
//	{ "name": { "kind": "input", "apiName": "supplier_name" } }
//	{ "name": { "kind": "literal", "value": "..." } }
//
// A bare value (string / number / map) is treated as a literal so the
// "I just want to hard-code a value" path stays one-liner-friendly.
func resolveParameterMappings(mappings map[string]any, inputs map[string]any) map[string]any {
	out := make(map[string]any, len(mappings))
	for name, spec := range mappings {
		out[name] = resolveMapping(spec, inputs)
	}
	return out
}

func resolveMapping(spec any, inputs map[string]any) any {
	m, ok := spec.(map[string]any)
	if !ok {
		return spec
	}
	kind, _ := m["kind"].(string)
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "input":
		apiName, _ := m["apiName"].(string)
		if apiName == "" {
			apiName, _ = m["api_name"].(string)
		}
		if v, ok := inputs[apiName]; ok {
			return v
		}
		return nil
	case "literal", "":
		if v, ok := m["value"]; ok {
			return v
		}
		return m
	default:
		// Unknown mapping kind (e.g. computed expression) — surface
		// the raw spec so the caller logs an actionable error rather
		// than silently dropping the mapping.
		return m
	}
}
