# syntax=docker/dockerfile:1.6

FROM golang:1.26 AS builder

# Install xcaddy
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest

# Copy the vendored caddy-blocker-plugin so xcaddy can use it as a local replace
COPY docker/caddy/plugins/caddy-blocker-plugin /plugins/caddy-blocker-plugin

# Build Caddy with plugins
# caddy-blocker-plugin uses the local vendored copy; other modules use the proxy cache
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/mholt/caddy-l4 \
    --with github.com/fuomag9/caddy-blocker-plugin=/plugins/caddy-blocker-plugin \
    --with github.com/corazawaf/coraza-caddy/v2 \
    --output /usr/bin/caddy

FROM ubuntu:24.04

# Accept build args for user/group IDs to support rootless operation
# Using 10000 as default to avoid conflicts with system users
ARG PUID=10000
ARG PGID=10000

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy caddy binary from builder
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Create caddy user and directories with configurable IDs for rootless operation
# Remove any existing users/groups with the same UID/GID to avoid conflicts
RUN (getent group ${PGID} && groupdel $(getent group ${PGID} | cut -d: -f1) || true) && \
    (getent passwd ${PUID} && userdel $(getent passwd ${PUID} | cut -d: -f1) || true) && \
    groupadd -g ${PGID} caddy && \
    useradd -r -u ${PUID} -g caddy -m -d /home/caddy caddy && \
    mkdir -p /data /config /logs /tmp/modsecurity/upload && \
    chown -R caddy:caddy /data /config /logs /tmp/modsecurity/upload /home/caddy

COPY --chown=caddy:caddy docker/caddy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443 2019

# Set environment variables to use /data and /config like official Caddy image
ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data

# Run as non-root user (fully rootless)
USER caddy

CMD ["caddy", "run", "--resume", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
