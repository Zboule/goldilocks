const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  median: "Median",
  min: "Min",
  max: "Max",
  p10: "P10",
  p90: "P90",
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  stats: string[];
  className?: string;
}

export default function StatSelect({ value, onChange, stats, className }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-gray-300 bg-white px-2 py-1 text-sm ${className ?? ""}`}
    >
      {stats.map((s) => (
        <option key={s} value={s}>{STAT_LABELS[s] ?? s}</option>
      ))}
    </select>
  );
}
