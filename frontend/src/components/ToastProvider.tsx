import { ReactNode, useCallback, useEffect, useState } from "react";

export type ToastKind = "ok" | "error";

type ToastItem = { id: number; kind: ToastKind; message: string };

let pushToast: ((kind: ToastKind, message: string) => void) | null = null;

export function showToast(kind: ToastKind, message: string) {
  pushToast?.(kind, message);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const add = useCallback((kind: ToastKind, message: string) => {
    const text = message.trim();
    if (!text) return;
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, kind, message: text }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    pushToast = add;
    return () => {
      if (pushToast === add) pushToast = null;
    };
  }, [add]);

  return (
    <>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.kind}`}>
            {item.message}
          </div>
        ))}
      </div>
    </>
  );
}
