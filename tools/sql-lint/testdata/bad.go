// Fixture: every fmt.Sprintf below should be flagged by sql-lint
// because the enclosing function does NOT call validate*Identifier
// or pgx.Identifier{}.Sanitize().
//
// This file deliberately uses package `testdata`; the linter parses
// it as raw source and never compiles it. `go test` skips the
// testdata/ directory automatically.

package testdata

import "fmt"

func badSelect(table string) string {
	return fmt.Sprintf("SELECT * FROM %s", table)
}

func badInsert(table, col string) string {
	return fmt.Sprintf("insert into %s (%s) values ($1)", table, col)
}

func badUpdateLowercase(table string, id int) string {
	q := fmt.Sprintf("UPDATE %s SET active = true WHERE id = %d", table, id)
	return q
}

func badNestedClosure(table string) func() string {
	return func() string {
		return fmt.Sprintf("DELETE FROM %s", table)
	}
}

func badMerge(target, src string) string {
	return fmt.Sprintf("MERGE INTO %s USING %s ON 1=1", target, src)
}

func sneakyCallsUnrelatedValidator(table string) string {
	_ = checkSomethingElse(table)
	return fmt.Sprintf("DROP TABLE %s", table)
}

func checkSomethingElse(string) error { return nil }
