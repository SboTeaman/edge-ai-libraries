# Passwords & Security

Explanation of password management in the monitoring stack.

---

## Grafana admin password (`GF_SECURITY_ADMIN_PASSWORD`)

### What is it?

The password for the `admin` user in Grafana. You use this to log in at `http://localhost:3000`.

### Where is it stored?

In the `.env` file:

```bash
GF_SECURITY_ADMIN_PASSWORD=MySecurePassword123
```

### Who uses it?

1. **docker compose** — when starting Grafana, sets this as the admin password
2. **You** — to log in to the web UI at http://localhost:3000

### How to set it?

Default is `admin` (from `.env.example`). To change:

**Option 1: Edit .env before starting**

```bash
cp .env.example .env
# Edit .env: change GF_SECURITY_ADMIN_PASSWORD to something strong
GF_SECURITY_ADMIN_PASSWORD=MySecurePassword123
docker compose up -d
```

**Option 2: Inline environment variable**

```bash
cp .env.example .env
GF_SECURITY_ADMIN_PASSWORD=MySecurePassword123 docker compose up -d
```

(This overrides `.env` without modifying the file.)

### Password requirements

- **Minimum:** 8 characters
- **Recommended:** use alphanumeric + underscore only (to avoid shell escaping issues)
- **Avoid:** special chars like `$`, `'`, `"`, `\` (they can break sed/shell commands)

If you use special chars, you may see a warning — it doesn't break things, but it's safer to keep it simple.

### What if I forget it?

There are two ways:

**Option 1: Reset via environment (easiest)**

```bash
cd tools/monitoring-dashboard

# Stop the stack
docker compose down -v

# Update .env with new password
echo 'GF_SECURITY_ADMIN_PASSWORD=NewPassword123' >> .env

# Restart (volumes are gone, so Grafana resets)
docker compose up -d --build
```

**Option 2: Reset via Grafana CLI (advanced)**

If you have an existing Grafana with data you want to keep:

```bash
# List users
docker exec xpu-grafana-*  grafana-cli admin list-users

# Reset password
docker exec xpu-grafana-* grafana-cli admin reset-admin-password NewPassword123

# Update .env so it matches
echo 'GF_SECURITY_ADMIN_PASSWORD=NewPassword123' >> .env
```

---

## Other passwords / secrets

### Prometheus

**No password.** Prometheus is internal (inside Docker network) and doesn't expose auth.

Only accessible from inside containers or via port 9090 on the host (if `HOST_PROMETHEUS_PORT` is set).

### metrics-manager

**No auth required.** The `/metrics` endpoint is public (Prometheus scrapes it).

Custom metric ingestion (`POST /api/v1/metrics`) has no auth by default. If you need auth, 
see the [metrics-manager docs](../../microservices/metrics-manager/README.md).

---

## Network security

### Default: containers isolated

All containers (Grafana, Prometheus, metrics-manager) are on a private Docker bridge network.
Only the host can reach:
- Grafana on port 3000
- metrics-manager on port 9090 (optional)
- Prometheus on port 9090 (if `HOST_PROMETHEUS_PORT` is set)

### Exposing to the network

If you need multiple machines to access this Grafana, expose the port on your firewall,
but **keep the password strong**:

```bash
# .env
HOST_GRAFANA_PORT=3000

# Then access from another machine:
# http://<your-ip>:3000  (admin / your password)
```

**Security tip:** Consider using a reverse proxy (nginx, Apache) with TLS/HTTPS and additional auth.

---

## Demo mode

In `compose.demo.yaml`, the default password is hardcoded:

```yaml
environment:
  - GF_SECURITY_ADMIN_PASSWORD=${GF_SECURITY_ADMIN_PASSWORD:-demo}
```

- If you set `GF_SECURITY_ADMIN_PASSWORD=mypass`, it uses `mypass`
- If unset, it defaults to `demo` (not recommended for production)

To override:

```bash
GF_SECURITY_ADMIN_PASSWORD=MyPassword123 \
  docker compose -f compose.demo.yaml up -d
```

---

## Best practices

| Do ✓ | Don't ✗ |
|---|---|
| Use strong passwords (12+ chars) | Use `admin/admin` |
| Store .env in a secure location (not on GitHub) | Commit .env to version control |
| Use alphanumeric + underscore | Use `$` or `'` in password (hard to escape in shell) |
| Change password periodically | Share password via plaintext email |
| Use HTTPS + reverse proxy for network access | Expose Grafana directly to the internet with weak password |
| Back up Grafana data (`docker compose ... down -v` makes clean slate) | Keep old .env files with passwords lying around |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **Grafana login fails (admin / admin doesn't work)** | .env password doesn't match what Grafana was initialized with. Run `docker compose down -v` and restart — Grafana will reinitialize with the .env password. |
| **Want to change password later** | Edit `.env`, then `docker compose down && docker compose up -d`. |
| **Forgot password** | `docker compose down -v` (deletes Grafana data) and start fresh — Grafana will use the .env password. |

---

## Summary

- **Grafana password:** stored in `.env`, used by docker compose to initialize Grafana
- **Default:** `admin` (from `.env.example`)
- **Other services:** no passwords needed (internal only)
- **Security:** keep .env out of version control, use strong alphanumeric passwords (or defaults for dev)
- **Forgot password?** `docker compose down -v` to reset, then start fresh

That's it. Passwords are simple — the stack is designed to be painless for edge deployments.
