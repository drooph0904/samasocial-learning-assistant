"use client";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

const ToastCtx = createContext<(message: string, type?: ToastType) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const color = {
    success: "text-success",
    error: "text-danger",
    info: "text-muted",
  };
  const Icon = { success: CheckCircle2, error: XCircle, info: Info };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => {
          const I = Icon[t.type];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-fg shadow-lg"
            >
              <I size={16} className={color[t.type]} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
