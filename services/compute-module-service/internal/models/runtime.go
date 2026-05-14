package models

import (
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// ContainerRole identifies whether the container is the module's main
// entrypoint or a sidecar client (multi-container replicas land with
// CM.23; for CM.4 the single-container case is the only one that
// reaches the runtime).
type ContainerRole string

const (
	ContainerRoleEntrypoint ContainerRole = "entrypoint"
	ContainerRoleClient     ContainerRole = "client"
)

// IsValid reports whether c is one of the canonical roles.
func (c ContainerRole) IsValid() bool {
	return c == ContainerRoleEntrypoint || c == ContainerRoleClient
}

// PortProtocol enumerates the transport protocols a container port
// can advertise. "http" is treated as TCP at the transport layer but
// signals to the gateway that L7 routing/probing is allowed.
type PortProtocol string

const (
	PortTCP  PortProtocol = "tcp"
	PortUDP  PortProtocol = "udp"
	PortHTTP PortProtocol = "http"
)

// IsValid reports whether p is one of the canonical protocols.
func (p PortProtocol) IsValid() bool {
	switch p {
	case PortTCP, PortUDP, PortHTTP:
		return true
	}
	return false
}

// ContainerPort describes one exposed port on the container's runtime
// configuration. Image-level "exposed_ports" (CM.3) advertise *which*
// ports the binary listens on; this struct adds protocol + name so
// the gateway can route requests and probes correctly.
type ContainerPort struct {
	Name     string       `json:"name"`
	Port     int          `json:"port"`
	Protocol PortProtocol `json:"protocol"`
}

// ResourceProfile is the per-container resource allocation. CM.22
// elaborates this into a first-class compute_module_resource_profile;
// here it is embedded so a builder can set defaults during initial
// runtime configuration.
type ResourceProfile struct {
	CPUMillicores    int    `json:"cpu_millicores,omitempty"`
	MemoryMiB        int    `json:"memory_mib,omitempty"`
	GPUUnits         int    `json:"gpu_units,omitempty"`
	EphemeralDiskMiB int    `json:"ephemeral_disk_mib,omitempty"`
	ResourceQueue    string `json:"resource_queue,omitempty"`
}

// LoggingConfig describes which streams/files OpenFoundry should
// capture into compute_module_runtime_log records.
type LoggingConfig struct {
	StdoutEnabled bool     `json:"stdout_enabled"`
	StderrEnabled bool     `json:"stderr_enabled"`
	FilePaths     []string `json:"file_paths,omitempty"`
	RetentionDays int      `json:"retention_days,omitempty"`
}

// HealthConfig describes how the runtime should probe the container.
// Empty paths disable the corresponding probe.
type HealthConfig struct {
	ReadinessPath        string `json:"readiness_path,omitempty"`
	ReadinessPort        int    `json:"readiness_port,omitempty"`
	LivenessPath         string `json:"liveness_path,omitempty"`
	LivenessPort         int    `json:"liveness_port,omitempty"`
	HeartbeatIntervalSec int    `json:"heartbeat_interval_sec,omitempty"`
	StartupGraceSec      int    `json:"startup_grace_sec,omitempty"`
}

// SecretBinding is a named slot through which container env/file
// mounts resolve raw secret material at runtime. The actual secret
// material never reaches this service — `SecretRef` is an opaque
// identifier owned by the security-governance-service (CM.32).
type SecretBinding struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	SecretRef   string `json:"secret_ref"`
}

// SecretValueSource lets an EnvVar pull its materialised value from a
// SecretBinding at runtime instead of carrying a literal Value. When
// set, EnvVar.Value must be empty.
type SecretValueSource struct {
	BindingName string `json:"binding_name"`
	Key         string `json:"key,omitempty"`
}

// EnvVar is one environment variable on the container. Either Value
// (literal) or ValueFromSecret (resolved at runtime) is set, never
// both. When the policy redacts a literal value, the runtime config
// keeps Name + Redacted=true and replaces Value with "***".
type EnvVar struct {
	Name            string             `json:"name"`
	Value           string             `json:"value,omitempty"`
	ValueFromSecret *SecretValueSource `json:"value_from_secret,omitempty"`
	Redacted        bool               `json:"redacted,omitempty"`
}

