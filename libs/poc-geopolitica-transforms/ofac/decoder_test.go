package ofac

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func loadFixture(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "sample-sdn.xml"))
	require.NoError(t, err, "fixture must be readable")
	return data
}

func TestDecodeSDNGoldenSnapshotIndividualEntity(t *testing.T) {
	rows, err := DecodeSDNAll(bytes.NewReader(loadFixture(t)))
	require.NoError(t, err)
	require.Len(t, rows, 3, "fixture contains 3 sdnEntry elements")

	// Row 1 — Individual John Smith with full address/alias coverage.
	smith := rows[0]
	require.Equal(t, "10001", smith.UID)
	require.Equal(t, "John Smith", smith.DisplayName)
	require.Equal(t, "Individual", smith.SDNType)
	require.ElementsMatch(t, []string{"SDGT", "UKRAINE-EO13662"}, smith.Programs)
	require.ElementsMatch(t, []string{"Jon Smyth", "Johnny S."}, smith.Aliases)
	require.ElementsMatch(t, []string{"London", "Geneva"}, smith.AddressCities)
	require.ElementsMatch(t, []string{"GE"}, smith.AddressStates)
	require.ElementsMatch(t, []string{"United Kingdom", "Switzerland"}, smith.AddressCountry)
	require.Equal(t, []string{"Russia"}, smith.Nationality)
	require.Equal(t, []string{"Russia"}, smith.Citizenship)
	require.Equal(t, []string{"15 Jun 1968"}, smith.DatesOfBirth)
	require.Equal(t, []string{"Saint Petersburg, Russia"}, smith.PlacesOfBirth)
	require.Equal(t, "Test entry for the PoC golden test.", smith.Remarks)

	// Row 2 — Entity Acme Logistics LLC (uses <name>, not first/last).
	acme := rows[1]
	require.Equal(t, "10002", acme.UID)
	require.Equal(t, "Acme Logistics LLC", acme.DisplayName)
	require.Equal(t, "Entity", acme.SDNType)
	require.Equal(t, []string{"SDGT"}, acme.Programs)
	require.Equal(t, []string{"Acme Holdings"}, acme.Aliases)
	require.Empty(t, acme.Nationality, "entities don't carry nationality")

	// Row 3 — Individual Ana Perez with minimal fields (no address city/state).
	perez := rows[2]
	require.Equal(t, "10003", perez.UID)
	require.Equal(t, "Ana Perez", perez.DisplayName)
	require.ElementsMatch(t, []string{"VENEZUELA-EO13692"}, perez.Programs)
	require.Empty(t, perez.AddressCities, "no <city> in fixture means no row in output")
	require.Equal(t, []string{"Venezuela"}, perez.AddressCountry)
}

func TestDecodeSDNStreamingCallbackShortCircuitsOnEOF(t *testing.T) {
	// Callback returning io.EOF after the first row stops the parser.
	var seen []SanctionsEntryRow
	err := DecodeSDN(bytes.NewReader(loadFixture(t)), func(row SanctionsEntryRow) error {
		seen = append(seen, row)
		return io.EOF
	})
	require.NoError(t, err)
	require.Len(t, seen, 1, "io.EOF from the callback must stop further parsing")
}

func TestDecodeSDNPropagatesCallbackError(t *testing.T) {
	wantErr := errors.New("downstream wrote failed")
	err := DecodeSDN(bytes.NewReader(loadFixture(t)), func(_ SanctionsEntryRow) error {
		return wantErr
	})
	require.ErrorIs(t, err, wantErr)
}

func TestDecodeSDNHandlesEmptyDocument(t *testing.T) {
	rows, err := DecodeSDNAll(strings.NewReader(`<?xml version="1.0"?><sdnList></sdnList>`))
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestDecodeSDNRejectsNilReader(t *testing.T) {
	require.Error(t, DecodeSDN(nil, func(_ SanctionsEntryRow) error { return nil }))
}

func TestDecodeSDNRejectsNilCallback(t *testing.T) {
	require.Error(t, DecodeSDN(bytes.NewReader([]byte("<sdnList/>")), nil))
}

func TestDecodeSDNFailsLoudlyOnMalformedXML(t *testing.T) {
	rows, err := DecodeSDNAll(strings.NewReader(`<sdnList><sdnEntry><uid>1`))
	require.Error(t, err)
	require.Empty(t, rows)
}

func TestDecodeSDNStreamingPreservesOrder(t *testing.T) {
	// The bronze→silver→gold pipeline relies on UID order being
	// stable so reruns produce identical lineage. This test pins
	// that invariant.
	rows, err := DecodeSDNAll(bytes.NewReader(loadFixture(t)))
	require.NoError(t, err)
	uids := make([]string, len(rows))
	for i, r := range rows {
		uids[i] = r.UID
	}
	require.Equal(t, []string{"10001", "10002", "10003"}, uids)
}

// Smoke check that the symbol the pipeline-build-service catalog
// references is actually importable — guards against accidental
// rename drift.
func TestDecodeSDNSymbolExportedAsExpected(t *testing.T) {
	// _ = DecodeSDN tests that the function exists with the expected
	// signature; if the signature drifts the seed catalog's
	// `OFACSDNDecoderImpl` constant goes stale.
	var fn = DecodeSDN
	require.NotNil(t, fn)
	_ = context.Background // import sanity for future ctx work
}
