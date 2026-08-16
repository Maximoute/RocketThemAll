# syntax=docker/dockerfile:1.7

FROM golang:1.26.6-alpine3.24@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS build

ARG CADDY_COMMIT=e2eee6a7fce366321294c9c2a79f3146891dcbdf
ARG CADDY_VERSION=v2.11.4

RUN apk add --no-cache ca-certificates git tzdata
WORKDIR /src
RUN git init \
    && git remote add origin https://github.com/caddyserver/caddy.git \
    && git fetch --depth 1 origin "refs/tags/${CADDY_VERSION}:refs/tags/${CADDY_VERSION}" \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${CADDY_COMMIT}"

# Caddy 2.11.4 predates these upstream security releases. Go module version
# selection keeps the patched transitive dependencies in the final binary.
RUN go get golang.org/x/text@v0.39.0 google.golang.org/grpc@v1.82.1 \
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
