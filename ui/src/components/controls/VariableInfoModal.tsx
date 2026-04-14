import { useEffect, useRef } from "react";
import { VARIABLE_DETAILS } from "../../lib/variableMetadata";
import type { ReferenceRange } from "../../lib/variableMetadata";
import { getColor, FIXED_DISPLAY_RANGE } from "../../lib/colorScale";

interface Props {
  variableKey: string;
  variableLabel: string;
  onClose: () => void;
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="font-semibold text-gray-700 text-xs mb-0.5">{label}</dt>
      <dd className="text-gray-500 text-xs leading-relaxed">{text}</dd>
    </div>
  );
}

function RangeTable({ ranges, variableKey }: { ranges: ReferenceRange[]; variableKey: string }) {
  const fixed = FIXED_DISPLAY_RANGE[variableKey];
  const displayMin = fixed?.[0] ?? Math.min(...ranges.map((r) => r.value));
  const displayMax = fixed?.[1] ?? Math.max(...ranges.map((r) => r.value));

  return (
    <div>
      <dt className="font-semibold text-gray-700 text-xs mb-1.5">Reference Ranges</dt>
      <dd className="space-y-1">
        {ranges.map((r, i) => {
          const [cr, cg, cb] = getColor(variableKey, r.value, displayMin, displayMax);
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: `rgb(${cr},${cg},${cb})` }}
              />
              <span className="font-mono text-gray-600 w-24 flex-shrink-0 text-right">{r.range}</span>
              <span className="text-gray-500">{r.label}</span>
            </div>
          );
        })}
      </dd>
    </div>
  );
}

export default function VariableInfoModal({ variableKey, variableLabel, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const detail = VARIABLE_DETAILS[variableKey];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!detail) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">{variableLabel}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <dl className="px-5 py-4 space-y-3">
          {detail.ranges && detail.ranges.length > 0 && (
            <RangeTable ranges={detail.ranges} variableKey={variableKey} />
          )}
          <div className="border-t border-gray-100 pt-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Methodology</div>
          </div>
          <Section label="Data Source" text={detail.source} />
          <Section label="Raw Variable" text={detail.rawVariable} />
          <Section label="Derivation" text={detail.derivation} />
          <Section label="Period Aggregation" text={detail.temporalAgg} />
          <Section label="Statistics" text={detail.stats} />
        </dl>
      </div>
    </div>
  );
}
