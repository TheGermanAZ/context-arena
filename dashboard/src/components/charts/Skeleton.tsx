interface Props {
  className?: string;
  variant?: 'chart' | 'table' | 'kpi';
}

export default function Skeleton({ className, variant = 'chart' }: Props) {
  const heights: Record<string, string> = {
    chart: 'h-[400px]',
    table: 'h-[300px]',
    kpi: 'h-24',
  };

  return (
    <div className={`animate-pulse rounded-lg bg-gray-800/50 ${heights[variant]} ${className ?? ''}`}>
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-gray-500 animate-spin" />
      </div>
    </div>
  );
}
