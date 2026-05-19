# syntax=docker/dockerfile:1.10
#
# OpenFoundry Go service — vertex-service.
# Same multi-stage distroless pattern documented in
# services/ontology-definition-service/Dockerfile.

ARG GO_VERSION=1.26.3
ARG ALPINE_VERSION=3.22
ARG DISTROLESS_IMAGE=gcr.io/distroless/static-debian12:nonroot

FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS modules

ENV GOTOOLCHAIN=local \
    CGO_ENABLED=0 \
    GOFLAGS="-mod=readonly -buildvcs=false" \
    GOPROXY=https://proxy.golang.org,direct \
    GOSUMDB=sum.golang.org

WORKDIR /workspace

COPY --link go.mod go.sum ./
RUN --mount=type=cache,id=of-go-mod,target=/go/pkg/mod,sharing=locked \
    go mod download -x

FROM modules AS builder

ARG SERVICE_NAME=vertex-service
ARG VERSION=dev
ARG TARGETOS=linux
ARG TARGETARCH=amd64

RUN --mount=type=bind,source=.,target=/workspace,rw \
    --mount=type=cache,id=of-go-mod,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=of-go-build,target=/root/.cache/go-build,sharing=locked \
    set -eux; \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
        go build -trimpath -buildvcs=false \
            -ldflags "-s -w -buildid= -extldflags=-static -X main.version=${VERSION}" \
            -tags "osusergo,netgo,static_build" \
            -o /out/service \
            ./services/${SERVICE_NAME}/cmd/${SERVICE_NAME}

FROM ${DISTROLESS_IMAGE} AS runtime

ARG SERVICE_NAME=vertex-service
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="openfoundry-vertex-service" \
      org.opencontainers.image.description="OpenFoundry Vertex graph application backend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/openfoundry/openfoundry-go" \
      org.opencontainers.image.vendor="OpenFoundry" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.base.name="gcr.io/distroless/static-debian12:nonroot"

COPY --from=builder /out/service /usr/local/bin/service

USER nonroot:nonroot
WORKDIR /home/nonroot
STOPSIGNAL SIGTERM

EXPOSE 50180

ENTRYPOINT ["/usr/local/bin/service"]
