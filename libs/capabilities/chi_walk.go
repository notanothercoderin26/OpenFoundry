package capabilities

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
)

// IngestOptions controls how [Registry.IngestChiRoutes] synthesises
// [Capability] entries from an existing chi router.
//
// The helper exists for services that mount large surfaces via
// pre-existing `Mount(r chi.Router, …)` style functions (see e.g.
// `libs/ontology-kernel/handlers/actions.Mount`) and would otherwise
// require an invasive refactor to register every route through
// [Registry.Register] one by one. After the router has been built,
// `IngestChiRoutes` walks it and adds the routes the registry does
// not already know about — so hand-curated entries take precedence.
//
// The synthesised capabilities are conservative:
//
//   - `Stable` defaults to false; promote the ones you trust by
//     re-registering them before the call (curated > synthesised).
//   - `RequiresAuth` is taken from the matching prefix in `AuthPaths`.
//   - `Summary` is left empty: agents should rely on the ID/path.
type IngestOptions struct {
	// IDPrefix is prepended (with a dot) to every synthesised ID.
	// Required, must not be empty.
	IDPrefix string
	// PathPrefix is prepended to every walked path so that paths
	// rooted at a chi.Route subrouter still surface their absolute
	// URL in the catalog (e.g. "/api/v1/ontology"). Empty means
	// "router walked is already absolute".
	PathPrefix string
	// AuthPaths lists path prefixes whose synthesised capabilities
	// must be tagged `RequiresAuth = true`. Order does not matter:
	// any matching prefix flags the capability.
	AuthPaths []string
	// Tags is appended verbatim to every synthesised capability.
	Tags []string
}

// IngestChiRoutes walks `routes` and adds a [Capability] for each
// (method, pattern) pair that is not already registered. Returns the
// number of newly added capabilities.
//
// Walk failures are surfaced as errors; ID validation errors
// short-circuit the walk and bubble up so misconfigurations are
// caught at startup.
func (rg *Registry) IngestChiRoutes(routes chi.Routes, opts IngestOptions) (int, error) {
	if strings.TrimSpace(opts.IDPrefix) == "" {
		return 0, fmt.Errorf("%w: IngestOptions.IDPrefix is required", ErrInvalidCapability)
	}

	rg.mu.RLock()
	known := make(map[string]struct{}, len(rg.items))
	for _, c := range rg.items {
		known[capKey(c.Method, c.Path)] = struct{}{}
	}
	rg.mu.RUnlock()

	added := 0
	walkErr := chi.Walk(routes, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		// chi appends "/*" to subrouter mounts; trim it so the path
		// is the canonical pattern an agent would call.
		path := opts.PathPrefix + route
		path = strings.TrimSuffix(path, "/*")
		if path == "" {
			path = "/"
		}
		if _, ok := known[capKey(method, path)]; ok {
			return nil
		}
		cap := Capability{
			ID:           opts.IDPrefix + "." + synthID(method, path),
			Method:       method,
			Path:         path,
			Stable:       false,
			RequiresAuth: matchesAnyPrefix(path, opts.AuthPaths),
			Tags:         append([]string(nil), opts.Tags...),
		}
		cap.Service = rg.service
		if err := cap.Validate(); err != nil {
			return fmt.Errorf("ingest %s %s: %w", method, path, err)
		}
		rg.mu.Lock()
		if _, exists := rg.items[cap.ID]; !exists {
			rg.items[cap.ID] = cap
			added++
		}
		rg.mu.Unlock()
		return nil
	})
	if walkErr != nil {
		return added, walkErr
	}
	return added, nil
}

func capKey(method, path string) string { return strings.ToUpper(method) + " " + path }

// synthID turns "GET /api/v1/ontology/actions/{id}/execute" into
// "actions.id.execute.post"-ish stable identifier. Path params keep
// their name so two routes that differ only in verb stay disjoint.
var nonIDChars = regexp.MustCompile(`[^a-zA-Z0-9]+`)

func synthID(method, path string) string {
	cleaned := strings.Trim(path, "/")
	cleaned = strings.ReplaceAll(cleaned, "{", "")
	cleaned = strings.ReplaceAll(cleaned, "}", "")
	cleaned = nonIDChars.ReplaceAllString(cleaned, ".")
	cleaned = strings.Trim(cleaned, ".")
	if cleaned == "" {
		cleaned = "root"
	}
	return cleaned + "." + strings.ToLower(method)
}

func matchesAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if p != "" && strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}
