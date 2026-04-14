import type { Manifest } from "../../types";
import CustomSelect from "./CustomSelect";
import { VARIABLE_GROUPS } from "../../lib/variableMetadata";

interface Props {
  value: string;
  onChange: (v: string) => void;
  manifest: Manifest;
  className?: string;
  excludeCategorical?: boolean;
}

export default function VariableSelect({ value, onChange, manifest, className, excludeCategorical }: Props) {
  const groups = VARIABLE_GROUPS
    .map((g) => ({
      label: g.label,
      options: g.variables
        .filter((v) => {
          if (!(v in manifest.variables)) return false;
          if (excludeCategorical && manifest.variables[v].categorical) return false;
          return true;
        })
        .map((v) => ({ value: v, label: manifest.variables[v].label })),
    }))
    .filter((g) => g.options.length > 0);

  return <CustomSelect value={value} onChange={onChange} groups={groups} className={className} minWidth="225px" />;
}
