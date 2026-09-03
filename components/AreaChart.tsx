"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, ColorType, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";

export interface AreaPoint {
  time: number;
  value: number;
}

export default function AreaChart({ data }: { data: AreaPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(200, 212, 224, 0.5)",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.07)" },
        horzLines: { color: "rgba(255, 255, 255, 0.07)" },
      },
      rightPriceScale: { borderColor: "rgba(255, 255, 255, 0.09)" },
      timeScale: { borderColor: "rgba(255, 255, 255, 0.09)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#8bc3ab",
      topColor: "rgba(139, 195, 171, 0.35)",
      bottomColor: "rgba(139, 195, 171, 0.02)",
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    seriesRef.current.setData(data.map((d) => ({ time: d.time as Time, value: d.value })));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}
