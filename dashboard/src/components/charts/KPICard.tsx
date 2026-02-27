interface Props {
  label: string;
  value: number;
  format?: (n: number) => string;
  subtitle?: string;
  accentColor?: string;
}

export default function KPICard({ label, value, format, subtitle, accentColor = '#10b981' }: Props) {
  const formatted = format ? format(value) : Math.round(value).toLocaleString();
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-5 flex flex-col shadow-lg shadow-black/20">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</span>
      <div className="w-8 h-0.5 rounded-full mb-3" style={{ backgroundColor: accentColor, opacity: 0.6 }} />
      <span className="text-3xl font-bold" style={{ color: accentColor }}>{formatted}</span>
      {subtitle && <span className="text-xs text-gray-400 mt-2">{subtitle}</span>}
    </div>
  );
}
