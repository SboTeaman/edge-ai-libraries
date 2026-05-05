import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store";

export interface MetricData {
  name: string;
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

export interface MetricsMessage {
  timestamp: number;
  metrics: MetricData[];
}

export interface MetricsState {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: string;
  metrics: MetricData[];
  error: string | null;
}

const initialState: MetricsState = {
  isConnected: false,
  isConnecting: false,
  lastMessage: "",
  metrics: [],
  error: null,
};

export const metrics = createSlice({
  name: "metrics",
  initialState,
  reducers: {
    wsConnecting: (state) => {
      state.isConnecting = true;
      state.isConnected = false;
      state.error = null;
    },
    wsConnected: (state) => {
      state.isConnected = true;
      state.isConnecting = false;
      state.error = null;
    },
    wsDisconnected: (state) => {
      state.isConnected = false;
      state.isConnecting = false;
    },
    wsError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isConnected = false;
      state.isConnecting = false;
    },
    messageReceived: (state, action: PayloadAction<string>) => {
      state.lastMessage = action.payload;
      try {
        const parsed = JSON.parse(action.payload) as MetricsMessage;
        if (parsed.metrics && Array.isArray(parsed.metrics)) {
          state.metrics = parsed.metrics;
        }
      } catch (error) {
        console.error("Failed to parse metrics message:", error);
      }
    },
  },
});

export const {
  wsConnecting,
  wsConnected,
  wsDisconnected,
  wsError,
  messageReceived,
} = metrics.actions;

export const selectMetricsState = (state: RootState) => state.metrics;
export const selectIsConnected = (state: RootState) =>
  state.metrics.isConnected;
export const selectIsConnecting = (state: RootState) =>
  state.metrics.isConnecting;
export const selectMetrics = (state: RootState) => state.metrics.metrics;
export const selectLastMessage = (state: RootState) =>
  state.metrics.lastMessage;
export const selectError = (state: RootState) => state.metrics.error;

export const selectFpsMetric = (state: RootState) =>
  state.metrics.metrics.find((m) => m.name === "fps")?.value as
    | number
    | undefined;

export const selectCpuMetric = (state: RootState) =>
  state.metrics.metrics.find((m) => m.name === "cpu_usage_user")?.value as
    | number
    | undefined;

export const selectMemoryMetric = (state: RootState) =>
  state.metrics.metrics.find((m) => m.name === "mem_used_percent")?.value as
    | number
    | undefined;

export const selectCpuMetrics = (state: RootState) => {
  const find = (name: string, labelFilter?: (m: MetricData) => boolean) =>
    state.metrics.metrics.find(
      (m) => m.name === name && (!labelFilter || labelFilter(m)),
    );

  const cpuUsageUser = find("cpu_usage_user", (m) => m.labels.cpu === "cpu-total");
  const cpuUsageIdle = find("cpu_usage_idle", (m) => m.labels.cpu === "cpu-total");
  const cpuFrequency = find("cpu_frequency_avg_frequency");
  const cpuTemp = find("temp", (m) =>
    (m.labels.sensor ?? "").includes("coretemp_package_id"),
  );

  return {
    user: cpuUsageUser?.value ?? 0,
    idle: cpuUsageIdle?.value ?? 0,
    avgFrequency: ((cpuFrequency?.value ?? 0) / 1000000), // kHz → GHz
    temp: cpuTemp?.value,
  };
};

export const selectGpuMetrics = (state: RootState, gpuId: string = "0") => {
  const gpuMetrics = state.metrics.metrics.filter(
    (m) => m.name === "gpu_engine_usage_usage" && m.labels.gpu_id === gpuId,
  );

  const gpuFrequencyMetric = state.metrics.metrics.find(
    (m) => m.name === "gpu_frequency_frequency" && m.labels.gpu_id === gpuId,
  );

  const gpuPowerMetrics = state.metrics.metrics.filter(
    (m) => m.name === "gpu_power_power" && m.labels.gpu_id === gpuId,
  );

  const engineNameMap: Record<string, string> = {
    rcs: "render",
    bcs: "copy",
    vcs: "video",
    vecs: "video-enhance",
    ccs: "compute",
  };

  const findEngineUsage = (engineNames: string[]) => {
    const metric = gpuMetrics.find((m) => {
      const engine = m.labels.engine ?? "";
      return (
        engineNames.includes(engine) ||
        engineNames.includes(engineNameMap[engine] ?? engine)
      );
    });
    return metric?.value;
  };

  const findPowerValue = (powerType: string) => {
    const metric = gpuPowerMetrics.find((m) => m.labels.type === powerType);
    return metric?.value;
  };

  return {
    compute: findEngineUsage(["compute", "ccs"]),
    render: findEngineUsage(["render", "rcs"]),
    copy: findEngineUsage(["copy", "bcs"]),
    video: findEngineUsage(["video", "vcs"]),
    videoEnhance: findEngineUsage(["video-enhance", "vecs"]),
    frequency: gpuFrequencyMetric ? gpuFrequencyMetric.value / 1000 : undefined,
    gpuPower: findPowerValue("gpu_cur_power"),
    pkgPower: findPowerValue("pkg_cur_power"),
  };
};

export default metrics.reducer;
