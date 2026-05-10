// capabilities-snapshot scans services/** for stable capability
// declarations and writes a deterministic JSON snapshot of the
// Stable=true subset to docs/agent-automation/stable-capabilities.json.
//
// CI re-runs this tool and fails if the snapshot drifts (i.e. a stable
// capability was added, removed or modified) without the snapshot file
// being updated in the same PR. See AGENT-CAPABILITIES-ROADMAP.md
// (Milestone M1.1, drift CI task).
//
// Detection strategy is purely static (Go AST): no service is started,
// no DB is needed. Two sources are merged:
//
//  1. Composite literals `capabilities.Capability{ ... Stable: true ... }`
//     anywhere under services/**. ID + Path + Method are extracted from
//     the literal; Service is derived from the owning service directory.
//  2. Implicit `_meta.capabilities.list` registration: every file that
//     calls `<reg>.Mount(<router>)` gets a synthetic stable entry, which
//     is what `Registry.Mount` actually emits at runtime.
//
// Limitations: literals built across multiple statements or via helper
// constructors are NOT detected. The snapshot is intentionally
// conservative — false negatives are safer than false positives for a
// drift gate.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type stableEntry struct {
	ID      string `json:"id"`
	Service string `json:"service"`
	Method  string `json:"method,omitempty"`
	Path    string `json:"path,omitempty"`
	Source  string `json:"source"` // "literal" | "mount"
}

type snapshot struct {
	SchemaVersion int           `json:"schema_version"`
	Generator     string        `json:"generator"`
	Entries       []stableEntry `json:"entries"`
}

func main() {
	var (
		root  = flag.String("root", ".", "repository root")
		out   = flag.String("out", "docs/agent-automation/stable-capabilities.json", "output snapshot path")
		check = flag.Bool("check", false, "exit non-zero if the snapshot would change")
	)
	flag.Parse()

	servicesDir := filepath.Join(*root, "services")
	entries, err := scan(servicesDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scan failed: %v\n", err)
		os.Exit(2)
	}

	snap := snapshot{
		SchemaVersion: 1,
		Generator:     "tools/capabilities-snapshot",
		Entries:       entries,
	}
	data, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal failed: %v\n", err)
		os.Exit(2)
	}
	data = append(data, '\n')

	outPath := filepath.Join(*root, *out)
	if *check {
		existing, err := os.ReadFile(outPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "::error::%s missing — run 'go run ./tools/capabilities-snapshot' and commit\n", *out)
			os.Exit(1)
		}
		if string(existing) != string(data) {
			fmt.Fprintf(os.Stderr, "::error::%s drift — run 'go run ./tools/capabilities-snapshot' and commit\n", *out)
			os.Exit(1)
		}
		fmt.Printf("ok — %d stable capabilities\n", len(entries))
		return
	}
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "mkdir failed: %v\n", err)
		os.Exit(2)
	}
	if err := os.WriteFile(outPath, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write failed: %v\n", err)
		os.Exit(2)
	}
	fmt.Printf("wrote %s — %d stable capabilities\n", outPath, len(entries))
}

func scan(servicesDir string) ([]stableEntry, error) {
	fset := token.NewFileSet()
	out := make(map[string]stableEntry) // dedup by service|id

	err := filepath.WalkDir(servicesDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		// Service name = first directory component under services/.
		rel, _ := filepath.Rel(servicesDir, path)
		service := strings.SplitN(rel, string(os.PathSeparator), 2)[0]
		if service == "template" {
			// Reference scaffold — exclude from the gate, it changes
			// freely as the template evolves.
			return nil
		}

		f, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return nil // tolerate parse errors; lint/vet jobs already cover them
		}
		ast.Inspect(f, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.CompositeLit:
				if isStableCapabilityLit(node) {
					if e, ok := entryFromLit(service, node); ok {
						out[service+"|"+e.ID] = e
					}
				}
			case *ast.CallExpr:
				if isMountCall(node) {
					// `Registry.Mount` registers four stable meta caps;
					// keep this list in sync with libs/capabilities/registry.go.
					mountCaps := []stableEntry{
						{ID: "_meta.capabilities.list", Method: "GET", Path: "/_meta/capabilities"},
						{ID: "_meta.deps.get", Method: "GET", Path: "/_meta/deps"},
						{ID: "_meta.health.get", Method: "GET", Path: "/_meta/health"},
						{ID: "_meta.version.get", Method: "GET", Path: "/_meta/version"},
					}
					for _, e := range mountCaps {
						e.Service = service
						e.Source = "mount"
						out[service+"|"+e.ID] = e
					}
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		return nil, err
	}

	flat := make([]stableEntry, 0, len(out))
	for _, e := range out {
		flat = append(flat, e)
	}
	sort.Slice(flat, func(i, j int) bool {
		if flat[i].Service != flat[j].Service {
			return flat[i].Service < flat[j].Service
		}
		return flat[i].ID < flat[j].ID
	})
	return flat, nil
}

// isStableCapabilityLit reports whether node is a `capabilities.Capability{...}`
// composite literal containing `Stable: true`.
func isStableCapabilityLit(node *ast.CompositeLit) bool {
	sel, ok := node.Type.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "Capability" {
		return false
	}
	pkg, ok := sel.X.(*ast.Ident)
	if !ok || pkg.Name != "capabilities" {
		return false
	}
	for _, el := range node.Elts {
		kv, ok := el.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok || key.Name != "Stable" {
			continue
		}
		if id, ok := kv.Value.(*ast.Ident); ok && id.Name == "true" {
			return true
		}
	}
	return false
}

func entryFromLit(service string, node *ast.CompositeLit) (stableEntry, bool) {
	e := stableEntry{Service: service, Source: "literal"}
	for _, el := range node.Elts {
		kv, ok := el.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok {
			continue
		}
		switch key.Name {
		case "ID":
			if s, ok := stringLit(kv.Value); ok {
				e.ID = s
			}
		case "Path":
			if s, ok := stringLit(kv.Value); ok {
				e.Path = s
			}
		case "Method":
			if s, ok := stringLit(kv.Value); ok {
				e.Method = strings.ToUpper(s)
			} else if sel, ok := kv.Value.(*ast.SelectorExpr); ok {
				// http.MethodGet etc. — derive from selector name.
				e.Method = strings.ToUpper(strings.TrimPrefix(sel.Sel.Name, "Method"))
			}
		}
	}
	if e.ID == "" {
		return e, false
	}
	return e, true
}

func stringLit(expr ast.Expr) (string, bool) {
	bl, ok := expr.(*ast.BasicLit)
	if !ok || bl.Kind != token.STRING {
		return "", false
	}
	s, err := strconv.Unquote(bl.Value)
	if err != nil {
		return "", false
	}
	return s, true
}

// isMountCall reports whether node looks like `<x>.Mount(<router>)`
// where the package context already imports libs/capabilities. We do
// not verify the receiver type (would need go/types); the
// `caps.Mount(r)` pattern is conventional across the tree, and the
// snapshot is reproducible so any false positive would be caught by
// review.
func isMountCall(node *ast.CallExpr) bool {
	sel, ok := node.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "Mount" {
		return false
	}
	x, ok := sel.X.(*ast.Ident)
	if !ok {
		return false
	}
	// Heuristic: receiver named "caps" — the convention used by every
	// auto-wired and hand-wired service in the tree.
	return x.Name == "caps"
}
