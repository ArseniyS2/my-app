"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface StatsData {
  statusCounts: {
    completed: number;
    watching: number;
    planned: number;
    onHold: number;
    dropped: number;
  };
  totalEpisodes: number;
  hoursLast30Days: number;
  watchedDates: string[];
  genreBreakdown: { genreName: string; count: number }[];
  popularTags: { tagName: string; count: number }[];
  genreCombinations: { genre1: string; genre2: string; count: number }[];
  tagCombinations: { tag1: string; tag2: string; count: number }[];
}

type TimePeriod = "30d" | "90d" | "12m" | "all";

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "12m", label: "Last 12 Months" },
  { value: "all", label: "Overall" },
];

/* ================================================================== */
/*  Timeline grouping logic                                            */
/* ================================================================== */

function computeTimeline(
  watchedDates: string[],
  period: TimePeriod
): { label: string; count: number }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const freq = new Map<string, number>();
  for (const d of watchedDates) {
    freq.set(d, (freq.get(d) ?? 0) + 1);
  }

  switch (period) {
    case "30d": {
      const result: { label: string; count: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        result.push({
          label: d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          count: freq.get(key) ?? 0,
        });
      }
      return result;
    }

    case "90d": {
      const result: { label: string; count: number }[] = [];
      for (let w = 12; w >= 0; w--) {
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() - w * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        const startStr = weekStart.toISOString().split("T")[0];
        const endStr = weekEnd.toISOString().split("T")[0];
        let count = 0;
        for (const d of watchedDates) {
          if (d >= startStr && d <= endStr) count++;
        }
        result.push({
          label: weekStart.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          count,
        });
      }
      return result;
    }

    case "12m": {
      const result: { label: string; count: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        let count = 0;
        for (const dateStr of watchedDates) {
          const pd = new Date(dateStr + "T00:00:00");
          if (pd.getFullYear() === y && pd.getMonth() === m) count++;
        }
        result.push({
          label: d.toLocaleDateString("en-US", {
            month: "short",
            year: "2-digit",
          }),
          count,
        });
      }
      return result;
    }

    case "all": {
      if (watchedDates.length === 0) return [];
      const sorted = [...watchedDates].sort();
      const earliest = new Date(sorted[0] + "T00:00:00");
      const result: { label: string; count: number }[] = [];
      const MN = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      for (let y = earliest.getFullYear(); y < 2024; y++) {
        let count = 0;
        for (const d of watchedDates) {
          const pd = new Date(d + "T00:00:00");
          if (pd.getFullYear() === y) count++;
        }
        result.push({ label: String(y), count });
      }
      const startYear = Math.max(earliest.getFullYear(), 2024);
      const startMonth =
        earliest.getFullYear() >= 2024 ? earliest.getMonth() : 0;
      let cur = new Date(startYear, startMonth, 1);
      while (cur <= now) {
        const y = cur.getFullYear();
        const m = cur.getMonth();
        let count = 0;
        for (const d of watchedDates) {
          const pd = new Date(d + "T00:00:00");
          if (pd.getFullYear() === y && pd.getMonth() === m) count++;
        }
        result.push({
          label: `${MN[m]} '${String(y).slice(2)}`,
          count,
        });
        cur = new Date(y, m + 1, 1);
      }
      return result;
    }
  }
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const GENRE_COLORS: Record<string, string> = {
  Action: "#FF6B6B",
  Adventure: "#4ECDC4",
  Comedy: "#FFD93D",
  Drama: "#6C9BCF",
  Romance: "#FF85A2",
  Psychological: "#A855F7",
  Suspense: "#5B8DEF",
  Tragedy: "#94A3B8",
  Fantasy: "#C084FC",
  "Sci-Fi": "#22D3EE",
  Horror: "#EF4444",
  Mystery: "#8B5CF6",
  "Slice of Life": "#34D399",
  Sports: "#F97316",
  Supernatural: "#D946EF",
  Thriller: "#6366F1",
  Ecchi: "#FB7185",
  Music: "#FBBF24",
  Mecha: "#14B8A6",
};

const FALLBACK_COLORS = [
  "#F472B6", "#818CF8", "#34D399", "#FBBF24",
  "#FB923C", "#A78BFA", "#38BDF8", "#F87171",
];

function getGenreColor(name: string, idx: number): string {
  return GENRE_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string; bgTint: string }
