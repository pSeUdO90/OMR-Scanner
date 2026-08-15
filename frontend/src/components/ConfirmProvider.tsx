import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ message: "" });
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="modal confirm-modal">
            <h3 id="confirm-title">{opts.title || "Confirm delete"}</h3>
            <p>{opts.message}</p>
            <div className="row-actions">
              <button type="button" className="secondary" onClick={() => finish(false)}>
                {opts.cancelLabel || "Cancel"}
              </button>
              <button type="button" className="btn-delete" onClick={() => finish(true)}>
                {opts.confirmLabel || "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
