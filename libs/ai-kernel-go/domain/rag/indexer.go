package rag

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
)

// IndexDocument splits a document into KnowledgeChunks (chunked +
// embedded).
//   - Each chunk's metadata = {"strategy": chunking_strategy}.
//   - chunk.id = "{document_id}-{position}".
//   - token_count = whitespace-separated word count.
func IndexDocument(documentID uuid.UUID, content, chunkingStrategy string) []models.KnowledgeChunk {
	maxChars := 520
	if chunkingStrategy == "fine" {
		maxChars = 320
	}
	chunks := ChunkText(content, maxChars)
	out := make([]models.KnowledgeChunk, 0, len(chunks))
	metadata, _ := json.Marshal(map[string]string{"strategy": chunkingStrategy})
	for _, c := range chunks {
		out = append(out, models.KnowledgeChunk{
			ID:         fmt.Sprintf("%s-%d", documentID.String(), c.Position),
			Position:   c.Position,
			Text:       c.Text,
			TokenCount: int32(len(strings.Fields(c.Text))),
			Embedding:  EmbedText(c.Text),
			Metadata:   metadata,
		})
	}
	return out
}
