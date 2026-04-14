import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
}

const STATS = [
  {
    name: "Mean",
    key: "mean",
    description: "Average value across all days in this period, pooled over 11 years (~110 daily values). Represents the typical condition.",
    tip: "Use this for general comparisons — \"what's the weather usually like here in early March?\"",
  },
  {
    name: "Median",
    key: "median",
    description: "The middle value (50th percentile). Half of days are above, half below. Less sensitive to extreme outliers than mean.",
    tip: "Useful when distributions are skewed (e.g., precipitation, where a few heavy rain days pull the mean up).",
  },
  {
    name: "P10",
    key: "p10",
    description: "10th percentile — 90% of days have a value higher than this. Represents the lower end of what to expect.",
    tip: "For temperature: the coldest days you'll encounter. For precipitation: the driest days.",
  },
  {
    name: "P90",
    key: "p90",
    description: "90th percentile — only 10% of days exceed this. Represents the upper end of what to expect.",
    tip: "For temperature: how hot can it get. For wind: the gusty days. Good for planning worst-case.",
  },
  {
    name: "Min",
    key: "min",
    description: "Absolute minimum observed across all 11 years. The most extreme low value ever recorded in this period.",
    tip: "Rare events — don't plan around these, but useful to know the extremes.",
  },
  {
    name: "Max",
    key: "max",
    description: "Absolute maximum observed across all 11 years. The most extreme high value ever recorded in this period.",
    tip: "Same as min — shows the tail of the distribution.",
  },
  {
    name: "Year Std (σyr)",
    key: "ystd",
    description: "Standard deviation of per-year period averages. Measures how much the typical value for this period varies from one year to the next.",
    tip: "Low σyr = reliable climate (similar every year). High σyr = volatile (some years much warmer/wetter than others). Useful for trip planning — a low mean with high σyr means you might get unlucky.",
  },
];

const EVENT_NOTE = "For event-frequency variables (Rainy Days, Hot Days, etc.), all stats are computed across per-year fractions, not individual days. Mean = typical fraction of event days, P10/P90 = the range across years.";

export default function StatInfoModal({ onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Statistics Guide</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {STATS.map((s) => (
            <div key={s.key}>
              <div className="font-semibold text-gray-700 text-xs">{s.name}</div>
              <div className="text-gray-500 text-xs leading-relaxed mt-0.5">{s.description}</div>
              <div className="text-gray-400 text-[11px] italic mt-0.5">{s.tip}</div>
            </div>
          ))}

          <div className="border-t border-gray-100 pt-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Note on Event Frequencies</div>
            <div className="text-gray-500 text-xs leading-relaxed">{EVENT_NOTE}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
