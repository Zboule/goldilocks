import type { Manifest } from "../../types";
import Select from "./Select";

interface Props {
  value: string;
  onChange: (v: string) => void;
  manifest: Manifest;
  className?: string;
}

export default function VariableSelect({ value, onChange, manifest, className }: Props) {
  const options = Object.entries(manifest.variables).map(([key, info]) => ({
    value: key,
    label: info.label,
  }));

  return <Select value={value} onChange={onChange} options={options} className={className} />;
}
