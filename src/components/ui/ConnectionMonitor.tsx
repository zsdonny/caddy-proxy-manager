"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * ConnectionMonitor — mounts once in providers.tsx.
 *
 * Normal mode: pings /api/health every 10 s; after 2 consecutive failures
 * the reconnecting overlay is shown and retries move to every 3 s.
 *
 * Expected-disconnect mode: the overlay activates immediately on the first
 * failure after the "caddy-reconnect-expected" custom event is dispatched
 * (e.g. by L4PortsApplyBanner before a Caddy container restart).
 *
 * Recovery: overlay dismissed, router.refresh() re-fetches stale data,
 * success toast shown.
 */
export function ConnectionMonitor() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [expectedDisconnect, setExpectedDisconnect] = useState(false);

  // Refs so the ping closure never goes stale
  const failCountRef = useRef(0);
  const offlineRef = useRef(false);
  const expectedRef = useRef(false);

  // Keep offlineRef in sync with state
  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  // Listen for the expected-disconnect signal
  useEffect(() => {
    const handler = () => {
      expectedRef.current = true;
      setExpectedDisconnect(true);
    };
    window.addEventListener("caddy-reconnect-expected", handler);
    return () => window.removeEventListener("caddy-reconnect-expected", handler);
  }, []);

  // Health polling — interval rate switches on offline state change
  useEffect(() => {
    async function ping() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error("unhealthy");

        if (offlineRef.current) {
          // Recovered
          failCountRef.current = 0;
          expectedRef.current = false;
          offlineRef.current = false;
          setOffline(false);
          setExpectedDisconnect(false);
          toast.success("Connection restored.");
          router.refresh();
        } else {
          failCountRef.current = 0;
        }
      } catch {
        failCountRef.current += 1;
        const threshold = expectedRef.current ? 1 : 2;
        if (failCountRef.current >= threshold && !offlineRef.current) {
          offlineRef.current = true;
          setOffline(true);
        }
      }
    }

    const intervalMs = offline ? 3000 : 10000;
    const id = setInterval(ping, intervalMs);
    return () => clearInterval(id);
  }, [offline, router]);

  if (!offline) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-xl text-center max-w-sm mx-4">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-lg font-semibold">Reconnecting&hellip;</p>
        <p className="text-sm text-muted-foreground">
          {expectedDisconnect
            ? "Caddy is restarting. This page will reload automatically when it comes back."
            : "Lost connection to the server. Attempting to reconnect\u2026"}
        </p>
      </div>
    </div>
  );
}
