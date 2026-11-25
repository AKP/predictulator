import {useId, useMemo, useRef, useState} from 'react';

/**
 * A restrained SVG line/area chart in the site's ink-on-paper system.
 *
 * Series are told apart by stroke pattern and direct labels, never by hue.
 * A crosshair with a tooltip follows the pointer; a table view backs every
 * chart. Gridlines are solid hairlines one shade off the surface.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Series {
  name: string;
  points: Point[];
  dash?: string;
  /** Fill the area under the line (first series only reads well). */
  area?: boolean;
  /** Mark the last point with a square. */
  endMarker?: boolean;
}

export interface Reference {
  y: number;
  label: string;
}

interface Props {
  series: Series[];
  xLabel: string;
  yLabel: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  references?: Reference[];
  height?: number;
  tableCaption?: string;
  /** Direct end-of-line labels. Turn off when series converge and the legend carries identity. */
  endLabels?: boolean;
}

const W = 640;
const PAD = {l: 56, r: 20, t: 18, b: 40};

export function LineChart({
  series,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  formatX,
  formatY,
  references = [],
  height = 300,
  tableCaption,
  endLabels = true,
}: Props) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const H = height;

  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y).concat(references.map((r) => r.y));
  const [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
        const last = s.points[s.points.length - 1];
        const first = s.points[0];
        const area =
          s.area && first && last
            ? `${d} L${sx(last.x).toFixed(1)},${sy(y0).toFixed(1)} L${sx(first.x).toFixed(1)},${sy(y0).toFixed(1)} Z`
            : null;
        return {d, area};
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, x0, x1, y0, y1, H],
  );

  const yTicks = 4;
  const xTicks = 5;

  // Hover: nearest x across the first series' points.
  const primary = series[0]?.points ?? [];
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !primary.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = x0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0);
    let best = 0;
    let bd = Infinity;
    primary.forEach((p, i) => {
      const d = Math.abs(p.x - xv);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hx = hover !== null && primary[hover] ? primary[hover].x : null;
  const hoverVals =
    hx === null
      ? []
      : series.map((s) => {
          let best = s.points[0];
          for (const p of s.points) if (best && Math.abs(p.x - hx) < Math.abs(best.x - hx)) best = p;
          return {name: s.name, point: best};
        });

  const tipX = hx === null ? 0 : sx(hx);
  const tipLeft = tipX > W * 0.62;

  return (
    <div className="max-w-[720px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        role="img"
        aria-labelledby={`${id}-t`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-t`}>
          {yLabel} against {xLabel}
        </title>
        {/* gridlines */}
        {Array.from({length: yTicks + 1}, (_, i) => y0 + ((y1 - y0) * i) / yTicks).map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="var(--rule)" strokeWidth={1} />
            <text x={PAD.l - 8} y={sy(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--mute)">
              {formatY(v)}
            </text>
          </g>
        ))}
        {Array.from({length: xTicks + 1}, (_, i) => x0 + ((x1 - x0) * i) / xTicks).map((v) => (
          <text key={`x${v}`} x={sx(v)} y={H - PAD.b + 16} textAnchor="middle" fontSize={11} fill="var(--mute)">
            {formatX(v)}
          </text>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--ink)" strokeWidth={1} />
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--mute)">
          {xLabel}
        </text>
        <text x={PAD.l} y={10} fontSize={11} fill="var(--mute)">
          {yLabel}
        </text>

        {/* references */}
        {references.map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--mute)" strokeWidth={1} strokeDasharray="2 4" />
            <text x={PAD.l + 6} y={sy(r.y) + (sy(r.y) < PAD.t + 16 ? 13 : -5)} fontSize={11} fill="var(--mute)">
              {r.label}
            </text>
          </g>
        ))}

        {/* series */}
        {series.map((s, i) => (
          <g key={s.name}>
            {paths[i]?.area && <path d={paths[i]!.area!} fill="var(--ink)" fillOpacity={0.06} />}
            <path d={paths[i]!.d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray={s.dash} strokeLinejoin="round" />
            {s.endMarker && s.points.length > 0 && (
              <rect
                x={sx(s.points[s.points.length - 1]!.x) - 4}
                y={sy(s.points[s.points.length - 1]!.y) - 4}
                width={8}
                height={8}
                fill="var(--ink)"
              />
            )}
            {endLabels && s.points.length > 0 && (
              <text
                x={Math.min(W - PAD.r, sx(s.points[s.points.length - 1]!.x) + 8)}
                y={
                  sy(s.points[s.points.length - 1]!.y) +
                  (i === 0 ? (sy(s.points[s.points.length - 1]!.y) < PAD.t + 20 ? 16 : -8) : 14)
                }
                fontSize={11}
                fill="var(--ink)"
                textAnchor={sx(s.points[s.points.length - 1]!.x) > W - 90 ? 'end' : 'start'}
              >
                {s.name}
              </text>
            )}
          </g>
        ))}

        {/* crosshair + tooltip */}
        {hx !== null && (
          <g pointerEvents="none">
            <line x1={tipX} x2={tipX} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeWidth={1} />
            {hoverVals.map(
              (h) =>
                h.point && (
                  <rect key={h.name} x={sx(h.point.x) - 4} y={sy(h.point.y) - 4} width={8} height={8} fill="var(--page)" stroke="var(--ink)" strokeWidth={1.5} />
                ),
            )}
            <g transform={`translate(${tipLeft ? tipX - 10 : tipX + 10},${PAD.t + 4})`}>
              <rect
                x={tipLeft ? -170 : 0}
                y={0}
                width={170}
                height={14 + hoverVals.length * 14 + 6}
                fill="var(--page)"
                stroke="var(--ink)"
                strokeWidth={1}
              />
              <text x={tipLeft ? -162 : 8} y={13} fontSize={11} fill="var(--mute)">
                {xLabel} {formatX(hx)}
              </text>
              {hoverVals.map(
                (h, i) =>
                  h.point && (
                    <text key={h.name} x={tipLeft ? -162 : 8} y={27 + i * 14} fontSize={11} fill="var(--ink)">
                      {h.name}: {formatY(h.point.y)}
                    </text>
                  ),
              )}
            </g>
          </g>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-tiny text-mute">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-2">
              <svg width="26" height="8" aria-hidden>
                <line x1="0" x2="26" y1="4" y2="4" stroke="var(--ink)" strokeWidth="2" strokeDasharray={s.dash} />
              </svg>
              {s.name}
            </span>
          ))}
        <button type="button" className="ml-auto underline underline-offset-4" onClick={() => setTable((t) => !t)}>
          {table ? 'Hide table' : 'Show table'}
        </button>
      </div>

      {table && (
        <table className="tbl mt-3">
          {tableCaption && <caption className="pb-2 text-left text-tiny text-mute">{tableCaption}</caption>}
          <thead>
            <tr>
              <th>{xLabel}</th>
              {series.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows(primary, 12).map((p) => (
              <tr key={p.x}>
                <td>{formatX(p.x)}</td>
                {series.map((s) => {
                  const q = s.points.find((z) => z.x === p.x) ?? nearest(s.points, p.x);
                  return <td key={s.name}>{q ? formatY(q.y) : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function nearest(points: Point[], x: number): Point | undefined {
  let best = points[0];
  for (const p of points) if (best && Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best;
}

function sampleRows(points: Point[], n: number): Point[] {
  if (points.length <= n) return points;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) out.push(points[Math.round((i * (points.length - 1)) / (n - 1))]!);
  return out;
}
