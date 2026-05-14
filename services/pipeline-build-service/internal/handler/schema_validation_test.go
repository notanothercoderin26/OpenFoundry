package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

func TestStrictSchemaValidationReportsTableDrivenErrors(t *testing.T) {
	tests := []struct {
		name string
		ir   models.PipelineIR
		code string
	}{
		{
			name: "missing select column",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"id":"mesa","name":"Mesa Trail"}]}`)},
				{ID: "select", TransformType: "select", DependsOn: []string{"source"}, Config: json.RawMessage(`{"columns":["id","distance"]}`)},
			}),
			code: "missing_column",
		},
		{
			name: "incompatible join keys",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "left", TransformType: "external", Config: json.RawMessage(`{"rows":[{"trail_id":1,"trail":"Mesa"}]}`)},
				{ID: "right", TransformType: "external", Config: json.RawMessage(`{"rows":[{"trail_id":"1","coffee":"Cafe"}]}`)},
				{ID: "join", TransformType: "sql", DependsOn: []string{"left", "right"}, Config: json.RawMessage(`{"_join":{"join_type":"left","matches":[{"left_column":"trail_id","right_column":"trail_id"}],"auto_select_left":true,"auto_select_right":true}}`)},
			}),
			code: "incompatible_join_key_types",
		},
		{
			name: "invalid cast target/input combination",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"region":42}]}`)},
				{ID: "cast", TransformType: "sql", DependsOn: []string{"source"}, Config: json.RawMessage(`{"_stack":{"blocks":[{"kind":"cast","applied":true,"source_column":"region","target_type":"Geometry","target_column":"region"}]}}`)},
			}),
			code: "invalid_cast",
		},
		{
			name: "nullable object primary key",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"id":null,"trail":"Mesa"}]}`)},
				{ID: "output", TransformType: "output_dataset", DependsOn: []string{"source"}, Config: json.RawMessage(`{"_output":{"kind":"object_type","primary_keys":["id"]}}`)},
			}),
			code: "nullable_primary_key",
		},
		{
			name: "duplicate selected columns",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"id":"mesa","trail":"Mesa"}]}`)},
				{ID: "select", TransformType: "select", DependsOn: []string{"source"}, Config: json.RawMessage(`{"columns":["id","id"]}`)},
			}),
			code: "duplicate_column_name",
		},
		{
			name: "invalid geospatial logical type",
			ir: withOutputSchema(models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{}`)},
			}), "source", models.PipelineIRSchema{Fields: []models.PipelineIRField{
				{Name: "trail_geom", FieldType: "INTEGER", Nullable: false, Metadata: map[string]json.RawMessage{"logical_type": json.RawMessage(`"geometry"`)}},
			}}),
			code: "invalid_geospatial_logical_type",
		},
		{
			name: "invalid geospatial bounding box backing type",
			ir: withOutputSchema(models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{}`)},
			}), "source", models.PipelineIRSchema{Fields: []models.PipelineIRField{
				{Name: "viewport", FieldType: "INTEGER", Nullable: false, Metadata: map[string]json.RawMessage{"logical_type": json.RawMessage(`"bounding_box"`)}},
			}}),
			code: "invalid_geospatial_logical_type",
		},
		{
			name: "invalid geospatial CRS metadata",
			ir: withOutputSchema(models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{}`)},
			}), "source", models.PipelineIRSchema{Fields: []models.PipelineIRField{
				{Name: "trailhead", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{
					"logical_type": json.RawMessage(`"geo_point"`),
					"crs":          json.RawMessage(`"EPSG:3857"`),
				}},
			}}),
			code: "invalid_geospatial_crs_policy",
		},
		{
			name: "invalid geospatial coordinate order",
			ir: withOutputSchema(models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{}`)},
			}), "source", models.PipelineIRSchema{Fields: []models.PipelineIRField{
				{Name: "route_geojson", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{
					"logical_type":     json.RawMessage(`"geojson"`),
					"coordinate_order": json.RawMessage(`"lat_lon"`),
				}},
			}}),
			code: "invalid_geospatial_crs_policy",
		},
		{
			name: "unsupported link output cardinality",
			ir:   linkOutputValidationIR(`"one_to_one"`, `"source_id"`, `"target_id"`, `"source_object"`, `"target_object"`),
			code: "unsupported_link_cardinality",
		},
		{
			name: "missing link source key column",
			ir:   linkOutputValidationIR(`"one_to_many"`, `"missing_source"`, `"target_id"`, `"source_object"`, `"target_object"`),
			code: "missing_link_source_key_column",
		},
		{
			name: "missing referenced object output",
			ir:   linkOutputValidationIR(`"one_to_many"`, `"source_id"`, `"target_id"`, `"missing_object"`, `"target_object"`),
			code: "missing_link_source_object",
		},
		{
			name: "virtual table input without pipeline builder compute",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "vt", TransformType: "virtual_table_input", Config: json.RawMessage(`{"source_kind":"virtual_table","virtual_table_rid":"ri.foundry.main.virtual-table.orders","columns":["ORDER_ID"],"host_application":"pipeline_builder","pipeline_type":"BATCH","capabilities":{"read":true,"foundry_compute":{"pipeline_builder_spark":false}}}`)},
			}),
			code: "virtual_table_pipeline_builder_not_supported",
		},
		{
			name: "virtual table output to read-only source",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"ORDER_ID":"100"}]}`)},
				{ID: "vt_output", TransformType: "output_virtual_table", DependsOn: []string{"source"}, Config: json.RawMessage(`{"_output":{"kind":"virtual_table","source_rid":"ri.source.snowflake","external_reference":{"kind":"tabular","database":"FINANCE","schema":"PUBLIC","table":"ORDERS_OUT"},"capabilities":{"write":false,"foundry_compute":{"pipeline_builder_spark":true}}}}`)},
			}),
			code: "virtual_table_output_write_not_supported",
		},
		{
			name: "virtual table with legacy external systems decorator",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "vt", TransformType: "virtual_table_input", Config: json.RawMessage(`{"source_kind":"virtual_table","virtual_table_rid":"ri.foundry.main.virtual-table.orders","columns":["ORDER_ID"],"capabilities":{"read":true,"foundry_compute":{"pipeline_builder_spark":true}}}`)},
				{ID: "python", TransformType: "python", DependsOn: []string{"vt"}, Config: json.RawMessage(`{"source":"from transforms.api import use_external_systems\n@use_external_systems()\ndef compute(ctx):\n    return []"}`)},
			}),
			code: "virtual_table_use_external_systems_incompatible",
		},
		{
			name: "virtual table input in streaming pipeline",
			ir: models.NewPipelineIRFromNodes([]models.PipelineNode{
				{ID: "vt", TransformType: "virtual_table_input", Config: json.RawMessage(`{"source_kind":"virtual_table","virtual_table_rid":"ri.foundry.main.virtual-table.orders","columns":["ORDER_ID"],"pipeline_type":"STREAMING","capabilities":{"read":true,"foundry_compute":{"pipeline_builder_spark":true}}}`)},
			}),
			code: "virtual_table_pipeline_type_not_supported",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			report := validatePipelineIRStrict("test", tc.ir.Normalize())
			require.False(t, report.AllValid)
			require.Contains(t, validationCodes(report), tc.code)
		})
	}
}

func TestStrictSchemaValidationAcceptsGeospatialLogicalTypes(t *testing.T) {
	ir := withOutputSchema(models.NewPipelineIRFromNodes([]models.PipelineNode{
		{ID: "source", TransformType: "external", Config: json.RawMessage(`{}`)},
	}), "source", models.PipelineIRSchema{Fields: []models.PipelineIRField{
		{Name: "trailhead", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{
			"logical_type":     json.RawMessage(`"geo_point"`),
			"crs":              json.RawMessage(`{"authority":"EPSG","code":4326}`),
			"coordinate_order": json.RawMessage(`"lat_lon"`),
		}},
		{Name: "route_geom", FieldType: "GEOMETRY", Nullable: false, Metadata: map[string]json.RawMessage{
			"logical_type": json.RawMessage(`"geometry"`),
			"crs":          json.RawMessage(`"EPSG:4326"`),
		}},
		{Name: "route_geojson", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{
			"logical_type":     json.RawMessage(`"geojson"`),
			"coordinate_order": json.RawMessage(`"lon_lat"`),
		}},
		{Name: "viewport", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{
			"logical_type":     json.RawMessage(`"bounding_box"`),
			"coordinate_order": json.RawMessage(`"geojson"`),
		}},
		{Name: "cell", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{"logical_type": json.RawMessage(`"h3_index"`)}},
		{Name: "crs", FieldType: "STRING", Nullable: false, Metadata: map[string]json.RawMessage{"logical_type": json.RawMessage(`"crs_metadata"`)}},
	}})

	report := validatePipelineIRStrict("test", ir.Normalize())
	require.True(t, report.AllValid, "expected no strict schema errors, got %#v", report.Errors)
}

func TestStrictSchemaValidationAcceptsVirtualTablePipelineInputAndOutput(t *testing.T) {
	ir := models.NewPipelineIRFromNodes([]models.PipelineNode{
		{ID: "vt", TransformType: "virtual_table_input", Config: json.RawMessage(`{"source_kind":"virtual_table","virtual_table_rid":"ri.foundry.main.virtual-table.orders","source_rid":"ri.source.snowflake","columns":["ORDER_ID","AMOUNT"],"host_application":"pipeline_builder","pipeline_type":"BATCH","capabilities":{"read":true,"write":true,"foundry_compute":{"pipeline_builder_spark":true}}}`)},
		{ID: "select", TransformType: "select", DependsOn: []string{"vt"}, Config: json.RawMessage(`{"columns":["ORDER_ID"]}`)},
		{ID: "vt_output", TransformType: "output_virtual_table", DependsOn: []string{"select"}, Config: json.RawMessage(`{"_output":{"kind":"virtual_table","source_rid":"ri.source.snowflake","external_reference":{"kind":"tabular","database":"FINANCE","schema":"PUBLIC","table":"ORDERS_OUT"},"storage":"external","orchestration":"openfoundry","capabilities":{"write":true,"foundry_compute":{"pipeline_builder_spark":true}}}}`)},
	})

	report := validatePipelineIRStrict("test", ir.Normalize())
	require.True(t, report.AllValid, "expected virtual table workflow to validate, got %#v", report.Errors)
}

func TestStrictSchemaValidationGPXParseProducesTrailSchema(t *testing.T) {
	ir := models.NewPipelineIRFromNodes([]models.PipelineNode{
		{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"raw_gpx":"<gpx/>","upload_name":"trail.gpx"}]}`)},
		{ID: "gpx", TransformType: "gpx_parse", DependsOn: []string{"source"}, Config: json.RawMessage(`{"gpx_column":"raw_gpx","file_name_column":"upload_name"}`)},
	})

	report := validatePipelineIRStrict("test", ir.Normalize())
	require.True(t, report.AllValid, "expected no strict schema errors, got %#v", report.Errors)

	node := strictNodeReport(t, report, "gpx")
	fields := map[string]pipelineStrictValidationField{}
	for _, field := range node.OutputSchema {
		fields[field.Name] = field
	}
	require.Equal(t, "DOUBLE", fields["distance_miles"].FieldType)
	require.Equal(t, "STRING", fields["route_geojson"].FieldType)
	require.JSONEq(t, `"geojson"`, string(fields["route_geojson"].Metadata["logical_type"]))
	require.JSONEq(t, `"lon_lat"`, string(fields["route_geojson"].Metadata["coordinate_order"]))
	require.JSONEq(t, `"geo_point"`, string(fields["trailhead_geo_point"].Metadata["logical_type"]))
}

