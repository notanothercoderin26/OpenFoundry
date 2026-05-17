// sql-lint scans Go source for fmt.Sprintf calls whose format string
// contains a SQL keyword (SELECT|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|
// DROP|ALTER, case-insensitive) plus a format verb, and flags them if
// the enclosing function body does NOT also call a validator named like
// validate*Identifier(s) or pgx.Identifier{}.Sanitize().
//
// The intent is to catch raw string-concatenated SQL on the connector
// adapter hot path; it does not analyse data flow, just lexical
// co-location inside the same function. An allowlist of "path:line"
// suppresses already-known hits so the workflow only gates *new*
// violations on PRs.
package main

import (
	"bufio"
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
)

var (
	sqlKeywordRe  = regexp.MustCompile(`(?i)\b(SELECT|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER)\b`)
	formatVerbRe  = regexp.MustCompile(`%[-+ #0]*\d*(?:\.\d+)?[bcdoUxXeEfgGsqvTpt]`)
	validatorRe   = regexp.MustCompile(`(?i)^validate.*identifiers?$`)
	defaultMsg    = "fmt.Sprintf with SQL keyword + format verb in a block that does not call validate*Identifier or pgx.Identifier{}.Sanitize()"
	exitOK        = 0
	exitViolation = 1
	exitUsage     = 2
)

type Hit struct {
	File string
	Line int
	Col  int
	Msg  string
}

func main() {
	var (
		allowlistPath  string
		writeAllowlist bool
		verbose        bool
	)
	flag.StringVar(&allowlistPath, "allowlist", "", "Path to allowlist file ('path:line' per line, # comments).")
	flag.BoolVar(&writeAllowlist, "write-allowlist", false, "Rewrite the -allowlist file with current hits and exit 0 (bootstrap).")
	flag.BoolVar(&verbose, "v", false, "Also print suppressed (allowlisted) hits to stderr.")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "usage: sql-lint [-allowlist FILE] [-write-allowlist] [-v] <path>...\n\n")
		flag.PrintDefaults()
	}
	flag.Parse()

	paths := flag.Args()
	if len(paths) == 0 {
		flag.Usage()
		os.Exit(exitUsage)
	}

	allow, err := loadAllowlist(allowlistPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "sql-lint: load allowlist: %v\n", err)
		os.Exit(exitUsage)
	}

	var all []Hit
	for _, p := range paths {
		hits, err := scanPath(p)
		if err != nil {
			fmt.Fprintf(os.Stderr, "sql-lint: scan %s: %v\n", p, err)
			os.Exit(exitUsage)
		}
		all = append(all, hits...)
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].File != all[j].File {
			return all[i].File < all[j].File
		}
		return all[i].Line < all[j].Line
	})

	if writeAllowlist {
		if allowlistPath == "" {
			fmt.Fprintln(os.Stderr, "sql-lint: -write-allowlist requires -allowlist")
			os.Exit(exitUsage)
		}
		if err := writeAllowlistFile(allowlistPath, all); err != nil {
			fmt.Fprintf(os.Stderr, "sql-lint: write allowlist: %v\n", err)
			os.Exit(exitUsage)
		}
		fmt.Fprintf(os.Stderr, "sql-lint: wrote %d hit(s) to %s\n", len(all), allowlistPath)
		os.Exit(exitOK)
	}

	var bad, allowed []Hit
	for _, h := range all {
		if _, ok := allow[hitKey(h)]; ok {
			allowed = append(allowed, h)
			continue
		}
		bad = append(bad, h)
	}

	for _, h := range bad {
		fmt.Printf("%s:%d:%d: %s\n", h.File, h.Line, h.Col, h.Msg)
	}
	if verbose {
		for _, h := range allowed {
			fmt.Fprintf(os.Stderr, "allowlisted: %s:%d:%d: %s\n", h.File, h.Line, h.Col, h.Msg)
		}
	}

	if len(bad) > 0 {
		fmt.Fprintf(os.Stderr, "\nsql-lint: %d unsanitized SQL fmt.Sprintf call(s) (allowlisted: %d)\n", len(bad), len(allowed))
		os.Exit(exitViolation)
	}
	if verbose {
		fmt.Fprintf(os.Stderr, "sql-lint: no new violations (allowlisted: %d)\n", len(allowed))
	}
}

func hitKey(h Hit) string {
	return fmt.Sprintf("%s:%d", h.File, h.Line)
}

func loadAllowlist(path string) (map[string]struct{}, error) {
	m := map[string]struct{}{}
	if path == "" {
		return m, nil
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return m, nil
		}
		return nil, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if i := strings.Index(line, "#"); i >= 0 {
			line = strings.TrimSpace(line[:i])
		}
		if line != "" {
			m[line] = struct{}{}
		}
	}
	return m, sc.Err()
}

