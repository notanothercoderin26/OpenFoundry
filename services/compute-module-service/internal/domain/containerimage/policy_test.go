package containerimage

import (
	"errors"
	"strings"
	"testing"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

func goodImage() models.ContainerImage {
	return models.ContainerImage{
		Registry:     "ghcr.io",
		Repository:   "openfoundry/echo",
		Tag:          "v1.0.0",
		Digest:       "sha256:" + strings.Repeat("a", 64),
		Platform:     "linux/amd64",
		User:         "65532",
		ExposedPorts: []int{8080},
		Provenance: &models.ImageProvenance{
			BuildRef: "abc123",
			BuildURL: "https://ci.example.com/run/1",
		},
	}
}

func findingFor(findings []models.CompatibilityFinding, code string) (models.CompatibilityFinding, bool) {
	for _, f := range findings {
		if f.Code == code {
			return f, true
		}
	}
	return models.CompatibilityFinding{}, false
}

func TestApplyClearsHappyPath(t *testing.T) {
	img := goodImage()
	cleared, err := Apply(&img)
	if err != nil {
		t.Fatalf("expected pass, got %v findings=%+v", err, img.Findings)
	}
	if !cleared {
		t.Fatal("expected cleared=true on happy path")
	}
	for _, f := range img.Findings {
		if f.Severity == models.FindingSeverityError {
			t.Fatalf("happy path produced error finding: %+v", f)
		}
	}
}

func TestNonRootRequired(t *testing.T) {
	img := goodImage()
	img.User = "0"
	_, err := Apply(&img)
	if !errors.Is(err, ErrFindingsRejected) {
		t.Fatalf("expected rejection for root user, got %v", err)
	}
	if _, ok := findingFor(img.Findings, CodeNonRootRequired); !ok {
		t.Fatalf("expected %s finding, got %+v", CodeNonRootRequired, img.Findings)
	}
}

func TestNumericUserRequired(t *testing.T) {
	img := goodImage()
	img.User = "appuser"
	_, err := Apply(&img)
	if !errors.Is(err, ErrFindingsRejected) {
		t.Fatalf("expected rejection for named user, got %v", err)
	}
	if _, ok := findingFor(img.Findings, CodeNumericUser); !ok {
		t.Fatalf("expected %s finding, got %+v", CodeNumericUser, img.Findings)
	}
}

func TestUnsupportedPlatform(t *testing.T) {
	img := goodImage()
	img.Platform = "linux/arm64"
	_, err := Apply(&img)
	if !errors.Is(err, ErrFindingsRejected) {
		t.Fatalf("expected rejection for arm64, got %v", err)
	}
	if _, ok := findingFor(img.Findings, CodeUnsupportedPlatform); !ok {
		t.Fatalf("expected %s finding, got %+v", CodeUnsupportedPlatform, img.Findings)
	}
}

func TestLatestTagRequiresDigest(t *testing.T) {
	img := goodImage()
	img.Tag = "latest"
	img.Digest = ""
	_, err := Apply(&img)
	if !errors.Is(err, ErrFindingsRejected) {
		t.Fatalf("expected rejection for latest tag without digest, got %v", err)
	}
	if _, ok := findingFor(img.Findings, CodeMutableTag); !ok {
		t.Fatalf("expected %s finding, got %+v", CodeMutableTag, img.Findings)
	}

	// With a digest, "latest" is acceptable (digest pins the bits).
	img2 := goodImage()
	img2.Tag = "latest"
	if _, err := Apply(&img2); err != nil {
		t.Fatalf("latest+digest should clear policy, got %v findings=%+v", err, img2.Findings)
	}
}

func TestMalformedDigestIsRejected(t *testing.T) {
	img := goodImage()
	img.Digest = "not-a-digest"
	_, err := Apply(&img)
	if !errors.Is(err, ErrFindingsRejected) {
		t.Fatalf("expected rejection for malformed digest, got %v", err)
	}
	if _, ok := findingFor(img.Findings, CodeMalformedDigest); !ok {
		t.Fatalf("expected %s finding, got %+v", CodeMalformedDigest, img.Findings)
	}
}

func TestPrivilegedPortRejected(t *testing.T) {
	img := goodImage()
	img.ExposedPorts = []int{80, 8080}
	_, err := Apply(&img)
	if !errors.Is(err, ErrFindingsRejected) {
		t.Fatalf("expected rejection for privileged port, got %v", err)
	}
	if _, ok := findingFor(img.Findings, CodePrivilegedPort); !ok {
		t.Fatalf("expected %s finding, got %+v", CodePrivilegedPort, img.Findings)
	}
}

func TestMissingDigestEmitsWarning(t *testing.T) {
	img := goodImage()
	img.Digest = ""
	cleared, err := Apply(&img)
	if err != nil {
		t.Fatalf("missing digest with non-latest tag should clear policy, got %v", err)
	}
	if !cleared {
		t.Fatal("policy should clear when only warnings are present")
	}
	f, ok := findingFor(img.Findings, CodeMissingDigest)
	if !ok {
		t.Fatalf("expected %s finding, got %+v", CodeMissingDigest, img.Findings)
	}
	if f.Severity != models.FindingSeverityWarn {
		t.Fatalf("missing digest should be warn, got %s", f.Severity)
	}
}

func TestMissingProvenanceEmitsInfo(t *testing.T) {
	img := goodImage()
	img.Provenance = nil
	cleared, err := Apply(&img)
	if err != nil {
		t.Fatalf("missing provenance is informational, not rejecting: %v", err)
	}
	if !cleared {
		t.Fatal("missing provenance should not block policy")
	}
	f, ok := findingFor(img.Findings, CodeMissingProvenance)
	if !ok {
		t.Fatalf("expected %s finding, got %+v", CodeMissingProvenance, img.Findings)
	}
	if f.Severity != models.FindingSeverityInfo {
		t.Fatalf("missing provenance should be info, got %s", f.Severity)
	}
}

func TestOversizedExposedPortsWarns(t *testing.T) {
	img := goodImage()
	ports := make([]int, MaxExposedPorts+1)
	for i := range ports {
		ports[i] = 8080 + i
	}
	img.ExposedPorts = ports
	cleared, err := Apply(&img)
	if err != nil {
		t.Fatalf("oversized port list should warn not reject, got %v", err)
	}
	if !cleared {
		t.Fatal("oversized port list should not block policy")
	}
	if _, ok := findingFor(img.Findings, CodeOversizedExposedPorts); !ok {
		t.Fatalf("expected %s finding, got %+v", CodeOversizedExposedPorts, img.Findings)
	}
}

func TestEvaluateDoesNotMutate(t *testing.T) {
	img := goodImage()
	img.Findings = []models.CompatibilityFinding{{Code: "stale"}}
	_ = Evaluate(img)
	if len(img.Findings) != 1 || img.Findings[0].Code != "stale" {
		t.Fatal("Evaluate should not mutate caller-supplied findings")
	}
}
