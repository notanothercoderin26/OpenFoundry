// B07 §AC#4 — Document upload + retrieval (RAG) HTTP surface.
//
// The agent runtime's `retrieval` tool kind hits POST /api/v1/retrieval/search;
// admins (or the user via the AI Threads document-upload affordance)
// post documents to POST /api/v1/retrieval/documents.
//
// The embedder is a deliberate PoC stand-in: a 15-dim bag-of-words
// hash signature. The shape is right — production swaps the
// embedder for `libs/ai-kernel-go/embeddings` without touching the
// surface or the chunk table.

package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

// EmbeddingDims is the stand-in vector width. Stable across the
// table schema; do not change without a migration.
const EmbeddingDims = 15

// MaxChunkChars caps each chunk; the embedder runs per-chunk so a
// long doc produces many cheap signatures.
const MaxChunkChars = 1200

// Knowledge bundles the document upload + retrieval handlers. The
// Embedder is pluggable so cmd/main can wire the offline-hash
// fallback (CI/dev) or a real provider-backed embedder (PoC and
// production) without re-touching the handler.
type Knowledge struct {
	Pool     *pgxpool.Pool
	Embedder Embedder
}

// embedder returns the configured Embedder or falls back to the
// offline hash. The fallback keeps single-test handlers working
// without having to construct the embedder up-front.
func (h *Knowledge) embedder() Embedder {
	if h.Embedder != nil {
		return h.Embedder
	}
	return OfflineEmbedder{}
}

// UploadDocumentRequest is POST /api/v1/retrieval/documents body.
type UploadDocumentRequest struct {
	KnowledgeBaseID string          `json:"knowledge_base_id"`
	Title           string          `json:"title"`
	ContentType     string          `json:"content_type,omitempty"`
	Content         string          `json:"content"`
	Metadata        json.RawMessage `json:"metadata,omitempty"`
}

// UploadDocumentResponse is the 201 body.
type UploadDocumentResponse struct {
	ID              uuid.UUID `json:"id"`
	KnowledgeBaseID string    `json:"knowledge_base_id"`
	Title           string    `json:"title"`
	ChunkCount      int       `json:"chunk_count"`
	CreatedAt       time.Time `json:"created_at"`
}

// SearchRequest is POST /api/v1/retrieval/search body.
type SearchRequest struct {
	KnowledgeBaseID string `json:"knowledge_base_id,omitempty"`
	Query           string `json:"query"`
	Limit           int    `json:"limit,omitempty"`
}

// SearchHit is one returned chunk + its source.
type SearchHit struct {
	DocumentID    uuid.UUID `json:"document_id"`
	DocumentTitle string    `json:"document_title"`
	ChunkIndex    int       `json:"chunk_index"`
	Content       string    `json:"content"`
	Score         float64   `json:"score"`
}

// SearchResponse is the body the agent's retrieval tool sees.
type SearchResponse struct {
	Hits []SearchHit `json:"hits"`
}

// UploadDocument handles POST /api/v1/retrieval/documents.
func (h *Knowledge) UploadDocument(w http.ResponseWriter, r *http.Request) {
	var body UploadDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	if strings.TrimSpace(body.KnowledgeBaseID) == "" {
		writeJSONError(w, http.StatusBadRequest, "knowledge_base_id required")
		return
	}
	if strings.TrimSpace(body.Content) == "" {
		writeJSONError(w, http.StatusBadRequest, "content required")
		return
	}
	if body.Title == "" {
		body.Title = "Untitled"
	}
	if body.ContentType == "" {
		body.ContentType = "text/plain"
	}
	metadata := body.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	userID := userIDFromClaimsOrNil(r)

	doc := UploadDocumentResponse{
		ID:              uuid.New(),
		KnowledgeBaseID: body.KnowledgeBaseID,
		Title:           body.Title,
		CreatedAt:       time.Now().UTC(),
	}
	chunks := splitIntoChunks(body.Content, MaxChunkChars)
	doc.ChunkCount = len(chunks)

	embedder := h.embedder()
	model := embedder.Model()

	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	_, err = tx.Exec(r.Context(),
		`INSERT INTO knowledge_documents
		    (id, knowledge_base_id, user_id, title, content_type, content, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		doc.ID, body.KnowledgeBaseID, userID, body.Title, body.ContentType, body.Content, []byte(metadata),
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i, ch := range chunks {
		emb, err := embedder.Embed(r.Context(), ch)
		if err != nil {
			writeJSONError(w, http.StatusBadGateway, "embedder failed: "+err.Error())
			return
		}
		_, err = tx.Exec(r.Context(),
			`INSERT INTO knowledge_document_chunks
			    (id, document_id, chunk_index, content, embedding, embedding_model, char_length)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			uuid.New(), doc.ID, i, ch, emb, model, len(ch),
		)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, doc)
}

// Search handles POST /api/v1/retrieval/search.
func (h *Knowledge) Search(w http.ResponseWriter, r *http.Request) {
	var body SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	if strings.TrimSpace(body.Query) == "" {
		writeJSONError(w, http.StatusBadRequest, "query required")
		return
	}
	limit := body.Limit
	if limit <= 0 || limit > 50 {
		limit = 5
	}
	hits, err := h.searchChunks(r.Context(), body.KnowledgeBaseID, body.Query, limit)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, SearchResponse{Hits: hits})
}

