# AI Platform (AIP)

This section covers the AI-facing capability surface of OpenFoundry.

## OpenFoundry mapping

The repository components that implement this capability today are:

- `services/agent-runtime-service` — OpenAI-compatible chat endpoint; hosts MCP tools and the Plan → Act → Observe loop
- `services/retrieval-context-service` — RAG surface for AI augmentation
- `services/llm-catalog-service` — provider/model catalog and discovery surface
- `services/ai-evaluation-service` — LLM evaluation and guardrail benchmarking
- `services/ai-sink` — Kafka → Iceberg consumer for the `ai.events.v1` stream
- `libs/ai-kernel-go` — multi-provider LLM gateway, agent execution, chat, RAG primitives
- `libs/vector-store` — backend-agnostic vector database abstraction
- `apps/web/src/routes/ai` — Copilot panel + chat UI
- `apps/web/src/routes/aip-evals` — evaluation results browser
- `apps/web/src/routes/automate` — agent / tool registry UI
- `proto/ai/*` — wire contracts for AI services

## Focus areas

- provider integration and orchestration (`llm-catalog-service` + `ai-kernel-go`)
- knowledge retrieval and semantic workflows (`retrieval-context-service`)
- agent runtime: Plan → Act → Observe with MCP tools (`agent-runtime-service`)
- training and model lifecycle — see [Model connectivity & development](/model-connectivity/)
- evaluation, guardrails and safety (`ai-evaluation-service`, `media-scanner` lib for SDS)

## Related pages

- [Model connectivity & development](/model-connectivity/)
- [Contracts and SDKs](/architecture/contracts-and-sdks)
- [Capability map](/architecture/capability-map)
