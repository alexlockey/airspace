// Airspace fork: minimal inline SVG sparkline. Stroke follows currentColor so
// callers pick the colour with a text-* class; fills a soft area underneath.
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const width = 100;
  const height = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="trend"
    >
      <polygon points={area} fill="currentColor" opacity="0.12" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
