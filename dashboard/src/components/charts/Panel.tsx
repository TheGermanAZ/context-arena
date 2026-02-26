import { useRef, type ReactNode } from 'react';
import ExportButton from './ExportButton';

interface Props {
  title: string;
  badge?: { text: string; color: 'emerald' | 'red' };
  children: ReactNode;
  onExpand?: () => void;
  exportData?: () => Record<string, unknown>[];
}

const BADGE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-900/50 text-emerald-400',
  red: 'bg-red-900/50 text-red-400',
};

export default function Panel({ title, badge, children, onExpand, exportData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden flex flex-col shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:border-gray-600 transition-all duration-200">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          {badge && (
            <span className={`text-[9px] font-semibold uppercase px-1.5 py-px rounded ${BADGE_CLASSES[badge.color]}`}>
              {badge.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ExportButton containerRef={containerRef} data={exportData} title={title} />
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Expand"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 1.5H12.5V5.5M5.5 12.5H1.5V8.5M12.5 1.5L8 6M1.5 12.5L6 8" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
