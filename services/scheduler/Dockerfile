# syntax=docker/dockerfile:1.7

# Build context is the `services/` directory (set in the compose files) so the
# build can see the shared module this service depends on.

# ---------- Stage 1: build a static binary ----------
FROM golang:1.26-alpine AS build
WORKDIR /src
# Single-module build: the go.mod `replace` resolves ../shared, no workspace.
ENV GOWORK=off
# Manifests first for dependency-layer caching.
COPY shared/go.mod shared/go.sum ./shared/
COPY scheduler/go.mod scheduler/go.sum ./scheduler/
RUN cd scheduler && go mod download
# Sources.
COPY shared ./shared
COPY scheduler ./scheduler
RUN cd scheduler && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /scheduler ./cmd/scheduler

# ---------- Stage 2: minimal runtime ----------
# distroless static: no shell, no package manager, nonroot user. The scheduler is
# a single static binary with no runtime dependencies.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /scheduler /scheduler
ENTRYPOINT ["/scheduler"]
