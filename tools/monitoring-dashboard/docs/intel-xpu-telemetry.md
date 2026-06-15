# Intel XPU Telemetry — Guide

> Dedicated end-to-end documentation for the Intel XPU monitoring stack
> (the third NVIDIA-parity pillar: exporter + published dashboard + **docs**).

## 1. Overview

Intel's monitoring landscape is fragmented (xpu-manager, qmassa/qmmd,
intel-gpu-exporter [archived], npu-monitor-tool). This tool provides one
discoverable, documented, ready-to-run stack:

```
exporter ──► Prometheus ──► Grafana (auto-provisioned dashboards)
```

It mirrors NVIDIA's structured answer (dcgm-exporter + grafana.com dashboard +
GPU Telemetry docs) for Intel XPU.

## 2. Architecture

### Variant A — with metrics-manager (recommended)

```
[metrics-manager :9273]  ──scrape 1s──►  [Prometheus]  ──►  [Grafana :3000]
   GPU (qmassa) + NPU + CPU + custom        7d / 2GB           Intel XPU folder
```

- One target (`metrics-manager:9273`) carries system + GPU + NPU + custom
  metrics (custom pushes are forwarded to Telegraf and re-exposed there).
- Prometheus is **not** published on the host (metrics-manager already binds
  9090); Grafana reaches it over the internal `metric-network`.
- metrics-manager is included verbatim from the microservice via Compose
  `include` — this tool never duplicates or modifies the service definition.

### Variant B — standalone Prometheus

```
[node-exporter :9100]        ┐
[npu-metrics-exporter :8000] ├─scrape──►  [Prometheus]  ──►  [Grafana :3000]
[qmmd (GPU, optional)]       ┘
```

For deployments that do not run metrics-manager. **Honest limitations:**

| Area | Variant A (MM) | Variant B (standalone) |
|---|---|---|
| GPU | ✅ qmassa, built in | ⚠️ needs qmmd/xpu-manager run separately |
| NPU | ✅ `npu_*` | ✅ via relabel `npu_monitor_*`→`npu_*` |
| System | ✅ Telegraf (`cpu_usage_*`, `mem_*`) | node-exporter (`node_*`) — use dashboard 1860 |
| Custom metrics / SSE | ✅ | ❌ |

