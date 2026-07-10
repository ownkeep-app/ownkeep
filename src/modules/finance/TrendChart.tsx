import { useEffect, useRef } from "react";

import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import type { TrendPoint } from "./logic";

/** Net-worth trend line over snapshots (spec M3), rendered with uPlot. */
export function TrendChart({
  points,
  currency,
}: {
  points: TrendPoint[];
  currency: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || points.length < 2) return;
    const xs = points.map((point) => Math.floor(Date.parse(point.date) / 1000));
    const ys = points.map((point) => point.total);
    // Size to the unpadded plot host so axis labels do not force horizontal overflow.
    const width = Math.max(0, el.clientWidth);
    const chart = new uPlot(
      {
        width: width || 640,
        height: 180,
        cursor: { show: false },
        legend: { show: false },
        scales: { x: { time: true } },
        series: [
          {},
          {
            label: currency,
            stroke: "#5B6CFF",
            width: 2,
            fill: "rgba(79, 124, 255, 0.12)",
            points: { show: true, size: 5 },
          },
        ],
        axes: [
          { stroke: "#888888", grid: { show: false } },
          {
            stroke: "#888888",
            grid: { stroke: "rgba(128,128,128,0.15)" },
            size: 56,
          },
        ],
      },
      [xs, ys],
      el,
    );
    return () => chart.destroy();
  }, [points, currency]);

  if (points.length < 2) {
    return (
      <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground">
        Add at least two snapshots to see the net-worth trend.
      </p>
    );
  }
  return (
    <div className="border-t border-border px-6 py-3">
      <div className="min-w-0 w-full overflow-hidden" ref={ref} />
    </div>
  );
}