func (h *Knowledge) searchChunks(ctx context.Context, kb, query string, limit int) ([]SearchHit, error) {
	// Filter to chunks produced by the currently-wired embedder.
	// Mixed-dim corpora (legacy 15-dim hash chunks + new 1536-dim
	// OpenAI chunks living in the same row set) would silently
	// score 0 and starve retrieval — the filter prevents that.
	embedder := h.embedder()
	model := embedder.Model()
	q := `SELECT c.document_id, d.title, c.chunk_index, c.content, c.embedding
	        FROM knowledge_document_chunks c
	        JOIN knowledge_documents d ON d.id = c.document_id
	       WHERE c.embedding_model = $1`
	args := []any{model}
	if kb != "" {
		q += ` AND d.knowledge_base_id = $2`
		args = append(args, kb)
	}
	rows, err := h.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	qEmb, err := embedder.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embedder failed: %w", err)
	}
	qWords := wordsOf(query)
	scored := make([]SearchHit, 0)
	for rows.Next() {
		var (
			docID      uuid.UUID
			title      string
			chunkIndex int
			content    string
			emb        []float64
		)
		if err := rows.Scan(&docID, &title, &chunkIndex, &content, &emb); err != nil {
			return nil, err
		}
		score := cosine(qEmb, emb) + lexicalBoost(qWords, content)
		scored = append(scored, SearchHit{
			DocumentID: docID, DocumentTitle: title, ChunkIndex: chunkIndex,
			Content: content, Score: score,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Sort by score desc and truncate.
	sortByScoreDesc(scored)
	if len(scored) > limit {
		scored = scored[:limit]
	}
	return scored, nil
}

// ── Embedding stand-in ──────────────────────────────────────────────

// embed produces a 15-dim bag-of-words signature: for each token,
// hash it into a bucket and increment that dimension. L2-normalised
// so cosine reduces to dot-product.
func embed(text string) []float64 {
	vec := make([]float64, EmbeddingDims)
	for _, w := range wordsOf(text) {
		h := fnv.New32a()
		_, _ = h.Write([]byte(w))
		vec[int(h.Sum32())%EmbeddingDims]++
	}
	norm := 0.0
	for _, v := range vec {
		norm += v * v
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return vec
	}
	for i := range vec {
		vec[i] /= norm
	}
	return vec
}

func wordsOf(text string) []string {
	lower := strings.ToLower(text)
	out := make([]string, 0, 32)
	cur := strings.Builder{}
	for _, c := range lower {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			cur.WriteRune(c)
		} else if cur.Len() > 0 {
			out = append(out, cur.String())
			cur.Reset()
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

func cosine(a, b []float64) float64 {
	if len(a) != len(b) {
		return 0
	}
	var s float64
	for i := range a {
		s += a[i] * b[i]
	}
	return s
}

// lexicalBoost adds a tiny bonus when the content contains the query
// tokens verbatim — keeps the hash-bucket false positives from
// dominating short corpora.
func lexicalBoost(qWords []string, content string) float64 {
	if len(qWords) == 0 {
		return 0
	}
	lower := strings.ToLower(content)
	hits := 0
	for _, w := range qWords {
		if strings.Contains(lower, w) {
			hits++
		}
	}
	return 0.1 * float64(hits) / float64(len(qWords))
}

// splitIntoChunks splits a document into ~MaxChunkChars windows,
// breaking on whitespace so words stay intact.
func splitIntoChunks(content string, maxChars int) []string {
	if maxChars <= 0 {
		maxChars = MaxChunkChars
	}
	if len(content) <= maxChars {
		return []string{content}
	}
	out := []string{}
	start := 0
	for start < len(content) {
		end := start + maxChars
		if end >= len(content) {
			out = append(out, content[start:])
			break
		}
		// Walk back to the previous whitespace.
		for end > start && !isWhitespace(content[end]) {
			end--
		}
		if end == start {
			end = start + maxChars // word longer than window — split anyway
		}
		out = append(out, content[start:end])
		start = end
		// Skip leading whitespace of next chunk.
		for start < len(content) && isWhitespace(content[start]) {
			start++
		}
	}
	return out
}

func isWhitespace(b byte) bool { return b == ' ' || b == '\n' || b == '\t' || b == '\r' }

// sortByScoreDesc is a stable insertion sort — fine for small N.
// Pulled out so tests can call it directly.
func sortByScoreDesc(hits []SearchHit) {
	for i := 1; i < len(hits); i++ {
		j := i
		for j > 0 && hits[j-1].Score < hits[j].Score {
			hits[j-1], hits[j] = hits[j], hits[j-1]
			j--
		}
	}
}

// ── Helpers ─────────────────────────────────────────────────────────

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// userIDFromClaimsOrNil returns the caller's subject if the
// auth-middleware attached claims; otherwise nil so anonymous
// uploads still work in dev. Returns *uuid.UUID for pgx-friendly NULL
// binding.
func userIDFromClaimsOrNil(r *http.Request) *uuid.UUID {
	if claims, ok := authmw.FromContext(r.Context()); ok {
		return &claims.Sub
	}
	return nil
}

// keep errors imported when only used via writeJSONError
var _ = errors.New

// fmt used in the unused-import audit if we add tracing later.
var _ = fmt.Sprintf
