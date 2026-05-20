-- PoC gap #4 — track which embedder produced each chunk so the search
-- path can filter to vectors of the matching dim/model.
--
-- Foundry's AIP Chatbot Studio public docs note that semantic-search
-- on Ontology objects requires "a vector embedding property", but the
-- specific embedder is provider-specific (BYO model). When OpenFoundry
-- swaps the in-process 15-dim hash for a real provider-backed
-- embedder (OpenAI text-embedding-3-small, Ollama nomic-embed-text,
-- etc.), pre-existing chunks become incompatible. Rather than gating
-- migration on a full re-embed, we tag each chunk and search only
-- considers chunks produced by the current embedder.
--
-- Default 'offline-hash-15' matches the legacy stand-in so existing
-- rows keep returning results until the operator switches to a real
-- provider and re-uploads.

ALTER TABLE knowledge_document_chunks
    ADD COLUMN IF NOT EXISTS embedding_model TEXT NOT NULL DEFAULT 'offline-hash-15';

CREATE INDEX IF NOT EXISTS idx_knowledge_document_chunks_model
    ON knowledge_document_chunks(embedding_model);
