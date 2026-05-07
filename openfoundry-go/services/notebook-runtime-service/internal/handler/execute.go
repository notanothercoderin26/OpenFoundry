package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	pythonsidecar "github.com/openfoundry/openfoundry-go/libs/python-sidecar"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/environment"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

const defaultNotebookCellTimeoutSeconds uint32 = 60

// notebookPythonKernel is the injectable runtime boundary used by
// ExecuteCell/ExecuteAllCells. Production wires it to python-sidecar;
// tests replace it with fakes without spawning a subprocess.
type NotebookPythonKernel interface {
	EnsureSession(ctx context.Context, sessionID uuid.UUID) error
	ExecuteCell(ctx context.Context, sessionID, notebookID uuid.UUID, source, workspaceDir string, timeoutSeconds uint32) (*pythonsidecar.NotebookCellResult, error)
	DropSession(ctx context.Context, sessionID uuid.UUID) error
}

// memoryNotebookRepo is the minimal no-DB repository slice used by unit
// tests and smoke clusters. The Postgres path remains the source of
// truth when Pool is non-nil.
type MemoryNotebookRepo struct {
	mu       sync.Mutex
	cells    map[uuid.UUID]models.Cell
	sessions map[uuid.UUID]models.Session
}

func NewMemoryNotebookRepo() *MemoryNotebookRepo {
	return &MemoryNotebookRepo{cells: map[uuid.UUID]models.Cell{}, sessions: map[uuid.UUID]models.Session{}}
}

func (m *MemoryNotebookRepo) putCell(c models.Cell) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cells == nil {
		m.cells = map[uuid.UUID]models.Cell{}
	}
	m.cells[c.ID] = c
}

func (m *MemoryNotebookRepo) putSession(sess models.Session) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.sessions == nil {
		m.sessions = map[uuid.UUID]models.Session{}
	}
	m.sessions[sess.ID] = sess
}

func (m *MemoryNotebookRepo) loadCell(id uuid.UUID) (models.Cell, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.cells[id]
	return c, ok
}

func (m *MemoryNotebookRepo) loadCodeCells(notebookID uuid.UUID) []models.Cell {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []models.Cell{}
	for _, c := range m.cells {
		if c.NotebookID == notebookID && c.CellType == "code" {
			out = append(out, c)
		}
	}
	sortCellsByPosition(out)
	return out
}

func (m *MemoryNotebookRepo) loadSession(id uuid.UUID) (models.Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	return sess, ok
}

func (m *MemoryNotebookRepo) updateSessionStatus(id uuid.UUID, status string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok {
		return
	}
	sess.Status = status
	sess.LastActivity = time.Now().UTC()
	m.sessions[id] = sess
}

func (m *MemoryNotebookRepo) persistOutput(cellID uuid.UUID, output models.CellOutput, count int32) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.cells[cellID]
	if !ok {
		return
	}
	raw, _ := json.Marshal(output)
	c.LastOutput = raw
	c.ExecutionCount = &count
	c.UpdatedAt = time.Now().UTC()
	m.cells[cellID] = c
}

