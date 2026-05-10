// Build/version metadata helpers.
//
// Capabilities exposes a service's build provenance under
// `GET /_meta/version` so an agent can correlate behaviour against
// a specific commit without scraping logs. Information is sourced
// from `runtime/debug.ReadBuildInfo` (populated automatically by
// `go build`) and from the `version` argument passed to [New], which
// callers typically set via `-ldflags "-X main.version=..."`.
//
// See AGENT-CAPABILITIES-ROADMAP.md (Milestone M1.3).
package capabilities

import (
	"encoding/json"
	"net/http"
	"runtime"
	"runtime/debug"
)

// Version is the JSON wire shape of `GET /_meta/version`.
//
// Fields beyond `service` / `version` are best-effort — they may be
// empty when the binary was built without VCS info (e.g. `go run`).
type Version struct {
	SchemaVersion int    `json:"schema_version"`
	Service       string `json:"service"`
	Version       string `json:"version,omitempty"`
	GitSHA        string `json:"git_sha,omitempty"`
	GitDirty      bool   `json:"git_dirty,omitempty"`
	BuiltAt       string `json:"built_at,omitempty"`
	GoVersion     string `json:"go_version,omitempty"`
	OS            string `json:"os,omitempty"`
	Arch          string `json:"arch,omitempty"`
}

// Version returns the registry's current build metadata. Safe to call
// from any goroutine; the underlying [debug.ReadBuildInfo] call is
// itself thread-safe and the result never changes for a given
// process.
func (rg *Registry) Version() Version {
	v := Version{
		SchemaVersion: SchemaVersion,
		Service:       rg.service,
		Version:       rg.version,
		GoVersion:     runtime.Version(),
		OS:            runtime.GOOS,
		Arch:          runtime.GOARCH,
	}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return v
	}
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			v.GitSHA = s.Value
		case "vcs.modified":
			v.GitDirty = s.Value == "true"
		case "vcs.time":
			v.BuiltAt = s.Value
		}
	}
	return v
}

// versionHandler serves `GET /_meta/version`. Always succeeds — there
// is no failure mode for reading process-local build metadata.
func (rg *Registry) versionHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(rg.Version())
	})
}
