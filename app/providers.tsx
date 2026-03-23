"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionMonitor } from "@/src/components/ui/ConnectionMonitor";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
      </TooltipProvider>
      <Toaster richColors position="bottom-right" />
      <ConnectionMonitor />
    </ThemeProvider>
  );
}
