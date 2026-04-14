import { useState, useRef, useEffect } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  className?: string;
  minWidth?: string;
}

export default function CustomSelect({ value, onChange, options, groups, className, minWidth = "120px" }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const allOptions = groups
    ? groups.flatMap((g) => g.options)
    : options ?? [];
  const currentLabel = allOptions.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button
        onClick={() => setOpen(!open)}
        style={{ minWidth }}
        className="appearance-none rounded border border-gray-300 bg-white pl-2 pr-7 py-1 text-sm text-left relative cursor-pointer
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:16px] bg-[right_6px_center] bg-no-repeat"
      >
        {currentLabel}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max bg-white border border-gray-200 rounded-lg shadow-xl z-[60] py-1 max-h-[70vh] overflow-y-auto">
          {groups ? (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {group.label}
                </div>
                {group.options.map((opt) => (
                  <Item key={opt.value} opt={opt} selected={opt.value === value} onSelect={(v) => { onChange(v); setOpen(false); }} />
                ))}
              </div>
            ))
          ) : (
            allOptions.map((opt) => (
              <Item key={opt.value} opt={opt} selected={opt.value === value} onSelect={(v) => { onChange(v); setOpen(false); }} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Item({ opt, selected, onSelect }: { opt: SelectOption; selected: boolean; onSelect: (v: string) => void }) {
  return (
    <div
      onClick={() => onSelect(opt.value)}
      className={`px-3 py-1.5 cursor-pointer text-sm truncate ${
        selected ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {opt.label}
    </div>
  );
}
