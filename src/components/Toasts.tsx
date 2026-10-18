import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useStudio } from '@/store/studio';

export function Toasts() {
  const toasts = useStudio((state) => state.toasts);
  const dismiss = useStudio((state) => state.dismissToast);

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id}>
          <span className="toast-icon">
            {toast.kind === 'error' ? (
              <TriangleAlert size={16} />
            ) : toast.kind === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button onClick={() => dismiss(toast.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
