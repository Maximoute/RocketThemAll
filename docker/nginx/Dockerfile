# syntax=docker/dockerfile:1.7

FROM nginx:stable-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c

# The upstream immutable image can lag Alpine security repository updates.
RUN apk upgrade --no-cache