func writeAllowlistFile(path string, hits []Hit) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	fmt.Fprintln(w, "# sql-lint allowlist — one 'path:line' per line.")
	fmt.Fprintln(w, "# Suppresses pre-existing fmt.Sprintf+SQL hits so PRs only gate new violations.")
	fmt.Fprintln(w, "# Regenerate with: go run ./tools/sql-lint -allowlist .sqlsafe-allowlist.txt -write-allowlist <paths>")
	fmt.Fprintln(w, "")
	for _, h := range hits {
		fmt.Fprintln(w, hitKey(h))
	}
	return w.Flush()
}

func scanPath(root string) ([]Hit, error) {
	var hits []Hit
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return scanFile(root)
	}
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, werr error) error {
		if werr != nil {
			return werr
		}
		if d.IsDir() {
			name := d.Name()
			if name == "testdata" || name == "vendor" || name == "node_modules" || strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		if strings.HasSuffix(path, "_test.go") {
			return nil
		}
		fileHits, err := scanFile(path)
		if err != nil {
			return err
		}
		hits = append(hits, fileHits...)
		return nil
	})
	return hits, err
}

func scanFile(path string) ([]Hit, error) {
	fset := token.NewFileSet()
	src, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	file, err := parser.ParseFile(fset, path, src, 0)
	if err != nil {
		return nil, err
	}
	rel := filepath.ToSlash(filepath.Clean(path))

	var hits []Hit
	visitBody := func(body *ast.BlockStmt) {
		if body == nil {
			return
		}
		suspects, hasValidator := scanBlock(body)
		if hasValidator {
			return
		}
		for _, s := range suspects {
			pos := fset.Position(s.Pos())
			hits = append(hits, Hit{
				File: rel,
				Line: pos.Line,
				Col:  pos.Column,
				Msg:  defaultMsg,
			})
		}
	}

	ast.Inspect(file, func(n ast.Node) bool {
		switch v := n.(type) {
		case *ast.FuncDecl:
			visitBody(v.Body)
		case *ast.FuncLit:
			visitBody(v.Body)
		}
		return true
	})
	return hits, nil
}

// scanBlock walks a function body, gathering suspect fmt.Sprintf calls
// and noting whether a validator is called in the same lexical scope.
// It does not descend into nested function literals — those are
// inspected separately by the file-level walker.
func scanBlock(body *ast.BlockStmt) (suspects []*ast.CallExpr, hasValidator bool) {
	ast.Inspect(body, func(n ast.Node) bool {
		if n == nil {
			return false
		}
		if _, ok := n.(*ast.FuncLit); ok {
			return false
		}
		ce, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		if isSprintfSQL(ce) {
			suspects = append(suspects, ce)
		}
		if isValidatorCall(ce) {
			hasValidator = true
		}
		return true
	})
	return
}

func isSprintfSQL(ce *ast.CallExpr) bool {
	sel, ok := ce.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel == nil || sel.Sel.Name != "Sprintf" {
		return false
	}
	pkg, ok := sel.X.(*ast.Ident)
	if !ok || pkg.Name != "fmt" {
		return false
	}
	if len(ce.Args) == 0 {
		return false
	}
	lit, ok := ce.Args[0].(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return false
	}
	s, err := strconv.Unquote(lit.Value)
	if err != nil {
		return false
	}
	return sqlKeywordRe.MatchString(s) && formatVerbRe.MatchString(s)
}

func isValidatorCall(ce *ast.CallExpr) bool {
	switch fn := ce.Fun.(type) {
	case *ast.Ident:
		return validatorRe.MatchString(fn.Name)
	case *ast.SelectorExpr:
		if fn.Sel == nil {
			return false
		}
		if fn.Sel.Name == "Sanitize" && isPgxIdentifierReceiver(fn.X) {
			return true
		}
		return validatorRe.MatchString(fn.Sel.Name)
	}
	return false
}

// isPgxIdentifierReceiver returns true for `pgx.Identifier{...}` or a
// parenthesised variant of it, matching the canonical pgx escape call.
func isPgxIdentifierReceiver(e ast.Expr) bool {
	for {
		p, ok := e.(*ast.ParenExpr)
		if !ok {
			break
		}
		e = p.X
	}
	cl, ok := e.(*ast.CompositeLit)
	if !ok {
		return false
	}
	t, ok := cl.Type.(*ast.SelectorExpr)
	if !ok || t.Sel == nil {
		return false
	}
	pkg, ok := t.X.(*ast.Ident)
	if !ok {
		return false
	}
	return pkg.Name == "pgx" && t.Sel.Name == "Identifier"
}
