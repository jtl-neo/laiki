interface ConfirmProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function Confirm({
  open,
  title,
  message,
  confirmLabel = "確定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-base">{title}</h3>
        {message && <p className="text-sm text-neutral-600">{message}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="btn-ghost flex-1">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`btn-primary flex-1 ${danger ? "!bg-red-600" : ""}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
