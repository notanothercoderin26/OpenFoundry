package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var defaultServices = []string{
	"pipeline-build-service",
	"notebook-runtime-service",
	"ontology-actions-service",
	"authorization-policy-service",
	"federation-product-exchange-service",
	"ontology-indexer",
	"dataset-versioning-service",
}

var goMethods = map[string]string{
	"Get": "GET", "Post": "POST", "Put": "PUT", "Patch": "PATCH", "Delete": "DELETE", "Head": "HEAD", "Options": "OPTIONS",
}

type Route struct {
	Service string
	Method  string
	Path    string
	Handler string
	File    string
	Line    int
	Status  string
}

func normalizePath(path string) string {
	path = regexp.MustCompile(`\{([^}:]+):[^}]+\}`).ReplaceAllString(path, `{$1}`)
	path = regexp.MustCompile(`<([^>]+)>`).ReplaceAllString(path, `{$1}`)
	path = regexp.MustCompile(`/+`).ReplaceAllString(path, `/`)
	if path != "/" {
		path = strings.TrimRight(path, "/")
	}
	if path == "" {
		return "/"
	}
	return path
}

func joinPaths(prefix, path string) string {
	if prefix == "" {
		return normalizePath(path)
	}
	return normalizePath(strings.TrimRight(prefix, "/") + "/" + strings.TrimLeft(path, "/"))
}

func comparablePath(path string) string {
	return regexp.MustCompile(`\{[^}]+\}`).ReplaceAllString(normalizePath(path), "{}")
}

func rel(path, root string) string {
	if r, err := filepath.Rel(root, path); err == nil {
		return filepath.ToSlash(r)
	}
	return filepath.ToSlash(path)
}

func lineNo(text string, idx int) int { return strings.Count(text[:idx], "\n") + 1 }

