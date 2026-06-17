"use client";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { LoadingProvider } from "@/components/ui/Loading";
import { ThemeProvider } from "@/components/ui/Theme";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LoadingProvider>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </LoadingProvider>
    </ThemeProvider>
  );
}