func (s *State) ExecuteCell(w http.ResponseWriter, r *http.Request) {
	if requireClaims(w, r) == nil {
		return
	}
	notebookID, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
		return
	}
	cellID, err := pathUUID(r, "cell_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid cell id"))
		return
	}
	var body models.ExecuteCellRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}

	cell, ok, err := s.loadCell(r.Context(), cellID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok || cell.NotebookID != notebookID {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if cell.CellType == "markdown" {
		content, _ := json.Marshal(cell.Source)
		writeJSON(w, http.StatusOK, models.CellOutput{OutputType: "text", Content: content, ExecutionCount: 0})
		return
	}

	if body.SessionID != nil {
		sess, ok, err := s.loadSession(r.Context(), *body.SessionID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
			return
		}
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if sess.Status == "dead" {
			writeJSON(w, http.StatusConflict, "session is stopped")
			return
		}
		if sess.Kernel != cell.Kernel {
			writeJSON(w, http.StatusBadRequest, "session kernel does not match cell kernel")
			return
		}
	}

	output, count := s.executeCodeCell(r.Context(), notebookID, cell, body.SessionID)
	writeJSON(w, http.StatusOK, output)
	_ = count
}

func (s *State) ExecuteAllCells(w http.ResponseWriter, r *http.Request) {
	if requireClaims(w, r) == nil {
		return
	}
	notebookID, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
		return
	}
	var body models.ExecuteCellRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}

	var sharedSession *models.Session
	if body.SessionID != nil {
		sess, ok, err := s.loadSession(r.Context(), *body.SessionID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
			return
		}
		if ok {
			sharedSession = &sess
			s.updateSessionStatus(r.Context(), sess.ID, "busy")
		}
	}

	cells, err := s.loadCodeCells(r.Context(), notebookID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}

	results := make([]map[string]any, 0, len(cells))
	for _, cell := range cells {
		var sid *uuid.UUID
		if sharedSession != nil && sharedSession.Kernel == cell.Kernel && sharedSession.Status != "dead" {
			sid = &sharedSession.ID
		}
		output, _ := s.executeCodeCell(r.Context(), notebookID, cell, sid)
		results = append(results, map[string]any{"cell_id": cell.ID, "output": output})
	}

	if sharedSession != nil {
		s.updateSessionStatus(r.Context(), sharedSession.ID, "idle")
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func (s *State) executeCodeCell(ctx context.Context, notebookID uuid.UUID, cell models.Cell, sessionID *uuid.UUID) (models.CellOutput, int32) {
	if sessionID != nil {
		sess, ok, err := s.loadSession(ctx, *sessionID)
		if err != nil {
			return s.errorOutput(cell, err.Error())
		}
		if !ok {
			return s.errorOutput(cell, "session not found")
		}
		if sess.Status == "dead" {
			return s.errorOutput(cell, "session is stopped")
		}
		if sess.Kernel != cell.Kernel {
			return s.errorOutput(cell, "session kernel does not match cell kernel")
		}
		s.updateSessionStatus(ctx, sess.ID, "busy")
	}

	result, err := s.executeKernel(ctx, notebookID, cell, sessionID)
	count := executionCount(cell)
	output := outputFromKernelResult(result, err, count)
	s.persistCellOutput(ctx, cell.ID, output, count)

	if sessionID != nil {
		s.updateSessionStatus(ctx, *sessionID, "idle")
	}
	return output, count
}

func (s *State) executeKernel(ctx context.Context, notebookID uuid.UUID, cell models.Cell, sessionID *uuid.UUID) (*pythonsidecar.NotebookCellResult, error) {
	switch strings.ToLower(cell.Kernel) {
	case "python":
		if s.PythonKernel == nil {
			return nil, errors.New("python kernel sidecar is not configured")
		}
		sid := uuid.Nil
		if sessionID != nil {
			sid = *sessionID
			if err := s.PythonKernel.EnsureSession(ctx, sid); err != nil {
				return nil, err
			}
		}
		dataDir := ""
		if s.Cfg != nil {
			dataDir = s.Cfg.DataDir
		}
		workspaceDir := environment.WorkspaceRoot(dataDir, notebookID)
		if err := environment.EnsureSeed(dataDir, notebookID); err != nil {
			return nil, err
		}
		return s.PythonKernel.ExecuteCell(ctx, sid, notebookID, cell.Source, workspaceDir, s.notebookCellTimeoutSeconds())
	case "sql", "r", "llm":
		return nil, fmt.Errorf("%s kernel execution is not supported by the python sidecar", cell.Kernel)
	default:
		return nil, fmt.Errorf("unsupported kernel: %s", cell.Kernel)
	}
}

func (s *State) errorOutput(cell models.Cell, message string) (models.CellOutput, int32) {
	count := executionCount(cell)
	content, _ := json.Marshal(map[string]string{"error": message})
	output := models.CellOutput{OutputType: "error", Content: content, ExecutionCount: count}
	s.persistCellOutput(context.Background(), cell.ID, output, count)
	return output, count
}

func outputFromKernelResult(result *pythonsidecar.NotebookCellResult, err error, count int32) models.CellOutput {
	if err != nil {
		content, _ := json.Marshal(map[string]string{"error": err.Error()})
		return models.CellOutput{OutputType: "error", Content: content, ExecutionCount: count}
	}
	outputType := result.OutputType
	if outputType == "" {
		outputType = "text"
	}
	content := json.RawMessage(result.ContentJSON)
	if !json.Valid(content) {
		content, _ = json.Marshal(string(result.ContentJSON))
	}
	if len(content) == 0 {
		content, _ = json.Marshal("")
	}
	return models.CellOutput{OutputType: outputType, Content: content, ExecutionCount: count}
}

func executionCount(cell models.Cell) int32 {
	if cell.ExecutionCount == nil {
		return 1
	}
	return *cell.ExecutionCount + 1
}

func (s *State) loadCell(ctx context.Context, cellID uuid.UUID) (models.Cell, bool, error) {
	if s.Pool == nil {
		if s.MemoryRepo == nil {
			return models.Cell{}, false, nil
		}
		c, ok := s.MemoryRepo.loadCell(cellID)
		return c, ok, nil
	}
	row := s.Pool.QueryRow(ctx, `
        SELECT id, notebook_id, cell_type, kernel, source, position,
               last_output, execution_count, created_at, updated_at
        FROM cells WHERE id = $1`, cellID)
	cell, err := scanCell(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Cell{}, false, nil
	}
	return cell, err == nil, err
}

func (s *State) loadCodeCells(ctx context.Context, notebookID uuid.UUID) ([]models.Cell, error) {
	if s.Pool == nil {
		if s.MemoryRepo == nil {
			return []models.Cell{}, nil
		}
		return s.MemoryRepo.loadCodeCells(notebookID), nil
	}
	rows, err := s.Pool.Query(ctx, `
        SELECT id, notebook_id, cell_type, kernel, source, position,
               last_output, execution_count, created_at, updated_at
        FROM cells WHERE notebook_id = $1 AND cell_type = 'code' ORDER BY position ASC`, notebookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cells := []models.Cell{}
	for rows.Next() {
		cell, err := scanCell(rows)
		if err != nil {
			return nil, err
		}
		cells = append(cells, cell)
	}
	return cells, rows.Err()
}

func (s *State) loadSession(ctx context.Context, sessionID uuid.UUID) (models.Session, bool, error) {
	if s.Pool == nil {
		if s.MemoryRepo == nil {
			return models.Session{}, false, nil
		}
		sess, ok := s.MemoryRepo.loadSession(sessionID)
		return sess, ok, nil
	}
	row := s.Pool.QueryRow(ctx, `
        SELECT id, notebook_id, kernel, status, started_by, created_at, last_activity
        FROM sessions WHERE id = $1`, sessionID)
	sess, err := scanSession(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Session{}, false, nil
	}
	return sess, err == nil, err
}

func (s *State) updateSessionStatus(ctx context.Context, sessionID uuid.UUID, status string) {
	if s.Pool == nil {
		if s.MemoryRepo != nil {
			s.MemoryRepo.updateSessionStatus(sessionID, status)
		}
		return
	}
	_, _ = s.Pool.Exec(ctx, `UPDATE sessions SET status = $2, last_activity = NOW() WHERE id = $1`, sessionID, status)
}

func (s *State) persistCellOutput(ctx context.Context, cellID uuid.UUID, output models.CellOutput, count int32) {
	if s.Pool == nil {
		if s.MemoryRepo != nil {
			s.MemoryRepo.persistOutput(cellID, output, count)
		}
		return
	}
	raw, _ := json.Marshal(output)
	_, _ = s.Pool.Exec(ctx,
		`UPDATE cells SET last_output = $2, execution_count = $3, updated_at = NOW() WHERE id = $1`,
		cellID, raw, count)
}

func (s *State) notebookCellTimeoutSeconds() uint32 {
	if s.Cfg != nil && s.Cfg.PythonSidecarTimeoutSeconds != 0 {
		return s.Cfg.PythonSidecarTimeoutSeconds
	}
	return defaultNotebookCellTimeoutSeconds
}

func sortCellsByPosition(cells []models.Cell) {
	for i := 1; i < len(cells); i++ {
		j := i
		for j > 0 && cells[j-1].Position > cells[j].Position {
			cells[j-1], cells[j] = cells[j], cells[j-1]
			j--
		}
	}
}
