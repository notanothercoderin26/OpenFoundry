#!/usr/bin/env python3
"""One-shot wiring of libs/capabilities into every remaining service.

Idempotent: if a server.go already imports `libs/capabilities` we skip it.
The script intentionally does NOT touch services with non-standard shapes
(plain net/http servers, missing cfg.Service.{Name,Version}). Those need a
manual pass.

Pattern injected:

  + "github.com/openfoundry/openfoundry-go/libs/capabilities"

  ... after the /metrics handler line:
  + caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
  + caps.Mount(r)

  ... before `return r` (or `addr := fmt.Sprintf` when buildRouter is inline):
  + if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
  +     IDPrefix: "<id>", AuthPaths: <list>, Tags: <list>,
  + }); err != nil { panic(...) }
"""
from __future__ import annotations
import re, sys, pathlib, json

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Per-service knobs. AuthPaths empty means "no per-route auth" (gateway gates).
PLAN = {
    "agent-runtime-service":              {"id": "agent-runtime",            "auth": ["/api/v1/agent-runtime"],            "tags": ["agent"]},
    "ai-evaluation-service":              {"id": "ai-evaluation",            "auth": ["/api/v1"],                          "tags": ["ai"]},
    "audit-compliance-service":           {"id": "audit-compliance",         "auth": ["/api/v1"],                          "tags": ["audit"]},
    "authorization-policy-service":       {"id": "authz-policy",             "auth": ["/api/v1"],                          "tags": ["authz"]},
    "code-repository-review-service":     {"id": "code-review",              "auth": ["/v1/global-branches"],              "tags": ["code"]},
    "connector-management-service":       {"id": "connector-management",     "auth": ["/api/v1", "/data-connection"],      "tags": ["data-connection"]},
    "dataset-versioning-service":         {"id": "dataset-versioning",       "auth": ["/api/v1", "/v1"],                   "tags": ["datasets"]},
    "entity-resolution-service":          {"id": "entity-resolution",        "auth": ["/api/v1/fusion"],                   "tags": ["fusion"]},
    "federation-product-exchange-service":{"id": "federation",               "auth": ["/api/v1/marketplace", "/v1/marketplace", "/v1/products", "/api/v1/product-distribution"], "tags": ["marketplace"]},
    "iceberg-catalog-service":            {"id": "iceberg-catalog",          "auth": ["/api/v1", "/v1/iceberg-clients", "/iceberg/v1"], "tags": ["iceberg"]},
    "ingestion-replication-service":      {"id": "ingestion-replication",    "auth": ["/api/v1"],                          "tags": ["ingestion"]},
    "lineage-service":                    {"id": "lineage",                  "auth": ["/api/v1/lineage"],                  "tags": ["lineage"]},
    "llm-catalog-service":                {"id": "llm-catalog",              "auth": [],                                   "tags": ["ai"]},
    "media-sets-service":                 {"id": "media-sets",               "auth": ["/api/v1"],                          "tags": ["media"]},
    "media-transform-runtime-service":    {"id": "media-transform",          "auth": [],                                   "tags": ["media"]},
    "model-catalog-service":              {"id": "model-catalog",            "auth": ["/api/v1/model-catalog"],            "tags": ["models"]},
    "notebook-runtime-service":           {"id": "notebook-runtime",         "auth": ["/api/v1"],                          "tags": ["notebook"]},
    "notification-alerting-service":      {"id": "notification",             "auth": ["/api/v1"],                          "tags": ["notifications"]},
    "ontology-exploratory-analysis-service": {"id": "ontology-eda",          "auth": ["/api/v1"],                          "tags": ["ontology"]},
    "ontology-indexer":                   {"id": "ontology-indexer",         "auth": [],                                   "tags": ["ontology"]},
    "pipeline-build-service":             {"id": "pipeline-build",           "auth": ["/api/v1/pipeline", "/api/v1", "/v1"], "tags": ["pipelines"]},
    "reindex-coordinator-service":        {"id": "reindex-coordinator",      "auth": [],                                   "tags": ["search"]},
    "retrieval-context-service":          {"id": "retrieval-context",        "auth": [],                                   "tags": ["ai"]},
    "sdk-generation-service":             {"id": "sdk-generation",           "auth": ["/api/v1"],                          "tags": ["sdk"]},
    "solution-design-service":            {"id": "solution-design",          "auth": ["/api/v1/solution-design"],          "tags": ["solution-design"]},
    "sql-bi-gateway-service":             {"id": "sql-bi-gateway",           "auth": ["/api/v1"],                          "tags": ["bi"]},
    "telemetry-governance-service":       {"id": "telemetry-governance",     "auth": ["/api/v1"],                          "tags": ["telemetry"]},
    "tenancy-organizations-service":      {"id": "tenancy",                  "auth": ["/api/v1"],                          "tags": ["tenancy"]},
    "workflow-automation-service":        {"id": "workflow",                 "auth": ["/api/v1"],                          "tags": ["workflows"]},
    # Special config shapes (cfg.Host instead of cfg.Service.{Name,Version})
    # are handled manually after this script.
    "model-deployment-service":           {"id": "model-deployment",         "auth": ["/api/v1"],                          "tags": ["models"]},
}