// RuntimeConfig is the per-container runtime configuration attached
// to a Compute Module (checklist CM.4). It does not include the image
// itself — that's CM.3 — only the runtime overrides and policy
// metadata used to launch one replica.
type RuntimeConfig struct {
	Command        []string               `json:"command,omitempty"`
	Args           []string               `json:"args,omitempty"`
	Env            []EnvVar               `json:"env,omitempty"`
	Ports          []ContainerPort        `json:"ports,omitempty"`
	Resources      *ResourceProfile       `json:"resources,omitempty"`
	Logging        *LoggingConfig         `json:"logging,omitempty"`
	Health         *HealthConfig          `json:"health,omitempty"`
	Role           ContainerRole          `json:"role"`
	SecretBindings []SecretBinding        `json:"secret_bindings,omitempty"`
	Findings       []CompatibilityFinding `json:"findings,omitempty"`
}

// SetRuntimeConfigParams is the wire shape accepted by
// Repository.SetRuntimeConfig.
type SetRuntimeConfigParams struct {
	Config RuntimeConfig
	Actor  uuid.UUID
}

const (
	maxEnvVars            = 256
	maxEnvNameRunes       = 256
	maxEnvValueRunes      = 32 * 1024
	maxContainerPorts     = 32
	maxPortNameRunes      = 64
	maxLogFilePaths       = 16
	maxLogFilePathRunes   = 512
	maxResourceQueueRunes = 128
	maxSecretBindings     = 64
	maxSecretNameRunes    = 64
)