> = {
  completed: {
    color: "#34D399",
    label: "Completed",
    bgTint: "rgba(52,211,153,0.08)",
  },
  watching: {
    color: "#5B8DEF",
    label: "Watching",
    bgTint: "rgba(91,141,239,0.08)",
  },
  planned: {
    color: "#FFD93D",
    label: "Planned",
    bgTint: "rgba(255,217,61,0.08)",
  },
  onHold: {
    color: "#F97316",
    label: "On Hold",
    bgTint: "rgba(249,115,22,0.08)",
  },
  dropped: {
    color: "#EF4444",
    label: "Dropped",
    bgTint: "rgba(239,68,68,0.08)",
  },
};

/* ================================================================== */
/*  Empty state                                                        */
/* ================================================================== */

function EmptyState({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-sm text-[#8B7FA0]">{text}</p>
  );
}

/* ================================================================== */
/*  Custom dropdown (matches dashboard style)                          */
/* ================================================================== */

function PeriodDropdown({
  value,
  onChange,
}: {
  value: TimePeriod;
  onChange: (v: TimePeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = PERIOD_OPTIONS.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-lg border bg-[#1A1625] py-2 pl-3 pr-8 text-sm text-[#E8E0F0] outline-none transition-colors ${
          open
            ? "border-[#E064D6]"
            : "border-[#2A2440] hover:border-[#3D3560]"
        }`}
      >
        {selected?.label}
        <svg
          className={`pointer-events-none absolute right-2 h-4 w-4 text-[#8B7FA0] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-[#2A2440] bg-[#1C1830] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`block w-full whitespace-nowrap px-4 py-2 text-left text-sm transition-colors ${
                opt.value === value
                  ? "bg-[#E064D6]/15 text-[#E064D6]"
                  : "text-[#C8BDD9] hover:bg-[#28223E] hover:text-[#E8E0F0]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Donut chart (SVG)                                                  */
/* ================================================================== */

function DonutChart({
  data,
  completedCount,
}: {
  data: { name: string; count: number; color: string; percentage: number }[];
  completedCount: number;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 90;
  const innerR = 58;

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={outerR} fill="#2A2440" />
        <circle cx={cx} cy={cy} r={innerR} fill="#0D0B14" />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#8B7FA0"
          fontSize="14"
        >
          No data
        </text>
      </svg>
    );
  }

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const segments = data.reduce<
    {
      name: string;
      count: number;
      color: string;
      percentage: number;
      startAngle: number;
      endAngle: number;
    }[]
  >((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
    const angle = (d.count / total) * 360;
    acc.push({ ...d, startAngle: prev, endAngle: prev + angle });
    return acc;
  }, []);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={outerR} fill="#2A2440" />
      {segments.map((seg, i) => {
        const span = seg.endAngle - seg.startAngle;
        if (span >= 359.99) {
          return (
            <circle key={i} cx={cx} cy={cy} r={outerR} fill={seg.color} />
          );
        }
        const p1 = polarToCartesian(seg.startAngle, outerR);
        const p2 = polarToCartesian(seg.endAngle, outerR);
        const largeArc = span > 180 ? 1 : 0;
        const d = [
          `M ${cx} ${cy}`,
          `L ${p1.x} ${p1.y}`,
          `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
          "Z",
        ].join(" ");
        return <path key={i} d={d} fill={seg.color} />;
      })}
      <circle cx={cx} cy={cy} r={innerR} fill="#0D0B14" />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#E8E0F0"
        fontSize="26"
        fontWeight="bold"
      >
        {completedCount}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#8B7FA0"
        fontSize="10"
      >
        completed
      </text>
    </svg>
  );
}

/* ================================================================== */
/*  Cumulative area chart (recharts)                                   */
/* ================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#3D3560] bg-[#1A1625] px-3.5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <p className="mb-0.5 text-[11px] text-[#8B7FA0]">{label}</p>
      <p className="text-sm font-bold text-[#E064D6]">
        {payload[0].value} anime
      </p>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function CumulativeChart({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  if (data.length === 0)
    return <EmptyState text="No timeline data available" />;

  /* Convert per-period counts → running total */
  const cumulativeData = data.reduce<{ label: string; total: number }[]>(
    (acc, d) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].total : 0;
      acc.push({ label: d.label, total: prev + d.count });
      return acc;
    },
    []
  );

  /* X-axis label interval */
  const xInterval =
    cumulativeData.length <= 13
      ? 0
      : cumulativeData.length <= 20
        ? 1
        : Math.ceil(cumulativeData.length / 10) - 1;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart
        data={cumulativeData}
        margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
      >
        <defs>
          <linearGradient id="chartAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E064D6" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#E064D6" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#2A2440"
          vertical={false}
        />

        <XAxis
          dataKey="label"
          tick={{ fill: "#6B6080", fontSize: 10 }}
          axisLine={{ stroke: "#2A2440" }}
          tickLine={false}
          interval={xInterval}
        />
        <YAxis
          tick={{ fill: "#6B6080", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />

        <Tooltip
          content={<ChartTooltip />}
          cursor={{
            stroke: "#E064D6",
            strokeWidth: 1,
            strokeOpacity: 0.45,
            strokeDasharray: "4 4",
          }}
        />

        <Area
          type="monotone"
          dataKey="total"
          stroke="#E064D6"
          strokeWidth={2.5}
          fill="url(#chartAreaFill)"
          dot={false}
          activeDot={{
            r: 5,
            stroke: "#E064D6",
            fill: "#0D0B14",
            strokeWidth: 2.5,
          }}
          animationDuration={1200}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ================================================================== */
/*  Horizontal bar chart (tags)                                        */
/* ================================================================== */

function HorizontalBarChart({
  data,
  animated,
}: {
  data: { name: string; count: number }[];
  animated: boolean;
}) {
  if (data.length === 0) return <EmptyState text="No tag data available" />;

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="space-y-2.5">
      {data.map((item, i) => {
        const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3 group">
            <span className="text-xs text-[#C8BDD9] w-[140px] truncate shrink-0">
              {item.name}
            </span>
            <div className="flex-1 h-[22px] bg-[#13111C] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all ease-out"
                style={{
                  width: animated ? `${Math.max(pct, 3)}%` : "0%",
                  transitionDuration: "0.8s",
                  transitionDelay: `${i * 0.04}s`,
                  background:
                    "linear-gradient(to right, #E064D6, #A855F7)",
                  boxShadow: "0 0 6px rgba(224,100,214,0.15)",
                }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums text-[#E8E0F0] w-7 text-right shrink-0">
              {item.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Combination list (genre or tag pairs)                              */
/* ================================================================== */

function CombinationList({
  data,
  color1 = "#E064D6",
  color2 = "#A855F7",
  emptyText = "No data yet",
}: {
  data: { name1: string; name2: string; count: number }[];
  color1?: string;
  color2?: string;
  emptyText?: string;
}) {
  if (data.length === 0) return <EmptyState text={emptyText} />;

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg bg-[#13111C] px-3 py-2.5"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-nowrap">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium truncate"
              style={{
                backgroundColor: `${color1}18`,
                color: color1,
              }}
            >
              {item.name1}
            </span>
            <span className="text-[10px] text-[#6B6080] shrink-0">+</span>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium truncate"
              style={{
                backgroundColor: `${color2}18`,
                color: color2,
              }}
            >
              {item.name2}
            </span>
          </div>
          <div className="flex items-center gap-2.5 ml-3 shrink-0">
            <div className="w-14 h-1.5 rounded-full bg-[#2A2440] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
                  background: `linear-gradient(to right, ${color1}, ${color2})`,
                }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums text-[#C8BDD9] w-5 text-right">
              {item.count}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Status icon SVGs                                                   */
/* ================================================================== */

function StatusIcon({ type, color }: { type: string; color: string }) {
  const props = {
    width: 16,
    height: 16,
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (type) {
    case "completed":
      return (
        <svg {...props} viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "watching":
      return (
        <svg {...props} viewBox="0 0 24 24">
          <polygon
            points="5 3 19 12 5 21 5 3"
            fill={color}
            stroke="none"
          />
        </svg>
      );
    case "planned":
      return (
        <svg {...props} viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      );
    case "onHold":
      return (
        <svg {...props} viewBox="0 0 24 24">
          <rect
            x="6" y="4" width="4" height="16" rx="1"
            fill={color} stroke="none"
          />
          <rect
            x="14" y="4" width="4" height="16" rx="1"
            fill={color} stroke="none"
          />
        </svg>
      );
    case "dropped":
      return (
        <svg {...props} viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
}

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

export default function OverviewTab({
  stats,
  loading,
}: {
  stats: StatsData | null;
  loading: boolean;
}) {
  const [animated, setAnimated] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("12m");

  useEffect(() => {
    if (stats && !loading) {
      const timer = setTimeout(() => setAnimated(true), 150);
      return () => clearTimeout(timer);
    }
  }, [stats, loading]);

  /* Recompute timeline when period or data changes */
  const timelineData = useMemo(
    () => (stats ? computeTimeline(stats.watchedDates, timePeriod) : []),
    [stats, timePeriod]
  );

  /* ---- Loading spinner ---- */
  if (loading) {
    return (
      <div>
        <h2 className="mb-6 text-xl font-bold">Overview</h2>
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <h2 className="mb-6 text-xl font-bold">Overview</h2>
        <p className="py-12 text-center text-sm text-[#8B7FA0]">
          Could not load statistics.
        </p>
      </div>
    );
  }

  const {
    statusCounts,
    totalEpisodes,
    hoursLast30Days,
    genreBreakdown,
    popularTags,
    genreCombinations,
    tagCombinations,
  } = stats;

  /* ---- Donut chart data ---- */
  const genreTotal = genreBreakdown.reduce((s, d) => s + d.count, 0);
  const chartData = genreBreakdown.map((g, i) => ({
    name: g.genreName,
    count: g.count,
    color: getGenreColor(g.genreName, i),
    percentage: genreTotal > 0 ? (g.count / genreTotal) * 100 : 0,
  }));

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">Overview</h2>

      {/* ============================================================ */}
      {/*  STATUS CARDS                                                 */}
      {/* ============================================================ */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {(
          Object.entries(STATUS_CONFIG) as [
            string,
            { color: string; label: string; bgTint: string },
          ][]
        ).map(([key, cfg]) => (
          <div
            key={key}
            className="rounded-xl border border-[#2A2440] p-4 transition-colors hover:border-[#3D3560]"
            style={{ backgroundColor: cfg.bgTint }}
          >
            <div className="mb-2 flex items-center gap-2">
              <StatusIcon type={key} color={cfg.color} />
              <span className="text-[11px] font-medium text-[#8B7FA0]">
                {cfg.label}
              </span>
            </div>
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: cfg.color }}
            >
              {statusCounts[key as keyof typeof statusCounts]}
            </p>
          </div>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  BIG NUMBER CARDS                                             */}
      {/* ============================================================ */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Total episodes */}
        <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-[#E064D6]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
              />
            </svg>
            <span className="text-xs font-medium text-[#8B7FA0]">
              Total Episodes Watched
            </span>
          </div>
          <p className="text-3xl font-bold text-[#E064D6] sm:text-4xl">
            {totalEpisodes.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-[#6B6080]">
            across all franchise seasons
          </p>
        </div>

        {/* Hours last 30 days */}
        <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-[#A855F7]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2"
              />
            </svg>
            <span className="text-xs font-medium text-[#8B7FA0]">
              Hours Watched (Last 30 Days)
            </span>
          </div>
          <p className="text-3xl font-bold text-[#A855F7] sm:text-4xl">
            {hoursLast30Days.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-[#6B6080]">
            ~24 min per episode
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  CUMULATIVE TIMELINE (recharts + custom dropdown)             */}
      {/* ============================================================ */}
      <div className="mb-5 rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold">
            Anime Watched Over Time
          </h3>
          <PeriodDropdown value={timePeriod} onChange={setTimePeriod} />
        </div>

        <CumulativeChart key={timePeriod} data={timelineData} />
      </div>

      {/* ============================================================ */}
      {/*  GENRE SECTION (donut + combinations)                         */}
      {/* ============================================================ */}
      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Genre distribution */}
        <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
          <h3 className="mb-5 text-base font-semibold">
            Genre Distribution
          </h3>

          {chartData.length === 0 ? (
            <EmptyState text="No genre data yet" />
          ) : (
            <div className="flex flex-col items-center gap-6">
              <DonutChart
                data={chartData}
                completedCount={statusCounts.completed}
              />

              {/* Legend */}
              <div className="grid w-full grid-cols-2 gap-x-5 gap-y-1.5">
                {chartData.map((g, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="text-xs text-[#C8BDD9]">{g.name}</span>
                    <span className="ml-auto text-xs font-medium tabular-nums text-[#8B7FA0]">
                      {g.percentage.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Genre combinations */}
        <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
          <h3 className="mb-5 text-base font-semibold">
            Top Genre Combinations
          </h3>
          <CombinationList
            data={genreCombinations.map((c) => ({
              name1: c.genre1,
              name2: c.genre2,
              count: c.count,
            }))}
            color1="#FF6B6B"
            color2="#4ECDC4"
            emptyText="No genre combination data"
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/*  TAGS SECTION – full width, stacked                           */}
      {/* ============================================================ */}
      <div className="space-y-3">
        {/* Popular tags */}
        <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
          <h3 className="mb-5 text-base font-semibold">
            Most Popular Tags
          </h3>
          <HorizontalBarChart
            data={popularTags.map((t) => ({
              name: t.tagName,
              count: t.count,
            }))}
            animated={animated}
          />
        </div>

        {/* Tag combinations */}
        <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
          <h3 className="mb-5 text-base font-semibold">
            Top Tag Combinations
          </h3>
          <CombinationList
            data={tagCombinations.map((c) => ({
              name1: c.tag1,
              name2: c.tag2,
              count: c.count,
            }))}
            emptyText="No tag combination data"
          />
        </div>
      </div>
    </div>
  );
}
