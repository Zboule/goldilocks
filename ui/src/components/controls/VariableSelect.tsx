import type { Manifest } from "../../types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  manifest: Manifest;
  className?: string;
}

export default function VariableSelect({ value, onChange, manifest, className }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-gray-300 bg-white px-2 py-1 text-sm ${className ?? ""}`}
    >
      {Object.entries(manifest.variables).map(([key, info]) => (
        <option key={key} value={key}>{info.label}</option>
      ))}
    </select>
  );
}
