"use client";
import { createContext, useCallback, useContext, useState } from "react";

// Global "something is processing" indicator. Any async op can call begin(),
// which returns an end() to call when done; a thin top bar shows while any are
// in flight (ref-counted so concurrent ops don't fight).
const LoadingCtx = createContext<{ begin: () => () => void }>({ begin: () => () => {} });

export function useLoading() {
  return useContext(LoadingCtx);
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const begin = useCallback(() => {
    setCount((c) => c + 1);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      setCount((c) => Math.max(0, c - 1));
    };
  }, []);

  return (
    <LoadingCtx.Provider value={{ begin }}>
      {count > 0 && (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden">
          <div className="absolute h-full w-2/5 animate-[loadbar_1.1s_ease-in-out_infinite] rounded-full bg-accent" />
        </div>
      )}
      {children}
    </LoadingCtx.Provider>
  );
}
