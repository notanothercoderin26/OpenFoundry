package proxy_test

import (
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/edge-gateway-service/internal/config"
)

// upstreamServiceMapping pins each gateway upstream slot to the
// in-repo service directory whose `main.go` is expected to serve it.
//
// Several upstreams point at the same binary (per ADR-0030's
// "consolidate retired services into the surviving owner" rule); the
// table records each mapping explicitly so a future port change in a
// merged service can't drift silently.
//
// Upstreams that don't yet have a Go service in `services/` (legacy
// Rust slices not ported, or future scaffolds) are listed in the test
// as "unmapped" so the assertion that *every* UpstreamURLs field is
// accounted for keeps that list honest.
var upstreamServiceMapping = []struct {
	field       string // name of the field on config.UpstreamURLs
	serviceDir  string // dir under services/ that owns this upstream
	expectedPort uint16 // port parseUint16(os.Getenv("PORT"), …) defaults to
}{
	{"IdentityFederation", "identity-federation-service", 50112},
	{"AuthorizationPolicy", "authorization-policy-service", 50115},
	{"TenancyOrganizations", "tenancy-organizations-service", 50113},
	{"ConnectorManagement", "connector-management-service", 50088},
	{"DataConnector", "connector-management-service", 50088},
	{"IngestionReplication", "ingestion-replication-service", 50120},
	{"DatasetVersioning", "dataset-versioning-service", 50117},
	{"IcebergCatalog", "iceberg-catalog-service", 50118},
	{"Query", "sql-bi-gateway-service", 50133},
	{"PipelineBuild", "pipeline-build-service", 50081},
	{"Lineage", "lineage-service", 50083},
	{"OntologyDefinition", "ontology-definition-service", 50122},
	{"Ontology", "ontology-definition-service", 50122},
	{"ObjectDatabase", "object-database-service", 50125},
	{"OntologyQuery", "ontology-query-service", 50123},
	{"OntologyActions", "ontology-actions-service", 50106},
	{"Workflow", "workflow-automation-service", 50137},
	{"Notebook", "notebook-runtime-service", 50134},
	{"Notification", "notification-alerting-service", 50114},
	{"ApplicationComposition", "application-composition-service", 50118},
	{"ML", "model-catalog-service", 50085},
	{"ModelCatalog", "model-catalog-service", 50085},
	{"ModelDeployment", "model-deployment-service", 50086},
	{"AI", "agent-runtime-service", 50127},
	{"AgentRuntime", "agent-runtime-service", 50127},
	{"LLMCatalog", "llm-catalog-service", 50095},
	{"RetrievalContext", "retrieval-context-service", 50098},
	{"AIEvaluation", "ai-evaluation-service", 50075},
	{"EntityResolution", "entity-resolution-service", 50058},
	{"CodeRepo", "code-repository-review-service", 50155},
	{"FederationProductExchange", "federation-product-exchange-service", 50126},
	{"AuditCompliance", "audit-compliance-service", 50116},
	{"Audit", "audit-compliance-service", 50116},
	{"CheckpointsPurpose", "audit-compliance-service", 50116},
	{"TelemetryGovernance", "telemetry-governance-service", 50153},
}

// upstreamsWithoutGoService lists UpstreamURLs fields for which no
// service directory exists yet (stubs that store `addr: :8080` in
// config.yaml, or legacy Rust slices not ported). Listing them here
// instead of in upstreamServiceMapping keeps the "every field is
// accounted for" check from drifting.
var upstreamsWithoutGoService = map[string]struct{}{
	"OauthIntegration":       {},
	"SessionGovernance":      {},
	"SecurityGovernance":     {},
	"Cipher":                 {}, // stub, addr-based config
	"VirtualTable":           {},
	"DataAssetCatalog":       {},
	"DatasetQuality":         {},
	"PipelineAuthoring":      {},
	"PipelineSchedule":       {},
	"ApplicationCuration":    {},
	"ModelEvaluation":        {},
	"ModelServing":           {},
	"ModelInferenceHistory":  {},
	"DocumentReporting":      {},
	"Report":                 {}, // stub, addr-based config
	"GeospatialIntelligence": {},
	"GlobalBranch":           {}, // stub, addr-based config
	"KnowledgeIndex":         {}, // stub, addr-based config
	"MarketplaceCatalog":     {},
	"ProductDistribution":    {},
	"NetworkBoundary":        {}, // stub, addr-based config
	"RetentionPolicy":        {},
	"LineageDeletion":        {},
	"SDS":                    {},
	"Nexus":                  {},
}

// portDefaultRe captures the integer literal in
// `parseUint16(os.Getenv("PORT"), 50118)`.
var portDefaultRe = regexp.MustCompile(`parseUint16\(os\.Getenv\("PORT"\),\s*(\d+)\s*\)`)

// portDefaultConstRe matches the connector-management-service shape:
// `parseUint16("PORT", os.Getenv("PORT"), DefaultPort)` where the
// default is held in a package-level const declared as
// `DefaultPort uint16 = 50088`.
var portDefaultConstRe = regexp.MustCompile(
	`parseUint16\("PORT",\s*os\.Getenv\("PORT"\),\s*(\w+)\s*\)`,
)
var portConstDeclRe = regexp.MustCompile(`(?m)^\s*(\w+)\s+uint16\s*=\s*(\d+)\s*$`)

// repoRoot returns the path to the repo root from the test working dir
// (`services/edge-gateway-service/internal/proxy`).
func repoRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	require.NoError(t, err)
	return root
}

