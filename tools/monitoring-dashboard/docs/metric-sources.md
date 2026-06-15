# Metric Sources — Where does each metric come from?

Complete trace from hardware to Grafana dashboard.

---

## Architecture overview

```
┌─────────────────────── HOST (Linux) ───────────────────────┐
│                                                              │
│  Hardware:                                                   │
│  ┌─ /dev/dri/renderD128 (Intel GPU)                        │
│  ├─ /sys/bus/pci/drivers/intel_vpu/ (Intel NPU)            │
│  └─ /proc/stat, /proc/meminfo, /sys/class/hwmon (CPU/RAM) │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Docker Container: metrics-manager                   │  │
│  │  (supervisord orchestrates all below)                │  │
│  │                                                       │  │
│  │  1. Telegraf (:9273)  ← reads CPU/RAM/Thermal       │  │
│  │                                                       │  │
│  │  2. qmassa_reader.py  ← reads qmassa FIFO           │  │
│  │     └─ qmassa (--to-json /app/qmassa.fifo)          │  │
│  │        reads /dev/dri/renderD128                     │  │
│  │                                                       │  │
│  │  3. npu_reader.py  ← reads PmtTelemetry              │  │
│  │     └─ reads /sys/bus/pci/drivers/intel_vpu/        │  │
│  │                                                       │  │
│  │  4. metrics-manager FastAPI (:9090)  ← scrapes       │  │
│  │     Telegraf (:9273) and outputs to Prometheus      │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Container: Prometheus (scrapes :9273)              │  │
│  │  Endpoint: http://prometheus:9090/api/v1/...        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
              ↓ (scrapes :9273 every 1s)
┌──────────────────────────────────────────────────────────────┐
│  Container: Grafana (:3000)                                   │
│  Datasource: Prometheus (uid="prometheus")                    │
│  Dashboards auto-load from provisioning                       │
└──────────────────────────────────────────────────────────────┘
```

---

## Metric families by source

### CPU (via Telegraf's system input plugin)

| Metric | Source | Location | Format |
|---|---|---|---|
| `cpu_usage_user` | `/proc/stat` | Telegraf → Prometheus | % (0-100) |
| `cpu_usage_system` | `/proc/stat` | Telegraf → Prometheus | % (0-100) |
| `cpu_usage_idle` | `/proc/stat` | Telegraf → Prometheus | % (0-100) |
| `cpu_frequency_avg_frequency` | `/proc/cpuinfo` | Telegraf → Prometheus | kHz |

**How it flows:**
1. Telegraf reads `/proc/stat` every 1s
2. Telegraf outputs InfluxDB line protocol to its HTTP listener (:8186)
3. metrics-manager scrapes Telegraf (:9273) and converts to Prometheus format
4. Prometheus scrapes metrics-manager (:9273)

---

### Memory (via Telegraf's mem input plugin)

| Metric | Source | Location | Format |
|---|---|---|---|
| `mem_used_percent` | `/proc/meminfo` | Telegraf → Prometheus | % (0-100) |
| `mem_available_percent` | `/proc/meminfo` | Telegraf → Prometheus | % (0-100) |
| `mem_total` | `/proc/meminfo` | Telegraf → Prometheus | bytes |
| `mem_used` | `/proc/meminfo` | Telegraf → Prometheus | bytes |

**How it flows:**
Same as CPU — Telegraf → metrics-manager → Prometheus.

---

### Temperature (via Telegraf's inputs.exec or hwmon)

| Metric | Source | Location | Format |
|---|---|---|---|
| `temp_temp` | `/sys/class/hwmon/hwmon*/temp*_input` | Telegraf → Prometheus | °C |

**How it flows:**
Telegraf executes `sensors` or reads sysfs directly → Prometheus.

---

### GPU (Intel Arc / Xe — via qmassa)

| Metric | Source | Location | Format |
|---|---|---|---|
| `gpu_power` | qmassa JSON → FIFO | `/app/qmassa.fifo` (InfluxDB line protocol) | W |
| `gpu_frequency` | qmassa JSON → FIFO | `/app/qmassa.fifo` (InfluxDB line protocol) | Hz |
| `gpu_engine_usage_usage` | qmassa JSON → FIFO | `/app/qmassa.fifo` (InfluxDB line protocol) | % |

**How it flows:**
1. **supervisord** (inside container) starts `qmassa --to-json /app/qmassa.fifo`
2. `qmassa` reads `/dev/dri/renderD128` (GPU device) every 1000ms
3. `qmassa_reader.py` (Telegraf execd input) reads FIFO and converts JSON → InfluxDB line protocol
4. Telegraf's HTTP listener (:8186) receives the line protocol
5. metrics-manager scrapes Telegraf (:9273)
6. Prometheus scrapes metrics-manager (:9273)

**Key file:** [qmassa_reader.py](../../microservices/metrics-manager/scripts/qmassa_reader.py:1-80)
- Reads JSON from `/app/qmassa.fifo` (named pipe)
- Parses `engine_usage`, `power` (by domain: pkg/cores/uncore), `frequency`
- Emits InfluxDB line protocol: `gpu_power,type=pkg,gpu_id=0 value=45.2 <ts>`

---

### NPU (Intel VPU — via npu_reader.py)

