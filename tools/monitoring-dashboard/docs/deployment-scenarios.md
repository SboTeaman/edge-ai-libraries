# Deployment Scenarios

Real-world deployment patterns for the Intel XPU Monitoring Dashboard.

---

## Scenario 1: Local demo (no hardware)

**Goal:** See the dashboards work without any Intel GPU/NPU.

```bash
cd tools/monitoring-dashboard
cp .env.example .env
docker compose -f compose.demo.yaml up -d
# http://localhost:3000   (admin / admin)
```

**What you get:**
- Synthetic animated metrics (for demos, screenshots, testing)
- Full 5 dashboards populated with plausible data
- Good for presentations or validating dashboard design

**Pros:** Runs on any machine, no hardware needed  
**Cons:** Metrics are fake, not real telemetry

---

## Scenario 2: Real machine (CPU + GPU)

**Goal:** Monitor actual Intel GPU on a Linux server.

```bash
cd tools/monitoring-dashboard
cp .env.example .env
docker compose up -d --build
# http://<your-ip>:3000   (admin / admin)
```

**First run:** ~3 minutes (builds metrics-manager image)  
**Subsequent runs:** ~5 seconds

**What you get:**
- Real GPU power/frequency/utilization (via qmassa)
- CPU usage, RAM, temperature (via Telegraf)
- NPU metrics (empty/idle if no NPU present)

**Hardware check:**
```bash
# GPU driver loaded?
ls -l /dev/dri/renderD128

# Intel GPU present?
lspci | grep Intel
```

---

## Scenario 3: CPU + NPU only (no GPU)

**Goal:** Monitor Intel NPU without GPU support.

```bash
cd tools/monitoring-dashboard
cp .env.example .env
docker compose -f compose.standalone-prometheus.yaml up -d --build
# http://<your-ip>:3000   (admin / admin)
```

**What you get:**
- CPU, RAM, temperature (node-exporter)
- NPU metrics (utilization, power, temp, freq, bandwidth, memory)
- ✗ GPU metrics (not available in this variant)

**Note:** If you add GPU later, switch back to default (`docker compose up`).

---

## Scenario 4: Behind corporate proxy

**Goal:** Deploy in an isolated network.

**Step 1: Configure**

Edit `.env`:
```bash
http_proxy=http://proxy.corp.com:3128
https_proxy=http://proxy.corp.com:3128
no_proxy=localhost,127.0.0.1
```

**Step 2: Start**

```bash
docker compose up -d --build
```

Docker will use the proxy for image pulls and the metrics-manager build.

**Optional: Custom CA certificates**

If your proxy uses certificate pinning, mount your CA bundle in `docker-compose.yml`:

```yaml
services:
  metrics-manager:
    volumes:
      - /etc/ssl/certs/ca-bundle.crt:/etc/ssl/certs/ca-bundle.crt:ro
```

---

## Scenario 5: Fleet of machines (independent dashboards)

**Goal:** Monitor multiple edge devices, each with its own Grafana.

Each machine runs the same way — no coordination needed:

```bash
# Machine 1
ssh user@edge-1
cd tools/monitoring-dashboard
cp .env.example .env
docker compose up -d --build
# http://edge-1:3000

# Machine 2
ssh user@edge-2
cd tools/monitoring-dashboard
cp .env.example .env
docker compose up -d --build
# http://edge-2:3000

# Machine 3 (no GPU, use standalone)
ssh user@edge-3
cd tools/monitoring-dashboard
cp .env.example .env
docker compose -f compose.standalone-prometheus.yaml up -d --build
# http://edge-3:3000
```

**Each machine:** independent Grafana, own data, own retention policy.

**Pros:** Simple, fully distributed, no single point of failure  
**Cons:** Each machine uses disk space for Prometheus; manual password management across 10+ machines

---

## Scenario 6: Kubernetes (sidecar dashboards)

**Goal:** Deploy dashboards as a Grafana sidecar in Kubernetes.

Use `kustomization.yaml` to package the 5 dashboards as ConfigMap with the auto-discovery label:

```bash
kubectl apply -k tools/monitoring-dashboard/
```

This creates a ConfigMap labeled `grafana_dashboard: "1"`, which the Grafana sidecar automatically picks up.

**Dashboards appear in:** Grafana → Dashboards → Intel XPU folder (auto-loaded)

**Prerequisite:** Grafana with sidecar provisioner (see 
[Grafana Helm chart docs](https://github.com/grafana/helm-charts/tree/main/charts/grafana)).

---

## Scenario 7: CI/CD automation (headless)

**Goal:** Deploy via Ansible, Terraform, or a deployment script.

**Minimal bash script:**

```bash
#!/bin/bash
cd tools/monitoring-dashboard
cp .env.example .env
echo 'GF_SECURITY_ADMIN_PASSWORD=RandomPassword123' >> .env
docker compose up -d --build
sleep 10
docker compose ps   # verify all healthy
```

**Ansible playbook (sketch):**

```yaml
- name: Deploy monitoring dashboard
  hosts: edge_devices
  tasks:
    - git:
        repo: https://github.com/...
        dest: /opt/monitoring
    - shell: |
        cd /opt/monitoring/tools/monitoring-dashboard
        cp .env.example .env
        echo 'GF_SECURITY_ADMIN_PASSWORD={{ grafana_password }}' >> .env
        docker compose up -d --build
    - wait_for:
        port: 3000
        timeout: 60
```

**Docker health check:**

```bash
docker compose ps   # shows healthy/unhealthy
docker compose logs grafana | tail -20   # debug if stuck
```

---

## Scenario 8: Development (iterate on dashboards)

**Goal:** Edit dashboards locally and reload.

**Step 1: Start with demo data**

```bash
docker compose -f compose.demo.yaml up -d
# http://localhost:3000
```

**Step 2: Edit dashboards in Grafana UI**

(Grafana UI at http://localhost:3000 → Dashboards → Intel XPU → edit panels)

**Step 3: Export and commit**

In Grafana UI: Dashboard → Menu → Export → Save JSON to `grafana/dashboards/`

**Step 4: Restart to load changes**

```bash
docker compose down
docker compose -f compose.demo.yaml up -d
# Refreshes from the updated JSON files
```

---

## Scenario 9: Troubleshooting high disk usage

**Problem:** Prometheus is consuming too much disk.

**Solution:** Adjust retention in `.env`:

```bash
# Current (7 days, 2GB)
PROM_RETENTION_TIME=7d
PROM_RETENTION_SIZE=2GB

# More aggressive (1 day, 500MB)
PROM_RETENTION_TIME=1d
PROM_RETENTION_SIZE=500MB
```

**Restart:**

```bash
docker compose down -v         # remove old data
docker compose up -d --build
```

**Note:** Size cap is soft (only compacted blocks counted). Keep disk 2× the cap as headroom.

---

## Quick commands for all scenarios

```bash
# Status
docker compose ps

# Logs
docker compose logs -f

# Metrics check (are they flowing?)
curl -s http://localhost:9273/metrics | grep -E '^(cpu|gpu|npu)_' | head

# Stop (keep data)
docker compose down

# Stop (delete everything)
docker compose down -v

# Restart one service
docker compose restart metrics-manager
```
