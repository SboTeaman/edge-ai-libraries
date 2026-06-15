# Installation on Linux (Intel XPU Machine)

Ultra-fast setup for a real Linux machine with Intel GPU and/or NPU.

---

## Prerequisites (one-time check)

```bash
# Check OS
uname -a
# Output should contain: Linux ... x86_64

# Check Intel GPU is present
ls -l /dev/dri/renderD128
# If missing: GPU driver not loaded (see troubleshooting below)

# Check Docker is installed
docker --version
docker compose version
# If missing: install Docker (https://docs.docker.com/engine/install/)
```

If all three ✓ pass, go to **Setup** below.

---

## Setup (5 minutes)

### Step 1: Get the code

```bash
# If you already have the repo, just update it
cd /path/to/repo/tools/monitoring-dashboard

# If not, clone it first
git clone https://github.com/...  /opt/intel-xpu-monitoring
cd /opt/intel-xpu-monitoring/tools/monitoring-dashboard
```

### Step 2: Configure

```bash
# Copy template (default is admin/admin)
cp .env.example .env
```

**Behind a proxy?** Edit `.env` and add:

```bash
http_proxy=http://proxy.corp.com:3128
https_proxy=http://proxy.corp.com:3128
no_proxy=localhost,127.0.0.1
```

Otherwise, no editing needed — default password is `admin`.

### Step 3: Start

```bash
# First time (builds the image, ~3-5 min)
docker compose up -d --build

# Subsequent times (fast)
docker compose up -d
```

**Wait for it to stabilize (~10 seconds).**

**Note:** `docker-compose.yml` is the default (metrics-manager variant).  
For other variants, use: `-f compose.demo.yaml` or `-f compose.standalone-prometheus.yaml`

---

## Access (open in browser)

```
http://<your-ip>:3000
```

Login:
- **Username:** `admin`
- **Password:** `admin`

Navigate to folder: **Intel XPU** → dashboards with real metrics appear.

---

## Verify metrics are flowing

```bash
# Check CPU metrics
curl -s http://localhost:9273/metrics | grep "^cpu_usage_user"

# Check GPU metrics (Intel GPU present)
curl -s http://localhost:9273/metrics | grep "^gpu_power"

# Check NPU metrics (Intel NPU present)
curl -s http://localhost:9273/metrics | grep "^npu_power"
```

If all three show values → **you're done!** ✅

---

## Troubleshooting

### GPU panels are empty

**Check if GPU driver is loaded:**

```bash
ls -l /dev/dri/renderD128
```

- **File exists:** Driver is loaded. Check qmassa logs:
  ```bash
  docker logs metrics-manager 2>&1 | grep -i qmassa | tail -20
  ```

- **File missing:** Driver not loaded. Fix:
  ```bash
  # Try to load i915 driver (Intel iGPU)
  sudo modprobe i915
  
  # Or xe driver (newer Intel GPUs)
  sudo modprobe xe
  
  # Check BIOS: confirm Intel GPU is enabled
  # Then restart the stack:
  docker compose restart metrics-manager
  ```

### Prometheus won't start

```bash
docker logs xpu-prometheus-prod
```

Look for config errors. Most common: scrape timeout misconfiguration (should already be fixed, but if not, report it).

### Build fails

```bash
# Check Docker can pull images
docker pull hello-world

# If behind proxy, ensure you set http_proxy/https_proxy in .env before build
docker compose down
# Edit .env with proxy settings
docker compose up -d --build
```

### High disk usage

Prometheus stores metrics on disk. Reduce retention:

```bash
# Edit .env
PROM_RETENTION_TIME=1d     # was 7d
PROM_RETENTION_SIZE=500MB  # was 2GB

# Restart
docker compose down -v
docker compose up -d
```

### Password reset

```bash
# Reset to default (admin/admin)
docker compose down -v
docker compose up -d
```

Or edit `.env` with a different password, then `docker compose up -d`.

---

## Stop the stack

```bash
# Keep data (volumes stay)
docker compose down

# Delete everything (fresh start)
docker compose down -v
```

---

## Next steps

- **View dashboards:** Intel XPU folder in Grafana (http://localhost:3000)
- **Understand metrics:** See [docs/metric-sources.md](./metric-sources.md)
- **Multiple machines:** Deploy same way on each; each gets its own Grafana
- **Add NPU later:** Just restart the container when NPU + driver are present:
  ```bash
  docker compose restart metrics-manager
  ```

---

## Quick commands reference

```bash
# Status
docker compose ps

# Logs
docker compose logs -f

# Logs from metrics-manager only
docker compose logs -f metrics-manager

# Restart
docker compose restart metrics-manager

# Stop
docker compose down

# Full reset
docker compose down -v
docker compose up -d --build
```

---

## Support

- **Setup issues:** Check Prerequisites section above
- **Metrics missing:** Check Verify section above
- **Advanced scenarios:** See [docs/deployment-scenarios.md](./deployment-scenarios.md)
- **Full reference:** See [docs/intel-xpu-telemetry.md](./intel-xpu-telemetry.md)
