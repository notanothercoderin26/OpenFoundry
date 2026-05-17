// Command bus-allowlist enforces the per-service Kafka topic / NATS
// subject allowlist defined in .github/bus-allowlist.yaml.
//
// It is the Go replacement for the retired Rust-era `bus-contract`
// gate that walked services/*/Cargo.toml against
// .github/bus-allowlist.yaml. Same intent: catch a service that
// starts producing or consuming on a topic nobody approved.
//
// Behaviour:
//
//   - Loads .github/bus-allowlist.yaml.
//   - Walks services/<svc>/ for *.go (non-test) files.
//   - Parses each file and collects every BasicLit STRING whose
//     value matches one of the bus-domain prefixes
//     (audit.events, audit.authz, ai.events, lineage.events, saga.,
//     approval., automate., ontology., ontology-indexer.,
//     foundry.branch.events., foundry.global.branch.,
//     dataset.branch., of., openfoundry.streams.). Format verbs in
//     templated literals (e.g. `openfoundry.streams.%s`) are
//     normalised to `*` before lookup.
//   - Fails when a service uses a topic that is not enumerated for
//     it. Stale allowlist entries (listed but not used) are reported
//     as warnings only — the gate is a FLOOR, not a reduction lever.
//
// Usage:
//
//	go run ./tools/bus-allowlist            # repo-root, default paths
//	go run ./tools/bus-allowlist -root /tmp/of -allowlist custom.yaml
package main

import (
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// busPrefixes is the list of dot-segment prefixes that the scanner
// considers candidate bus topics. A string literal must start with
// one of these AND match a topic shape (see [isBusTopicShape]) to
// count; anything else (permission action names, schema versions,
// event-type discriminators that ride inside a payload) is treated
// as out-of-scope by design.
//
// `dataset.branch.` is intentionally absent: real dataset bus
// traffic flows on `foundry.branch.events.v1`; `dataset.branch.*.v1`
// strings are event-type discriminators inside that envelope.
var busPrefixes = []string{
	"audit.events.",
	"audit.authz.",
	"ai.events.",
	"lineage.events",
	"saga.",
	"approval.",
	"automate.",
	"ontology.actions.",
	"ontology.object.",
	"ontology.objects.",
	"ontology.links.",
	"ontology.reindex.",
	"ontology-indexer.",
	"foundry.branch.events.",
	"foundry.global.branch.",
	"of.",
	"openfoundry.streams.",
}

// versionSuffixRE pins the Kafka data-plane topic convention
// (`<domain>.<...>.v<N>`).
var versionSuffixRE = regexp.MustCompile(`\.v\d+$`)

// formatVerbRE matches Go fmt verbs. Templated literals like
// `openfoundry.streams.%s` resolve to multiple runtime topics; the
// gate normalises every verb to `*` so the YAML can list one
// wildcard entry instead of enumerating every UUID.
var formatVerbRE = regexp.MustCompile(`%[+#0\- ]*\d*\.?\d*[svdtTqxXfeEgGpc]`)

// validTopicRE rejects literals that carry stray characters (URL
// schemes, slashes, whitespace, …). After format-verb normalisation
// a real bus topic is a sequence of `[a-z0-9_-]` tokens joined by
// `.` plus optional `*` segments.
var validTopicRE = regexp.MustCompile(`^[a-z0-9_*.\-]+$`)

type allowlist struct {
	Version  int                       `yaml:"version"`
	Services map[string]serviceEntry   `yaml:"services"`
}

type serviceEntry struct {
	Topics []string `yaml:"topics"`
}

type finding struct {
	service string
	topic   string
	file    string
	line    int
}

func main() {
	var (
		root      string
		allowPath string
		quiet     bool
	)
	flag.StringVar(&root, "root", ".", "repo root (defaults to working directory)")
	flag.StringVar(&allowPath, "allowlist", "", "allowlist YAML path (default: <root>/.github/bus-allowlist.yaml)")
	flag.BoolVar(&quiet, "quiet", false, "suppress the per-service summary on success")
	flag.Parse()

	if allowPath == "" {
		allowPath = filepath.Join(root, ".github", "bus-allowlist.yaml")
	}

	allow, err := loadAllowlist(allowPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "bus-allowlist: load %s: %v\n", allowPath, err)
		os.Exit(2)
	}

	servicesDir := filepath.Join(root, "services")
	usage, err := scanServices(servicesDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "bus-allowlist: scan %s: %v\n", servicesDir, err)
		os.Exit(2)
	}

	violations, stale := compare(allow, usage)

	for _, w := range stale {
		fmt.Fprintf(os.Stderr, "warning: bus-allowlist: %s lists %q but no source literal references it\n",
			w.service, w.topic)
	}

	if len(violations) > 0 {
		for _, v := range violations {
			fmt.Fprintf(os.Stderr, "error: bus-allowlist: %s uses topic %q which is not in the allowlist (%s:%d)\n",
				v.service, v.topic, v.file, v.line)
		}
		fmt.Fprintf(os.Stderr, "\n%d violation(s) found. Add the topic(s) to %s, or remove the literal from the service.\n",
			len(violations), allowPath)
		os.Exit(1)
	}

	if !quiet {
		fmt.Printf("bus-allowlist: OK — %d service(s) checked, %d topic literal(s) validated against %s\n",
			len(usage), countLiterals(usage), allowPath)
	}
}

