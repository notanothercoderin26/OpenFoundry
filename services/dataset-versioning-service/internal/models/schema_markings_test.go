package models

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateDatasetSchemaRejectsMarkedColumnWithoutStringArrayShape(t *testing.T) {
	t.Parallel()

	errs := ValidateDatasetSchema(DatasetSchema{
		FileFormat: FileFormatParquet,
		Fields: []Field{
			{
				Name:           "data_markings",
				Type:           FieldTypeString,
				CustomMetadata: json.RawMessage(`{"typeclasses":["marking_type.mandatory"]}`),
			},
		},
	})

	assert.Contains(t, strings.Join(errs, "; "), `marking column "data_markings" must be ARRAY<STRING>`)
}

func TestValidateDatasetSchemaAcceptsMarkedStringArrayColumn(t *testing.T) {
	t.Parallel()

	errs := ValidateDatasetSchema(DatasetSchema{
		FileFormat: FileFormatParquet,
		Fields: []Field{
			{
				Name:           "data_markings",
				Type:           FieldTypeArray,
				ArraySubType:   &Field{Type: FieldTypeString},
				CustomMetadata: json.RawMessage(`{"typeclasses":["marking_type.mandatory"]}`),
			},
		},
	})

	assert.Empty(t, errs)
}
