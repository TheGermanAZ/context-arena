interface TooltipEntry {
  name: string;
  value: number;
  color: string;
  payload?: Record<string, unknown>;
}

interface Props {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  labelFormatter?: (label: string, payload: TooltipEntry[]) => string;
  valueFormatter?: (value: number, name: string, entry: TooltipEntry) => string;
}

export default function StyledTooltipContent({
  active, payload, label, labelFormatter, valueFormatter,
}: Props) {
  if (!active || !payload?.length) return null;

  const displayLabel = labelFormatter ? labelFormatter(label ?? '', payload) : label;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      {displayLabel && <p className="text-xs text-gray-300 mb-1 font-medium">{displayLabel}</p>}
      {payload.map((entry) => {
        const formatted = valueFormatter
          ? valueFormatter(entry.value, entry.name, entry)
          : entry.value.toLocaleString();
        return (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-400">{entry.name}:</span>
            <span className="text-gray-100 font-mono">{formatted}</span>
          </div>
        );
      })}
    </div>
  );
}
