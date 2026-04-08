import { weekToDateRange } from "../../lib/gridGeometry";

interface Props {
  week: number;
  weeks: number[];
  onChange: (w: number) => void;
}

const MONTH_TICKS = [
  { week: 1, label: "Jan" },
  { week: 5, label: "Feb" },
  { week: 9, label: "Mar" },
  { week: 14, label: "Apr" },
  { week: 18, label: "May" },
  { week: 22, label: "Jun" },
  { week: 27, label: "Jul" },
  { week: 31, label: "Aug" },
  { week: 36, label: "Sep" },
  { week: 40, label: "Oct" },
  { week: 44, label: "Nov" },
  { week: 48, label: "Dec" },
];

export default function WeekSlider({ week, weeks, onChange }: Props) {
  const min = weeks[0];
  const max = weeks[weeks.length - 1];
  const range = max - min;

  return (
    <div className="flex items-start gap-2 flex-1 min-w-0 py-1">
      <span className="text-sm font-medium shrink-0 mt-0.5">Week</span>
      <div className="flex-1 min-w-0 flex flex-col">
        <input
          type="range"
          min={min}
          max={max}
          value={week}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="relative h-3 mt-px pointer-events-none select-none">
          {MONTH_TICKS.map(({ week: tw, label }) => {
            const pct = ((tw - min) / range) * 100;
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
      <span className="w-36 text-right tabular-nums text-sm text-gray-600 shrink-0 mt-0.5 whitespace-nowrap">
        {weekToDateRange(week)}
      </span>
    </div>
  );
}
