import CustomSelect from "./CustomSelect";

const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  median: "Median",
  min: "Min",
  max: "Max",
  p10: "P10",
  p90: "P90",
  ystd: "Year Std",
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  stats: string[];
  className?: string;
}

export default function StatSelect({ value, onChange, stats, className }: Props) {
  const options = stats.map((s) => ({ value: s, label: STAT_LABELS[s] ?? s }));

  return <CustomSelect value={value} onChange={onChange} options={options} className={className} minWidth="80px" />;
}
