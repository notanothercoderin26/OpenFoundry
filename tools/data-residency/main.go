// data-residency enforces two gates on the OpenFoundry monorepo:
//
//  1. Migration residency. Each services/<svc>/internal/repo/migrations/*.sql
//     file must declare its residency tag on the first non-blank line as
//     `-- residency: <region>`. The region must be in the service's
//     `regions` list in .github/data-residency-allowlist.yaml (or in the
//     top-level default_regions if the service has no override).
//
//  2. Restricted-table handler access. Direct .Query / .Exec / .QueryRow
//     (and *Context variants) calls from handler-tier code under
//     services/<svc>/internal/handlers/ or services/<svc>/internal/handler/
//     that reference a table listed in `restricted_tables` are only
//     permitted from services in that table's `allowed_services`. Non-
//     allowed services should route through the owning service's HTTP
//     API, not issue SQL directly.
//
// Usage:
//
//	data-residency [-allowlist .github/data-residency-allowlist.yaml]
//	               [-repo-root .]
//	               [-gate-new-only]
//	               [-base-ref origin/main]
//	               [-skip-migrations] [-skip-handlers]
//	               [-format text|json]
//
// With -gate-new-only the migration check only inspects files that were
// added (status A) between -base-ref and HEAD according to git diff, and
// the grandfathered list is ignored (since the file is new by
// construction it must declare residency). The handler check is always
// strict and consults grandfathered_handler_queries.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

type allowlist struct {
	Version             int                       `yaml:"version"`
	DefaultRegions      []string                  `yaml:"default_regions"`
	DefaultMarkingTags  []string                  `yaml:"default_marking_tags"`
	Services            map[string]serviceProfile `yaml:"services"`
	RestrictedTables    map[string]restrictedTbl  `yaml:"restricted_tables"`
	GrandfatheredQueries []grandfatheredQuery     `yaml:"grandfathered_handler_queries"`
}

type serviceProfile struct {
	Regions                 []string `yaml:"regions"`
	MarkingTags             []string `yaml:"marking_tags"`
	GrandfatheredMigrations []string `yaml:"grandfathered_migrations"`
}

type restrictedTbl struct {
	AllowedServices []string `yaml:"allowed_services"`
}

type grandfatheredQuery struct {
	File  string `yaml:"file"`
	Table string `yaml:"table"`
}

type violation struct {
	Kind    string `json:"kind"`
	Service string `json:"service,omitempty"`
	File    string `json:"file"`
	Line    int    `json:"line,omitempty"`
	Table   string `json:"table,omitempty"`
	Region  string `json:"region,omitempty"`
	Message string `json:"message"`
}

func main() {
	var (
		allowlistPath = flag.String("allowlist", ".github/data-residency-allowlist.yaml", "path to allowlist YAML")
		repoRoot      = flag.String("repo-root", ".", "repository root")
		gateNewOnly   = flag.Bool("gate-new-only", false, "only enforce migration check on files added since -base-ref")
		baseRef       = flag.String("base-ref", "origin/main", "git ref to diff against when -gate-new-only is set")
		skipMig       = flag.Bool("skip-migrations", false, "skip the migration residency check")
		skipHand      = flag.Bool("skip-handlers", false, "skip the restricted-table handler check")
		format        = flag.String("format", "text", "output format: text or json")
	)
	flag.Parse()

	root, err := filepath.Abs(*repoRoot)
	if err != nil {
		fail("resolve repo-root: %v", err)
	}

	al, err := loadAllowlist(filepath.Join(root, *allowlistPath))
	if err != nil {
		fail("load allowlist: %v", err)
	}
	if al.Version != 1 {
		fail("allowlist version %d is not supported (want 1)", al.Version)
	}

	var violations []violation

	if !*skipMig {
		var addedSet map[string]bool
		if *gateNewOnly {
			added, err := gitAddedFiles(root, *baseRef)
			if err != nil {
				fail("git diff against %s: %v", *baseRef, err)
			}
			addedSet = make(map[string]bool, len(added))
			for _, f := range added {
				addedSet[f] = true
			}
		}
		v, err := checkMigrations(root, al, *gateNewOnly, addedSet)
		if err != nil {
			fail("migration check: %v", err)
		}
		violations = append(violations, v...)
	}

	if !*skipHand {
		v, err := checkHandlers(root, al)
		if err != nil {
			fail("handler check: %v", err)
		}
		violations = append(violations, v...)
	}

	sortViolations(violations)

	switch *format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(struct {
			Violations []violation `json:"violations"`
		}{violations}); err != nil {
			fail("encode json: %v", err)
		}
	default:
		printText(os.Stdout, violations)
	}

	if len(violations) > 0 {
		os.Exit(1)
	}
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "data-residency: "+format+"\n", args...)
	os.Exit(2)
}