CAPS_IMPORT = '\t"github.com/openfoundry/openfoundry-go/libs/capabilities"\n'

def patch(path: pathlib.Path, knob: dict) -> tuple[str, str]:
    src = path.read_text()
    if "libs/capabilities" in src:
        return ("skip", "already wired")

    # 1. Add import. Place it right after auth-middleware import or
    # right after core-models/health import. Both already exist in
    # all targeted services.
    if "libs/auth-middleware\"" in src:
        anchor = re.search(r'^(\tauthmw "github\.com/openfoundry/openfoundry-go/libs/auth-middleware"\n)', src, re.M)
    else:
        anchor = re.search(r'^(\t"github\.com/openfoundry/openfoundry-go/libs/core-models/health"\n)', src, re.M)
    if not anchor:
        # Fallback: just before observability.
        anchor = re.search(r'^(\t"github\.com/openfoundry/openfoundry-go/libs/observability"\n)', src, re.M)
    if not anchor:
        return ("error", "no import anchor")
    src = src[: anchor.end()] + CAPS_IMPORT + src[anchor.end() :]

    # 2. Insert Mount(r) after the /metrics line. The metrics line
    # comes in two flavours:
    #   r.Method(http.MethodGet, "/metrics", m.Handler())
    #   r.Method(http.MethodGet, "/metrics", deps.Metrics.Handler())
    # Sometimes wrapped in `if m != nil { … }`.
    metrics_re = re.compile(r'(^[ \t]*r\.Method\(http\.MethodGet, "/metrics",[^\n]*\n)', re.M)
    m = metrics_re.search(src)
    if not m:
        # Some files wrap it in `if m != nil { r.Method(...) }`.
        metrics_re2 = re.compile(r'(^[ \t]*if [a-zA-Z\.]+ != nil \{\n[ \t]+r\.Method\(http\.MethodGet, "/metrics",[^\n]+\n[ \t]*\}\n)', re.M)
        m = metrics_re2.search(src)
    if not m:
        return ("error", "no /metrics anchor")
    mount_block = (
        '\n\t// Capability registry — see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md (M1.1).\n'
        '\tcaps := capabilities.New(cfg.Service.Name, cfg.Service.Version)\n'
        '\tcaps.Mount(r)\n'
    )
    src = src[: m.end()] + mount_block + src[m.end() :]

    # 3. Insert ingest block before `return r` (when buildRouter helper)
    # OR before `addr := fmt.Sprintf("%s:%d", cfg.Server.Host` (inline New).
    auth_lit = "[]string{" + ", ".join(f'"{p}"' for p in knob["auth"]) + "}" if knob["auth"] else "nil"
    tags_lit = "[]string{" + ", ".join(f'"{t}"' for t in knob["tags"]) + "}"
    ingest_block = (
        '\tif _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{\n'
        f'\t\tIDPrefix:  "{knob["id"]}",\n'
        f'\t\tAuthPaths: {auth_lit},\n'
        f'\t\tTags:      {tags_lit},\n'
        '\t}); err != nil {\n'
        f'\t\tpanic("{path.parent.parent.parent.name}: capability ingest failed: " + err.Error())\n'
        '\t}\n\n'
    )
    # Prefer the bare `return r` (last occurrence inside buildRouter).
    return_re = re.compile(r'(^\treturn r\n)', re.M)
    matches = list(return_re.finditer(src))
    if matches:
        last = matches[-1]
        src = src[: last.start()] + ingest_block + src[last.start() :]
    else:
        # Fall back to addr := fmt.Sprintf line.
        addr_re = re.compile(r'(^\taddr := fmt\.Sprintf\("%s:%d",[^\n]+\n)', re.M)
        m2 = addr_re.search(src)
        if not m2:
            return ("error", "no return r / addr anchor")
        src = src[: m2.start()] + ingest_block + src[m2.start() :]

    path.write_text(src)
    return ("ok", "patched")

def main():
    report = {}
    for svc, knob in PLAN.items():
        f = ROOT / "services" / svc / "internal" / "server" / "server.go"
        if not f.exists():
            report[svc] = ("missing", str(f))
            continue
        report[svc] = patch(f, knob)
    width = max(len(s) for s in report)
    for svc, (status, msg) in sorted(report.items()):
        print(f"{status:6}  {svc:<{width}}  {msg}")
    bad = [s for s, (st, _) in report.items() if st == "error"]
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
