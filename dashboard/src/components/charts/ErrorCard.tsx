interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorCard({ message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-red-900/30 flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6.5V10.5M10 13.5V13.5" />
        </svg>
      </div>
      <p className="text-sm text-gray-400 mb-1">Unable to load data</p>
      {message && <p className="text-xs text-gray-600 mb-3">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 border border-gray-700 rounded-md hover:bg-gray-800 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