The repo's system/GPU dashboards target metrics-manager names and apply to
variant A. On variant B, the **NPU dashboard works** (Prometheus relabels the
exporter's `npu_monitor_*` to canonical `npu_*`); for system metrics import the
community **Node Exporter Full** dashboard (grafana.com ID `1860`).

## 3. Quick start

```bash
cp .env.example .env   # set GF_SECURITY_ADMIN_PASSWORD
# Variant A (recommended):
docker compose up -d --build
# Variant B:
docker compose -f compose.standalone-prometheus.yaml up -d --build
# Grafana: http://localhost:3000  (admin / your password)
```

Stop and free resources (telemetry need not run 24/7):

```bash
docker compose down   # add -v to drop volumes
```

## 4. Metrics reference

Confirmed Prometheus metric names exposed by metrics-manager (`:9273`):

| Area | Metric | Labels |
|---|---|---|
| CPU usage | `cpu_usage_user`, `cpu_usage_system`, `cpu_usage_idle` | `cpu` |
| RAM | `mem_used_percent`, `mem_available_percent`, `mem_total`, `mem_used` | — |
| CPU freq | `cpu_frequency_avg_frequency` (kHz) | — |
| Temp (PKG) | `temp_temp` | `sensor` |
| GPU engine | `gpu_engine_usage_usage` | `engine`, `type`, `host`, `gpu_id` |
| GPU freq | `gpu_frequency` | `type`, `host`, `gpu_id` |
| GPU power | `gpu_power` | `type`, `host`, `gpu_id` |
| NPU | `npu_power`, `npu_frequency`, `npu_temperature`, `npu_bandwidth`, `npu_tile_config`, `npu_utilization`, `npu_memory_mb` | `host` |

> Requires Intel GPU and/or NPU present. On hosts without the hardware the
> respective readers idle and those panels stay empty (the stack still runs and
> shows CPU/system metrics).

## 5. Dashboards

Auto-provisioned under the **Intel XPU** folder (datasource uid `prometheus`,
zero manual import):

| File | Dashboard | Focus |
|---|---|---|
| `0-overview.json` | Overview (starter) | quick landing: CPU, RAM, GPU/NPU power |
| `1-system.json` | System | CPU usage, RAM, CPU package temp, avg frequency |
| `2-gpu-power.json` | GPU Power | power by domain per GPU; total; peak over range — "am I hitting the platform power limit?" |
| `3-gpu-performance.json` | GPU Performance | engine utilization (render/compute/copy/video), clocks |
| `4-npu.json` | NPU | utilization, power, temp, frequency, bandwidth, memory |

Each is deliberately scoped to one task (per review feedback: don't pile every
metric on one screen). All carry a `host` template variable; GPU dashboards add
`gpu_id`.

## 6. Saving / reviewing specific time windows

Grafana's time-range selector + **Share → Snapshot** capture a specific window;
Prometheus retains history within the configured window. A first-class
"recording" workflow (mark a window via the metrics-manager API) is a future,
optional metrics-manager feature — out of scope here.

## 7. Kubernetes

In K8s, metrics-manager already ships a `ServiceMonitor`, so a
kube-prometheus-stack Prometheus auto-discovers it (the NVIDIA dcgm-style path).
Load the same dashboards via the Grafana sidecar:

```bash
kubectl apply -k tools/monitoring-dashboard/ -n monitoring
```

This packages the dashboard JSONs (single source of truth) into a ConfigMap
labeled `grafana_dashboard: "1"` for sidecar discovery. Requires
`sidecar.dashboards.enabled=true` in the stack.

## 8. Publishing on grafana.com (NVIDIA-parity, pillar 2)

To give Intel an officially discoverable dashboard like NVIDIA's #12239
(importable by ID), publish each dashboard JSON to grafana.com:

1. Sign in to grafana.com with the corporate/org account.
2. **Dashboards → Publish a dashboard → upload JSON** (e.g. `4-npu.json`).
3. Set datasource requirement to **Prometheus**, add a screenshot + description.
4. Note the assigned dashboard ID; reference it in this guide and the README.
5. Keep the published JSON in sync with this repo on each release.

> This step is manual (requires the grafana.com account) and is the remaining
> action to complete pillar 2.

## 9. Configuration reference

All knobs live in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `GF_SECURITY_ADMIN_PASSWORD` | — (required) | Grafana admin password |
| `GF_AUTH_ANONYMOUS_ENABLED` | `false` | read-only viewing without login |
| `HOST_GRAFANA_PORT` | `3000` | Grafana UI host port |
| `PROM_RETENTION_TIME` | `7d` | drop samples older than this |
| `PROM_RETENTION_SIZE` | `2GB` | soft cap on blocks (keep disk ≥ 2×) |
| `HOST_PROMETHEUS_PORT` | (unset) | optional host port for Prometheus debug |

## 10. Troubleshooting

- **Prometheus won't start** → ensure `scrape_timeout <= scrape_interval` in the
  Prometheus config (it refuses to start otherwise; both are `1s` here).
- **Empty GPU/NPU panels** → confirm Intel hardware + drivers (`/dev/dri`,
  `intel_vpu`). CPU/system panels should still populate.
- **Datasource not green** → confirm the `prometheus` container is healthy and on
  the same network; datasource uid must be `prometheus`.
- **Disk usage above the size cap** → expected; `retention.size` bounds compacted
  blocks, not WAL/head. Lower `PROM_RETENTION_TIME`/`SIZE` or add disk.
- **Variant B: NPU panels empty but exporter up** → check the relabel rules in
  `prometheus.standalone.yml`; metrics arrive as `npu_monitor_*` and are renamed
  to `npu_*`.
