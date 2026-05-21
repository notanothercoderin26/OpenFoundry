// Package ofac is the OFAC Specially Designated Nationals (SDN) XML
// decoder for the Geopolitical Intelligence PoC.
//
// Source XML: https://www.treasury.gov/ofac/downloads/sdn.xml
// Schema reference: https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists
//
// Foundry-native framing
// -----------------------
// This package implements one **bronze decoder** transform from the
// PoC pipeline catalog (see PoC/geopolitica/assets/pipeline-transforms.yaml
// `ofac-sdn-xml-decoder`). Foundry's transform model for non-DSL
// formats is a UDF — Go in our case, see
// https://www.palantir.com/docs/foundry/pipeline-builder/transforms-overview/
// §"User-defined functions".
//
// Input shape (XML, abbreviated):
//
//	<sdnList xmlns="https://www.treasury.gov/ofac/DownloadXML">
//	  <sdnEntry>
//	    <uid>1234</uid>
//	    <lastName>SMITH</lastName>
//	    <firstName>John</firstName>
//	    <sdnType>Individual</sdnType>
//	    <programList>
//	      <program>SDGT</program>
//	      <program>UKRAINE-EO13662</program>
//	    </programList>
//	    <akaList><aka><type>a.k.a.</type><lastName>SMYTHE</lastName></aka></akaList>
//	    <addressList><address><city>London</city><country>UK</country></address></addressList>
//	    <nationalityList>...</nationalityList>
//	    <citizenshipList>...</citizenshipList>
//	    <dateOfBirthList>...</dateOfBirthList>
//	    <placeOfBirthList>...</placeOfBirthList>
//	  </sdnEntry>
//	  ...
//	</sdnList>
//
// Output shape: one `SanctionsEntryRow` per <sdnEntry>, with aliases /
// addresses / programs flattened into typed slices. The shared
// `sanctions-aggregator` silver transform then converges these with
// the EU + OpenSanctions parallel decoders into a single
// canonical_sanctions dataset.
//
// Design notes
// ------------
//
//  1. Pure-Go via `encoding/xml`. No third-party dependency.
//  2. Streams via decoder.Token + decoder.DecodeElement for
//     constant-memory parsing — the SDN file is ~12k entries today
//     but grows; nothing in this package should allocate O(N) state
//     ahead of yielding rows.
//  3. The XML namespace is OFAC-controlled
//     (`https://www.treasury.gov/ofac/DownloadXML`). We match on
//     local element names via struct tags so a namespace change
//     does not silently empty the output.
//  4. Outputs are immutable value types — safe to fan out across
//     goroutines downstream.

package ofac

