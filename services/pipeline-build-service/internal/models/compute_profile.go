package models

import "time"

// ComputeProfile is the wire shape for a pipeline build compute preset.
// Mirrors Foundry's "Build settings" Default / Medium / Large profiles.
// Profiles are read-only in this iteration; admin CRUD lands later.
type ComputeProfile struct {
	Slug             string    `json:"slug"`
	DisplayName      string    `json:"display_name"`
	Description      string    `json:"description"`
	ExecutorCores    int       `json:"executor_cores"`
	ExecutorMemoryGB float64   `json:"executor_memory_gb"`
	IsDefault        bool      `json:"is_default"`
	CreatedAt        time.Time `json:"created_at"`
}
