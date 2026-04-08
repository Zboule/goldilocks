import type { Manifest } from "../../types";
import VariableSelect from "./VariableSelect";
import StatSelect from "./StatSelect";

interface Props {
  variable: string;
  stat: string;
  manifest: Manifest;
  onVariableChange: (v: string) => void;
  onStatChange: (s: string) => void;
}

export default function DisplaySelector({
  variable,
  stat,
  manifest,
  onVariableChange,
  onStatChange,
}: Props) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <span className="text-gray-500">Color by</span>
      <VariableSelect value={variable} onChange={onVariableChange} manifest={manifest} />
      <StatSelect value={stat} onChange={onStatChange} stats={manifest.stats} />
    </div>
  );
}