func loadAllowlist(path string) (*allowlist, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var a allowlist
	if err := yaml.Unmarshal(raw, &a); err != nil {
		return nil, err
	}
	if a.Version != 1 {
		return nil, fmt.Errorf("unsupported version %d (want 1)", a.Version)
	}
	return &a, nil
}

// scanServices returns a map of service → set of topic strings found
// as direct literals in that service's non-test Go sources.
func scanServices(servicesDir string) (map[string]map[string][]location, error) {
	usage := map[string]map[string][]location{}
	entries, err := os.ReadDir(servicesDir)
	if err != nil {
		return nil, err
	}
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		svc := ent.Name()
		if svc == "template" {
			continue
		}
		svcRoot := filepath.Join(servicesDir, svc)
		found, err := scanService(svcRoot)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", svc, err)
		}
		if len(found) > 0 {
			usage[svc] = found
		}
	}
	return usage, nil
}

type location struct {
	file string
	line int
}

// scanService walks one service directory and returns every topic
// literal that matches the bus-domain prefixes, keyed by the
// normalised topic and carrying the first location it was seen at.
func scanService(svcRoot string) (map[string][]location, error) {
	found := map[string][]location{}
	walkErr := filepath.WalkDir(svcRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		if strings.HasSuffix(path, "_test.go") {
			return nil
		}
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			val, err := strconv.Unquote(lit.Value)
			if err != nil {
				return true
			}
			topic, ok := normalize(val)
			if !ok {
				return true
			}
			pos := fset.Position(lit.Pos())
			found[topic] = append(found[topic], location{file: pos.Filename, line: pos.Line})
			return true
		})
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}
	return found, nil
}

// normalize returns the topic string after format-verb substitution,
// or false if the literal is not a bus-domain candidate. Two gates
// apply: the literal must start with a known bus-domain prefix, and
// it must match a recognised topic shape (versioned Kafka topic,
// `of.*` NATS subject, `openfoundry.streams.*` template, or the
// legacy `lineage.events` exception).
func normalize(raw string) (string, bool) {
	if !hasBusPrefix(raw) {
		return "", false
	}
	candidate := formatVerbRE.ReplaceAllString(raw, "*")
	if !validTopicRE.MatchString(candidate) {
		return "", false
	}
	for strings.Contains(candidate, "**") {
		candidate = strings.ReplaceAll(candidate, "**", "*")
	}
	if !isBusTopicShape(candidate) {
		return "", false
	}
	return candidate, true
}

// isBusTopicShape gates candidate strings to the two real bus
// conventions used in the repo: Kafka topics with a `.vN` suffix and
// NATS subjects beginning with `of.` or `openfoundry.streams.`. The
// `lineage.events` legacy topic predates the versioning convention
// and is kept as an explicit exception.
func isBusTopicShape(s string) bool {
	if versionSuffixRE.MatchString(s) {
		return true
	}
	if strings.HasPrefix(s, "of.") {
		return true
	}
	if strings.HasPrefix(s, "openfoundry.streams.") {
		return true
	}
	if s == "lineage.events" {
		return true
	}
	return false
}

func hasBusPrefix(s string) bool {
	for _, p := range busPrefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
		// Allow exact match for prefixes that don't end in a dot
		// (e.g. "lineage.events" with no version suffix).
		if !strings.HasSuffix(p, ".") && s == p {
			return true
		}
	}
	return false
}

// compare returns the list of usage entries that the allowlist does
// not cover, and the list of allowlist entries that no usage backs.
func compare(allow *allowlist, usage map[string]map[string][]location) ([]finding, []finding) {
	var violations, stale []finding

	for svc, topics := range usage {
		entry, ok := allow.Services[svc]
		var patterns []string
		if ok {
			patterns = entry.Topics
		}
		for topic, locs := range topics {
			if matchesAny(topic, patterns) {
				continue
			}
			loc := locs[0]
			violations = append(violations, finding{service: svc, topic: topic, file: loc.file, line: loc.line})
		}
	}

	for svc, entry := range allow.Services {
		used := usage[svc]
		for _, pat := range entry.Topics {
			if anyMatched(pat, used) {
				continue
			}
			stale = append(stale, finding{service: svc, topic: pat})
		}
	}

	sort.Slice(violations, func(i, j int) bool {
		if violations[i].service != violations[j].service {
			return violations[i].service < violations[j].service
		}
		return violations[i].topic < violations[j].topic
	})
	sort.Slice(stale, func(i, j int) bool {
		if stale[i].service != stale[j].service {
			return stale[i].service < stale[j].service
		}
		return stale[i].topic < stale[j].topic
	})
	return violations, stale
}

func matchesAny(topic string, patterns []string) bool {
	for _, p := range patterns {
		if globMatch(p, topic) {
			return true
		}
	}
	return false
}

func anyMatched(pattern string, found map[string][]location) bool {
	for topic := range found {
		if globMatch(pattern, topic) {
			return true
		}
	}
	return false
}

// globMatch implements a tiny `*` wildcard match. Anything between
// `*`s is matched literally; `*` itself matches any run of
// characters including the empty string.
func globMatch(pattern, s string) bool {
	if !strings.Contains(pattern, "*") {
		return pattern == s
	}
	re := "^" + regexp.QuoteMeta(pattern) + "$"
	re = strings.ReplaceAll(re, `\*`, `.*`)
	return regexp.MustCompile(re).MatchString(s)
}

func countLiterals(usage map[string]map[string][]location) int {
	n := 0
	for _, topics := range usage {
		for _, locs := range topics {
			n += len(locs)
		}
	}
	return n
}
