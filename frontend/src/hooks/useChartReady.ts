import { useRef, useState, useEffect } from 'react';

/**
 * Returns a ref to attach to a chart's wrapper div, and the actual
 * measured width and height to pass directly to the chart.
 */
export function useChartReady() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ ready: false, width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ ready: true, width, height });
        } else {
          setDimensions({ ready: false, width: 0, height: 0 });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return {
    containerRef,
    chartReady: dimensions.ready,
    width: dimensions.width,
    height: dimensions.height
  };
}
