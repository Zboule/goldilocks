import { useState } from "react";
import type { Manifest } from "../../types";
import VariableSelect from "./VariableSelect";
import StatSelect from "./StatSelect";
import VariableInfoModal from "./VariableInfoModal";
import StatInfoModal from "./StatInfoModal";
import { VARIABLE_DETAILS } from "../../lib/variableMetadata";

interface Props {
  variable: string;
  stat: string;
  manifest: Manifest;
  onVariableChange: (v: string) => void;
  onStatChange: (s: string) => void;
}

function InfoButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      className="w-5 h-5 rounded-full border border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-300 text-[11px] leading-none flex items-center justify-center flex-shrink-0 transition-colors"
      title={title}
    >
      i
    </button>
  );
}

export default function DisplaySelector({
  variable,
  stat,
  manifest,
  onVariableChange,
  onStatChange,
}: Props) {
  const [showVarInfo, setShowVarInfo] = useState(false);
  const [showStatInfo, setShowStatInfo] = useState(false);
  const hasDetail = variable in VARIABLE_DETAILS;

  return (
    <>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <VariableSelect value={variable} onChange={onVariableChange} manifest={manifest} />
        {hasDetail && <InfoButton onClick={() => setShowVarInfo(true)} title="About this layer" />}
        <StatSelect value={stat} onChange={onStatChange} stats={manifest.stats} />
        <InfoButton onClick={() => setShowStatInfo(true)} title="About statistics" />
      </div>

      {showVarInfo && (
        <VariableInfoModal
          variableKey={variable}
          variableLabel={manifest.variables[variable]?.label ?? variable}
          onClose={() => setShowVarInfo(false)}
        />
      )}

      {showStatInfo && (
        <StatInfoModal onClose={() => setShowStatInfo(false)} />
      )}
    </>
  );
}