// envNameOK enforces the C/POSIX-style env variable name grammar:
// `[A-Za-z_][A-Za-z0-9_]*`. We keep this strict so downstream runtimes
// (Linux, distroless) don't have to revalidate.
func envNameOK(name string) bool {
	if name == "" {
		return false
	}
	for i, r := range name {
		switch {
		case r == '_':
			continue
		case 'A' <= r && r <= 'Z', 'a' <= r && r <= 'z':
			continue
		case '0' <= r && r <= '9':
			if i == 0 {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// ValidateStructure runs cheap structural checks on the runtime
// config: presence, length, allowed alphabet, internal consistency
// (e.g. EnvVar.Value xor EnvVar.ValueFromSecret). Semantic findings
// (secret detection, redaction) are produced by the runtime policy.
func (c *RuntimeConfig) ValidateStructure() error {
	if c == nil {
		return invalid("runtime_config", "missing payload")
	}
	if !c.Role.IsValid() {
		return invalid("role", `must be "entrypoint" or "client"`)
	}
	if len(c.Env) > maxEnvVars {
		return invalid("env", "exceeds 256 entries")
	}
	envSeen := make(map[string]struct{}, len(c.Env))
	for i := range c.Env {
		ev := c.Env[i]
		if !envNameOK(ev.Name) {
			return invalid("env", "name must match [A-Za-z_][A-Za-z0-9_]*: "+ev.Name)
		}
		if utf8.RuneCountInString(ev.Name) > maxEnvNameRunes {
			return invalid("env", "name exceeds 256 characters")
		}
		if _, dup := envSeen[ev.Name]; dup {
			return invalid("env", "duplicate env name: "+ev.Name)
		}
		envSeen[ev.Name] = struct{}{}
		if utf8.RuneCountInString(ev.Value) > maxEnvValueRunes {
			return invalid("env", "value exceeds 32 KiB")
		}
		if ev.ValueFromSecret != nil && ev.Value != "" {
			return invalid("env", "value and value_from_secret are mutually exclusive: "+ev.Name)
		}
		if ev.ValueFromSecret != nil && strings.TrimSpace(ev.ValueFromSecret.BindingName) == "" {
			return invalid("env", "value_from_secret.binding_name must not be empty: "+ev.Name)
		}
	}
	if len(c.Ports) > maxContainerPorts {
		return invalid("ports", "exceeds 32 entries")
	}
	portSeen := make(map[int]struct{}, len(c.Ports))
	portNameSeen := make(map[string]struct{}, len(c.Ports))
	for i := range c.Ports {
		p := c.Ports[i]
		if p.Port < 1 || p.Port > 65535 {
			return invalid("ports", "port must be in 1..65535")
		}
		if !p.Protocol.IsValid() {
			return invalid("ports", `protocol must be "tcp", "udp", or "http"`)
		}
		if strings.TrimSpace(p.Name) == "" {
			return invalid("ports", "name must not be empty")
		}
		if utf8.RuneCountInString(p.Name) > maxPortNameRunes {
			return invalid("ports", "name exceeds 64 characters")
		}
		if _, dup := portSeen[p.Port]; dup {
			return invalid("ports", "duplicate port number")
		}
		if _, dup := portNameSeen[p.Name]; dup {
			return invalid("ports", "duplicate port name: "+p.Name)
		}
		portSeen[p.Port] = struct{}{}
		portNameSeen[p.Name] = struct{}{}
	}
	if c.Resources != nil {
		if c.Resources.CPUMillicores < 0 || c.Resources.MemoryMiB < 0 ||
			c.Resources.GPUUnits < 0 || c.Resources.EphemeralDiskMiB < 0 {
			return invalid("resources", "values must be non-negative")
		}
		if utf8.RuneCountInString(c.Resources.ResourceQueue) > maxResourceQueueRunes {
			return invalid("resources", "resource_queue exceeds 128 characters")
		}
	}
	if c.Logging != nil {
		if len(c.Logging.FilePaths) > maxLogFilePaths {
			return invalid("logging", "exceeds 16 file paths")
		}
		for _, p := range c.Logging.FilePaths {
			if !strings.HasPrefix(p, "/") {
				return invalid("logging", "file path must be absolute: "+p)
			}
			if utf8.RuneCountInString(p) > maxLogFilePathRunes {
				return invalid("logging", "file path exceeds 512 characters")
			}
		}
		if c.Logging.RetentionDays < 0 {
			return invalid("logging", "retention_days must be non-negative")
		}
	}
	if c.Health != nil {
		for label, path := range map[string]string{"readiness_path": c.Health.ReadinessPath, "liveness_path": c.Health.LivenessPath} {
			if path != "" && !strings.HasPrefix(path, "/") {
				return invalid(label, "must be an absolute path")
			}
		}
		if c.Health.HeartbeatIntervalSec < 0 || c.Health.StartupGraceSec < 0 {
			return invalid("health", "intervals must be non-negative")
		}
	}
	if len(c.SecretBindings) > maxSecretBindings {
		return invalid("secret_bindings", "exceeds 64 entries")
	}
	bindingSeen := make(map[string]struct{}, len(c.SecretBindings))
	for i := range c.SecretBindings {
		b := c.SecretBindings[i]
		name := strings.TrimSpace(b.Name)
		if name == "" {
			return invalid("secret_bindings", "name must not be empty")
		}
		if utf8.RuneCountInString(name) > maxSecretNameRunes {
			return invalid("secret_bindings", "name exceeds 64 characters")
		}
		if _, dup := bindingSeen[name]; dup {
			return invalid("secret_bindings", "duplicate name: "+name)
		}
		bindingSeen[name] = struct{}{}
		if strings.TrimSpace(b.SecretRef) == "" {
			return invalid("secret_bindings", "secret_ref must not be empty for "+name)
		}
		c.SecretBindings[i].Name = name
	}
	// Cross-check value_from_secret bindings against declared bindings.
	for _, ev := range c.Env {
		if ev.ValueFromSecret == nil {
			continue
		}
		if _, ok := bindingSeen[ev.ValueFromSecret.BindingName]; !ok {
			return invalid("env", "value_from_secret references unknown binding: "+ev.ValueFromSecret.BindingName)
		}
	}
	return nil
}
