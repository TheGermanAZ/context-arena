import AnimatedNumber from './AnimatedNumber';

interface Props {
  label: string;
  value: number;
  format?: (n: number) => string;
  subtitle?: string;
  accentColor?: string;
}

export default function KPICard({ label, value, format, subtitle, accentColor = '#10b981' }: Props) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-5 flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</span>
      <div style={{ color: accentColor }}>
        <AnimatedNumber value={value} format={format} className="text-3xl font-bold" />
      </div>
      {subtitle && <span className="text-xs text-gray-400 mt-1">{subtitle}</span>}
    </div>
  );
}