func loadAllowlist(path string) (*allowlist, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var al allowlist
	if err := yaml.Unmarshal(raw, &al); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}
	return &al, nil
}

// ---------------------------------------------------------------------------
// Migration check
// ---------------------------------------------------------------------------

var residencyHeader = regexp.MustCompile(`^--\s*residency:\s*([A-Za-z0-9_-]+)\s*$`)

func checkMigrations(root string, al *allowlist, gateNewOnly bool, addedSet map[string]bool) ([]violation, error) {
	var out []violation

	servicesDir := filepath.Join(root, "services")
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		return nil, fmt.Errorf("read services dir: %w", err)
	}
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		svc := ent.Name()
		migDir := filepath.Join(servicesDir, svc, "internal", "repo", "migrations")
		st, err := os.Stat(migDir)
		if err != nil || !st.IsDir() {
			continue
		}
		profile := al.Services[svc]
		allowed := profile.Regions
		if len(allowed) == 0 {
			allowed = al.DefaultRegions
		}
		grandfathered := make(map[string]bool, len(profile.GrandfatheredMigrations))
		for _, m := range profile.GrandfatheredMigrations {
			grandfathered[m] = true
		}

		err = fs.WalkDir(os.DirFS(migDir), ".", func(p string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.IsDir() || !strings.HasSuffix(p, ".sql") {
				return nil
			}
			abs := filepath.Join(migDir, p)
			rel, err := filepath.Rel(root, abs)
			if err != nil {
				return err
			}
			rel = filepath.ToSlash(rel)
			base := filepath.Base(p)

			if gateNewOnly {
				if !addedSet[rel] {
					return nil
				}
				// Grandfathering does not apply to new files.
			} else if grandfathered[base] {
				return nil
			}

			region, ok, err := readResidencyHeader(abs)
			if err != nil {
				return err
			}
			if !ok {
				out = append(out, violation{
					Kind:    "migration_missing_residency",
					Service: svc,
					File:    rel,
					Line:    1,
					Message: "missing `-- residency: <region>` header on first non-blank line",
				})
				return nil
			}
			if !contains(allowed, region) {
				out = append(out, violation{
					Kind:    "migration_region_not_allowed",
					Service: svc,
					File:    rel,
					Line:    1,
					Region:  region,
					Message: fmt.Sprintf("region %q is not in allowed regions for %s (allowed: %s)", region, svc, strings.Join(allowed, ", ")),
				})
			}
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("walk migrations for %s: %w", svc, err)
		}
	}
	return out, nil
}

func readResidencyHeader(path string) (string, bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", false, err
	}
	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		m := residencyHeader.FindStringSubmatch(trimmed)
		if m == nil {
			return "", false, nil
		}
		return m[1], true, nil
	}
	return "", false, nil
}

// ---------------------------------------------------------------------------
// Handler check
// ---------------------------------------------------------------------------

var queryMethodRe = regexp.MustCompile(`\.(Query|QueryRow|Exec|QueryContext|QueryRowContext|ExecContext)\s*\(`)

func checkHandlers(root string, al *allowlist) ([]violation, error) {
	var out []violation
	if len(al.RestrictedTables) == 0 {
		return out, nil
	}

	// Pre-compile per-table word-boundary regexes once.
	tableRes := make(map[string]*regexp.Regexp, len(al.RestrictedTables))
	for t := range al.RestrictedTables {
		tableRes[t] = regexp.MustCompile(`\b` + regexp.QuoteMeta(t) + `\b`)
	}

	grandfathered := make(map[string]bool, len(al.GrandfatheredQueries))
	for _, g := range al.GrandfatheredQueries {
		grandfathered[g.File+"|"+g.Table] = true
	}

	servicesDir := filepath.Join(root, "services")
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		return nil, fmt.Errorf("read services dir: %w", err)
	}
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		svc := ent.Name()
		for _, sub := range []string{"handlers", "handler"} {
			dir := filepath.Join(servicesDir, svc, "internal", sub)
			st, err := os.Stat(dir)
			if err != nil || !st.IsDir() {
				continue
			}
			err = filepath.WalkDir(dir, func(p string, d fs.DirEntry, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}
				if d.IsDir() || !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") {
					return nil
				}
				rel, err := filepath.Rel(root, p)
				if err != nil {
					return err
				}
				rel = filepath.ToSlash(rel)
				v, err := scanHandlerFile(p, rel, svc, al, tableRes, grandfathered)
				if err != nil {
					return err
				}
				out = append(out, v...)
				return nil
			})
			if err != nil {
				return nil, fmt.Errorf("walk handlers for %s: %w", svc, err)
			}
		}
	}
	return out, nil
}

