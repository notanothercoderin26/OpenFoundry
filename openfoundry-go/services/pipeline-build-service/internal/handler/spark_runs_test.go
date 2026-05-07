package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	sparkpkg "github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/spark"
)

func TestSubmitSparkRunOK(t *testing.T) {
	fake := &fakeSparkClient{submittedName: "pipeline-run-p-r"}
	restore := SetSparkClient(fake)
	defer restore()
	body := []byte(`{"pipeline_id":"p","run_id":"r","input_dataset_rid":"in","output_dataset_rid":"out","pipeline_runner_image":"img"}`)
	rr := httptest.NewRecorder()
	SubmitSparkRun(rr, httptest.NewRequest(http.MethodPost, "/api/v1/data-integration/spark-runs", bytes.NewReader(body)))

	res := rr.Result()
	defer res.Body.Close()
	require.Equal(t, http.StatusAccepted, res.StatusCode)
	require.Equal(t, "p", fake.submitted.PipelineID)
	require.Equal(t, "r", fake.submitted.RunID)
	var payload map[string]any
	require.NoError(t, json.NewDecoder(res.Body).Decode(&payload))
	require.Equal(t, "pipeline-run-p-r", payload["spark_app_name"])
	require.Equal(t, "SUBMITTED", payload["status"])
}

func TestSubmitSparkRunKubeUnavailableShape(t *testing.T) {
	restore := SetSparkClient(noSparkClient{})
	defer restore()
	rr := httptest.NewRecorder()
	SubmitSparkRun(rr, httptest.NewRequest(http.MethodPost, "/api/v1/data-integration/spark-runs", bytes.NewReader([]byte(`{}`))))

	res := rr.Result()
	defer res.Body.Close()
	require.Equal(t, http.StatusServiceUnavailable, res.StatusCode)
	var payload map[string]string
	require.NoError(t, json.NewDecoder(res.Body).Decode(&payload))
	require.Equal(t, "kube_client_unavailable", payload["error"])
	require.Contains(t, payload["detail"], "SparkApplication endpoints require")
}

func TestGetSparkRunFoundAndNotFound(t *testing.T) {
	fake := &fakeSparkClient{status: &sparkpkg.SparkRunStatusReport{Status: sparkpkg.SparkRunSucceeded}}
	restore := SetSparkClient(fake)
	defer restore()
	rr := httptest.NewRecorder()
	GetSparkRun(rr, httptest.NewRequest(http.MethodGet, "/api/v1/data-integration/spark-runs/app-1?namespace=ns", nil))
	require.Equal(t, http.StatusOK, rr.Result().StatusCode)
	var payload map[string]any
	require.NoError(t, json.NewDecoder(rr.Result().Body).Decode(&payload))
	require.Equal(t, "app-1", fake.gotName)
	require.Equal(t, "ns", fake.gotNamespace)
	require.Equal(t, "SUCCEEDED", payload["status"])

	fake.status = nil
	rr = httptest.NewRecorder()
	GetSparkRun(rr, httptest.NewRequest(http.MethodGet, "/api/v1/data-integration/spark-runs/missing", nil))
	require.Equal(t, http.StatusNotFound, rr.Result().StatusCode)
}

func TestSubmitSparkRunInvalidSpec(t *testing.T) {
	restore := SetSparkClient(&fakeSparkClient{})
	defer restore()
	body := []byte(`{"pipeline_id":"p","run_id":"r","input_dataset_rid":"in","output_dataset_rid":"out","pipeline_runner_image":"   "}`)
	rr := httptest.NewRecorder()
	SubmitSparkRun(rr, httptest.NewRequest(http.MethodPost, "/api/v1/data-integration/spark-runs", bytes.NewReader(body)))

	res := rr.Result()
	defer res.Body.Close()
	require.Equal(t, http.StatusBadRequest, res.StatusCode)
	var payload map[string]string
	require.NoError(t, json.NewDecoder(res.Body).Decode(&payload))
	require.Equal(t, "invalid_spark_spec", payload["error"])
}

type fakeSparkClient struct {
	submittedName string
	submitted     sparkpkg.PipelineRunInput
	status        *sparkpkg.SparkRunStatusReport
	gotNamespace  string
	gotName       string
}

func (f *fakeSparkClient) SubmitPipelineRun(_ context.Context, input sparkpkg.PipelineRunInput) (string, error) {
	if err := validateByRendering(input); err != nil {
		return "", err
	}
	f.submitted = input
	if f.submittedName != "" {
		return f.submittedName, nil
	}
	return sparkpkg.SparkAppName(input.PipelineID, input.RunID)
}

func (f *fakeSparkClient) GetPipelineRunStatus(_ context.Context, namespace, name string) (*sparkpkg.SparkRunStatusReport, error) {
	f.gotNamespace = namespace
	f.gotName = name
	return f.status, nil
}

func validateByRendering(input sparkpkg.PipelineRunInput) error {
	_, err := sparkpkg.RenderManifest(input)
	return err
}
