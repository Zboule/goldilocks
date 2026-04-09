import type { Filter, Manifest } from "../../types";
import VariableSelect from "./VariableSelect";
import StatSelect from "./StatSelect";
import Select from "./Select";

interface Props {
  filter: Filter;
  manifest: Manifest;
  onChange: (patch: Partial<Filter>) => void;
  onRemove: () => void;
}

const OPERATOR_OPTIONS = [
  { value: "<", label: "<" },
  { value: ">", label: ">" },
];

export default function FilterRow({ filter, manifest, onChange, onRemove }: Props) {
  const varInfo = manifest.variables[filter.variable];

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-2 relative group">
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 text-gray-300 hover:text-red-500 transition-colors text-sm leading-none px-1 opacity-0 group-hover:opacity-100"
        title="Remove filter"
      >
        ×
      </button>
      <div className="flex items-center gap-1.5 flex-wrap">
        <VariableSelect
          value={filter.variable}
          onChange={(v) => onChange({ variable: v })}
          manifest={manifest}
          className="text-xs"
        />
        <StatSelect
          value={filter.stat}
          onChange={(s) => onChange({ stat: s })}
          stats={manifest.stats}
          className="text-xs"
        />
        <Select
          value={filter.operator}
          onChange={(v) => onChange({ operator: v as "<" | ">" })}
          options={OPERATOR_OPTIONS}
          className="text-xs w-12 text-center"
        />
        <input
          type="number"
          value={filter.value}
          onChange={(e) => onChange({ value: parseFloat(e.target.value) || 0 })}
          className="w-14 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs tabular-nums text-center"
        />
        <span className="text-[10px] text-gray-400">{varInfo?.units ?? ""}</span>
      </div>
    </div>
  );
}