func scanHandlerFile(absPath, relPath, svc string, al *allowlist, tableRes map[string]*regexp.Regexp, grandfathered map[string]bool) ([]violation, error) {
	raw, err := os.ReadFile(absPath)
	if err != nil {
		return nil, err
	}
	text := string(raw)

	// Strip block and line comments so a commented table reference doesn't
	// trip the gate.
	stripped := stripGoComments(text)

	var out []violation
	for _, m := range queryMethodRe.FindAllStringIndex(stripped, -1) {
		// m[1] points just past the opening `(` of the call.
		openIdx := m[1] - 1
		closeIdx := findMatchingParen(stripped, openIdx)
		if closeIdx < 0 {
			continue
		}
		call := stripped[openIdx+1 : closeIdx]
		for table, re := range tableRes {
			if !re.MatchString(call) {
				continue
			}
			allowed := al.RestrictedTables[table].AllowedServices
			if containsString(allowed, svc) {
				continue
			}
			if grandfathered[relPath+"|"+table] {
				continue
			}
			line := lineOf(stripped, m[0])
			out = append(out, violation{
				Kind:    "handler_restricted_table_access",
				Service: svc,
				File:    relPath,
				Line:    line,
				Table:   table,
				Message: fmt.Sprintf("handler-tier direct query references restricted table %q from service %q (allowed services: %s); route through the owning service instead", table, svc, strings.Join(allowed, ", ")),
			})
		}
	}
	return out, nil
}

// stripGoComments removes // line and /* */ block comments but preserves
// string literals (where SQL lives). Newlines are kept so line numbers
// stay aligned with the source.
func stripGoComments(text string) string {
	var b strings.Builder
	b.Grow(len(text))
	i := 0
	for i < len(text) {
		ch := text[i]
		// String literal — copy through verbatim.
		if ch == '"' || ch == '`' {
			quote := ch
			b.WriteByte(ch)
			i++
			for i < len(text) {
				c := text[i]
				b.WriteByte(c)
				i++
				if quote == '"' && c == '\\' && i < len(text) {
					b.WriteByte(text[i])
					i++
					continue
				}
				if c == quote {
					break
				}
			}
			continue
		}
		if ch == '/' && i+1 < len(text) {
			if text[i+1] == '/' {
				for i < len(text) && text[i] != '\n' {
					i++
				}
				continue
			}
			if text[i+1] == '*' {
				i += 2
				for i+1 < len(text) && !(text[i] == '*' && text[i+1] == '/') {
					if text[i] == '\n' {
						b.WriteByte('\n')
					}
					i++
				}
				if i+1 < len(text) {
					i += 2
				}
				continue
			}
		}
		b.WriteByte(ch)
		i++
	}
	return b.String()
}

func findMatchingParen(text string, openIdx int) int {
	if openIdx >= len(text) || text[openIdx] != '(' {
		return -1
	}
	depth := 0
	i := openIdx
	inDouble, inBack, escaped := false, false, false
	for i < len(text) {
		c := text[i]
		switch {
		case escaped:
			escaped = false
		case inDouble:
			if c == '\\' {
				escaped = true
			} else if c == '"' {
				inDouble = false
			}
		case inBack:
			if c == '`' {
				inBack = false
			}
		default:
			switch c {
			case '"':
				inDouble = true
			case '`':
				inBack = true
			case '(':
				depth++
			case ')':
				depth--
				if depth == 0 {
					return i
				}
			}
		}
		i++
	}
	return -1
}

func lineOf(text string, idx int) int {
	if idx > len(text) {
		idx = len(text)
	}
	return strings.Count(text[:idx], "\n") + 1
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func gitAddedFiles(root, baseRef string) ([]string, error) {
	cmd := exec.Command("git", "diff", "--name-only", "--diff-filter=A", baseRef+"...HEAD", "--", "services/*/internal/repo/migrations/*.sql")
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff: %w", err)
	}
	var files []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		files = append(files, line)
	}
	return files, nil
}

func contains(haystack []string, needle string) bool {
	return containsString(haystack, needle)
}

func containsString(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func sortViolations(vs []violation) {
	sort.Slice(vs, func(i, j int) bool {
		if vs[i].File != vs[j].File {
			return vs[i].File < vs[j].File
		}
		if vs[i].Line != vs[j].Line {
			return vs[i].Line < vs[j].Line
		}
		return vs[i].Kind < vs[j].Kind
	})
}

func printText(out *os.File, vs []violation) {
	if len(vs) == 0 {
		fmt.Fprintln(out, "data-residency: OK (no violations)")
		return
	}
	fmt.Fprintf(out, "data-residency: %d violation(s)\n\n", len(vs))
	for _, v := range vs {
		loc := v.File
		if v.Line > 0 {
			loc = fmt.Sprintf("%s:%d", v.File, v.Line)
		}
		fmt.Fprintf(out, "  [%s] %s\n    %s\n", v.Kind, loc, v.Message)
	}
}
