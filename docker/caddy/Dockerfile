# syntax=docker/dockerfile:1.7

FROM golang:1.26.10-alpine3.24@sha256:87c65a688975c0b1d4585d204874c45ca78354670e3a5f11368c5a492303d696 AS build

ARG CADDY_COMMIT=0d98caea58f794f88e709b1bef2880996a471bca
ARG CADDY_VERSION=v2.11.9

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates git tzdata
WORKDIR /src
RUN git init \
    && git remote add origin https://github.com/caddyserver/caddy.git \
    && git fetch --depth 1 origin "refs/tags/${CADDY_VERSION}:refs/tags/${CADDY_VERSION}" \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${CADDY_COMMIT}"

# Go module version selection keeps the patched transitive dependencies in the
# final binary when the Caddy release predates their security releases.
RUN go get \
      golang.org/x/crypto@v0.58.0 \
      golang.org/x/net@v0.62.0 \
      golang.org/x/text@v0.43.0 \
      github.com/go-jose/go-jose/v4@v4.1.6 \
      google.golang.org/grpc@v1.83.2 \
    && go mod tidy \
    && CGO_ENABLED=0 go build \
      -trimpath \
      -ldflags="-s -w -buildid=" \
      -o /out/caddy \
      ./cmd/caddy

FROM scratch

ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=build /out/caddy /usr/bin/caddy

EXPOSE 80 443 443/udp 2019
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
