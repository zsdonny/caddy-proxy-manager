"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PortsDiff = {
  currentPorts: string[];
  requiredPorts: string[];
  needsApply: boolean;
};

type PortsStatus = {
  state: "idle" | "pending" | "applying" | "applied" | "failed";
  message?: string;
  appliedAt?: string;
  error?: string;
};

type PortsResponse = {
  diff: PortsDiff;
  status: PortsStatus;
  networkMode?: string;
  error?: string;
};

export function L4PortsApplyBanner({ refreshSignal }: { refreshSignal?: number }) {
  const [data, setData] = useState<PortsResponse | null>(null);
  const [applying, setApplying] = useState(false);
  const [polling, setPolling] = useState(false);
  // Track whether we've already signalled ConnectionMonitor for this apply cycle
  const reconnectSignalledRef = useRef(false);
  // Client-side override: Caddy is reachable even if sidecar status lags behind
  const [caddyRecovered, setCaddyRecovered] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/l4-ports");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore fetch errors
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Re-fetch when the parent signals a mutation (create/edit/delete/toggle)
  useEffect(() => {
    if (!refreshSignal) return;
    fetchStatus();
  }, [refreshSignal, fetchStatus]);

  // Listen for ConnectionMonitor signalling that Caddy is back online.
  // Docker healthcheck can lag behind actual availability, so the sidecar
  // may still report "applying" even though the user is already connected
  // through Caddy. In that case, show applied state client-side immediately.
  useEffect(() => {
    const handler = () => {
      setCaddyRecovered(true);
      // Do a final fetch — the sidecar may have caught up by now
      fetchStatus();
    };
    window.addEventListener("caddy-reconnect-recovered", handler);
    return () => window.removeEventListener("caddy-reconnect-recovered", handler);
  }, [fetchStatus]);

  useEffect(() => {
    if (!data) return;
    const shouldPoll =
      data.status.state === "pending" || data.status.state === "applying";

    // Bootstrap case: L4 manager is automatically applying (no user click).
    // Signal ConnectionMonitor so the reconnecting overlay appears immediately
    // rather than waiting for 2 health-ping failures.
    if (data.status.state === "applying" && !reconnectSignalledRef.current) {
      reconnectSignalledRef.current = true;
      window.dispatchEvent(new Event("caddy-reconnect-expected"));
    }
    // Reset the flag once the apply cycle completes
    if (!shouldPoll) {
      reconnectSignalledRef.current = false;
      setCaddyRecovered(false);
    }

    if (shouldPoll && !polling) {
      setPolling(true);
      const interval = setInterval(fetchStatus, 2000);
      return () => {
        clearInterval(interval);
        setPolling(false);
      };
    }
    if (!shouldPoll && polling) {
      setPolling(false);
    }
  }, [data, polling, fetchStatus]);

  const handleApply = async () => {
    // Signal ConnectionMonitor that we expect the server to become unreachable
    // during the Caddy container recreation in bridge-network mode.
    window.dispatchEvent(new Event("caddy-reconnect-expected"));
    setApplying(true);
    try {
      const res = await fetch("/api/l4-ports", { method: "POST" });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      // ignore
    } finally {
      setApplying(false);
    }
  };

  if (!data) return null;

  // In macvlan mode, L4 port changes are instant — no banner needed
  if (data.networkMode && data.networkMode !== "bridge") return null;

  const { diff, status } = data;

  // When Caddy is back online but the sidecar status file still says "applying"
  // (Docker healthcheck hasn't caught up), treat it as effectively applied so
  // the user doesn't see a stale "Recreating caddy container" banner.
  const effectiveState =
    caddyRecovered && status.state === "applying" ? "applied" : status.state;

  // Show nothing if no changes needed and status is idle/applied
  if (!diff.needsApply && (effectiveState === "idle" || effectiveState === "applied")) {
    return null;
  }

  const isSpinning =
    effectiveState === "pending" || effectiveState === "applying";

  const alertVariant: "default" | "destructive" =
    effectiveState === "failed" ? "destructive" : "default";

  const stateIcon =
    effectiveState === "applied" ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : effectiveState === "failed" ? (
      <XCircle className="h-4 w-4 text-destructive" />
    ) : isSpinning ? (
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    ) : null;

  return (
    <Alert
      variant={alertVariant}
      className={cn(
        "flex items-start gap-3",
        effectiveState === "applied" && "border-green-500/50 text-green-700 dark:text-green-400",
        diff.needsApply && effectiveState !== "failed" && effectiveState !== "applied" && "border-yellow-500/50 text-yellow-800 dark:text-yellow-400"
      )}
    >
      {stateIcon && <div className="mt-0.5 shrink-0">{stateIcon}</div>}
      <AlertDescription className="flex-1">
        <div className="flex flex-col gap-1">
          {diff.needsApply ? (
            <p className="text-sm">
              <strong>Docker port changes pending.</strong> The caddy container
              needs to be recreated to expose L4 ports.
              {diff.requiredPorts.length > 0 && (
                <span className="inline-flex items-center gap-1 ml-1 flex-wrap">
                  Required:{" "}
                  {diff.requiredPorts.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="text-[0.7rem] h-5 px-1.5"
                    >
                      {p}
                    </Badge>
                  ))}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm">{status.message}</p>
          )}
          {effectiveState === "failed" && status.error && (
            <p className="text-xs text-destructive">{status.error}</p>
          )}
        </div>
      </AlertDescription>
      {diff.needsApply && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleApply}
          disabled={
            applying ||
            effectiveState === "pending" ||
            effectiveState === "applying"
          }
          className="shrink-0 ml-auto"
        >
          {applying ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent mr-1.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Apply Ports
        </Button>
      )}
    </Alert>
  );
}
