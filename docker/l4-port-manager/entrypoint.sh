#!/bin/sh
#
# L4 Port Manager Sidecar
#
# On startup: always applies the current L4 ports override so the caddy
# container has the correct ports bound (the main compose stack starts caddy
# without the L4 ports override file).
#
# During runtime: watches the trigger file for changes and re-applies when
# the web app signals that port configuration has changed.
#
# Only ever recreates the caddy container — never touches any other service.
#
# Two operating modes (auto-detected):
#
#   Compose mode  — When a docker-compose.yml is mounted at COMPOSE_DIR,
#                   uses `docker compose up` to recreate the caddy container.
#
#   Direct mode   — When no compose file is available, uses the Docker Engine
#                   API to recreate the caddy container from its saved base
#                   configuration plus L4 port overrides.  No bind-mounted
#                   compose file is needed.
#
# Environment variables:
#   DATA_DIR              - Path to shared data volume (default: /data)
#   COMPOSE_DIR           - Path to compose files (default: /compose)
#   CADDY_CONTAINER_NAME  - Caddy container name for project auto-detection (default: caddy-proxy-manager-caddy)
#   COMPOSE_PROJECT_NAME  - Override compose project name (auto-detected from caddy container labels if unset)
#   POLL_INTERVAL         - Seconds between trigger file checks (default: 2)
#   DOCKER_SOCKET         - Path to Docker socket (default: /var/run/docker.sock)
#   DOCKER_API_VERSION    - Docker Engine API version (default: v1.43)

set -e

DATA_DIR="${DATA_DIR:-/data}"
COMPOSE_DIR="${COMPOSE_DIR:-/compose}"
POLL_INTERVAL="${POLL_INTERVAL:-2}"
CADDY_CONTAINER_NAME="${CADDY_CONTAINER_NAME:-caddy-proxy-manager-caddy}"
DOCKER_SOCKET="${DOCKER_SOCKET:-/var/run/docker.sock}"
API_VER="${DOCKER_API_VERSION:-v1.43}"

# Auto-negotiate API version: query the daemon and use its MaxAPIVersion if
# it is lower than our default.  This handles older Docker daemons (e.g. those
# that only support up to v1.41) without requiring manual DOCKER_API_VERSION config.
_negotiate_api_version() {
  _daemon_max=$(curl -s --unix-socket "$DOCKER_SOCKET" \
    "http://localhost/version" 2>/dev/null | jq -r '.ApiVersion // empty' 2>/dev/null || echo "")
  if [ -z "$_daemon_max" ]; then
    return  # Can't reach daemon yet; keep the configured/default version
  fi
  _our_ver="${API_VER#v}"  # strip leading 'v' for numeric comparison
  # Compare as floats using awk
  if awk "BEGIN{exit !($_our_ver > $_daemon_max)}"; then
    log "Docker daemon max API version is v${_daemon_max} (our default is ${API_VER}). Using v${_daemon_max}."
    API_VER="v${_daemon_max}"
  fi
}
_negotiate_api_version

TRIGGER_FILE="$DATA_DIR/l4-ports.trigger"
STATUS_FILE="$DATA_DIR/l4-ports.status"
OVERRIDE_FILE="$DATA_DIR/docker-compose.l4-ports.yml"
BASE_CONFIG_FILE="$DATA_DIR/.l4-caddy-base-config.json"

