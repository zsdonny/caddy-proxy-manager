<!-- ============================================================
     FORK-SPECIFIC DOCUMENTATION
     Fork of fuomag9/caddy-proxy-manager — changes listed below.
     The upstream README begins after the horizontal rule at the bottom.
     ============================================================ -->

> [!NOTE]
> This is a fork of [fuomag9/caddy-proxy-manager](https://github.com/fuomag9/caddy-proxy-manager). The section below documents changes made in this fork. The original upstream README starts after the `---` separator.

# Fork Notes

[![Upstream Merge Check](https://github.com/zsdonny/caddy-proxy-manager/actions/workflows/feature-upstream-merge-check.yml/badge.svg?branch=develop)](https://github.com/zsdonny/caddy-proxy-manager/actions/workflows/feature-upstream-merge-check.yml)

## Changes from Upstream

| Change | Description |
|--------|-------------|
| **UDP L4 proxy fix** | L4 proxy hosts with UDP protocol now correctly prepend the `udp/` prefix to both the caddy-l4 listen address and each upstream dial address |
| **Composeless l4-port-manager** | The `l4-port-manager` sidecar can recreate the Caddy container using the Docker Engine API directly, without a bind-mounted `docker-compose.yml` |
| **Fork web image** | A pre-built `web` image including all fork patches is published as `ghcr.io/zsdonny/caddy-proxy-manager-web:latest` |
| **Fork caddy image** | A pre-built `caddy` image is published as `ghcr.io/zsdonny/caddy-proxy-manager-caddy:latest` |
| **Macvlan mode** | Zero-downtime L4 port changes — Caddy gets its own LAN IP via macvlan, L4 port changes become instant config reloads |
| **Proxy host duplication fix** | Duplicating a proxy host now correctly copies all geoblock settings (rules, mode, response config, trusted proxies) instead of silently resetting them |

## Composeless L4 Port Manager (Direct Mode)

The upstream `l4-port-manager` requires your `docker-compose.yml` to be bind-mounted so it can run `docker compose up` when L4 port bindings change. This is not always practical when using pre-built images from a registry.

This fork adds a **direct mode** that falls back to the Docker Engine API when no compose file is present. Detection is automatic:

- **Compose mode** — used when `$COMPOSE_DIR/docker-compose.yml` exists (default: `/compose/docker-compose.yml`)
- **Direct mode** — used otherwise; captures Caddy's full container config at startup and recreates it via `curl` to the Docker socket on each L4 trigger

> [!NOTE]
> On first startup in direct mode, the sidecar saves the Caddy container's configuration (image, networks, volumes, ports, environment) to `$DATA_DIR/.l4-caddy-base-config.json`. This file is recaptured automatically if the Caddy image changes. Delete it manually to force a recapture.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/data` | Shared data volume (must match the `web` container) |
| `CADDY_CONTAINER_NAME` | `caddy-proxy-manager-caddy` | Name of the Caddy container to recreate |
| `POLL_INTERVAL` | `2` | Seconds between trigger file checks |
| `COMPOSE_DIR` | `/compose` | Path checked for `docker-compose.yml` (compose mode only) |
| `COMPOSE_PROJECT_NAME` | _(auto)_ | Override compose project name (compose mode only) |
| `COMPOSE_HOST_DIR` | — | Host path of the project directory for compose bind-mount resolution |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `DOCKER_API_VERSION` | `v1.43` | Docker Engine API version. The sidecar auto-negotiates downward if the daemon's max version is lower — override only if auto-detection fails. |

> [!WARNING]
> Mount the Docker socket **without** `:ro`. Both compose mode and direct mode issue Docker API calls (`docker inspect`, `docker compose`, and raw Engine API requests) that require write access to the socket. A read-only mount causes all of these calls to fail and the sidecar will not function.

### Compose Example

<details>
<summary>Full <code>docker-compose.yml</code> using fork web + caddy + l4-port-manager images (no bind-mount needed)</summary>

```yaml
services:
  web:
    container_name: caddy-proxy-manager-web
    image: ghcr.io/zsdonny/caddy-proxy-manager-web:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      SESSION_SECRET: ${SESSION_SECRET:?ERROR - SESSION_SECRET is required}
      CADDY_API_URL: ${CADDY_API_URL:-http://caddy:2019}
      BASE_URL: ${BASE_URL:-http://localhost:3000}
      DATABASE_PATH: /app/data/caddy-proxy-manager.db
      DATABASE_URL: file:/app/data/caddy-proxy-manager.db
      NEXTAUTH_URL: ${BASE_URL:-http://localhost:3000}
      ADMIN_USERNAME: ${ADMIN_USERNAME:?ERROR - ADMIN_USERNAME is required}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:?ERROR - ADMIN_PASSWORD is required}
    volumes:
      - caddy-manager-data:/app/data
      - caddy-logs:/logs:ro
      - caddy-data:/caddy-data:ro
    depends_on:
      caddy:
        condition: service_healthy
    networks:
      - caddy-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health',r=>{process.exit(r.statusCode<400?0:1)}).on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  caddy:
    container_name: caddy-proxy-manager-caddy
    image: ghcr.io/zsdonny/caddy-proxy-manager-caddy:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "80:80/udp"
      - "443:443"
      - "443:443/udp"
    environment:
      PRIMARY_DOMAIN: ${PRIMARY_DOMAIN:-caddyproxymanager.com}
    volumes:
      - caddy-data:/data
      - caddy-config:/config
      - caddy-logs:/logs
    networks:
      - caddy-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "-O", "/dev/null", "http://localhost:2019/config/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  l4-port-manager:
    container_name: caddy-proxy-manager-l4-ports
    # Fork image — adds composeless direct mode
    image: ghcr.io/zsdonny/caddy-proxy-manager-l4-port-manager:latest
    restart: unless-stopped
    environment:
      DATA_DIR: /data
      POLL_INTERVAL: "${L4_PORT_MANAGER_POLL_INTERVAL:-2}"
      # COMPOSE_DIR is not mounted — direct mode activates automatically
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # must NOT be :ro — both modes write to the socket (docker inspect, docker compose, Engine API)
      - caddy-manager-data:/data
    depends_on:
      caddy:
        condition: service_healthy

networks:
  caddy-network:
    driver: bridge

volumes:
  caddy-manager-data:
  caddy-data:
  caddy-config:
  caddy-logs:
```

</details>

## Macvlan Mode (Zero-Downtime L4)

In the default bridge mode, adding or removing L4 proxy host ports requires the caddy container to be recreated (Docker port bindings are immutable). With macvlan mode, Caddy gets its own static LAN IP and all ports bind directly — so L4 port changes become instant Caddy config reloads with no container restart.

**Requirements:** Linux host with a NIC that supports promiscuous mode. Test with:
```bash
ip link set <NIC> promisc on && ip link add test0 link <NIC> type macvlan mode bridge && ip link delete test0
```

**Portainer:** Paste `docker-compose.macvlan.yml` into the stack editor (instead of `docker-compose.yml`) and set the required environment variables.

**CLI:** `docker compose -f docker-compose.macvlan.yml up -d`

### Required env vars for macvlan mode

| Variable | Example | Description |
|---|---|---|
| `MACVLAN_PARENT` | `ens3` | Host NIC (find with `ip -brief link show`) |
| `MACVLAN_SUBNET` | `192.168.1.0/24` | Your LAN subnet |
| `MACVLAN_GATEWAY` | `192.168.1.1` | Your LAN gateway |
| `MACVLAN_IP_RANGE` | `192.168.1.200/30` | IP range to assign Caddy from |
| `CADDY_MACVLAN_IP` | `192.168.1.200` | Static IP for Caddy on your LAN |

> [!NOTE]
> The Docker host cannot reach Caddy's macvlan IP directly (Linux macvlan limitation). Other containers and LAN devices can. If host access is needed, create a macvlan shim interface on the host.

> [!NOTE]
> The `l4-port-manager` sidecar is not included in `docker-compose.macvlan.yml`. It is not needed — L4 port changes apply instantly.

### Switching back to bridge mode

Use `docker-compose.yml` (or paste it into Portainer). The `l4-port-manager` sidecar will start and the "Apply Ports" banner will reappear when L4 port bindings need updating.

---
<!-- ============================================================
     UPSTREAM README (fuomag9/caddy-proxy-manager)
     ============================================================ -->

# Caddy Proxy Manager

Web interface for managing [Caddy Server](https://caddyserver.com/) reverse proxies and certificates.

[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://mit-license.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com/)

[Report Bug](https://github.com/fuomag9/caddy-proxy-manager/issues) • [Request Feature](https://github.com/fuomag9/caddy-proxy-manager/issues)

<img width="100%" alt="Dashboard" src="site/assets/screenshots/dashboard-main.png" />

## Overview

This project provides a web UI for Caddy Server, eliminating the need to manually edit JSON configurations or Caddyfiles. It handles reverse proxies, access lists, and certificate management through a shadcn/ui interface. Built with Next.js 16, React 19, shadcn/ui, Tailwind CSS, Drizzle ORM, and TypeScript.

---

## Installation

```bash
git clone https://github.com/fuomag9/caddy-proxy-manager.git
cd caddy-proxy-manager
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

Access at `http://localhost:3000/login`

Data persists in Docker volumes (caddy-manager-data, caddy-data, caddy-config, caddy-logs).

---

## Features

- **Proxy Hosts** - Reverse proxies with custom headers, multiple upstreams, load balancing, and enable/disable toggle
- **L4 Proxy Hosts** - TCP/UDP stream proxying with TLS SNI matching, proxy protocol (v1/v2), load balancing, health checks, and per-host geo blocking
- **WAF** - Web Application Firewall powered by Coraza with optional OWASP Core Rule Set (SQLi, XSS, LFI, RCE). Per-host enable/disable, global and per-host rule suppression, custom SecLang directives, and a searchable event log with severity and blocked/detected classification
- **Analytics** - Live traffic charts, protocol breakdown, country map, top user agents, and blocked request log with configurable time ranges
- **Search & Pagination** - Server-side search and pagination on all data tables (proxy hosts, access lists, audit log, certificates)
- **Geo Blocking** - Block or allow traffic by country, continent, ASN, CIDR range, or exact IP per proxy host
- **Access Lists** - Multi-account HTTP basic auth protection assignable per proxy host
- **Certificates** - Automatic HTTPS for every proxy host via Caddy ACME (Let's Encrypt / ZeroSSL), with issuer and expiry visibility + manual SSL/TLS import. Built-in CA for issuing internal client certificates
- **Instance Sync** - Master/slave configuration sync for multi-instance deployments. The master pushes proxy hosts, certificates, access lists, and settings to slaves on every change
- **Settings** - ACME email, Cloudflare DNS-01, upstream DNS pinning defaults, Authentik outpost, Prometheus metrics
- **Audit Log** - Searchable configuration change history with user attribution
- **Mobile UI** - Fully responsive interface optimised for iPhone and other narrow viewports

---

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SESSION_SECRET` | Session encryption key (32+ chars) | None | **Yes** |
| `ADMIN_USERNAME` | Admin login username | `admin` | **Yes** |
| `ADMIN_PASSWORD` | Admin password (see requirements below) | `admin` (dev only) | **Yes** |
| `BASE_URL` | Public URL where users access the dashboard.<br/>**Required for OAuth** - must match redirect URI | `http://localhost:3000` | **Yes** (if using OAuth) |
| `CADDY_API_URL` | Caddy Admin API endpoint | `http://caddy:2019` (prod)<br/>`http://localhost:2019` (dev) | No |
| `DATABASE_URL` | SQLite database URL | `file:/app/data/caddy-proxy-manager.db` | No |
| `CERTS_DIRECTORY` | Certificate storage directory | `./data/certs` | No |
| `CADDY_CERTS_DIR` | Caddy cert storage path used for ACME metadata scanning (non-default deployments) | `/caddy-data/caddy/certificates` | No |
| `LOGIN_MAX_ATTEMPTS` | Max login attempts before rate limit | `5` | No |
| `LOGIN_WINDOW_MS` | Rate limit window in milliseconds | `300000` (5 min) | No |
| `LOGIN_BLOCK_MS` | Rate limit block duration in milliseconds | `900000` (15 min) | No |
| `OAUTH_ENABLED` | Enable OAuth2/OIDC authentication | `false` | No |
| `OAUTH_PROVIDER_NAME` | Display name for OAuth provider | `OAuth2` | No |
| `OAUTH_CLIENT_ID` | OAuth2 client ID | None | No |
| `OAUTH_CLIENT_SECRET` | OAuth2 client secret | None | No |
| `OAUTH_ISSUER` | OAuth2 OIDC issuer URL | None | No |
| `OAUTH_AUTHORIZATION_URL` | Optional OAuth authorization endpoint override | Auto-discovered from `OAUTH_ISSUER` | No |
| `OAUTH_TOKEN_URL` | Optional OAuth token endpoint override | Auto-discovered from `OAUTH_ISSUER` | No |
| `OAUTH_USERINFO_URL` | Optional OAuth userinfo endpoint override | Auto-discovered from `OAUTH_ISSUER` | No |
| `OAUTH_ALLOW_AUTO_LINKING` | Allow auto-linking OAuth identities to existing users | `false` | No |
| `INSTANCE_MODE` | Instance role: `standalone`, `master`, or `slave` | `standalone` | No |
| `INSTANCE_SYNC_TOKEN` | Bearer token slaves use to authenticate sync requests | None | No (required if `slave`) |
| `INSTANCE_SLAVES` | JSON array of slave instances for the master to push to | None | No |
| `INSTANCE_SYNC_INTERVAL` | Periodic sync interval in seconds (`0` = disabled) | `0` | No |
| `INSTANCE_SYNC_ALLOW_HTTP` | Allow sync over HTTP (for internal Docker networks) | `false` | No |

**Production Requirements:**
- `SESSION_SECRET`: 32+ characters (`openssl rand -base64 32`)
- `ADMIN_PASSWORD`: 12+ chars with uppercase, lowercase, numbers, and special characters

Development mode (`NODE_ENV=development`) allows default `admin`/`admin` credentials.

---


## Security

- Production enforces strong passwords (12+ chars, mixed case, numbers, special characters)
- 32+ character session secrets required
- Login rate limiting: 5 attempts per 5 minutes
- Audit trail for all configuration changes
- Supports OAuth2/OIDC for SSO

**Production Setup:**
```bash
export SESSION_SECRET=$(openssl rand -base64 32)
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="YourStr0ng-P@ssw0rd123!"
docker compose up -d
```

**Limitations:**
- Certificate private keys stored unencrypted in SQLite
- In-memory rate limiting (not suitable for multi-instance deployments)

---

## Certificate Management

Caddy automatically obtains Let's Encrypt certificates for all proxy hosts.

**Cloudflare DNS-01** (optional): Configure in Settings with a Cloudflare API token (`Zone.DNS:Edit` permissions).

**Custom Certificates** (optional): Import your own certificates via the Certificates page. Private keys are stored unencrypted in SQLite.

---

## Geo Blocking

Geo blocking is configured per proxy host. It requires MaxMind GeoLite2 databases (see [GeoIP Setup](#geoip-setup)).

### Rule types

| Type | Example | Description |
|------|---------|-------------|
| Country | `DE` | ISO 3166-1 alpha-2 country code |
| Continent | `EU` | `AF`, `AN`, `AS`, `EU`, `NA`, `OC`, `SA` |
| ASN | `24940` | Autonomous System Number |
| CIDR | `91.98.150.0/24` | IP range in CIDR notation |
| IP | `91.98.150.103` | Exact IP address |

Rules can be **block** or **allow**. Allow rules take precedence over block rules — you can block an entire continent and then allow specific IPs or ASNs through.

### GeoIP Setup

Geo blocking requires MaxMind GeoLite2 Country and/or ASN databases. Use the bundled `geoipupdate` service:

1. Register for a free MaxMind account at [maxmind.com](https://www.maxmind.com/)
2. Generate a license key with `GeoLite2-Country` and `GeoLite2-ASN` permissions
3. Add to your `.env`:
   ```
   GEOIPUPDATE_ACCOUNT_ID=your-account-id
   GEOIPUPDATE_LICENSE_KEY=your-license-key
   ```
4. Start with the `geoipupdate` profile:
   ```bash
   docker compose --profile geoipupdate up -d
   ```

The databases are stored in the `geoip-data` Docker volume and shared between the web and Caddy containers.

---

## WAF (Web Application Firewall)

The WAF is powered by [Coraza](https://coraza.io/) and integrates the OWASP Core Rule Set.

Enable globally in **WAF → Settings**, then optionally override per proxy host. Two modes:
- **Block** — requests matching rules are rejected with 403
- **Detect** — requests are logged but not blocked

**OWASP CRS** covers SQLi, XSS, LFI, RCE, and more (enabled by default when WAF is on).

**Rule suppression** — suppress noisy rules globally or per host from the event detail drawer or the Suppressed Rules tab.

**Custom directives** — any ModSecurity SecLang syntax is accepted, e.g.:
```
SecRule REQUEST_URI "@beginsWith /api/" "id:9001,phase:1,ctl:ruleEngine=Off,nolog"
```

---

## Instance Sync

Run a master instance that pushes configuration to one or more slaves on every change.

```bash
# Master
INSTANCE_MODE=master
INSTANCE_SLAVES='[{"name":"replica","url":"https://replica.example.com","token":"<32-char-token>"}]'

# Slave
INSTANCE_MODE=slave
INSTANCE_SYNC_TOKEN=<32-char-token>
```

Synced data: proxy hosts, certificates, access lists, and settings. User accounts are **not** synced.

Use HTTPS slave URLs in production. Set `INSTANCE_SYNC_ALLOW_HTTP=true` only for internal Docker networks.

See the [Environment Variables Reference](https://github.com/fuomag9/caddy-proxy-manager/wiki/Environment-Variables-Reference) for all `INSTANCE_*` options.

---

## Upstream DNS Pinning

You can enable upstream DNS pinning globally (**Settings → Upstream DNS Pinning**) and override per host (**Proxy Host → Upstream DNS Pinning**).

When enabled, hostname upstreams are resolved during config save/reload and written to Caddy as concrete IP dials. Address family selection supports:
- `both` (preferred, resolves AAAA then A with IPv6 preference)
- `ipv6`
- `ipv4`

### Important HTTPS Limitation

If one reverse proxy handler contains multiple different HTTPS upstream hostnames, HTTPS pinning is skipped for those HTTPS upstreams to avoid TLS SNI mismatch. In that case, hostname dials are kept for those HTTPS upstreams.

HTTP upstreams in the same handler are still eligible for pinning.

---

## OAuth Authentication

Supports any OIDC-compliant provider (Authentik, Keycloak, Auth0, etc.).

```bash
# Set your public URL (REQUIRED for OAuth to work)
BASE_URL=https://caddy-manager.example.com

OAUTH_ENABLED=true
OAUTH_PROVIDER_NAME="Authentik"  # Display name
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_ISSUER=https://auth.example.com/application/o/app/
```

**Redirect URI Configuration:**

You must configure this redirect URI in your OAuth provider:
```
{BASE_URL}/api/auth/callback/oauth2
```

Examples:
- `http://localhost:3000/api/auth/callback/oauth2` (development)
- `https://caddy-manager.example.com/api/auth/callback/oauth2` (production)

The `BASE_URL` environment variable must match exactly where users access your dashboard.

OAuth login appears on the login page alongside credentials. Users can link OAuth to existing accounts from the Profile page.

---

## Roadmap

- [ ] Multi-user RBAC
- [ ] Additional DNS providers (Route53, Namecheap, etc.)

[Open an issue](https://github.com/fuomag9/caddy-proxy-manager/issues) for feature requests.

---

## Contributing

Contributions welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open a Pull Request

- Follow the existing code style (TypeScript, Prettier formatting)
- Add tests for new features when applicable
- Update documentation for user-facing changes
- Keep commits focused and write clear commit messages

---

## Support

- **Issues:** [GitHub Issues](https://github.com/fuomag9/caddy-proxy-manager/issues) for bugs and feature requests
- **Discussions:** [GitHub Discussions](https://github.com/fuomag9/caddy-proxy-manager/discussions) for questions and ideas

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **[Caddy Server](https://caddyserver.com/)** – The amazing web server that powers this project
- **[Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)** – The original project
- **[Next.js](https://nextjs.org/)** – React framework for production
- **[shadcn/ui](https://ui.shadcn.com/)** – Beautifully designed components built on Radix UI and Tailwind CSS
- **[Drizzle ORM](https://orm.drizzle.team/)** – Lightweight SQL migrations and type-safe queries

---

<div align="center">

[⬆ back to top](#caddy-proxy-manager)

</div>
