import { useState } from "react";
import type { Manifest } from "../../types";
import VariableSelect from "./VariableSelect";
import StatSelect from "./StatSelect";
import VariableInfoModal, { VariableInfoBody } from "./VariableInfoModal";
import StatInfoModal, { StatInfoBody } from "./StatInfoModal";
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
      className="relative w-5 h-5 rounded-full border border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-300 active:text-blue-600 text-[11px] leading-none flex items-center justify-center flex-shrink-0 transition-colors
                 before:absolute before:-inset-2.5 before:content-['']"
      title={title}
      aria-label={title}
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
  const isCategorical = manifest.variables[variable]?.categorical === true;

  return (
    <>
      <div className="flex items-center gap-1.5 text-sm font-medium flex-1 md:flex-none min-w-0">
        <VariableSelect
          value={variable}
          onChange={onVariableChange}
          manifest={manifest}
          className="flex-1 md:flex-none min-w-0"
          renderInfo={hasDetail ? () => <VariableInfoBody variableKey={variable} /> : undefined}
          infoTitle={manifest.variables[variable]?.label ?? variable}
        />
        {/* Desktop: inline info button. Mobile: the info action lives inside the picker sheet. */}
        {hasDetail && (
          <span className="hidden md:inline-flex">
            <InfoButton onClick={() => setShowVarInfo(true)} title="About this layer" />
          </span>
        )}
        {!isCategorical && (
          <>
            <StatSelect
              value={stat}
              onChange={onStatChange}
              stats={manifest.stats}
              className="shrink-0"
              renderInfo={() => <StatInfoBody />}
              infoTitle="Statistics"
            />
            <span className="hidden md:inline-flex">
              <InfoButton onClick={() => setShowStatInfo(true)} title="About statistics" />
            </span>
          </>
        )}
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
