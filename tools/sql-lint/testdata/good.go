// Fixture: every fmt.Sprintf below must be clean — each enclosing
// function calls validate*Identifier or pgx.Identifier{}.Sanitize() in
// the same lexical block.
//
// This file is parsed only as AST; it never compiles. The pgx ref
// below is therefore allowed to be syntactic-only.

package testdata

import (
	"errors"
	"fmt"
	"regexp"
)

var identRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func validateTableIdentifier(s string) error {
	if !identRe.MatchString(s) {
		return errors.New("bad identifier")
	}
	return nil
}

func validateColumnIdentifiers(cols []string) error {
	for _, c := range cols {
		if err := validateTableIdentifier(c); err != nil {
			return err
		}
	}
	return nil
}

func goodSelect(table string) string {
	if err := validateTableIdentifier(table); err != nil {
		return ""
	}
	return fmt.Sprintf("SELECT * FROM %s", table)
}

func goodInsert(table string, cols []string) string {
	if err := validateColumnIdentifiers(cols); err != nil {
		return ""
	}
	if err := validateTableIdentifier(table); err != nil {
		return ""
	}
	return fmt.Sprintf("INSERT INTO %s (%s) VALUES ($1)", table, cols[0])
}

// goodPgxSanitize uses the canonical pgx.Identifier{}.Sanitize() escape
// path. The linter recognises this even without a validate*Identifier
// call in scope. pgx is referenced only syntactically — this fixture
// is parsed, never compiled.
func goodPgxSanitize(table string) string {
	q := pgx.Identifier{table}.Sanitize()
	return fmt.Sprintf("DELETE FROM %s", q)
}

// Closure with its own validator call — the inner scope is sanitized
// independently of the outer.
func goodNestedClosure(table string) func() string {
	return func() string {
		if err := validateTableIdentifier(table); err != nil {
			return ""
		}
		return fmt.Sprintf("UPDATE %s SET active = true", table)
	}
}
