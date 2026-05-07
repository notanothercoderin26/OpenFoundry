package spark

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func sampleInput() PipelineRunInput {
	return PipelineRunInput{PipelineID: "p-7c1a", RunID: "r-stub", Namespace: "openfoundry-spark", ApplicationType: SparkApplicationScala, PipelineRunnerImage: "localhost:5001/pipeline-runner:0.1.0", InputDatasetRID: "ri.dataset.main.in", OutputDatasetRID: "ri.dataset.main.out"}
}

func TestKubernetesClientSubmitOK(t *testing.T) {
	var gotPath, gotMethod string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(gotBody)
	}))
	defer server.Close()
	client, err := NewKubernetesClient(server.URL, "token", server.Client())
	require.NoError(t, err)

	name, err := client.SubmitPipelineRun(context.Background(), sampleInput())
	require.NoError(t, err)
	require.Equal(t, "pipeline-run-p-7c1a-r-stub", name)
	require.Equal(t, http.MethodPost, gotMethod)
	require.Equal(t, "/apis/sparkoperator.k8s.io/v1beta2/namespaces/openfoundry-spark/sparkapplications", gotPath)
	require.Equal(t, "SparkApplication", gotBody["kind"])
	meta := gotBody["metadata"].(map[string]any)
	require.Equal(t, "pipeline-run-p-7c1a-r-stub", meta["name"])
	spec := gotBody["spec"].(map[string]any)
	args := spec["arguments"].([]any)
	require.Contains(t, args, "ri.dataset.main.in")
	require.Contains(t, args, "ri.dataset.main.out")
}

func TestKubernetesClientGetRunFoundAndNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/missing") {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": map[string]any{"applicationState": map[string]any{"state": "RUNNING"}}})
	}))
	defer server.Close()
	client, err := NewKubernetesClient(server.URL, "", server.Client())
	require.NoError(t, err)

	report, err := client.GetPipelineRunStatus(context.Background(), "ns", "present")
	require.NoError(t, err)
	require.NotNil(t, report)
	require.Equal(t, SparkRunRunning, report.Status)

	report, err = client.GetPipelineRunStatus(context.Background(), "ns", "missing")
	require.NoError(t, err)
	require.Nil(t, report)
}

func TestRenderManifestRejectsInvalidSpec(t *testing.T) {
	bad := sampleInput()
	bad.PipelineRunnerImage = ""
	_, err := RenderManifest(bad)
	require.Error(t, err)
	var invalid *InvalidInputError
	require.ErrorAs(t, err, &invalid)
	require.Contains(t, invalid.Message, "pipeline_runner_image")
}
