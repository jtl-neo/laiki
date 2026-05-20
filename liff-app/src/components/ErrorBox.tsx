interface ErrorBoxProps {
  message?: string;
  onRetry?: () => void;
  error?: Error;
}

export default function ErrorBox({
  message = "載入失敗",
  onRetry,
  error,
}: ErrorBoxProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 space-y-3">
      <div className="font-medium">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary !bg-red-600">
          重試
        </button>
      )}
      {error?.message && (
        <details className="text-xs text-red-600">
          <summary className="cursor-pointer">詳細資訊</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        </details>
      )}
    </div>
  );
}
