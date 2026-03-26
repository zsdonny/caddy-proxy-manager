import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";
import { useState } from "react";
import { ProxyHost, LoadBalancingPolicy } from "@/lib/models/proxy-hosts";

const LOAD_BALANCING_POLICIES = [
  { value: "random", label: "Random", description: "Random selection (default)" },
  { value: "round_robin", label: "Round Robin", description: "Sequential distribution" },
  { value: "least_conn", label: "Least Connections", description: "Fewest active connections" },
  { value: "ip_hash", label: "IP Hash", description: "Client IP-based sticky sessions" },
  { value: "first", label: "First Available", description: "First available upstream" },
  { value: "header", label: "Header Hash", description: "Hash based on request header" },
  { value: "cookie", label: "Cookie", description: "Cookie-based sticky sessions" },
  { value: "uri_hash", label: "URI Hash", description: "URI path-based distribution" }
];

export function LoadBalancerFields({
  loadBalancer
}: {
  loadBalancer?: ProxyHost["load_balancer"] | null;
}) {
  const initial = loadBalancer ?? null;
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [policy, setPolicy] = useState<LoadBalancingPolicy>(initial?.policy ?? "random");
  const [activeHealthEnabled, setActiveHealthEnabled] = useState(initial?.activeHealthCheck?.enabled ?? false);
  const [passiveHealthEnabled, setPassiveHealthEnabled] = useState(initial?.passiveHealthCheck?.enabled ?? false);

  const showHeaderField = policy === "header";
  const showCookieFields = policy === "cookie";

  return (
    <div className="rounded-lg border border-cyan-500/60 bg-cyan-500/5 p-4">
      <input type="hidden" name="lb_present" value="1" />
      <input type="hidden" name="lb_enabled_present" value="1" />
      <div className="flex flex-col gap-4">
        <div className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-row items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center shrink-0">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">Load Balancer</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configure load balancing and health checks for multiple upstreams
              </p>
            </div>
          </div>
          <Switch
            name="lb_enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            className="shrink-0"
          />
        </div>

        <div className={cn(
          "overflow-hidden transition-all duration-200",
          enabled ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
        )}>
          <div className="flex flex-col gap-6">
            {/* Policy Selection */}
            <div>
              <p className="text-sm font-semibold mb-2">Selection Policy</p>
              <input type="hidden" name="lb_policy" value={policy} />
              <Select value={policy} onValueChange={(v) => setPolicy(v as LoadBalancingPolicy)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select policy" />
                </SelectTrigger>
                <SelectContent>
                  {LOAD_BALANCING_POLICIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label} - {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Header-based policy fields */}
            <div className={cn(
              "overflow-hidden transition-all duration-200",
              showHeaderField ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
            )}>
              <div>
                <label className="text-sm font-medium mb-1 block" htmlFor="lb_policy_header_field">Header Field Name</label>
                <Input
                  name="lb_policy_header_field"
                  id="lb_policy_header_field"
                  placeholder="X-Custom-Header"
                  defaultValue={initial?.policyHeaderField ?? ""}
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">The request header to hash for upstream selection</p>
              </div>
            </div>

            {/* Cookie-based policy fields */}
            <div className={cn(
              "overflow-hidden transition-all duration-200",
              showCookieFields ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
            )}>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block" htmlFor="lb_policy_cookie_name">Cookie Name</label>
                  <Input
                    name="lb_policy_cookie_name"
                    id="lb_policy_cookie_name"
                    placeholder="server_id"
                    defaultValue={initial?.policyCookieName ?? ""}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Name of the cookie for sticky sessions</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block" htmlFor="lb_policy_cookie_secret">Cookie Secret (Optional)</label>
                  <Input
                    name="lb_policy_cookie_secret"
                    id="lb_policy_cookie_secret"
                    placeholder="your-secret-key"
                    defaultValue={initial?.policyCookieSecret ?? ""}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Secret key for HMAC cookie signing</p>
                </div>
              </div>
            </div>

            {/* Retry Settings */}
            <div>
              <p className="text-sm font-semibold mb-2">Retry Settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block" htmlFor="lb_try_duration">Try Duration</label>
                  <Input
                    name="lb_try_duration"
                    id="lb_try_duration"
                    placeholder="5s"
                    defaultValue={initial?.tryDuration ?? ""}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">How long to try upstreams</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block" htmlFor="lb_try_interval">Try Interval</label>
                  <Input
                    name="lb_try_interval"
                    id="lb_try_interval"
                    placeholder="250ms"
                    defaultValue={initial?.tryInterval ?? ""}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Wait between attempts</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block" htmlFor="lb_retries">Max Retries</label>
                  <Input
                    name="lb_retries"
                    id="lb_retries"
                    type="number"
                    min={0}
                    defaultValue={initial?.retries ?? ""}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Maximum retry attempts</p>
                </div>
              </div>
            </div>

            {/* Active Health Checks */}
            <div className="rounded-lg border border-border p-4">
              <input type="hidden" name="lb_active_health_enabled_present" value="1" />
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <Switch
                    name="lb_active_health_enabled"
                    checked={activeHealthEnabled}
                    onCheckedChange={setActiveHealthEnabled}
                    aria-label="Enable active health checks"
                  />
                  <div>
                    <p className="text-sm font-semibold">Active Health Checks</p>
                    <span className="text-xs text-muted-foreground">Periodically probe upstreams to check health</span>
                  </div>
                </div>

                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  activeHealthEnabled ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_active_health_uri">Health Check URI</label>
                        <Input name="lb_active_health_uri" id="lb_active_health_uri" placeholder="/health" defaultValue={initial?.activeHealthCheck?.uri ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Path to probe for health</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_active_health_port">Health Check Port</label>
                        <Input name="lb_active_health_port" id="lb_active_health_port" type="number" min={1} max={65535} defaultValue={initial?.activeHealthCheck?.port ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Override upstream port</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_active_health_interval">Check Interval</label>
                        <Input name="lb_active_health_interval" id="lb_active_health_interval" placeholder="30s" defaultValue={initial?.activeHealthCheck?.interval ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">How often to check</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_active_health_timeout">Check Timeout</label>
                        <Input name="lb_active_health_timeout" id="lb_active_health_timeout" placeholder="5s" defaultValue={initial?.activeHealthCheck?.timeout ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Timeout for health probe</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_active_health_status">Expected Status Code</label>
                        <Input name="lb_active_health_status" id="lb_active_health_status" type="number" min={100} max={599} defaultValue={initial?.activeHealthCheck?.status ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Expected HTTP status</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_active_health_body">Expected Body</label>
                        <Input name="lb_active_health_body" id="lb_active_health_body" placeholder="OK" defaultValue={initial?.activeHealthCheck?.body ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Expected response body</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Passive Health Checks */}
            <div className="rounded-lg border border-border p-4">
              <input type="hidden" name="lb_passive_health_enabled_present" value="1" />
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <Switch
                    name="lb_passive_health_enabled"
                    checked={passiveHealthEnabled}
                    onCheckedChange={setPassiveHealthEnabled}
                    aria-label="Enable passive health checks"
                  />
                  <div>
                    <p className="text-sm font-semibold">Passive Health Checks</p>
                    <span className="text-xs text-muted-foreground">Mark upstreams unhealthy based on response failures</span>
                  </div>
                </div>

                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  passiveHealthEnabled ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_passive_health_fail_duration">Fail Duration</label>
                        <Input name="lb_passive_health_fail_duration" id="lb_passive_health_fail_duration" placeholder="30s" defaultValue={initial?.passiveHealthCheck?.failDuration ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">How long to remember failures</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_passive_health_max_fails">Max Failures</label>
                        <Input name="lb_passive_health_max_fails" id="lb_passive_health_max_fails" type="number" min={0} defaultValue={initial?.passiveHealthCheck?.maxFails ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Failures before marking unhealthy</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_passive_health_unhealthy_status">Unhealthy Status Codes</label>
                        <Input name="lb_passive_health_unhealthy_status" id="lb_passive_health_unhealthy_status" placeholder="500, 502, 503" defaultValue={initial?.passiveHealthCheck?.unhealthyStatus?.join(", ") ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Comma-separated status codes</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block" htmlFor="lb_passive_health_unhealthy_latency">Unhealthy Latency</label>
                        <Input name="lb_passive_health_unhealthy_latency" id="lb_passive_health_unhealthy_latency" placeholder="5s" defaultValue={initial?.passiveHealthCheck?.unhealthyLatency ?? ""} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">Latency threshold for unhealthy</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