func TestStrictSchemaValidationHaversineDistanceAddsNullableDouble(t *testing.T) {
	ir := models.NewPipelineIRFromNodes([]models.PipelineNode{
		{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"trail_lat":0,"trail_lon":0,"coffee_lat":0,"coffee_lon":1}]}`)},
		{ID: "distance", TransformType: "sql", DependsOn: []string{"source"}, Config: json.RawMessage(`{"_stack":{"blocks":[{"kind":"haversine_distance","applied":true,"start_lat_column":"trail_lat","start_lon_column":"trail_lon","end_lat_column":"coffee_lat","end_lon_column":"coffee_lon","unit":"km","target_column":"distance_km"}]}}`)},
	})

	report := validatePipelineIRStrict("test", ir.Normalize())
	require.True(t, report.AllValid, "expected no strict schema errors, got %#v", report.Errors)

	node := strictNodeReport(t, report, "distance")
	fields := map[string]pipelineStrictValidationField{}
	for _, field := range node.OutputSchema {
		fields[field.Name] = field
	}
	require.Equal(t, "DOUBLE", fields["distance_km"].FieldType)
	require.True(t, fields["distance_km"].Nullable)
}

func TestValidatePipelineGraphEndpointReturnsDiagnostics(t *testing.T) {
	body := []byte(`{
		"status": "draft",
		"schedule_config": {"enabled": false, "cron": null},
		"nodes": [
			{"id":"source","transform_type":"external","config":{"rows":[{"id":"mesa"}]}},
			{"id":"filter","transform_type":"filter","depends_on":["source"],"config":{"predicate":"distance > 3"}}
		]
	}`)
	rr := httptest.NewRecorder()
	ValidatePipelineGraph(rr, httptest.NewRequest(http.MethodPost, "/api/v1/pipelines/_validate", bytes.NewReader(body)))
	require.Equal(t, http.StatusOK, rr.Code)
	var payload pipelineGraphValidationResponse
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&payload))
	require.False(t, payload.Valid)
	require.Len(t, payload.Nodes, 2)
	require.Equal(t, "INVALID", payload.Nodes[1].Status)
	require.Equal(t, "missing_column", payload.Nodes[1].Errors[0].Code)
}

func TestTriggerPipelineRunBlocksInvalidSchemaBeforeOpeningRun(t *testing.T) {
	pipelineID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	nodes := []models.PipelineNode{
		{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"id":"mesa"}]}`)},
		{ID: "filter", TransformType: "filter", DependsOn: []string{"source"}, Config: json.RawMessage(`{"predicate":"distance > 3"}`)},
	}
	runRepo := newRecordingPipelineRunsWithNodes(pipelineID, nodes)
	restore := SetExecutionPorts(ExecutionPorts{Runs: runRepo, Committer: &recordingCommitter{}, Transactions: &recordingTransactions{}, Parallelism: 1})
	defer restore()

	rr := httptest.NewRecorder()
	TriggerPipelineRun(rr, httptest.NewRequest(http.MethodPost, "/api/v1/pipelines/"+pipelineID.String()+"/runs", bytes.NewReader([]byte(`{}`))))

	require.Equal(t, http.StatusBadRequest, rr.Code)
	require.Equal(t, 0, runRepo.opened)
	var payload struct {
		Error  string                         `json:"error"`
		Report pipelineStrictValidationReport `json:"report"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&payload))
	require.Equal(t, "pipeline_schema_validation_failed", payload.Error)
	require.Contains(t, validationCodes(payload.Report), "missing_column")
}

func withOutputSchema(ir models.PipelineIR, nodeID string, schema models.PipelineIRSchema) models.PipelineIR {
	for i := range ir.Nodes {
		if ir.Nodes[i].ID == nodeID {
			ir.Nodes[i].OutputSchema = &schema
		}
	}
	return ir
}

func linkOutputValidationIR(cardinality, sourceColumn, targetColumn, sourceObjectNodeID, targetObjectNodeID string) models.PipelineIR {
	return models.NewPipelineIRFromNodes([]models.PipelineNode{
		{ID: "source", TransformType: "external", Config: json.RawMessage(`{"rows":[{"source_id":"trail-1","target_id":"coffee-1"}]}`)},
		{ID: "source_object", TransformType: "output_object_type", DependsOn: []string{"source"}, Config: json.RawMessage(`{"_output":{"kind":"object_type","object_type_id":"11111111-1111-1111-1111-111111111111","primary_key":"source_id"}}`)},
		{ID: "target_object", TransformType: "output_object_type", DependsOn: []string{"source"}, Config: json.RawMessage(`{"_output":{"kind":"object_type","object_type_id":"22222222-2222-2222-2222-222222222222","primary_key":"target_id"}}`)},
		{ID: "link", TransformType: "output_link_type", DependsOn: []string{"source", "source_object", "target_object"}, Config: json.RawMessage(`{"_output":{"kind":"link_type","cardinality":` + cardinality + `,"source_object_node_id":` + sourceObjectNodeID + `,"target_object_node_id":` + targetObjectNodeID + `,"source_key_column":` + sourceColumn + `,"target_key_column":` + targetColumn + `}}`)},
	})
}

func strictNodeReport(t *testing.T, report pipelineStrictValidationReport, nodeID string) pipelineStrictNodeReport {
	t.Helper()
	for _, node := range report.Nodes {
		if node.NodeID == nodeID {
			return node
		}
	}
	require.Failf(t, "missing node report", "node %s was not reported", nodeID)
	return pipelineStrictNodeReport{}
}

func validationCodes(report pipelineStrictValidationReport) []string {
	out := make([]string, 0, len(report.Errors))
	for _, err := range report.Errors {
		out = append(out, err.Code)
	}
	return out
}
