"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { formatPrice } from "@/lib/format";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export default function TradingChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // Crosshair-hovered candle, shown as an OHLC readout over the top-left of the chart —
  // falls back to the latest candle when nothing is hovered, so the readout is never blank.
  const [legend, setLegend] = useState<Candle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // lightweight-charts renders to <canvas>, so none of its colors are reachable via CSS —
    // read the theme once at chart-creation time (a theme toggle reloads the page, per
    // lib/settings.ts, so this never needs to react to a live change mid-session).
    const isLight = document.documentElement.dataset.theme === "light";
    const gridColor = isLight ? "rgba(10, 16, 22, 0.06)" : "rgba(255, 255, 255, 0.07)";
    const scaleBorderColor = isLight ? "rgba(10, 16, 22, 0.1)" : "rgba(255, 255, 255, 0.09)";

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isLight ? "rgba(20, 26, 32, 0.55)" : "rgba(200, 212, 224, 0.5)",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      // Price candles occupy the top ~75% of the pane, volume bars sit in the bottom ~20% —
      // the same split every candlestick platform (TradingView, Binance, pump.fun's
      // advanced view) uses so volume reads as context under the price action, not a
      // separate chart competing for attention.
      rightPriceScale: { borderColor: scaleBorderColor, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: scaleBorderColor, timeVisible: true, secondsVisible: true },
      crosshair: { mode: 0 },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#8bc3ab",
      downColor: "#c98a8a",
      borderVisible: false,
      wickUpColor: "#8bc3ab",
      wickDownColor: "#c98a8a",
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: isLight ? "rgba(20, 26, 32, 0.3)" : "rgba(200, 212, 224, 0.35)",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !seriesRef.current) {
        setLegend(null);
        return;
      }
      const point = param.seriesData.get(seriesRef.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!point) {
        setLegend(null);
        return;
      }
      setLegend({ time: param.time as number, ...point, volume: 0 });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || candles.length === 0) return;
    seriesRef.current.setData(candles.map((c) => ({ ...c, time: c.time as Time })));
    volumeRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(139, 195, 171, 0.5)" : "rgba(201, 138, 138, 0.5)",
      }))
    );
    chartRef.current?.timeScale().fitContent();
    setLegend(candles[candles.length - 1]);
  }, [candles]);

  const up = legend ? legend.close >= legend.open : true;

  return (
    <div className="w-full h-full" style={{ position: "relative" }}>
      {legend && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            zIndex: 2,
            display: "flex",
            gap: 10,
            fontFamily: "var(--alloy-mono, monospace)",
            fontSize: 11,
            color: "color-mix(in srgb, var(--text) 75%, transparent)",
            pointerEvents: "none",
          }}
        >
          <span>
            O <span style={{ color: up ? "var(--up)" : "var(--down)" }}>{formatPrice(legend.open)}</span>
          </span>
          <span>
            H <span style={{ color: up ? "var(--up)" : "var(--down)" }}>{formatPrice(legend.high)}</span>
          </span>
          <span>
            L <span style={{ color: up ? "var(--up)" : "var(--down)" }}>{formatPrice(legend.low)}</span>
          </span>
          <span>
            C <span style={{ color: up ? "var(--up)" : "var(--down)" }}>{formatPrice(legend.close)}</span>
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
