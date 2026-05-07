package productdistribution

import (
	"fmt"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// ValidateContract is the 1:1 port of governance::validate_contract from Rust.
// It enforces the lifecycle invariants for sharing contracts: required name,
// query template and replication mode; positive max-rows / retention; allowed
// status; expiry-in-future for non-expired contracts; and an authenticated
// peer + at least one allowed purpose for active contracts. The peer argument
// is consulted only when status == "active".
func ValidateContract(
	peer *models.PeerOrganization,
	name string,
	queryTemplate string,
	allowedPurposes []string,
	maxRowsPerQuery int64,
	replicationMode string,
	retentionDays int32,
	status string,
	expiresAt time.Time,
	now time.Time,
) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("contract name is required")
	}
	if strings.TrimSpace(queryTemplate) == "" {
		return fmt.Errorf("query template is required")
	}
	if maxRowsPerQuery <= 0 {
		return fmt.Errorf("max_rows_per_query must be greater than zero")
	}
	if retentionDays <= 0 {
		return fmt.Errorf("retention_days must be greater than zero")
	}
	if !matchesContractStatus(status) {
		return fmt.Errorf("unsupported contract status '%s'", status)
	}
	if err := ensureValidReplicationMode(replicationMode); err != nil {
		return err
	}
	if status != "expired" && !expiresAt.After(now) {
		return fmt.Errorf("contract expiry must be in the future")
	}
	if status == "active" {
		if len(allowedPurposes) == 0 {
			return fmt.Errorf("active contracts require at least one allowed purpose")
		}
		if err := ensurePeerAuthenticated(peer, "contract peer"); err != nil {
			return err
		}
	}
	return nil
}

func ensurePeerAuthenticated(peer *models.PeerOrganization, label string) error {
	if peer == nil || peer.Status != authenticatedPeerStatus {
		return fmt.Errorf("%s must be authenticated", label)
	}
	return nil
}

func ensureValidReplicationMode(mode string) error {
	if _, ok := replicationRank(mode); !ok {
		return fmt.Errorf("unsupported replication mode '%s'", mode)
	}
	return nil
}

func matchesContractStatus(status string) bool {
	switch status {
	case "draft", "active", "suspended", "expired":
		return true
	}
	return false
}
