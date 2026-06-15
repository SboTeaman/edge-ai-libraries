#!/usr/bin/env python3
# Copyright (C) 2025-2026 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

"""
Synthetic Intel XPU metrics exporter for DEMO ONLY.

Serves a Prometheus /metrics endpoint exposing the exact metric names that
metrics-manager emits (cpu_usage_*, mem_*, gpu_power, gpu_engine_usage_usage,
npu_*, ...) with animated, plausible values — so the dashboards render with
data on machines WITHOUT Intel GPU/NPU hardware.

Stdlib only (no pip install needed). Listens on :9273 to mirror metrics-manager.
"""

import math
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST_LABEL = "demo-host"
GPU_ID = "0"
START = time.time()

# Which hardware to simulate. Set DEMO_PROFILE to one of:
#   cpu | cpu+gpu | cpu+npu | cpu+gpu+npu   (default: cpu+gpu+npu)
# CPU/system metrics are always emitted; GPU and NPU families are gated so the
# demo can mimic a host without that hardware (those panels then stay empty,
# exactly like the real readers idling).
_PROFILE = os.environ.get("DEMO_PROFILE", "cpu+gpu+npu").lower().replace(" ", "")
_PARTS = {p for p in _PROFILE.split("+") if p}
EMIT_GPU = "gpu" in _PARTS
EMIT_NPU = "npu" in _PARTS


def wave(period_s, lo, hi, phase=0.0):
    """Smooth sine oscillation between lo and hi."""
    t = time.time() - START
    frac = 0.5 * (1 + math.sin(2 * math.pi * (t / period_s) + phase))
    return lo + (hi - lo) * frac


def render():
    h = f'host="{HOST_LABEL}"'
    g = f'host="{HOST_LABEL}",gpu_id="{GPU_ID}"'
    lines = []

    def fam(name, mtype, samples):
        lines.append(f"# HELP {name} synthetic demo metric")
        lines.append(f"# TYPE {name} {mtype}")
        lines.extend(samples)

    # --- CPU ---
    user = wave(40, 5, 65)
    system = wave(25, 2, 25, phase=1.0)
    fam("cpu_usage_user", "gauge", [f'cpu_usage_user{{{h},cpu="cpu-total"}} {user:.2f}'])
    fam("cpu_usage_system", "gauge", [f'cpu_usage_system{{{h},cpu="cpu-total"}} {system:.2f}'])
    fam("cpu_usage_idle", "gauge", [f'cpu_usage_idle{{{h},cpu="cpu-total"}} {max(0, 100-user-system):.2f}'])
    # scaling_cur_freq is in kHz; dashboard multiplies *1000 to Hz
    fam("cpu_frequency_avg_frequency", "gauge", [f'cpu_frequency_avg_frequency{{{h}}} {wave(30, 1600000, 3600000):.0f}'])

    # --- Memory ---
    used_pct = wave(60, 35, 75)
    total = 16 * 1024**3
    fam("mem_used_percent", "gauge", [f'mem_used_percent{{{h}}} {used_pct:.2f}'])
    fam("mem_available_percent", "gauge", [f'mem_available_percent{{{h}}} {100-used_pct:.2f}'])
    fam("mem_total", "gauge", [f'mem_total{{{h}}} {total}'])
    fam("mem_used", "gauge", [f'mem_used{{{h}}} {total*used_pct/100:.0f}'])

    # --- Temperature (CPU package) ---
    fam("temp_temp", "gauge", [f'temp_temp{{{h},sensor="coretemp_package_id_0"}} {wave(50, 45, 78):.1f}'])

    # --- GPU (gated by DEMO_PROFILE) ---
    if EMIT_GPU:
        # power by domain
        fam("gpu_power", "gauge", [
            f'gpu_power{{{g},type="pkg"}} {wave(35, 8, 55):.2f}',
            f'gpu_power{{{g},type="cores"}} {wave(35, 3, 40, phase=0.5):.2f}',
            f'gpu_power{{{g},type="uncore"}} {wave(45, 1, 8, phase=1.5):.2f}',
        ])
        # frequency
        fam("gpu_frequency", "gauge", [f'gpu_frequency{{{g},type="cur_freq"}} {wave(30, 300000000, 2050000000):.0f}'])
        # engine utilization
        engines = [("render", 0.0), ("compute", 0.8), ("copy", 1.6), ("video", 2.4), ("video_enh", 3.2)]
        fam("gpu_engine_usage_usage", "gauge", [
            f'gpu_engine_usage_usage{{engine="{e}",type="{e}",{g}}} {wave(20+i*4, 0, 95, phase=ph):.2f}'
            for i, (e, ph) in enumerate(engines)
        ])

    # --- NPU (gated by DEMO_PROFILE) ---
    if EMIT_NPU:
        fam("npu_utilization", "gauge", [f'npu_utilization{{{h}}} {wave(28, 0, 90):.0f}'])
        fam("npu_power", "gauge", [f'npu_power{{{h}}} {wave(28, 0.5, 6.5):.3f}'])
        fam("npu_temperature", "gauge", [f'npu_temperature{{{h}}} {wave(55, 38, 62):.0f}'])
        fam("npu_frequency", "gauge", [f'npu_frequency{{{h}}} {wave(30, 400000000, 1400000000):.0f}'])
        fam("npu_bandwidth", "gauge", [f'npu_bandwidth{{{h}}} {wave(22, 0, 12000):.2f}'])
        fam("npu_tile_config", "gauge", [f'npu_tile_config{{{h}}} 4'])
        fam("npu_memory_mb", "gauge", [f'npu_memory_mb{{{h}}} {wave(40, 128, 900):.2f}'])

    return "\n".join(lines) + "\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") in ("/metrics", ""):
            body = render().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass  # quiet


if __name__ == "__main__":
    emitting = "cpu" + ("+gpu" if EMIT_GPU else "") + ("+npu" if EMIT_NPU else "")
    print(f"Synthetic Intel XPU exporter on :9273/metrics (DEMO, profile={emitting})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 9273), Handler).serve_forever()