// servicePortFromConfig parses
// `services/<dir>/internal/config/config.go` and returns the integer
// literal passed as the parseUint16("PORT", …) fallback. Supports both
// the inline-literal shape and the named-const shape (see the regex
// declarations above).
func servicePortFromConfig(t *testing.T, root, dir string) uint16 {
	t.Helper()
	cfgPath := filepath.Join(root, "services", dir, "internal", "config", "config.go")
	body, err := os.ReadFile(cfgPath)
	require.NoErrorf(t, err, "reading %s", cfgPath)
	src := string(body)

	if m := portDefaultRe.FindStringSubmatch(src); len(m) == 2 {
		v, err := strconv.ParseUint(m[1], 10, 16)
		require.NoErrorf(t, err, "parsing port literal %q from %s", m[1], cfgPath)
		return uint16(v)
	}
	if m := portDefaultConstRe.FindStringSubmatch(src); len(m) == 2 {
		// Resolve the const declaration `<name> uint16 = N`.
		for _, c := range portConstDeclRe.FindAllStringSubmatch(src, -1) {
			if c[1] == m[1] {
				v, err := strconv.ParseUint(c[2], 10, 16)
				require.NoErrorf(t, err,
					"parsing const %s = %q from %s", c[1], c[2], cfgPath)
				return uint16(v)
			}
		}
		t.Fatalf("could not resolve const %q in %s", m[1], cfgPath)
	}
	t.Fatalf("no parseUint16 PORT default in %s", cfgPath)
	return 0
}

// portFromURL extracts the port from a `host:port` URL string. Returns
// 0 when no port is present.
func portFromURL(t *testing.T, u string) uint16 {
	t.Helper()
	idx := strings.LastIndex(u, ":")
	require.Greaterf(t, idx, -1, "no port in URL %q", u)
	v, err := strconv.ParseUint(u[idx+1:], 10, 16)
	require.NoErrorf(t, err, "parsing port from URL %q", u)
	return uint16(v)
}

// TestUpstreamPortsMatchService asserts that every routed upstream in
// DefaultUpstreams lines up with the destination service's actual
// `parseUint16("PORT", N)` fallback in its main.go's config package.
//
// It catches three classes of drift that bit us before: (a) the
// gateway points at a port no service listens on, (b) the service
// renames or moves but the gateway routes still target the old port,
// (c) someone bumps the service default without updating the gateway.
func TestUpstreamPortsMatchService(t *testing.T) {
	t.Parallel()
	root := repoRoot(t)
	defaults := config.DefaultUpstreams()
	defaultsV := reflect.ValueOf(defaults)

	for _, m := range upstreamServiceMapping {
		m := m
		t.Run(m.field, func(t *testing.T) {
			t.Parallel()

			// (a) service-dir exists with the expected config.go.
			cfgPath := filepath.Join(root, "services", m.serviceDir,
				"internal", "config", "config.go")
			_, err := os.Stat(cfgPath)
			require.NoErrorf(t, err,
				"%s upstream expects services/%s/internal/config/config.go",
				m.field, m.serviceDir)

			// (b) parseUint16 default in the service config matches the
			// expected port.
			got := servicePortFromConfig(t, root, m.serviceDir)
			assert.Equalf(t, m.expectedPort, got,
				"services/%s default PORT mismatch — table says %d, config.go says %d",
				m.serviceDir, m.expectedPort, got)

			// (c) gateway DefaultUpstreams[field] resolves to the same port.
			fv := defaultsV.FieldByName(m.field)
			require.Truef(t, fv.IsValid(),
				"UpstreamURLs has no field %q (upstreamServiceMapping out of date)",
				m.field)
			require.Equalf(t, reflect.String, fv.Kind(),
				"UpstreamURLs.%s is not a string", m.field)
			gotURLPort := portFromURL(t, fv.String())
			assert.Equalf(t, m.expectedPort, gotURLPort,
				"DefaultUpstreams.%s = %q, expected port %d",
				m.field, fv.String(), m.expectedPort)
		})
	}
}

// TestUpstreamFieldsAccountedFor ensures every UpstreamURLs field is
// either tied to a real service (upstreamServiceMapping) or explicitly
// parked in upstreamsWithoutGoService. A new field added to the struct
// without a routing decision will fail this test.
func TestUpstreamFieldsAccountedFor(t *testing.T) {
	t.Parallel()
	mapped := map[string]struct{}{}
	for _, m := range upstreamServiceMapping {
		mapped[m.field] = struct{}{}
	}
	tp := reflect.TypeOf(config.UpstreamURLs{})
	var missing []string
	for i := 0; i < tp.NumField(); i++ {
		name := tp.Field(i).Name
		if _, ok := mapped[name]; ok {
			continue
		}
		if _, ok := upstreamsWithoutGoService[name]; ok {
			continue
		}
		missing = append(missing, name)
	}
	require.Emptyf(t, missing,
		"UpstreamURLs fields without a routing decision: %s — add to "+
			"upstreamServiceMapping or upstreamsWithoutGoService",
		strings.Join(missing, ", "))
}

// TestRetiredUpstreamsAreGone asserts the ADR-0030 retirements stay
// retired: AppBuilder, Approvals, ConversationState, and Streaming
// must not reappear on UpstreamURLs. If a future PR re-adds one of
// these without paving the routing path, this test breaks loudly.
func TestRetiredUpstreamsAreGone(t *testing.T) {
	t.Parallel()
	tp := reflect.TypeOf(config.UpstreamURLs{})
	for _, retired := range []string{"AppBuilder", "Approvals", "ConversationState", "Streaming"} {
		_, ok := tp.FieldByName(retired)
		assert.Falsef(t, ok,
			"UpstreamURLs.%s reappeared — ADR-0030 retired this upstream; "+
				"reintroducing it needs an ADR update and a routing entry",
			retired)
	}
}
