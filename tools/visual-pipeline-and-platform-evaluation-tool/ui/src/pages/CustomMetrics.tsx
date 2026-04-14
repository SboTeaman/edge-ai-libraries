import { useMemo } from "react";
import { Activity } from "lucide-react";
import { MetricChart } from "@/features/metrics/MetricChart";
import {
  CHART_MAX_DATA_POINTS,
  getRecentYAxisMax,
} from "@/features/metrics/charts";
import { useCustomMetricHistory } from "@/hooks/useCustomMetricHistory";
import { useAppSelector } from "@/store/hooks";
import { selectCustomMetrics, type MetricData } from "@/store/reducers/metrics";

const CHART_COLORS = [
  "var(--color-magenta-chart)",
  "var(--color-green-chart)",
  "var(--color-yellow-chart)",
  "var(--color-orange-chart)",
  "var(--color-purple-chart)",
  "var(--color-red-chart)",
  "var(--color-geode-chart)",
];

const getLatestValue = (
  metrics: MetricData[],
  name: string,
): { value: number; fieldName: string } => {
  const metric = metrics.find((m) => m.name === name);
  if (!metric) return { value: 0, fieldName: "value" };

  if (typeof metric.fields?.value === "number") {
    return { value: metric.fields.value, fieldName: "value" };
  }

  for (const [key, val] of Object.entries(metric.fields)) {
    if (typeof val === "number") {
      return { value: val, fieldName: key };
    }
  }

  return { value: 0, fieldName: "value" };
};

const getTags = (
  metrics: MetricData[],
  name: string,
): Record<string, string> => {
  const metric = metrics.find((m) => m.name === name);
  return metric?.tags ?? {};
};

export const CustomMetrics = () => {
  const { history, metricNames } = useCustomMetricHistory();
  const customMetrics = useAppSelector(selectCustomMetrics);

  const metricCards = useMemo(
    () =>
      metricNames.map((name, index) => {
        const { value } = getLatestValue(customMetrics, name);
        const tags = getTags(customMetrics, name);
        const data = (history[name] ?? []).map((point) => ({
          timestamp: point.timestamp,
          value: point.value,
        }));

        const yAxisMax = getRecentYAxisMax(
          data.map((p) => p.value),
          CHART_MAX_DATA_POINTS,
          1,
        );

        return {
          name,
          value,
          tags,
          data,
          yAxisMax,
          color: CHART_COLORS[index % CHART_COLORS.length],
        };
      }),
    [metricNames, customMetrics, history],
  );

  if (metricNames.length === 0) {
    return (
      <div className="container pl-16 mx-auto py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Custom Metrics</h1>
          <p className="text-muted-foreground mt-2">
            No custom metrics received yet. Send metrics via REST API to see
            them here.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="h-16 w-16 mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">Waiting for metrics...</p>
          <code className="text-sm bg-muted px-3 py-1.5 rounded">
            POST /api/v1/metrics/simple {`{"name": "my_metric", "value": 42}`}
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="container pl-16 mx-auto py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Custom Metrics</h1>
        <p className="text-muted-foreground mt-2">
          Metrics received via REST API ({metricNames.length}{" "}
          {metricNames.length === 1 ? "metric" : "metrics"})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {metricCards.map((metric) => (
          <div key={metric.name} className="space-y-3">
            <div className="bg-background shadow-md p-4 flex items-center space-x-3">
              <div className="shrink-0 bg-classic-blue/5 dark:bg-teal-chart p-2">
                <Activity
                  className="h-6 w-6"
                  style={{ color: metric.color }}
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  {metric.name}
                </h3>
                <p className="text-3xl font-bold text-foreground">
                  {metric.value.toFixed(2)}
                </p>
                {Object.keys(metric.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(metric.tags).map(([key, val]) => (
                      <span
                        key={key}
                        className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                      >
                        {key}={val}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <MetricChart
              title={`${metric.name} Over Time`}
              data={metric.data}
              dataKeys={["value"]}
              colors={[metric.color]}
              unit=""
              yAxisDomain={[0, metric.yAxisMax]}
              showLegend={false}
              maxDataPoints={CHART_MAX_DATA_POINTS}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