log() {
  echo "[l4-port-manager] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

write_status() {
  state="$1"
  message="$2"
  applied_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  error="${3:-}"

  cat > "$STATUS_FILE" <<STATUSEOF
{
  "state": "$state",
  "message": "$message",
  "appliedAt": "$applied_at"$([ -n "$error" ] && echo ",
  \"error\": \"$error\"" || echo "")
}
STATUSEOF
}

# Auto-detect the Docker Compose project name from the running caddy container's labels.
# This ensures we operate on the correct project regardless of where compose files are mounted.
detect_project_name() {
  if [ -n "$COMPOSE_PROJECT_NAME" ]; then
    echo "$COMPOSE_PROJECT_NAME"
    return
  fi
  detected=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$CADDY_CONTAINER_NAME" 2>/dev/null || echo "")
  if [ -n "$detected" ]; then
    echo "$detected"
  else
    echo "caddy-proxy-manager"
  fi
}

# ---------------------------------------------------------------------------
# Base config: save the caddy container's initial configuration for direct
# mode recreation.  Captured once on first run; recaptured automatically if
# the caddy image changes.  Delete the file manually to force a recapture.
# ---------------------------------------------------------------------------
capture_base_config() {
  if [ -f "$BASE_CONFIG_FILE" ]; then
    CURRENT_IMAGE=$(docker inspect --format '{{.Config.Image}}' "$CADDY_CONTAINER_NAME" 2>/dev/null || echo "")
    # If caddy isn't running, keep the existing base config — don't delete it
    # just because inspect returned empty string.
    if [ -z "$CURRENT_IMAGE" ]; then
      return 0
    fi
    SAVED_IMAGE=$(jq -r '.[0].Config.Image' "$BASE_CONFIG_FILE" 2>/dev/null || echo "")
    if [ "$CURRENT_IMAGE" = "$SAVED_IMAGE" ]; then
      return 0
    fi
    log "Caddy image changed ($SAVED_IMAGE -> $CURRENT_IMAGE). Recapturing base config..."
    rm -f "$BASE_CONFIG_FILE"
  fi

  log "Capturing caddy container base configuration..."
  if ! docker inspect "$CADDY_CONTAINER_NAME" > "$BASE_CONFIG_FILE.tmp" 2>/dev/null; then
    log "WARNING: Could not capture base config (caddy container not running?)"
    rm -f "$BASE_CONFIG_FILE.tmp"
    return 1
  fi
  mv "$BASE_CONFIG_FILE.tmp" "$BASE_CONFIG_FILE"
}

# ---------------------------------------------------------------------------
# Wait for the caddy container's health check to pass.
# ---------------------------------------------------------------------------
wait_for_health() {
  HEALTH_TIMEOUT=30
  HEALTH_WAITED=0
  HEALTH="unknown"
  while [ "$HEALTH_WAITED" -lt "$HEALTH_TIMEOUT" ]; do
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CADDY_CONTAINER_NAME" 2>/dev/null || echo "unknown")
    if [ "$HEALTH" = "healthy" ]; then
      break
    fi
    sleep 1
    HEALTH_WAITED=$((HEALTH_WAITED + 1))
  done

  if [ "$HEALTH" = "healthy" ]; then
    write_status "applied" "Caddy container recreated and healthy with updated ports."
    log "Caddy is healthy."
  else
    write_status "applied" "Caddy container recreated but health check status: $HEALTH (may still be starting)."
    log "Warning: Caddy health status is '$HEALTH' after ${HEALTH_TIMEOUT}s."
  fi
}

# ---------------------------------------------------------------------------
# Compose mode: recreate caddy via docker compose (requires mounted files).
# ---------------------------------------------------------------------------
do_apply_compose() {
  COMPOSE_PROJECT="$(detect_project_name)"
  log "Compose mode: using project '$COMPOSE_PROJECT'"

  # Build compose args. Files are read from COMPOSE_DIR (container path).
  # COMPOSE_HOST_DIR (when set) is passed as --project-directory so the Docker
  # daemon resolves relative bind-mount paths (e.g. ./geoip-data) against the
  # actual host project directory rather than the sidecar's /compose mount.
  COMPOSE_ARGS="-p $COMPOSE_PROJECT"
  if [ -n "$COMPOSE_HOST_DIR" ]; then
    COMPOSE_ARGS="$COMPOSE_ARGS --project-directory $COMPOSE_HOST_DIR"
  fi
  # Explicitly supply the .env file so required variables are available even
  # when --project-directory points to a host path not mounted in the sidecar.
  if [ -f "$COMPOSE_DIR/.env" ]; then
    COMPOSE_ARGS="$COMPOSE_ARGS --env-file $COMPOSE_DIR/.env"
  fi
  COMPOSE_ARGS="$COMPOSE_ARGS -f $COMPOSE_DIR/docker-compose.yml"
  if [ -f "$COMPOSE_DIR/docker-compose.override.yml" ]; then
    COMPOSE_ARGS="$COMPOSE_ARGS -f $COMPOSE_DIR/docker-compose.override.yml"
  fi
  if [ -f "$OVERRIDE_FILE" ]; then
    COMPOSE_ARGS="$COMPOSE_ARGS -f $OVERRIDE_FILE"
  fi

  write_status "applying" "Recreating caddy container with updated ports..."

  # shellcheck disable=SC2086
  if docker compose $COMPOSE_ARGS up -d --no-deps --force-recreate caddy 2>&1; then
    log "Caddy container recreated successfully."
    wait_for_health
  else
    ERROR_MSG="Failed to recreate caddy container. Check Docker logs."
    write_status "failed" "$ERROR_MSG" "$ERROR_MSG"
    log "ERROR: $ERROR_MSG"
  fi
}

# ---------------------------------------------------------------------------
# Direct mode: recreate caddy via Docker Engine API (no compose file needed).
#
# Reads the saved base configuration, merges L4 port bindings from the
# override file, stops+removes the old container, and creates a new one
# with the combined port set.
# ---------------------------------------------------------------------------
do_apply_direct() {
  log "Direct mode: recreating caddy container via Docker API..."

  if [ ! -f "$BASE_CONFIG_FILE" ]; then
    capture_base_config || {
      write_status "failed" "Cannot capture base config. Is caddy running?" "Missing base config"
      return 1
    }
  fi

  # --- Parse L4 port specs from the override YAML ---
  L4_PORT_BINDINGS="{}"
  L4_EXPOSED_PORTS="{}"
  if [ -f "$OVERRIDE_FILE" ]; then
    PORT_LINES=$(grep -E '^\s+- "' "$OVERRIDE_FILE" 2>/dev/null | sed 's/.*"\([^"]*\)".*/\1/' || true)
    if [ -n "$PORT_LINES" ]; then
      L4_PORT_BINDINGS=$(printf '%s\n' "$PORT_LINES" | jq -Rn '
        [inputs | select(length > 0) | split(":") |
          if length == 2 then
            (.[1] | split("/")) as $cp |
            { key: ($cp[0] + "/" + ($cp[1] // "tcp")),
              value: [{ HostIp: "", HostPort: .[0] }] }
          elif length == 3 then
            (.[2] | split("/")) as $cp |
            { key: ($cp[0] + "/" + ($cp[1] // "tcp")),
              value: [{ HostIp: .[0], HostPort: .[1] }] }
          else empty end
        ] | from_entries
      ')
      L4_EXPOSED_PORTS=$(printf '%s' "$L4_PORT_BINDINGS" | jq 'with_entries(.value = {})')
    fi
  fi

  # --- Build Docker create request from base config + L4 ports ---
  CREATE_JSON=$(jq \
    --argjson lp "$L4_PORT_BINDINGS" \
    --argjson le "$L4_EXPOSED_PORTS" '
    .[0] as $c |
    ($c.NetworkSettings.Networks | keys) as $all_nets |
    {
      body: (
        ($c.Config | del(.Hostname)) +
        {
          ExposedPorts: (($c.Config.ExposedPorts // {}) + $le),
          HostConfig: ($c.HostConfig + {
            PortBindings: (($c.HostConfig.PortBindings // {}) + $lp)
          }),
          NetworkingConfig: {
            EndpointsConfig: (
              if ($all_nets | length) > 0 then
                { ($all_nets[0]): {
                    Aliases: ($c.NetworkSettings.Networks[$all_nets[0]].Aliases // [])
                } }
              else {} end
            )
          }
        }
      ),
      extra_nets: ($all_nets[1:])
    }
  ' "$BASE_CONFIG_FILE")

  REQUEST_BODY=$(printf '%s' "$CREATE_JSON" | jq -c '.body')
  EXTRA_NETS=$(printf '%s' "$CREATE_JSON" | jq -r '.extra_nets[]' 2>/dev/null || true)

  write_status "applying" "Recreating caddy container with updated ports (direct mode)..."

  # --- Stop & remove the old container ---
  docker stop "$CADDY_CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CADDY_CONTAINER_NAME" 2>/dev/null || true

  # --- Create the new container via Docker Engine API ---
  # Use -w to capture HTTP status separately so the response body (error detail)
  # is always available for logging — curl -f would discard it on 4xx/5xx.
  ENCODED_NAME=$(printf '%s' "$CADDY_CONTAINER_NAME" | jq -Rr @uri)
  CREATE_RESP_FILE="/tmp/.l4pm_create_resp"
  HTTP_STATUS=$(printf '%s' "$REQUEST_BODY" | curl -s \
    --unix-socket "$DOCKER_SOCKET" \
    -H "Content-Type: application/json" \
    -d @- \
    -o "$CREATE_RESP_FILE" \
    -w "%{http_code}" \
    "http://localhost/${API_VER}/containers/create?name=${ENCODED_NAME}" 2>&1)
  CREATE_RESULT=$(cat "$CREATE_RESP_FILE" 2>/dev/null || echo "")
  rm -f "$CREATE_RESP_FILE"
  if [ "$HTTP_STATUS" != "201" ]; then
    ERROR_MSG="Failed to create caddy container via Docker API (HTTP $HTTP_STATUS): $CREATE_RESULT"
    write_status "failed" "$ERROR_MSG" "Docker API create error"
    log "ERROR: $ERROR_MSG"
    log "ERROR: Request body was: $(printf '%s' "$REQUEST_BODY" | jq -c . 2>/dev/null || echo "$REQUEST_BODY")"
    return 1
  fi

  # --- Connect to additional networks (create API supports only one) ---
  for net in $EXTRA_NETS; do
    curl -sf --unix-socket "$DOCKER_SOCKET" \
      -H "Content-Type: application/json" \
      -d "{\"Container\":\"$CADDY_CONTAINER_NAME\"}" \
      "http://localhost/${API_VER}/networks/${net}/connect" 2>/dev/null || \
      log "WARNING: Could not connect to network: $net"
  done

  # --- Start the container ---
  if ! curl -sf --unix-socket "$DOCKER_SOCKET" -X POST \
    "http://localhost/${API_VER}/containers/${CADDY_CONTAINER_NAME}/start" 2>/dev/null; then
    ERROR_MSG="Failed to start caddy container."
    write_status "failed" "$ERROR_MSG" "Docker start error"
    log "ERROR: $ERROR_MSG"
    return 1
  fi

  log "Caddy container recreated successfully."
  wait_for_health
}

# ---------------------------------------------------------------------------
# Main apply entry point — auto-selects compose or direct mode.
# ---------------------------------------------------------------------------
do_apply() {
  if [ -f "$COMPOSE_DIR/docker-compose.yml" ]; then
    do_apply_compose
  else
    do_apply_direct
  fi

  # Delete the trigger file after processing so stale triggers don't cause
  # "Waiting for port manager sidecar..." on the next boot.
  rm -f "$TRIGGER_FILE"
}

# ---------------------------------------------------------------------------
# Startup: always apply the override so caddy has the correct ports bound.
# (The main compose stack starts caddy without the L4 ports override file.)
# Only apply if the override file exists — it is created on first "Apply Ports".
# ---------------------------------------------------------------------------

# In direct mode, capture the caddy container's base config before any apply.
# If capture fails (caddy not running yet), skip the startup apply — the poll
# loop will apply once a new trigger arrives.  This prevents a crash loop where
# a stale trigger file causes the sidecar to destroy caddy before it has base
# config, rendering it unable to recreate the container.
DIRECT_MODE_READY=1
if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
  log "No compose file found at $COMPOSE_DIR — will use direct mode."
  if ! capture_base_config; then
    log "WARNING: Skipping startup apply — caddy base config not available. Will retry on next trigger."
    write_status "idle" "Port manager sidecar is running. Waiting for caddy to be available before applying L4 ports."
    DIRECT_MODE_READY=0
  fi
fi
if [ "$DIRECT_MODE_READY" = "1" ] && [ -f "$OVERRIDE_FILE" ]; then
  log "Startup: applying existing L4 port override..."
  do_apply
else
  if [ "$DIRECT_MODE_READY" = "1" ]; then
    write_status "idle" "Port manager sidecar is running and ready."
    log "Started. No L4 port override file yet."
  fi
fi

# Capture the current trigger content so the poll loop doesn't re-apply
# a trigger that was already handled (either above or before this boot).
# Use explicit assignment — do NOT use ${VAR:-fallback} which treats empty as unset.
LAST_TRIGGER=$(cat "$TRIGGER_FILE" 2>/dev/null || echo "")

log "Watching $TRIGGER_FILE for changes (poll every ${POLL_INTERVAL}s)"

while true; do
  sleep "$POLL_INTERVAL"

  CURRENT_TRIGGER=$(cat "$TRIGGER_FILE" 2>/dev/null || echo "")
  if [ "$CURRENT_TRIGGER" = "$LAST_TRIGGER" ]; then
    continue
  fi

  # Empty trigger means the file was just deleted — nothing to do.
  if [ -z "$CURRENT_TRIGGER" ]; then
    LAST_TRIGGER=""
    continue
  fi

  LAST_TRIGGER="$CURRENT_TRIGGER"
  log "Trigger changed. Applying port changes..."
  do_apply
done
