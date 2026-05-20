-- B07 §AC#4 — Document upload + retrieval surface used by the
-- agent runtime's `retrieval` tool kind.
--
-- knowledge_documents stores the uploaded payload (with content as
-- TEXT for PoC scope — production would offload to object storage
-- and keep the row metadata-only). Chunks live in
-- knowledge_document_chunks with a numeric "embedding" vector (15
-- dims, sufficient for the hash-based stand-in used in the PoC
-- embedder; production swaps to libs/ai-kernel-go embeddings).
--
-- Retrieval is currently lexical + cosine over the stand-in vector;
-- the chunk content is returned to the agent verbatim so it can
-- cite the source inline.

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id                UUID PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    user_id           UUID,
    title             TEXT NOT NULL,
    content_type      TEXT NOT NULL DEFAULT 'text/plain',
    content           TEXT NOT NULL,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_kb
    ON knowledge_documents(knowledge_base_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_document_chunks (
    id            UUID PRIMARY KEY,
    document_id   UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index   INTEGER NOT NULL,
    content       TEXT NOT NULL,
    -- PoC stand-in: 15-dim hash-based bag-of-words signature. The
    -- search endpoint computes cosine vs the query's signature.
    embedding     DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
    char_length   INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_chunks_doc
    ON knowledge_document_chunks(document_id, chunk_index);
