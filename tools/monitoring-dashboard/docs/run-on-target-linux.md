# Running on a target Linux machine (real Intel XPU)

Step-by-step runbook for bringing up the **real** telemetry stack
(default: `docker-compose.yml`, which uses metrics-manager) on a Linux host. 
Written for a machine that initially has **CPU + Intel GPU only** (no NPU yet) — 
the NPU panels stay empty until an NPU is present, and **no config change** is 
needed when one is added later.

> Demo vs real: `compose.demo.yaml` = synthetic data (any machine).
> `docker-compose.yml` (default) = **real** data (needs Intel hardware).

---

## 1. Prerequisites (host)

| Requirement | Check |
|---|---|
| Linux (x86_64) | `uname -a` |
| Intel GPU + kernel driver (i915 or xe) | `ls -l /dev/dri/renderD128` (must exist) |
| Docker Engine + Compose plugin | `docker --version && docker compose version` |
| Network / proxy to pull + build images | `docker pull hello-world` |
| The repo checked out | this directory present |

Notes:
- **qmassa is bundled inside the metrics-manager image** (built from source,
  v2.1.0) — you do NOT install it on the host. The host only needs the GPU and
  `/dev/dri`.
- GPU access works because the included metrics-manager service runs
  `privileged: true`, maps `/dev/dri`, and mounts `/sys` (read-only) — already
  wired in `../../microservices/metrics-manager/compose.yaml`.

If `/dev/dri/renderD128` is missing, the GPU driver is not loaded — fix that
first (`modprobe i915` or `xe`, confirm BIOS shows the iGPU/dGPU).

---

## 2. Configure

```bash
cd tools/monitoring-dashboard
cp .env.example .env
```

Default login is **admin / admin**.

If behind a corporate proxy, edit `.env` and add:

```bash
http_proxy=http://<proxy>:<port>
https_proxy=http://<proxy>:<port>
no_proxy=localhost,127.0.0.1
```

---

## 3. Build & start

```bash
docker compose up -d --build
```

First run builds the metrics-manager image (includes compiling qmassa) — it can
take several minutes. Subsequent starts are fast.

(Note: `docker-compose.yml` is the default variant. To use others:
`docker compose -f compose.demo.yaml up -d --build` or
`docker compose -f compose.standalone-prometheus.yaml up -d --build`)

---

## 4. Verify the stack

```bash
# All containers up (metrics-manager, prometheus, grafana)
docker compose ps

# metrics-manager exposes metrics
curl -s http://localhost:9090/health

# qmassa is running inside the container and producing GPU data
docker exec metrics-manager ps -ef | grep -E 'qmassa|telegraf'
curl -s http://localhost:9273/metrics | grep -E '^gpu_(power|frequency|engine)' | head

# CPU/system always present
curl -s http://localhost:9273/metrics | grep -E '^cpu_usage' | head

# NPU: expected EMPTY on a CPU+GPU machine (reader idles, no error)
curl -s http://localhost:9273/metrics | grep -E '^npu_' || echo "no NPU yet (expected)"
```

Prometheus target should be `UP`:
```bash
# Prometheus has no host port by default; query it from inside the network:
docker exec metrics-manager curl -s http://prometheus:9090/api/v1/targets \
  | grep -o '"health":"[a-z]*"' | head
```

---

## 5. Open Grafana

```
http://<host-ip>:3000      (admin / admin)
```

Dashboards are auto-loaded under the **Intel XPU** folder. On a CPU+GPU machine
you should see:

| Dashboard | State |
|---|---|
| System (CPU / RAM / Thermal) | ✅ populated |
| GPU Power | ✅ populated (pkg / cores / uncore as qmassa reports) |
| GPU Performance | ✅ populated (engine utilization, clocks) |
| NPU | ⚪ empty until an NPU is present |
| Overview (starter) | ✅ CPU/RAM/GPU populated; NPU panel empty |

---

## 6. When an NPU is added later

**Nothing to reconfigure.** `npu_reader.py` auto-detects the `intel_vpu` driver;
once the NPU + driver are present and the container is restarted, `npu_*`
metrics start flowing and the NPU dashboard lights up.

```bash
# after the NPU hardware/driver is in place:
docker compose restart metrics-manager
curl -s http://localhost:9273/metrics | grep -E '^npu_' | head   # now non-empty
```

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| GPU panels empty | `/dev/dri/renderD128` missing or no GPU driver; check `docker exec metrics-manager ls /dev/dri` and qmassa logs (`docker logs metrics-manager 2>&1 \| grep -i qmassa`) |
| `permission denied` on /dev/dri | ensure the service runs privileged (default); on hardened hosts check device cgroup rules |
| Prometheus won't start | config error — ensure `scrape_timeout <= scrape_interval` (both 1s here) |
| Grafana datasource not green | Prometheus container unhealthy or not on `metric-network`; `docker compose ... logs prometheus` |
| Build fails behind proxy | export `http_proxy`/`https_proxy`/`no_proxy` before `--build` (step 2) |
| High disk usage | lower `PROM_RETENTION_TIME` / `PROM_RETENTION_SIZE` in `.env` (size cap is soft) |

---

## 8. Stop

```bash
docker compose down       # keep data
docker compose down -v    # also drop volumes
```