import (
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// SanctionsEntryRow is the canonical projection of one <sdnEntry>.
// Mirrors the bronze schema downstream silver transforms consume.
// Field order follows the ontology's SanctionsEntry properties
// (PoC/geopolitica/05-ontologia-geopolitica.md §"SanctionsEntry").
type SanctionsEntryRow struct {
	UID            string   `json:"uid"`             // OFAC's sdnEntry.uid — primary key
	DisplayName    string   `json:"display_name"`    // "<firstName> <lastName>" or <name> for entities
	SDNType        string   `json:"sdn_type"`        // "Individual" | "Entity" | "Vessel" | "Aircraft"
	Programs       []string `json:"programs"`        // SDGT, UKRAINE-EO13662, etc.
	Aliases        []string `json:"aliases"`         // flattened a.k.a.s; original capitalisation preserved
	Citizenship    []string `json:"citizenship"`     // ISO-style country names as OFAC publishes them
	Nationality    []string `json:"nationality"`     // distinct from citizenship per OFAC's schema
	DatesOfBirth   []string `json:"dates_of_birth"`  // "DD MMM YYYY" verbatim; downstream parses where needed
	PlacesOfBirth  []string `json:"places_of_birth"` //
	AddressCities  []string `json:"address_cities"`
	AddressStates  []string `json:"address_states"`
	AddressCountry []string `json:"address_country"`
	Remarks        string   `json:"remarks"`
}

// sdnList is the outer envelope. Namespace tag is intentionally empty
// so we match on the local element name (XML namespaces in OFAC XML
// are noise for our purposes).
type sdnList struct {
	XMLName xml.Name  `xml:"sdnList"`
	Entries []sdnXML  `xml:"sdnEntry"`
}

type sdnXML struct {
	UID            string         `xml:"uid"`
	FirstName      string         `xml:"firstName"`
	LastName       string         `xml:"lastName"`
	Name           string         `xml:"name"` // Entity/Vessel/Aircraft variant
	SDNType        string         `xml:"sdnType"`
	Programs       programList    `xml:"programList"`
	AKAs           akaList        `xml:"akaList"`
	Addresses      addressList    `xml:"addressList"`
	Nationality    nationalityList    `xml:"nationalityList"`
	Citizenship    citizenshipList    `xml:"citizenshipList"`
	DatesOfBirth   dateOfBirthList    `xml:"dateOfBirthList"`
	PlacesOfBirth  placeOfBirthList   `xml:"placeOfBirthList"`
	Remarks        string             `xml:"remarks"`
}

type programList struct {
	Programs []string `xml:"program"`
}

type akaList struct {
	AKAs []struct {
		Type      string `xml:"type"`
		FirstName string `xml:"firstName"`
		LastName  string `xml:"lastName"`
		Name      string `xml:"name"`
	} `xml:"aka"`
}

type addressList struct {
	Addresses []struct {
		City    string `xml:"city"`
		State   string `xml:"stateOrProvince"`
		Country string `xml:"country"`
	} `xml:"address"`
}

type nationalityList struct {
	Items []struct {
		Country string `xml:"country"`
	} `xml:"nationality"`
}

type citizenshipList struct {
	Items []struct {
		Country string `xml:"country"`
	} `xml:"citizenship"`
}

type dateOfBirthList struct {
	Items []struct {
		Date string `xml:"dateOfBirth"`
	} `xml:"dateOfBirthItem"`
}

type placeOfBirthList struct {
	Items []struct {
		Place string `xml:"placeOfBirth"`
	} `xml:"placeOfBirthItem"`
}

// DecodeSDN streams every <sdnEntry> from r and emits a typed row.
// Memory bound is one entry + the partial token buffer. The cb
// callback may return io.EOF to short-circuit (useful for tests +
// dry-runs).
//
// This is the entry point the pipeline catalog references at
// `OFACSDNDecoderImpl`. Keep the signature stable — refactors must
// update the catalog too.
func DecodeSDN(r io.Reader, cb func(SanctionsEntryRow) error) error {
	if r == nil {
		return fmt.Errorf("ofac: reader is nil")
	}
	if cb == nil {
		return fmt.Errorf("ofac: callback is nil")
	}
	dec := xml.NewDecoder(r)
	// XML namespaces in OFAC's file change over time but the local
	// names stay stable; ignore namespaces.
	dec.DefaultSpace = ""

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("ofac: read token: %w", err)
		}
		start, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		if start.Name.Local != "sdnEntry" {
			continue
		}
		var raw sdnXML
		if err := dec.DecodeElement(&raw, &start); err != nil {
			return fmt.Errorf("ofac: decode sdnEntry: %w", err)
		}
		row := toRow(raw)
		if err := cb(row); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

// DecodeSDNAll is the convenience form that buffers every row into
// memory. Useful for unit tests + small batches; production should
// prefer DecodeSDN with a streaming callback.
func DecodeSDNAll(r io.Reader) ([]SanctionsEntryRow, error) {
	rows := make([]SanctionsEntryRow, 0)
	err := DecodeSDN(r, func(row SanctionsEntryRow) error {
		rows = append(rows, row)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func toRow(raw sdnXML) SanctionsEntryRow {
	row := SanctionsEntryRow{
		UID:         strings.TrimSpace(raw.UID),
		DisplayName: composeDisplayName(raw),
		SDNType:     strings.TrimSpace(raw.SDNType),
		Programs:    trimSlice(raw.Programs.Programs),
		Remarks:     strings.TrimSpace(raw.Remarks),
	}
	for _, a := range raw.AKAs.AKAs {
		entry := composeAlias(a.FirstName, a.LastName, a.Name)
		if entry != "" {
			row.Aliases = append(row.Aliases, entry)
		}
	}
	for _, a := range raw.Addresses.Addresses {
		if c := strings.TrimSpace(a.City); c != "" {
			row.AddressCities = append(row.AddressCities, c)
		}
		if s := strings.TrimSpace(a.State); s != "" {
			row.AddressStates = append(row.AddressStates, s)
		}
		if c := strings.TrimSpace(a.Country); c != "" {
			row.AddressCountry = append(row.AddressCountry, c)
		}
	}
	for _, n := range raw.Nationality.Items {
		if c := strings.TrimSpace(n.Country); c != "" {
			row.Nationality = append(row.Nationality, c)
		}
	}
	for _, c := range raw.Citizenship.Items {
		if v := strings.TrimSpace(c.Country); v != "" {
			row.Citizenship = append(row.Citizenship, v)
		}
	}
	for _, d := range raw.DatesOfBirth.Items {
		if v := strings.TrimSpace(d.Date); v != "" {
			row.DatesOfBirth = append(row.DatesOfBirth, v)
		}
	}
	for _, p := range raw.PlacesOfBirth.Items {
		if v := strings.TrimSpace(p.Place); v != "" {
			row.PlacesOfBirth = append(row.PlacesOfBirth, v)
		}
	}
	return row
}

func composeDisplayName(raw sdnXML) string {
	// Individuals: <firstName> <lastName>. Entities/Vessels/Aircraft:
	// <name>. OFAC mixes these depending on sdnType; check both.
	if name := strings.TrimSpace(raw.Name); name != "" {
		return name
	}
	first := strings.TrimSpace(raw.FirstName)
	last := strings.TrimSpace(raw.LastName)
	switch {
	case first != "" && last != "":
		return first + " " + last
	case last != "":
		return last
	case first != "":
		return first
	}
	return ""
}

func composeAlias(first, last, name string) string {
	if n := strings.TrimSpace(name); n != "" {
		return n
	}
	f := strings.TrimSpace(first)
	l := strings.TrimSpace(last)
	switch {
	case f != "" && l != "":
		return f + " " + l
	case l != "":
		return l
	case f != "":
		return f
	}
	return ""
}

func trimSlice(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if v := strings.TrimSpace(s); v != "" {
			out = append(out, v)
		}
	}
	return out
}
