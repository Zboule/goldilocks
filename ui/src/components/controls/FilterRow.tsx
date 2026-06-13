import { useEffect, useState } from "react";
import type { Filter, Manifest } from "../../types";
import VariableSelect from "./VariableSelect";
import StatSelect from "./StatSelect";

interface Props {
  filter: Filter;
  manifest: Manifest;
  onChange: (patch: Partial<Filter>) => void;
  onRemove: () => void;
}

const OPERATORS: { value: Filter["operator"]; label: string; title: string }[] = [
  { value: "<", label: "<", title: "Less than" },
  { value: ">", label: ">", title: "Greater than" },
  { value: "between", label: "Range", title: "Between two values" },
];

/**
 * Controlled number input that doesn't fight the user mid-edit: keeps a local
 * draft string ("0." stays "0.", empty stays empty) and commits only values
 * that parse to a finite number.
 */
function NumberInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync external changes (preset load) while not editing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
      className="w-16 md:w-14 h-9 md:h-7 rounded border border-gray-300 bg-white px-1.5 text-[16px] md:text-xs tabular-nums text-center"
    />
  );
}

export default function FilterRow({ filter, manifest, onChange, onRemove }: Props) {
  const varInfo = manifest.variables[filter.variable];
  const isCategorical = varInfo?.categorical === true;
  const isBetween = filter.operator === "between";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 space-y-1.5">
      {/* Row 1: layer + statistic + remove. Stat is a fixed width so swapping
          labels (Mean ↔ Year Std) doesn't shift the layer field. */}
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
          label="Filter variable"
        />
        {!isCategorical && (
          <StatSelect
            value={filter.stat}
            onChange={(s) => onChange({ stat: s })}
            stats={manifest.stats}
            className="text-xs shrink-0 w-24 md:w-28"
          />
        )}
        <button
          onClick={onRemove}
          className="shrink-0 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 active:text-red-500 active:bg-red-50 transition-colors text-xl md:text-base leading-none"
          title="Remove filter"
          aria-label="Remove filter"
        >
          ×
        </button>
      </div>
      {/* Row 2: operator + value(s) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Operator: segmented control — every option visible, thumb-sized */}
        <div className="flex rounded border border-gray-300 bg-white overflow-hidden shrink-0 h-9 md:h-7" role="radiogroup" aria-label="Operator">
          {OPERATORS.map((op, i) => (
            <button
              key={op.value}
              role="radio"
              aria-checked={filter.operator === op.value}
              title={op.title}
              onClick={() => {
                const patch: Partial<Filter> = { operator: op.value };
                // Entering "between" with no upper bound: seed a non-wiping
                // range from the variable's display ceiling instead of 0–0.
                if (op.value === "between" && filter.value2 == null) {
                  patch.value2 = Math.ceil(varInfo?.display_max ?? filter.value);
                }
                onChange(patch);
              }}
              className={`flex items-center px-2.5 md:px-2 text-xs font-medium transition-colors
                ${i > 0 ? "border-l border-gray-200" : ""}
                ${filter.operator === op.value
                  ? "bg-blue-500 text-white"
                  : "text-gray-500 hover:bg-gray-50 active:bg-gray-100"}`}
            >
              {op.label}
            </button>
          ))}
        </div>

        {!isBetween && (
          <>
            <NumberInput value={filter.value} onCommit={(v) => onChange({ value: v })} />
            <span className="text-[10px] text-gray-400 shrink-0">{varInfo?.units ?? ""}</span>
          </>
        )}

        {isBetween && (
          <div className="flex items-center gap-1.5">
            <NumberInput value={filter.value} onCommit={(v) => onChange({ value: v })} />
            <span className="text-[10px] text-gray-400">to</span>
            <NumberInput value={filter.value2 ?? 0} onCommit={(v) => onChange({ value2: v })} />
            <span className="text-[10px] text-gray-400 shrink-0">{varInfo?.units ?? ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}
