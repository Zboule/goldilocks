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
  { value: "between", label: "between" },
];

export default function FilterRow({ filter, manifest, onChange, onRemove }: Props) {
  const varInfo = manifest.variables[filter.variable];
  const isCategorical = varInfo?.categorical === true;

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <VariableSelect
          value={filter.variable}
          onChange={(v) => {
            const newVarInfo = manifest.variables[v];
            const patch: Partial<Filter> = { variable: v };
            if (newVarInfo?.categorical) patch.stat = "mean";
            onChange(patch);
          }}
          manifest={manifest}
          className="text-xs flex-1 min-w-0"
        />
        <button
          onClick={onRemove}
          className="text-gray-300 hover:text-red-500 transition-colors text-sm leading-none px-1 shrink-0"
          title="Remove filter"
        >
          ×
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {!isCategorical && (
          <StatSelect
            value={filter.stat}
            onChange={(s) => onChange({ stat: s })}
            stats={manifest.stats}
            className="text-xs"
          />
        )}
        <Select
          value={filter.operator}
          onChange={(v) => onChange({ operator: v as "<" | ">" | "between" })}
          options={OPERATOR_OPTIONS}
          className="text-xs w-16 text-center"
        />
        <input
          type="number"
          value={filter.value}
          onChange={(e) => onChange({ value: parseFloat(e.target.value) || 0 })}
          className="w-14 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs tabular-nums text-center"
        />
        {filter.operator === "between" && (
          <>
            <span className="text-[10px] text-gray-400">–</span>
            <input
              type="number"
              value={filter.value2 ?? 0}
              onChange={(e) => onChange({ value2: parseFloat(e.target.value) || 0 })}
              className="w-14 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs tabular-nums text-center"
            />
          </>
        )}
        <span className="text-[10px] text-gray-400 shrink-0">{varInfo?.units ?? ""}</span>
      </div>
    </div>
  );
}