| Metric | Source | Location | Format |
|---|---|---|---|
| `npu_utilization` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | % (0-100) |
| `npu_power` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | W |
| `npu_temperature` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | °C |
| `npu_frequency` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | Hz |
| `npu_bandwidth` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | MB/s |
| `npu_memory_mb` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | MB |
| `npu_tile_config` | PmtTelemetry | `/sys/bus/pci/drivers/intel_vpu/*/` | tiles |

**How it flows:**
1. **supervisord** (inside container) starts `npu_reader.py` as Telegraf execd input
2. `npu_reader.py` loads `PmtTelemetry` (from `npu_monitor_tool.py`)
3. `PmtTelemetry` locates `intel_vpu` driver at `/sys/bus/pci/drivers/intel_vpu/`
4. Reads telemetry files from sysfs every 1s
5. Emits InfluxDB line protocol: `npu_utilization,host=<host> value=45 <ts>`
6. Same path as GPU: Telegraf → metrics-manager (:9273) → Prometheus

**Key file:** [npu_reader.py](../../microservices/metrics-manager/scripts/npu_reader.py:1-80)
- Auto-detects Intel NPU via sysfs path
- If `/sys/bus/pci/drivers/intel_vpu/` is missing, enters **idle mode** (sleeps 1h, no error)
- When NPU is added later, restart the container and it auto-detects

---

## Scrape chain (Prometheus perspective)

```
prometheus.yml:
  scrape_configs:
    - job_name: metrics-manager
      scrape_interval: 1s
      scrape_timeout: 1s
      static_configs:
        - targets: ['metrics-manager:9273']  ← scrapes Telegraf + custom
          # via metrics-manager's /metrics endpoint
```

Each scrape pulls:
- All metrics Telegraf has collected (system, CPU, RAM, temp)
- All GPU metrics (qmassa via qmassa_reader.py)
- All NPU metrics (npu_reader.py)

Prometheus stores the time-series in `/prometheus` volume.

---

## Data transforms: InfluxDB → Prometheus

metrics-manager's `app/metrics.py` wraps Telegraf's `/metrics` endpoint
and converts InfluxDB line protocol to Prometheus text format:

```
Input (from Telegraf HTTP listener):
  cpu_usage_user,host=prod-server cpu=42.5 1625097600000000000

Output (from metrics-manager /metrics):
  # TYPE cpu_usage_user gauge
  cpu_usage_user{host="prod-server"} 42.5
```

---

## Grafana dashboard panel resolution

When you open a Grafana panel (e.g., "GPU Power"), it:

1. Queries Prometheus via HTTP API: `GET /api/v1/query?query=gpu_power{gpu_id="0"}`
2. Prometheus returns time-series from its in-memory TSDB
3. Grafana renders the panel (gauge, graph, etc.)

**Example:** Panel `GPU Power — Package`
```promql
# Query in the dashboard JSON:
max(gpu_power{type="pkg"})

# Prometheus evaluates:
1. Filter: gpu_power where type="pkg"
2. Aggregate: max() across instances
3. Return: single scalar or series
```

---

## Idle modes (graceful handling of missing hardware)

### GPU missing
- `qmassa_reader.py` sees no data in FIFO
- After MAX_FAST_RETRIES (5) consecutive failures, enters idle mode
- Sleeps for 3600s (1h) between retries instead of flooding logs
- If GPU is added later, Telegraf restart picks it up automatically

### NPU missing
- `npu_reader.py` tries to locate `/sys/bus/pci/drivers/intel_vpu/`
- If path doesn't exist, calls `idle_forever("Intel NPU driver path not found")`
- Sleeps indefinitely; logs the reason once
- If NPU + driver are added, container restart re-runs the detection

This is why on a **CPU-only machine**, you see no errors — both readers just idle quietly.

---

## Verification commands (once stack is running)

```bash
# Check Telegraf is collecting CPU/RAM/temp
docker exec metrics-manager curl -s http://localhost:8186/api/v1/status

# Check qmassa is running and producing data
docker exec metrics-manager ls -la /app/qmassa.fifo
docker logs metrics-manager 2>&1 | grep -i qmassa

# Check npu_reader status
docker logs metrics-manager 2>&1 | grep -i "npu"

# Check metrics-manager is scraping Telegraf and outputting to Prometheus
docker exec metrics-manager curl -s http://localhost:9273/metrics | grep -E '^(cpu_|mem_|gpu_|npu_)' | head

# Check Prometheus has the target UP
docker exec metrics-manager curl -s http://prometheus:9090/api/v1/targets | grep -i health
```

---

## Key takeaway

Every metric reaches Grafana through this chain:
```
Hardware (CPU/GPU/NPU) 
  ↓ (readers: Telegraf, qmassa_reader, npu_reader)
InfluxDB Line Protocol (Telegraf :8186, FIFO)
  ↓ (metrics-manager scrapes Telegraf :9273)
Prometheus Text Format (metrics-manager :9273)
  ↓ (Prometheus scrapes :9273)
Time-series storage (Prometheus TSDB)
  ↓ (Grafana queries via HTTP API)
Dashboard panels
```

No metric is "hard-coded" — all are real-time reads from hardware or `/proc`/`/sys`.
