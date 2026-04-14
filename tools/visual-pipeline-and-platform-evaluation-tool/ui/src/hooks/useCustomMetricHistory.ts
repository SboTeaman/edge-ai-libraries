import { useEffect, useRef, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  selectCustomMetrics,
  selectCustomMetricNames,
  messageReceived,
  type MetricData,
} from "@/store/reducers/metrics";

export interface CustomMetricHistoryPoint {
  timestamp: number;
  value: number;
}

const MAX_HISTORY_POINTS = 60;

export const useCustomMetricHistory = () => {
  const dispatch = useAppDispatch();
  const customMetrics = useAppSelector(selectCustomMetrics);
  const customMetricNames = useAppSelector(selectCustomMetricNames);
  const [history, setHistory] = useState<
    Record<string, CustomMetricHistoryPoint[]>
  >({});
  const lastUpdateRef = useRef<number>(0);

  // On mount: fetch latest metrics from REST API and seed the Redux store.
  // This handles metrics that were sent before the WebSocket connected.
  useEffect(() => {
    fetch("/api/v1/metrics/latest")
      .then((res) => res.json())
      .then((data: { metrics: Record<string, MetricData> }) => {
        const metricsArray = Object.values(data.metrics ?? {});
        if (metricsArray.length > 0) {
          dispatch(
            messageReceived(JSON.stringify({ metrics: metricsArray })),
          );
        }
      })
      .catch(() => {
        // metric-service unavailable — silently skip, WS will populate store
      });
  }, [dispatch]);

  // On every WebSocket update: append a new history point per metric
  useEffect(() => {
    const now = Date.now();

    if (now - lastUpdateRef.current < 1000) {
      return;
    }

    if (customMetrics.length === 0) {
      return;
    }

    lastUpdateRef.current = now;

    setHistory((prev) => {
      const next = { ...prev };

      for (const name of customMetricNames) {
        const metric = customMetrics.find((m: MetricData) => m.name === name);
        if (!metric) continue;

        const value = getNumericValue(metric);
        if (value === null) continue;

        const points = [...(next[name] ?? []), { timestamp: now, value }];
        next[name] =
          points.length > MAX_HISTORY_POINTS
            ? points.slice(points.length - MAX_HISTORY_POINTS)
            : points;
      }

      return next;
    });
  }, [customMetrics, customMetricNames]);

  return { history, metricNames: customMetricNames };
};

const getNumericValue = (metric: MetricData): number | null => {
  if (typeof metric.fields?.value === "number") {
    return metric.fields.value;
  }

  const numericFields = Object.values(metric.fields).filter(
    (v): v is number => typeof v === "number",
  );

  return numericFields.length > 0 ? numericFields[0] : null;
};
