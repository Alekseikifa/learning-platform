import { useEffect, useState } from "react";
import { removeToast, subscribeToasts } from "../lib/toast";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribeToasts((event) => {
      if (event.action === "add") {
        setToasts((prev) => [...prev, event.item]);
        // Set auto timer
        if (event.item.duration > 0) {
          setTimeout(() => {
            removeToast(event.item.id);
          }, event.item.duration);
        }
      } else if (event.action === "remove") {
        setToasts((prev) => prev.filter((t) => t.id !== event.id));
      }
    });
    return unsub;
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => {
        const icon =
          t.type === "success" ? "✓" :
          t.type === "error" ? "✕" :
          t.type === "warning" ? "⚠" : "ℹ";

        return (
          <div
            key={t.id}
            className={`toast-item toast-${t.type}`}
            onClick={() => removeToast(t.id)}
            role="status"
          >
            <div className="toast-icon-wrap">{icon}</div>
            <div className="toast-content">{t.message}</div>
            <button
              type="button"
              className="toast-close"
              aria-label="Закрыть"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
