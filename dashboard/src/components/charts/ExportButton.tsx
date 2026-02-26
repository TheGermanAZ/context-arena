import { useCallback, useState, type RefObject } from 'react';

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  data?: () => Record<string, unknown>[];
  title: string;
}

export default function ExportButton({ containerRef, data, title }: Props) {
  const [open, setOpen] = useState(false);

  const exportPNG = useCallback(async () => {
    if (!containerRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(containerRef.current, {
      backgroundColor: '#111827',
      scale: 2,
    });
    const link = document.createElement('a');
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setOpen(false);
  }, [containerRef, title]);

  const exportCSV = useCallback(() => {
    if (!data) return;
    const rows = data();
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }, [data, title]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Export"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M7 1.5V9.5M3.5 6L7 9.5L10.5 6M2 12.5H12" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
            <button onClick={exportPNG} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
              Export PNG
            </button>
            {data && (
              <button onClick={exportCSV} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
                Export CSV
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
