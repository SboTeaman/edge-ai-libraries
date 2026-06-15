# Intel XPU Monitoring Dashboard

A ready-to-run Grafana + Prometheus stack for monitoring **Intel XPU** (GPU + NPU)
and system (CPU / RAM / temperature) telemetry — Intel's structured answer to
NVIDIA's GPU Telemetry stack (dcgm-exporter + published dashboard + docs).

```
exporter ───────► Prometheus ───────► Grafana
(metrics-manager     (1s scrape,        (auto-provisioned
 or standalone)       retention)         dashboards)
```

## Who this is for

- ✅ **Embedded SI / ODM and edge integrators** who want a working Intel XPU
  dashboard out of the box, without wiring Grafana/Prometheus by hand.
- ✅ Teams evaluating Intel GPU/NPU workloads who need power/utilization/thermal
  visibility (e.g. checking whether a workload hits the platform power limit).
- ⚠️ **Not aimed at** cloud-native teams who already run their own Prometheus
  stack — for them this is a reference, not a product. Value is highest at the
  "basic metrics export to Grafana" layer.

## Quick Start

```bash
cd tools/monitoring-dashboard

# 1. Configure
cp .env.example .env

# 2. Start (default: metrics-manager variant)
docker compose up -d --build

# 3. Open http://localhost:3000
#    Login: admin / admin
```

**For detailed step-by-step instructions:** see [**INSTALL.md**](./docs/INSTALL.md)

First run builds the image (~3 minutes). Subsequent starts are fast.

**Other variants:**
```bash
# CPU + NPU only (no GPU support):
docker compose -f compose.standalone-prometheus.yaml up -d --build

# Demo (synthetic metrics, no hardware needed):
docker compose -f compose.demo.yaml up -d --build
```

**To stop:**
```bash
docker compose down              # keep data
docker compose down -v           # delete everything
```

---

## Two variants

| File | Engine | Coverage | Use case |
|---|---|---|---|
| `compose.with-metrics-manager.yaml` | **metrics-manager** (recommended) | GPU + NPU + CPU + custom, SSE | Customer A — richest, unified collector |
| `compose.standalone-prometheus.yaml` *(Phase 3)* | node-exporter + npu-metrics-exporter | CPU + NPU (GPU needs qmmd/xpu-manager separately) | Customer B — health monitoring at scale, no MM overhead |

> **Why metrics-manager is recommended:** it is the only collector that unifies
> Intel GPU (via qmassa), NPU and CPU/system in a single container. Intel has no
> clean standalone GPU exporter (intel-gpu-exporter is archived), so the
> standalone variant is intentionally GPU-limited.

## Verify

Check that metrics are flowing:

```bash
# CPU metrics
curl -s http://localhost:9273/metrics | grep -E '^cpu_' | head

# GPU metrics (if Intel GPU present)
curl -s http://localhost:9273/metrics | grep -E '^gpu_' | head

# NPU metrics (if Intel NPU present)
curl -s http://localhost:9273/metrics | grep -E '^npu_' | head
```

## Demo mode (no Intel hardware)

To see the dashboards populated **without any Intel GPU/NPU** (for demos,
screenshots, dashboard validation), run the synthetic stack. Pick which hardware
to simulate with `DEMO_PROFILE` — GPU/NPU panels stay empty when that part is
off, exactly like a real host without it:

```bash
GF_SECURITY_ADMIN_PASSWORD=demo DEMO_PROFILE=cpu+gpu+npu \
  docker compose -f compose.demo.yaml up -d
# other profiles: cpu | cpu+gpu | cpu+npu | cpu+gpu+npu (default)
# Grafana: http://localhost:3000  (admin / demo)
docker compose -f compose.demo.yaml down
```

Demo data is synthetic (animated) — it proves the dashboards, datasource,
provisioning and PromQL work; it is **not** real telemetry.

## Configuration & passwords

All settings live in `.env` (copy from `.env.example`).

### Grafana admin password

Default: `admin` (username: `admin`)

> **⚠️ For development/testing only.** Change `GF_SECURITY_ADMIN_PASSWORD` in `.env` to something strong for production.

If you need to change it: edit `.env`, then `docker compose down && docker compose up -d`.

### Other settings

- `HOST_GRAFANA_PORT` — Grafana port (default 3000)
- `PROM_RETENTION_TIME` — how long to keep metrics (default 7 days)
- `PROM_RETENTION_SIZE` — disk cap for Prometheus (default 2GB, soft limit)
- `METRICS_MANAGER_HOSTNAME` — fixed hostname label (useful for stable dashboards across reboots)
- Proxy settings (`http_proxy`, `https_proxy`, `no_proxy`) — passed to Docker build and containers

## Data volume

Prometheus retention is bounded by **both** time (`PROM_RETENTION_TIME`, default
7d) and size (`PROM_RETENTION_SIZE`, default 2GB) — whichever hits first. Note
the size cap is *soft* (it bounds compacted blocks, not the write-ahead log /
head chunks), so provision disk headroom (~2× the cap).

## Documentation

**Getting started:**
- **[INSTALL.md](./docs/INSTALL.md)** ← **START HERE** — step-by-step on Linux (5 min)

**Deeper dives:**
- **[run-on-target-linux.md](./docs/run-on-target-linux.md)** — detailed walkthrough with verification
- **[deployment-scenarios.md](./docs/deployment-scenarios.md)** — proxy, fleet, CI/CD, Kubernetes, etc.
- **[metric-sources.md](./docs/metric-sources.md)** — where metrics come from (internals)
- **[passwords-and-security.md](./docs/passwords-and-security.md)** — password reset, security tips
- **[intel-xpu-telemetry.md](./docs/intel-xpu-telemetry.md)** — complete reference

## Status

- **Variant A** (with metrics-manager): full stack, GPU + NPU + CPU + custom metrics
- **Variant B** (standalone): node-exporter + npu-exporter, CPU + NPU only
- **Kubernetes:** `kustomization.yaml` packages dashboards for sidecar auto-discovery
- **Next:** publish dashboards on grafana.com (manual, requires org account)
