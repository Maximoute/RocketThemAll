# syntax=docker/dockerfile:1.7

FROM postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777

# The official entrypoint only needs gosu when PID 1 starts as root. Run as an
# explicit unprivileged UID instead, align that UID with the existing Debian
# volume, and remove the otherwise vulnerable Go helper from the final image.
USER root
RUN apk upgrade --no-cache \
    && rm -f /usr/local/bin/gosu \
    && sed -i 's/^postgres:x:70:70:/postgres:x:999:70:/' /etc/passwd \
    && chown -R 999:70 /var/lib/postgresql /var/run/postgresql
USER 999:70
