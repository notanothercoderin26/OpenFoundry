package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestGeopoliticaNotificationRoutingRoundTrips smoke-tests the PoC's
// notification routing YAML against the wire types:
//
//   - every subscriptions[*].template_ref resolves to a templates[*].id
//   - each subscription round-trips into a valid CreateSubscriptionRequest
//   - every channel value is a member of SubscriptionChannel
//   - the producer_marking_contract documents the actor.alert.raised
//     event so reviewers cannot quietly delete the Marcos-OFAC guarantee
//
// Drift here breaks make test rather than the operator's terminal.
func TestGeopoliticaNotificationRoutingRoundTrips(t *testing.T) {
	t.Parallel()

	repoRoot, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	path := filepath.Join(repoRoot, "PoC/geopolitica/assets/notification-routing-geopolitica.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	var doc struct {
		NotificationRouting struct {
			Templates []struct {
				ID      string `yaml:"id"`
				Subject string `yaml:"subject"`
				Body    string `yaml:"body"`
				Mode    string `yaml:"mode"`
			} `yaml:"templates"`
			Subscriptions []struct {
				ID               string `yaml:"id"`
				EventType        string `yaml:"event_type"`
				Channel          string `yaml:"channel"`
				Target           string `yaml:"target"`
				TemplateRef      string `yaml:"template_ref"`
				SLASeconds       any    `yaml:"sla_seconds"`
				EscalationTarget string `yaml:"escalation_target"`
				Enabled          bool   `yaml:"enabled"`
			} `yaml:"subscriptions"`
			ProducerMarkingContract []struct {
				EventType string `yaml:"event_type"`
				Filter    string `yaml:"filter"`
			} `yaml:"producer_marking_contract"`
		} `yaml:"notification_routing"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("yaml: %v", err)
	}
	nr := doc.NotificationRouting

	if len(nr.Templates) < 3 {
		t.Fatalf("want ≥ 3 templates, got %d", len(nr.Templates))
	}
	templates := map[string]bool{}
	for i, tmpl := range nr.Templates {
		if tmpl.ID == "" {
			t.Fatalf("templates[%d]: empty id", i)
		}
		if templates[tmpl.ID] {
			t.Fatalf("templates[%d]: duplicate id %q", i, tmpl.ID)
		}
		templates[tmpl.ID] = true
	}

	if got := len(nr.Subscriptions); got != 5 {
		t.Fatalf("want 5 subscriptions, got %d", got)
	}
	seenIDs := map[string]bool{}
	for i, s := range nr.Subscriptions {
		if s.ID == "" {
			t.Fatalf("subscriptions[%d]: empty id", i)
		}
		if seenIDs[s.ID] {
			t.Fatalf("subscriptions[%d]: duplicate id %q", i, s.ID)
		}
		seenIDs[s.ID] = true
		if s.EventType == "" {
			t.Fatalf("subscriptions %q: empty event_type", s.ID)
		}
		ch := SubscriptionChannel(s.Channel)
		if !ch.IsValid() {
			t.Fatalf("subscriptions %q: channel %q is not in the enum", s.ID, s.Channel)
		}
		if s.Target == "" {
			t.Fatalf("subscriptions %q: empty target", s.ID)
		}
		if !templates[s.TemplateRef] {
			t.Fatalf("subscriptions %q: template_ref %q does not resolve to any templates[*].id",
				s.ID, s.TemplateRef)
		}

		// Round-trip into the wire shape. The register script
		// inlines the matching template body; the smoke test just
		// proves the type-level shape is compatible.
		req := CreateSubscriptionRequest{
			EventType: s.EventType,
			Channel:   ch,
			Target:    s.Target,
			Template:  json.RawMessage(`{"placeholder": true}`),
		}
		body, err := json.Marshal(req)
		if err != nil {
			t.Fatalf("subscriptions %q: marshal CreateSubscriptionRequest: %v", s.ID, err)
		}
		var back CreateSubscriptionRequest
		if err := json.Unmarshal(body, &back); err != nil {
			t.Fatalf("subscriptions %q: re-unmarshal: %v", s.ID, err)
		}
		if back.Channel != ch || back.Target != s.Target {
			t.Fatalf("subscriptions %q: round-trip mismatch", s.ID)
		}
	}

	// Marcos-OFAC contract guard — the producer_marking_contract MUST
	// describe actor.alert.raised so a future careless edit cannot
	// quietly remove the Marcos-not-on-OFAC-alerts guarantee that
	// underpins demo UC-7.
	wantMarkingRule := false
	for _, c := range nr.ProducerMarkingContract {
		if c.EventType == "actor.alert.raised" && strings.Contains(strings.ToLower(c.Filter), "marcos") && strings.Contains(strings.ToUpper(c.Filter), "MARKING:OFAC") {
			wantMarkingRule = true
			break
		}
	}
	if !wantMarkingRule {
		t.Fatalf("producer_marking_contract MUST document the Marcos-OFAC filter for actor.alert.raised (UC-7 acceptance)")
	}

	// Sanity: at least one in_app, one email, one webhook
	// subscription so the demo can show fan-out across channels.
	wantChannels := map[string]bool{"in_app": false, "email": false, "webhook": false}
	for _, s := range nr.Subscriptions {
		if _, ok := wantChannels[s.Channel]; ok {
			wantChannels[s.Channel] = true
		}
	}
	for ch, seen := range wantChannels {
		if !seen {
			t.Fatalf("subscriptions missing a channel=%s row (demo expects fan-out across in_app + email + webhook)", ch)
		}
	}
}
