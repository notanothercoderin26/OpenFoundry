package proxy

import (
	"net"
	"net/http"
	"strconv"
	"strings"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

// Header keys forwarded downstream — match the Rust gateway exactly so
// any service can verify caller identity / quotas without parsing the JWT.
const (
	HdrTenantScope             = "x-openfoundry-tenant-scope"
	HdrTenantTier              = "x-openfoundry-tenant-tier"
	HdrQuotaQueryLimit         = "x-openfoundry-quota-query-limit"
	HdrQuotaPipelineWorkers    = "x-openfoundry-quota-pipeline-workers"
	HdrQuotaRequestsPerMin     = "x-openfoundry-quota-requests-per-minute"
	HdrAuthSub                 = "x-openfoundry-auth-sub"
	HdrAuthEmail               = "x-openfoundry-auth-email"
	HdrAuthMethods             = "x-openfoundry-auth-methods"
	HdrZeroTrust               = "x-openfoundry-zero-trust"
	HdrOrgID                   = "x-openfoundry-org-id"
	HdrSessionKind             = "x-openfoundry-session-kind"
	HdrClassificationClearance = "x-openfoundry-classification-clearance"
	HdrScopeWorkspace          = "x-openfoundry-scope-workspace"
	HdrScopePathPrefixes       = "x-openfoundry-scope-path-prefixes"
	HdrAllowedOrgIDs           = "x-openfoundry-allowed-org-ids"
	HdrAllowedMarkings         = "x-openfoundry-allowed-markings"
	HdrRestrictedViewIDs       = "x-openfoundry-restricted-view-ids"
	HdrConsumerMode            = "x-openfoundry-consumer-mode"
	HdrGuestEmail              = "x-openfoundry-guest-email"
	HdrGuestAccess             = "x-openfoundry-guest-access"
)

// gatewayAssertedHeaders is the full set of x-openfoundry-* headers
// that ApplyTenantHeaders / ApplyAuthContextHeaders may write on an
// outbound request. Downstream services trust these as gateway-asserted
// facts (subject, tenant scope, markings, …), so any client-supplied
// value MUST be stripped before we attach our own — otherwise a caller
// can forge identity by sending the header themselves alongside an
// invalid (or missing) bearer token.
//
// The list is intentionally exhaustive: even when a particular header
// would not be re-written for the current claims (e.g. HdrOrgID for a
// claims-less request), we still strip it so the client value cannot
// leak through unchanged.
var gatewayAssertedHeaders = []string{
	HdrTenantScope,
	HdrTenantTier,
	HdrQuotaQueryLimit,
	HdrQuotaPipelineWorkers,
	HdrQuotaRequestsPerMin,
	HdrAuthSub,
	HdrAuthEmail,
	HdrAuthMethods,
	HdrZeroTrust,
	HdrOrgID,
	HdrSessionKind,
	HdrClassificationClearance,
	HdrScopeWorkspace,
	HdrScopePathPrefixes,
	HdrAllowedOrgIDs,
	HdrAllowedMarkings,
	HdrRestrictedViewIDs,
	HdrConsumerMode,
	HdrGuestEmail,
	HdrGuestAccess,
}

// StripClientAuthHeaders removes every x-openfoundry-* header listed in
// gatewayAssertedHeaders from the outbound request, regardless of
// whether ApplyTenantHeaders / ApplyAuthContextHeaders will later
// re-write it. Callers MUST invoke this before applying tenant / auth
// headers; see the comment on gatewayAssertedHeaders for why.
func StripClientAuthHeaders(req *http.Request) {
	if req == nil {
		return
	}
	for _, h := range gatewayAssertedHeaders {
		req.Header.Del(h)
	}
}

// clientProxyHeaders is the set of standard reverse-proxy headers that
// downstream services trust to identify the original caller (client IP,
// scheme, host). A client-supplied value here lets the caller spoof
// their IP for logs, geo, IP-based ACLs, and rate-limit buckets — so
// the gateway must always own these. StampForwardedHeaders strips all
// of them and stamps the canonical values from the inbound request.
var clientProxyHeaders = []string{
	"X-Forwarded-For",
	"X-Forwarded-Host",
	"X-Forwarded-Proto",
	"X-Forwarded-Port",
	"X-Forwarded-Server",
	"X-Real-IP",
	"CF-Connecting-IP",
	"True-Client-IP",
	"Forwarded", // RFC 7239
}

// StampForwardedHeaders sanitizes reverse-proxy identity headers on the
// outbound request and re-stamps them with gateway-asserted values.
//
// Behavior depends on trustInbound:
//
//   - trustInbound=false (default, secure-by-default for direct exposure):
//     every header in clientProxyHeaders is dropped and a fresh chain is
//     stamped from in.RemoteAddr / in.Host / in.TLS. The caller cannot
//     forge their IP regardless of what they send.
//
//   - trustInbound=true (gateway sits behind a trusted reverse proxy
//     such as a k8s ingress controller): the existing X-Forwarded-For
//     chain is preserved and the gateway's peer is appended to it.
//     X-Real-IP is derived from the leftmost entry of the trusted chain
//     so downstream services see the *original* client, not the ingress.
//
// In both modes Forwarded (RFC 7239), CF-Connecting-IP, True-Client-IP
// and X-Forwarded-Server are unconditionally dropped — we never want to
// pass these through unchanged.
func StampForwardedHeaders(out *http.Request, in *http.Request, trustInbound bool) {
	if out == nil || in == nil {
		return
	}

	// Snapshot trusted values before we delete client-supplied ones.
	var inboundFor, inboundHost, inboundProto string
	if trustInbound {
		inboundFor = in.Header.Get("X-Forwarded-For")
		inboundHost = in.Header.Get("X-Forwarded-Host")
		inboundProto = in.Header.Get("X-Forwarded-Proto")
	}
	for _, h := range clientProxyHeaders {
		out.Header.Del(h)
	}

	peer := peerIP(in.RemoteAddr)

	// X-Forwarded-For chain: trusted inbound + our peer; or peer alone.
	switch {
	case inboundFor != "" && peer != "":
		out.Header.Set("X-Forwarded-For", inboundFor+", "+peer)
	case inboundFor != "":
		out.Header.Set("X-Forwarded-For", inboundFor)
	case peer != "":
		out.Header.Set("X-Forwarded-For", peer)
	}

	// X-Real-IP: the *original* client. When we trust the inbound chain,
	// take its leftmost entry; otherwise fall back to the direct peer.
	realIP := peer
	if trustInbound && inboundFor != "" {
		if i := strings.IndexByte(inboundFor, ','); i > 0 {
			realIP = strings.TrimSpace(inboundFor[:i])
		} else {
			realIP = strings.TrimSpace(inboundFor)
		}
	}
	if realIP != "" {
		out.Header.Set("X-Real-IP", realIP)
	}

	// X-Forwarded-Proto: trust inbound when allowed; else derive from TLS.
	proto := inboundProto
	if proto == "" {
		proto = "http"
		if in.TLS != nil {
			proto = "https"
		}
	}
	out.Header.Set("X-Forwarded-Proto", proto)

	// X-Forwarded-Host: trust inbound when allowed; else inbound Host.
	host := inboundHost
	if host == "" {
		host = in.Host
	}
	if host != "" {
		out.Header.Set("X-Forwarded-Host", host)
	}
}

// peerIP returns the host part of a net.Addr-style "ip:port" string.
// Falls back to the raw value when no port is present.
func peerIP(remoteAddr string) string {
	if remoteAddr == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}

// ApplyTenantHeaders sets the per-tenant headers on the upstream request.
func ApplyTenantHeaders(req *http.Request, t *authmw.TenantContext) {
	if t == nil {
		return
	}
	req.Header.Set(HdrTenantScope, t.ScopeID)
	req.Header.Set(HdrTenantTier, t.Tier)
	req.Header.Set(HdrQuotaQueryLimit, strconv.FormatUint(uint64(t.Quotas.MaxQueryLimit), 10))
	req.Header.Set(HdrQuotaPipelineWorkers, strconv.FormatUint(uint64(t.Quotas.MaxPipelineWorkers), 10))
	req.Header.Set(HdrQuotaRequestsPerMin, strconv.FormatUint(uint64(t.Quotas.RequestsPerMinute), 10))
}

// ApplyAuthContextHeaders mirrors the Rust `apply_auth_context_headers`
// function: copies subject / email / org / session-scope details onto
// the upstream request so downstream services can enforce ABAC without
// re-decoding the JWT.
func ApplyAuthContextHeaders(req *http.Request, c *authmw.Claims) {
	if c == nil {
		return
	}
	req.Header.Set(HdrAuthSub, c.Sub.String())
	req.Header.Set(HdrAuthEmail, c.Email)
	req.Header.Set(HdrAuthMethods, strings.Join(c.AuthMethods, ","))

	zeroTrust := "standard"
	if c.SessionScope != nil {
		zeroTrust = "scoped"
	}
	req.Header.Set(HdrZeroTrust, zeroTrust)

	if c.OrgID != nil {
		req.Header.Set(HdrOrgID, c.OrgID.String())
	}
	if c.SessionKind != nil && *c.SessionKind != "" {
		req.Header.Set(HdrSessionKind, *c.SessionKind)
	}
	if clr, ok := c.ClassificationClearance(); ok {
		req.Header.Set(HdrClassificationClearance, clr)
	}
	if allowedMarkings := c.AllowedMarkings(); len(allowedMarkings) > 0 {
		req.Header.Set(HdrAllowedMarkings, strings.Join(allowedMarkings, ","))
	}

	scope := c.SessionScope
	if scope == nil {
		return
	}
	if scope.Workspace != nil && *scope.Workspace != "" {
		req.Header.Set(HdrScopeWorkspace, *scope.Workspace)
	}
	if len(scope.AllowedPathPrefixes) > 0 {
		req.Header.Set(HdrScopePathPrefixes, strings.Join(scope.AllowedPathPrefixes, ","))
	}
	if len(scope.AllowedOrgIDs) > 0 {
		ids := make([]string, len(scope.AllowedOrgIDs))
		for i, id := range scope.AllowedOrgIDs {
			ids[i] = id.String()
		}
		req.Header.Set(HdrAllowedOrgIDs, strings.Join(ids, ","))
	}
	if len(scope.RestrictedViewIDs) > 0 {
		ids := make([]string, len(scope.RestrictedViewIDs))
		for i, id := range scope.RestrictedViewIDs {
			ids[i] = id.String()
		}
		req.Header.Set(HdrRestrictedViewIDs, strings.Join(ids, ","))
	}
	if scope.ConsumerMode {
		req.Header.Set(HdrConsumerMode, "true")
	}
	if scope.GuestEmail != nil && *scope.GuestEmail != "" {
		req.Header.Set(HdrGuestEmail, *scope.GuestEmail)
		req.Header.Set(HdrGuestAccess, "true")
	}
}
