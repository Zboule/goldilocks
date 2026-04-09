import { periodToLabel } from "../../lib/gridGeometry";

interface Props {
  period: number;
  periods: number[];
  periodLabels: string[];
  onChange: (p: number) => void;
}

const MONTH_TICKS = [
  { period: 1, label: "Jan" },
  { period: 4, label: "Feb" },
  { period: 7, label: "Mar" },
  { period: 10, label: "Apr" },
  { period: 13, label: "May" },
  { period: 16, label: "Jun" },
  { period: 19, label: "Jul" },
  { period: 22, label: "Aug" },
  { period: 25, label: "Sep" },
  { period: 28, label: "Oct" },
  { period: 31, label: "Nov" },
  { period: 34, label: "Dec" },
];

export default function PeriodSlider({ period, periods, periodLabels, onChange }: Props) {
  const min = periods[0];
  const max = periods[periods.length - 1];
  const range = max - min;

  return (
    <div className="flex items-start gap-2 flex-1 min-w-0 py-1">
      <span className="text-sm font-medium shrink-0 mt-0.5">Period</span>
      <div className="flex-1 min-w-0 flex flex-col">
        <input
          type="range"
          min={min}
          max={max}
          value={period}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="relative h-3 mt-px pointer-events-none select-none">
          {MONTH_TICKS.map(({ period: tp, label }) => {
            const pct = ((tp - min) / range) * 100;
            return (
              <div
                key={label}
                className="absolute flex flex-col items-center"
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
              >
                <div className="w-px h-1 bg-gray-300" />
                <span className="text-[9px] text-gray-400 leading-none">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <span className="w-28 text-right tabular-nums text-sm text-gray-600 shrink-0 mt-0.5 whitespace-nowrap">
        {periodToLabel(period, periodLabels)}
      </span>
    </div>
  );
}
