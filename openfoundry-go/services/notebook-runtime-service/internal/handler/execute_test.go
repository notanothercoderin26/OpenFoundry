package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	pythonsidecar "github.com/openfoundry/openfoundry-go/libs/python-sidecar"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

type fakePythonKernel struct {
	results    map[string]*pythonsidecar.NotebookCellResult
	errors     map[string]error
	block      bool
	calls      []string
	ensureSeen []uuid.UUID
}

func (f *fakePythonKernel) EnsureSession(_ context.Context, sessionID uuid.UUID) error {
	f.ensureSeen = append(f.ensureSeen, sessionID)
	return nil
}

func (f *fakePythonKernel) ExecuteCell(ctx context.Context, _, _ uuid.UUID, source, _ string, _ uint32) (*pythonsidecar.NotebookCellResult, error) {
	f.calls = append(f.calls, source)
	if f.block {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if err := f.errors[source]; err != nil {
		return nil, err
	}
	if out := f.results[source]; out != nil {
		return out, nil
	}
	return &pythonsidecar.NotebookCellResult{OutputType: "text", ContentJSON: []byte(jsonString(""))}, nil
}

func (f *fakePythonKernel) DropSession(context.Context, uuid.UUID) error { return nil }

func executeTestState(t *testing.T, fk *fakePythonKernel) (*State, chi.Router, uuid.UUID) {
	t.Helper()
	nb := uuid.New()
	s := &State{Cfg: &config.Config{DataDir: t.TempDir()}, MemoryRepo: NewMemoryNotebookRepo(), PythonKernel: fk}
	r := chi.NewRouter()
	r.Post("/api/v1/notebooks/{notebook_id}/cells/{cell_id}/execute", s.ExecuteCell)
	r.Post("/api/v1/notebooks/{notebook_id}/cells/execute-all", s.ExecuteAllCells)
	return s, r, nb
}

func putTestCell(s *State, nb uuid.UUID, source string, position int32) models.Cell {
	id := uuid.New()
	now := time.Now().UTC()
	cell := models.Cell{ID: id, NotebookID: nb, CellType: "code", Kernel: "python", Source: source, Position: position, CreatedAt: now, UpdatedAt: now}
	s.MemoryRepo.putCell(cell)
	return cell
}

func TestExecuteCellSuccessfulPythonExecution(t *testing.T) {
	fk := &fakePythonKernel{results: map[string]*pythonsidecar.NotebookCellResult{
		"print('hi')": {OutputType: "text", ContentJSON: []byte(jsonString("hi\n")), Stdout: "hi\n"},
	}}
	s, r, nb := executeTestState(t, fk)
	cell := putTestCell(s, nb, "print('hi')", 1)

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notebooks/"+nb.String()+"/cells/"+cell.ID.String()+"/execute", bytes.NewReader([]byte(`{}`))), uuid.New())
	req.ContentLength = 2
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: %d body=%s", w.Code, w.Body.String())
	}
	var got models.CellOutput
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("json: %v", err)
	}
	if got.OutputType != "text" || string(got.Content) != jsonString("hi\n") || got.ExecutionCount != 1 {
		t.Fatalf("output drift: %+v content=%s", got, got.Content)
	}
	persisted, _ := s.MemoryRepo.loadCell(cell.ID)
	if persisted.ExecutionCount == nil || *persisted.ExecutionCount != 1 || len(persisted.LastOutput) == 0 {
		t.Fatalf("output was not persisted: %+v", persisted)
	}
}

func TestExecuteCellStdoutStderrContract(t *testing.T) {
	fk := &fakePythonKernel{results: map[string]*pythonsidecar.NotebookCellResult{
		"logs": {OutputType: "text", ContentJSON: []byte(jsonString("out\n")), Stdout: "out\n", Stderr: "err\n"},
	}}
	s, r, nb := executeTestState(t, fk)
	cell := putTestCell(s, nb, "logs", 1)

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notebooks/"+nb.String()+"/cells/"+cell.ID.String()+"/execute", bytes.NewReader([]byte(`{}`))), uuid.New())
	req.ContentLength = 2
	r.ServeHTTP(w, req)

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("json: %v", err)
	}
	if string(raw["content"]) != jsonString("out\n") {
		t.Fatalf("stdout content drift: %s", raw["content"])
	}
	if _, ok := raw["stderr"]; ok {
		t.Fatalf("stderr must not leak into Rust CellOutput contract: %s", w.Body.String())
	}
}

func TestExecuteCellException(t *testing.T) {
	fk := &fakePythonKernel{errors: map[string]error{"boom": errors.New("Traceback: boom")}}
	s, r, nb := executeTestState(t, fk)
	cell := putTestCell(s, nb, "boom", 1)

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notebooks/"+nb.String()+"/cells/"+cell.ID.String()+"/execute", bytes.NewReader([]byte(`{}`))), uuid.New())
	req.ContentLength = 2
	r.ServeHTTP(w, req)

	var got models.CellOutput
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if got.OutputType != "error" || !bytes.Contains(got.Content, []byte("Traceback: boom")) {
		t.Fatalf("error output drift: %+v content=%s", got, got.Content)
	}
}

func TestExecuteCellCancellation(t *testing.T) {
	fk := &fakePythonKernel{block: true}
	s, r, nb := executeTestState(t, fk)
	cell := putTestCell(s, nb, "wait", 1)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notebooks/"+nb.String()+"/cells/"+cell.ID.String()+"/execute", bytes.NewReader([]byte(`{}`))).WithContext(ctx), uuid.New())
	req.ContentLength = 2
	r.ServeHTTP(w, req)

	var got models.CellOutput
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if got.OutputType != "error" || !bytes.Contains(got.Content, []byte("context canceled")) {
		t.Fatalf("cancel output drift: %+v content=%s", got, got.Content)
	}
}

func TestExecuteAllCellsOrdering(t *testing.T) {
	fk := &fakePythonKernel{results: map[string]*pythonsidecar.NotebookCellResult{
		"first":  {OutputType: "text", ContentJSON: []byte(jsonString("1"))},
		"second": {OutputType: "text", ContentJSON: []byte(jsonString("2"))},
	}}
	s, r, nb := executeTestState(t, fk)
	second := putTestCell(s, nb, "second", 2)
	first := putTestCell(s, nb, "first", 1)

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notebooks/"+nb.String()+"/cells/execute-all", bytes.NewReader([]byte(`{}`))), uuid.New())
	req.ContentLength = 2
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: %d body=%s", w.Code, w.Body.String())
	}
	if len(fk.calls) != 2 || fk.calls[0] != "first" || fk.calls[1] != "second" {
		t.Fatalf("call order = %v", fk.calls)
	}
	var env struct {
		Results []struct {
			CellID uuid.UUID         `json:"cell_id"`
			Output models.CellOutput `json:"output"`
		} `json:"results"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v", err)
	}
	if len(env.Results) != 2 || env.Results[0].CellID != first.ID || env.Results[1].CellID != second.ID {
		t.Fatalf("result order drift: %+v", env.Results)
	}
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