func findMatching(text string, openIdx int, openCh, closeCh byte) int {
	depth := 0
	inString, escaped := false, false
	inLineComment := false
	inBlockComment := false
	for i := openIdx; i < len(text); i++ {
		ch := text[i]
		next := byte(0)
		if i+1 < len(text) {
			next = text[i+1]
		}
		if inLineComment {
			if ch == '\n' {
				inLineComment = false
			}
			continue
		}
		if inBlockComment {
			if ch == '*' && next == '/' {
				inBlockComment = false
				i++
			}
			continue
		}
		if inString {
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		if ch == '/' && next == '/' {
			inLineComment = true
			i++
			continue
		}
		if ch == '/' && next == '*' {
			inBlockComment = true
			i++
			continue
		}
		if ch == '"' {
			inString = true
			continue
		}
		if ch == openCh {
			depth++
		}
		if ch == closeCh {
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

func splitTopLevelArgs(text string) []string {
	var args []string
	start, depth := 0, 0
	inString, escaped := false, false
	for i := 0; i < len(text); i++ {
		ch := text[i]
		if inString {
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		if ch == '"' {
			inString = true
			continue
		}
		switch ch {
		case '(', '[', '{':
			depth++
		case ')', ']', '}':
			depth--
		case ',':
			if depth == 0 {
				args = append(args, strings.TrimSpace(text[start:i]))
				start = i + 1
			}
		}
	}
	if tail := strings.TrimSpace(text[start:]); tail != "" {
		args = append(args, tail)
	}
	return args
}

func iterFiles(root, suffix string) []string {
	var files []string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, suffix) && !strings.HasSuffix(path, "_test"+suffix) {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)
	return files
}

func dedupeRoutes(routes []Route) []Route {
	seen := map[string]bool{}
	out := make([]Route, 0, len(routes))
	for _, r := range routes {
		key := r.Method + " " + comparablePath(r.Path)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, r)
	}
	return out
}

type goFuncDef struct {
	Name          string
	Package       string
	File          string
	Body          string
	BodyLine      int
	RouterParams  map[string]bool
	ImportAliases map[string]string
}

func goPackageName(text string) string {
	if m := regexp.MustCompile(`(?m)^\s*package\s+(\w+)`).FindStringSubmatch(text); m != nil {
		return m[1]
	}
	return ""
}

func goImportAliases(text string) map[string]string {
	aliases := map[string]string{}
	add := func(alias, path string) {
		name := alias
		if name == "" {
			name = filepath.Base(path)
		}
		if name != "." && name != "_" {
			aliases[name] = filepath.Base(path)
		}
	}
	blockRe := regexp.MustCompile(`(?s)import\s*\((.*?)\)`)
	for _, bm := range blockRe.FindAllStringSubmatch(text, -1) {
		lineRe := regexp.MustCompile(`(?m)^\s*(?:(\w+)\s+)?"([^"]+)"`)
		for _, lm := range lineRe.FindAllStringSubmatch(bm[1], -1) {
			add(lm[1], lm[2])
		}
	}
	singleRe := regexp.MustCompile(`(?m)^\s*import\s+(?:(\w+)\s+)?"([^"]+)"`)
	for _, m := range singleRe.FindAllStringSubmatch(text, -1) {
		add(m[1], m[2])
	}
	return aliases
}

func goSearchRoots(repo, service string) []string {
	roots := []string{filepath.Join(repo, "services", service)}
	if service == "ontology-actions-service" {
		roots = append(roots, filepath.Join(repo, "libs", "ontology-kernel", "handlers"))
	}
	return roots
}

func extractGoFunctionDefs(repo, service string) map[string][]goFuncDef {
	defs := map[string][]goFuncDef{}
	fnRe := regexp.MustCompile(`func\s+(?:\([^\)]*\)\s*)?(\w+)\s*\(([^)]*)\)`)
	for _, root := range goSearchRoots(repo, service) {
		for _, file := range iterFiles(root, ".go") {
			data, _ := os.ReadFile(file)
			text := string(data)
			pkg := goPackageName(text)
			imports := goImportAliases(text)
			for _, m := range fnRe.FindAllStringSubmatchIndex(text, -1) {
				brace := strings.IndexByte(text[m[1]:], '{')
				if brace < 0 {
					continue
				}
				brace += m[1]
				close := findMatching(text, brace, '{', '}')
				if close == -1 {
					continue
				}
				name := text[m[2]:m[3]]
				params := text[m[4]:m[5]]
				routerParams := map[string]bool{}
				for _, pm := range regexp.MustCompile(`(\w+)\s+chi\.Router`).FindAllStringSubmatch(params, -1) {
					routerParams[pm[1]] = true
				}
				def := goFuncDef{Name: name, Package: pkg, File: file, Body: text[brace+1 : close], BodyLine: lineNo(text, brace+1), RouterParams: routerParams, ImportAliases: imports}
				defs[pkg+"."+name] = append(defs[pkg+"."+name], def)
				defs[name] = append(defs[name], def)
			}
		}
	}
	return defs
}

func classifyGoHandler(handler string, bodies map[string][]string) string {
	name := handler[strings.LastIndex(handler, ".")+1:]
	candidates := bodies[name]
	if len(candidates) == 0 {
		return "implemented"
	}
	sawEmpty, sawConfig := false, false
	for _, body := range candidates {
		compact := regexp.MustCompile(`\s+`).ReplaceAllString(body, " ")
		lower := strings.ToLower(body)
		if strings.Contains(body, "http.StatusNotImplemented") || strings.Contains(body, "notImplemented(w") || (strings.Contains(body, "StatusServiceUnavailable") && strings.Contains(lower, "pending")) {
			return "501"
		}
		if strings.Contains(body, "writeEmptyList") || strings.Contains(compact, `"data": []any{}`) || strings.Contains(body, "[]any{}") {
			sawEmpty = true
		}
		if strings.Contains(lower, "disabled") || strings.Contains(body, "StatusServiceUnavailable") || strings.Contains(body, "StatusBadGateway") || strings.Contains(body, "PythonSidecarBinary") || strings.Contains(body, "if m != nil") {
			sawConfig = true
		}
	}
	if sawEmpty {
		return "empty-envelope"
	}
	if sawConfig {
		return "config-gated"
	}
	return "implemented"
}

func extractGoRoutes(repo, service string) []Route {
	defs := extractGoFunctionDefs(repo, service)
	bodies := map[string][]string{}
	for _, group := range defs {
		for _, def := range group {
			bodies[def.Name] = append(bodies[def.Name], def.Body)
		}
	}
	var routes []Route
	direct := regexp.MustCompile(`(\w+)\.(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*"([^"]+)"\s*,\s*([^\n]+?)\s*\)`)
	methodCall := regexp.MustCompile(`(\w+)\.Method\s*\(\s*http\.Method(\w+)\s*,\s*"([^"]+)"\s*,\s*([^\n]+?)\s*\)`)
	routeStart := regexp.MustCompile(`(\w+)\.Route\s*\(\s*"([^"]+)"\s*,\s*func\s*\(\s*(\w+)\s+chi\.Router\s*\)`)
	callRe := regexp.MustCompile(`(?:^|[^\.\w])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\(`)
	reserved := map[string]bool{"if": true, "for": true, "switch": true, "return": true, "func": true, "append": true, "make": true, "new": true, "len": true, "cap": true, "panic": true}
	visited := map[string]bool{}
	var walk func(def goFuncDef, prefixes map[string]string)
	copyPrefixes := func(in map[string]string) map[string]string {
		out := map[string]string{}
		for k, v := range in {
			out[k] = v
		}
		return out
	}
	resolve := func(def goFuncDef, name string) []goFuncDef {
		if strings.Contains(name, ".") {
			parts := strings.SplitN(name, ".", 2)
			pkg := parts[0]
			if mapped := def.ImportAliases[pkg]; mapped != "" {
				pkg = mapped
			}
			return defs[pkg+"."+parts[1]]
		}
		if ds := defs[def.Package+"."+name]; len(ds) > 0 {
			return ds
		}
		return defs[name]
	}
	walk = func(def goFuncDef, prefixes map[string]string) {
		key := def.File + ":" + def.Package + "." + def.Name + fmt.Sprintf("%v", prefixes)
		if visited[key] {
			return
		}
		visited[key] = true
		lines := strings.Split(def.Body, "\n")
		skipUntilLine := 0
		for no, line := range lines {
			lineNo := def.BodyLine + no
			if lineNo < skipUntilLine {
				continue
			}
			if m := routeStart.FindStringSubmatch(line); m != nil {
				childPrefixes := copyPrefixes(prefixes)
				childPrefixes[m[3]] = joinPaths(prefixes[m[1]], m[2])
				openRel := strings.Index(def.Body, line)
				if openRel >= 0 {
					brace := strings.IndexByte(def.Body[openRel:], '{')
					if brace >= 0 {
						brace += openRel
						close := findMatching(def.Body, brace, '{', '}')
						if close != -1 {
							inline := goFuncDef{Name: def.Name + "$route", Package: def.Package, File: def.File, Body: def.Body[brace+1 : close], BodyLine: def.BodyLine + strings.Count(def.Body[:brace+1], "\n"), RouterParams: map[string]bool{m[3]: true}, ImportAliases: def.ImportAliases}
							walk(inline, childPrefixes)
							skipUntilLine = def.BodyLine + strings.Count(def.Body[:close+1], "\n")
						}
					}
				}
			}
			for _, m := range direct.FindAllStringSubmatch(line, -1) {
				full := joinPaths(prefixes[m[1]], m[3])
				h := strings.TrimSpace(m[4])
				routes = append(routes, Route{service, goMethods[m[2]], full, h, rel(def.File, repo), lineNo, classifyGoHandler(h, bodies)})
			}
			if m := methodCall.FindStringSubmatch(line); m != nil {
				full := joinPaths(prefixes[m[1]], m[3])
				h := strings.TrimSpace(m[4])
				routes = append(routes, Route{service, strings.ToUpper(m[2]), full, h, rel(def.File, repo), lineNo, classifyGoHandler(h, bodies)})
			}
			for _, cm := range callRe.FindAllStringSubmatchIndex(line, -1) {
				name := line[cm[2]:cm[3]]
				if reserved[name] || strings.HasPrefix(name, "http.") || strings.HasPrefix(name, "json.") {
					continue
				}
				open := strings.IndexByte(line[cm[3]:], '(')
				if open < 0 {
					continue
				}
				open += cm[3]
				close := findMatching(line, open, '(', ')')
				if close == -1 {
					continue
				}
				args := splitTopLevelArgs(line[open+1 : close])
				if len(args) == 0 {
					continue
				}
				arg0 := strings.TrimSpace(args[0])
				pfx, ok := prefixes[arg0]
				if !ok {
					continue
				}
				for _, child := range resolve(def, name) {
					for rp := range child.RouterParams {
						childPrefixes := map[string]string{rp: pfx}
						walk(child, childPrefixes)
					}
				}
			}
		}
	}
	seeded := map[string]bool{}
	for _, group := range defs {
		for _, def := range group {
			seedKey := def.File + ":" + def.Package + "." + def.Name
			if seeded[seedKey] {
				continue
			}
			seeded[seedKey] = true
			if def.Package == "server" && (def.Name == "BuildRouter" || def.Name == "Build" || def.Name == "New") {
				walk(def, map[string]string{"r": ""})
			}
			if def.Package == "server" && strings.Contains(def.Body, "chi.NewRouter()") {
				prefixes := map[string]string{}
				for _, m := range regexp.MustCompile(`(\w+)\s*:=\s*chi\.NewRouter\s*\(`).FindAllStringSubmatch(def.Body, -1) {
					prefixes[m[1]] = ""
				}
				if len(prefixes) > 0 {
					walk(def, prefixes)
				}
			}
		}
	}
	if len(routes) == 0 {
		for _, group := range defs {
			for _, def := range group {
				prefixes := map[string]string{}
				for rp := range def.RouterParams {
					prefixes[rp] = ""
				}
				if len(prefixes) > 0 {
					walk(def, prefixes)
				}
			}
		}
	}
	return dedupeRoutes(routes)
}

func reportForService(repo, service string) string {
	routes := extractGoRoutes(repo, service)
	sort.Slice(routes, func(i, j int) bool {
		if routes[i].Path == routes[j].Path {
			return routes[i].Method < routes[j].Method
		}
		return routes[i].Path < routes[j].Path
	})
	counts := map[string]int{}
	var rows []string
	for _, r := range routes {
		counts[r.Status]++
		rows = append(rows, fmt.Sprintf("| `%s` | %s | `%s`<br><sub>%s:%d</sub> | %s |",
			r.Path, r.Method, r.Handler, r.File, r.Line, r.Status))
	}
	var countKeys []string
	for k := range counts {
		countKeys = append(countKeys, k)
	}
	sort.Strings(countKeys)
	var countParts []string
	for _, k := range countKeys {
		countParts = append(countParts, fmt.Sprintf("%s: %d", k, counts[k]))
	}
	lines := []string{
		fmt.Sprintf("## %s", service),
		"",
		fmt.Sprintf("Go routes: %d.", len(routes)),
		"State counts: " + strings.Join(countParts, ", ") + ".",
		"",
		"| Path | Method | Handler | Status |",
		"| --- | --- | --- | --- |",
	}
	lines = append(lines, rows...)
	lines = append(lines, "")
	return strings.Join(lines, "\n")
}

func generateReport(repo string, services []string) string {
	parts := []string{
		"# Go route inventory",
		"",
		"Date: " + time.Now().UTC().Format("2006-01-02"),
		"",
		"Generated with:",
		"",
		"```sh",
		"go run ./tools/route-audit --write docs/route-inventory.md",
		"```",
		"",
		"Status values:",
		"",
		"- `implemented`: handler executes real logic.",
		"- `501`: handler advertises Not Implemented or pending behavior.",
		"- `empty-envelope`: handler returns an empty/list placeholder envelope.",
		"- `config-gated`: handler returns `503` or short-circuits when optional runtime/config wiring is absent.",
		"",
		"Heuristic parser for repository-local chi route declarations. Path structure is compared ignoring URL parameter names.",
		"",
	}
	for _, s := range services {
		parts = append(parts, reportForService(repo, s))
	}
	return strings.TrimRight(strings.Join(parts, "\n"), "\n") + "\n"
}

func findRepoRoot(start string) string {
	cur, _ := filepath.Abs(start)
	for {
		if _, err := os.Stat(filepath.Join(cur, "go.mod")); err == nil {
			if _, err := os.Stat(filepath.Join(cur, "services")); err == nil {
				return cur
			}
		}
		next := filepath.Dir(cur)
		if next == cur {
			return start
		}
		cur = next
	}
}

func main() {
	write := flag.String("write", "", "write report to path")
	repoFlag := flag.String("repo", "", "repository root containing services/ and go.mod")
	servicesFlag := flag.String("services", strings.Join(defaultServices, ","), "comma-separated service list")
	flag.Parse()
	repo := *repoFlag
	if repo == "" {
		repo = findRepoRoot(".")
	}
	var services []string
	for _, s := range strings.Split(*servicesFlag, ",") {
		if strings.TrimSpace(s) != "" {
			services = append(services, strings.TrimSpace(s))
		}
	}
	report := generateReport(repo, services)
	if *write != "" {
		if err := os.MkdirAll(filepath.Dir(*write), 0o755); err != nil {
			panic(err)
		}
		if err := os.WriteFile(*write, []byte(report), 0o644); err != nil {
			panic(err)
		}
		return
	}
	fmt.Print(report)
}
