package models

import "testing"

func TestBuildConnectorCapabilityPacks_CoversAllRequiredFamilies(t *testing.T) {
	packs := BuildConnectorCapabilityPacks()
	required := []string{
		"postgresql",
		"mssql",
		"oracle",
		"db2",
		"snowflake",
		"bigquery",
		"databricks",
		"s3",
		"onelake",
		"abfs",
		"gcs",
		"sftp",
		"kafka",
		"kinesis",
		"streaming_sqs",
		"streaming_pubsub",
		"rest_api",
		"foundry_to_foundry",
	}
	got := map[string]bool{}
	for _, p := range packs {
		got[p.ConnectorType] = true
	}
	for _, want := range required {
		if !got[want] {
			t.Fatalf("missing capability pack for %s", want)
		}
	}
}

func TestRelationalPacksDeclareCdc(t *testing.T) {
	for _, connectorType := range []string{"postgresql", "mssql", "oracle", "db2"} {
		pack := ConnectorCapabilityPackFor(connectorType)
		if pack == nil {
			t.Fatalf("expected pack for %s", connectorType)
		}
		if !pack.Capabilities.CdcSync {
			t.Fatalf("%s should declare cdc_sync", connectorType)
		}
		if pack.CdcInputKind != "relational_connector" {
			t.Fatalf("%s should be relational_connector, got %s", connectorType, pack.CdcInputKind)
		}
		rules := pack.ValidationRulesForCapability("cdc_sync")
		if len(rules) == 0 {
			t.Fatalf("%s should publish CDC validation rules", connectorType)
		}
	}
}

func TestObjectStorePacksDeclareMedia(t *testing.T) {
	for _, connectorType := range []string{"s3", "onelake", "abfs"} {
		pack := ConnectorCapabilityPackFor(connectorType)
		if pack == nil {
			t.Fatalf("missing pack for %s", connectorType)
		}
		if !pack.Capabilities.MediaSync {
			t.Fatalf("%s should declare media_sync (SDC.41 supported connector)", connectorType)
		}
		if !pack.Capabilities.FileSync || !pack.Capabilities.FileExport {
			t.Fatalf("%s should declare file_sync and file_export", connectorType)
		}
	}

	gcs := ConnectorCapabilityPackFor("gcs")
	if gcs == nil {
		t.Fatalf("missing pack for gcs")
	}
	if gcs.Capabilities.MediaSync {
		t.Fatalf("gcs is not in the SDC.41 media-sync allowlist; pack should not advertise media_sync")
	}
}

func TestEventStreamPacksDeclareStreamingAndCdc(t *testing.T) {
	for _, connectorType := range []string{"kafka", "kinesis"} {
		pack := ConnectorCapabilityPackFor(connectorType)
		if pack == nil {
			t.Fatalf("missing pack for %s", connectorType)
		}
		if !pack.Capabilities.StreamingSync {
			t.Fatalf("%s should declare streaming_sync", connectorType)
		}
		if !pack.Capabilities.CdcSync || pack.CdcInputKind != "streaming_middleware_changelog" {
			t.Fatalf("%s should declare changelog CDC", connectorType)
		}
	}

	sqs := ConnectorCapabilityPackFor("streaming_sqs")
	if sqs == nil {
		t.Fatalf("missing pack for streaming_sqs")
	}
	if sqs.Capabilities.CdcSync {
		t.Fatalf("streaming_sqs should not declare cdc_sync (no changelog shape)")
	}
}

func TestRelationalAgentWorkerDropsTableExport(t *testing.T) {
	pack := ConnectorCapabilityPackFor("postgresql")
	if pack == nil {
		t.Fatalf("missing postgresql pack")
	}
	agentFlags := pack.EffectiveCapabilitiesForWorker("agent")
	if agentFlags.TableExport {
		t.Fatalf("agent worker override should drop table_export on relational packs")
	}
	if !agentFlags.BatchSync {
		t.Fatalf("agent worker should keep batch_sync on relational packs")
	}
	foundry := pack.EffectiveCapabilitiesForWorker("foundry")
	if !foundry.TableExport {
		t.Fatalf("foundry worker should keep table_export on relational packs")
	}
	unknown := pack.EffectiveCapabilitiesForWorker("does-not-exist")
	if unknown.TableExport != pack.Capabilities.TableExport {
		t.Fatalf("unknown workers should fall back to the base flags")
	}
}

func TestRestAndFoundryPacksDeclareExpectedCapabilities(t *testing.T) {
	rest := ConnectorCapabilityPackFor("rest_api")
	if rest == nil {
		t.Fatalf("missing rest_api pack")
	}
	if !rest.Capabilities.Webhook || !rest.Capabilities.BatchSync {
		t.Fatalf("rest_api should declare webhook + batch_sync, got %+v", rest.Capabilities)
	}
	if rest.Capabilities.MediaSync {
		t.Fatalf("rest_api should not declare media_sync")
	}

	foundry := ConnectorCapabilityPackFor("foundry_to_foundry")
	if foundry == nil {
		t.Fatalf("missing foundry_to_foundry pack")
	}
	if !foundry.Capabilities.VirtualTable || !foundry.Capabilities.TableExport {
		t.Fatalf("foundry_to_foundry should declare virtual_table and table_export")
	}
	rules := foundry.ValidationRulesForCapability("table_export")
	found := false
	for _, rule := range rules {
		if rule.ID == "f2f-marking-policy" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("foundry_to_foundry must publish the marking policy rule on table_export")
	}
}

func TestCapabilityListMirrorsFlags(t *testing.T) {
	pack := ConnectorCapabilityPackFor("postgresql")
	if pack == nil {
		t.Fatalf("missing postgresql pack")
	}
	list := pack.CapabilityList()
	want := map[string]bool{
		"batch_sync":   true,
		"table_sync":   true,
		"cdc_sync":     true,
		"table_export": true,
		"exploration":  true,
	}
	for _, capability := range list {
		delete(want, capability)
	}
	if len(want) != 0 {
		t.Fatalf("CapabilityList missing entries: %v", want)
	}
}

func TestUnknownConnectorReturnsNil(t *testing.T) {
	if pack := ConnectorCapabilityPackFor("does-not-exist"); pack != nil {
		t.Fatalf("expected nil for unknown connector, got %+v", pack)
	}
	if pack := ConnectorCapabilityPackFor(""); pack != nil {
		t.Fatalf("expected nil for empty connector")
	}
}
