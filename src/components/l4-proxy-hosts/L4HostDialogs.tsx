"use client";

import { useFormState } from "react-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createL4ProxyHostAction,
  deleteL4ProxyHostAction,
  updateL4ProxyHostAction,
} from "@/app/(dashboard)/l4-proxy-hosts/actions";
import { INITIAL_ACTION_STATE } from "@/lib/actions";
import type { L4ProxyHost } from "@/lib/models/l4-proxy-hosts";
import type { Certificate } from "@/lib/models/certificates";
import { AppDialog } from "@/components/ui/AppDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Globe, Layers, Pin } from "lucide-react";
import { UpstreamTlsFields } from "./UpstreamTlsFields";
import { GeoBlockFields } from "@/components/proxy-hosts/GeoBlockFields";
import { MtlsFields } from "@/components/proxy-hosts/MtlsConfig";
import type { CaCertificate } from "@/lib/models/ca-certificates";

function FormField({
  label,
  htmlFor,
  helperText,
  children,
}: {
  label: string;
  htmlFor: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

function L4HostForm({
  formId,
  formAction,
  state,
  initialData,
  certificates = [],
  caCertificates = [],
}: {
  formId: string;
  formAction: (formData: FormData) => void;
  state: { status: string; message?: string };
  initialData?: L4ProxyHost | null;
  certificates?: Certificate[];
  caCertificates?: CaCertificate[];
}) {
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [protocol, setProtocol] = useState(initialData?.protocol ?? "tcp");
  const [matcherType, setMatcherType] = useState(
    initialData?.matcher_type ?? "none"
  );
  const [tlsTermination, setTlsTermination] = useState(initialData?.tls_termination ?? false);
  const isUdp = protocol === "udp";
  const [lbEnabled, setLbEnabled] = useState(initialData?.load_balancer?.enabled ?? false);
  const [dnsEnabled, setDnsEnabled] = useState(initialData?.dns_resolver?.enabled ?? false);
  const [selectedCertId, setSelectedCertId] = useState<string>(String(initialData?.certificate_id ?? "__none__"));
  const hasExplicitCert = selectedCertId !== "__none__";

  const defaultUpstreamDnsAccordion =
    initialData?.upstream_dns_resolution?.enabled === true
      ? "upstream-dns"
      : undefined;

  // Reset TLS-incompatible settings when switching to UDP
  useEffect(() => {
    if (isUdp) {
      setTlsTermination(false);
      if (matcherType === "tls_sni" || matcherType === "http_host" || matcherType === "proxy_protocol") {
        setMatcherType("none");
      }
    }
  }, [isUdp, matcherType]);

  return (
    <form id={formId} action={formAction} className="flex flex-col gap-5">
      {state.status !== "idle" && state.message && (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="enabled_present" value="1" />
      <input type="hidden" name="enabled" value={enabled ? "on" : ""} />
      <div className={cn(
        "flex flex-row items-center justify-between p-4 rounded-lg border transition-all duration-200",
        enabled
          ? "border-primary bg-primary/5"
          : "border-border bg-background"
      )}>
        <div>
          <p className={cn("text-sm font-semibold", enabled ? "text-primary" : "text-foreground")}>
            {enabled ? "L4 Host Enabled" : "L4 Host Paused"}
          </p>
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "This host is active and proxying connections"
              : "This host is disabled and will not accept connections"}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <FormField label="Name" htmlFor="name">
        <Input
          id="name"
          name="name"
          placeholder="PostgreSQL Proxy"
          defaultValue={initialData?.name ?? ""}
          required
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="protocol">Protocol</Label>
        <Select
          name="protocol"
          value={protocol}
          onValueChange={(v) => setProtocol(v as "tcp" | "udp")}
        >
          <SelectTrigger id="protocol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tcp">
              <div className="flex items-center gap-2">
                <Badge variant="info" className="text-[10px] px-1.5 py-0">TCP</Badge>
                TCP
              </div>
            </SelectItem>
            <SelectItem value="udp">
              <div className="flex items-center gap-2">
                <Badge variant="warning" className="text-[10px] px-1.5 py-0">UDP</Badge>
                UDP
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <FormField
        label="Listen Address"
        htmlFor="listen_address"
        helperText="Format: :PORT or HOST:PORT. Make sure to expose this port in docker-compose.yml on the caddy service."
      >
        <Input
          id="listen_address"
          name="listen_address"
          placeholder=":5432"
          defaultValue={initialData?.listen_address ?? ""}
          required
        />
      </FormField>

      <FormField
        label="Connection Idle Timeout"
        htmlFor="idle_timeout"
        helperText="Max idle time before a connection is closed (e.g. 5m, 30s). Applies to this listen address. Leave empty for no limit."
      >
        <Input
          id="idle_timeout"
          name="idle_timeout"
          placeholder="5m"
          defaultValue={initialData?.idle_timeout ?? ""}
        />
      </FormField>

      <FormField
        label="Upstreams"
        htmlFor="upstreams"
        helperText="One per line in host:port format."
      >
        <Textarea
          id="upstreams"
          name="upstreams"
          placeholder={"10.0.0.1:5432\n10.0.0.2:5432"}
          defaultValue={initialData?.upstreams.join("\n") ?? ""}
          rows={2}
          required
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="matcher_type">Matcher</Label>
        <Select
          name="matcher_type"
          value={matcherType}
          onValueChange={(v) =>
            setMatcherType(
              v as "none" | "tls_sni" | "http_host" | "proxy_protocol" | "remote_ip"
            )
          }
        >
          <SelectTrigger id="matcher_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (catch-all)</SelectItem>
            {!isUdp && <SelectItem value="tls_sni">TLS SNI</SelectItem>}
            {!isUdp && <SelectItem value="http_host">HTTP Host</SelectItem>}
            {!isUdp && <SelectItem value="proxy_protocol">Proxy Protocol</SelectItem>}
            <SelectItem value="remote_ip">Remote IP (CIDR)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Match incoming connections before proxying. &apos;None&apos; matches
          all connections on this port.
        </p>
      </div>

      {(matcherType === "tls_sni" || matcherType === "http_host") && (
        <FormField
          label={matcherType === "tls_sni" ? "SNI Hostnames" : "HTTP Hostnames"}
          htmlFor="matcher_value"
          helperText="Comma-separated list of hostnames to match."
        >
          <Input
            id="matcher_value"
            name="matcher_value"
            placeholder="db.example.com, api.example.com"
            defaultValue={initialData?.matcher_value?.join(", ") ?? ""}
            required
          />
        </FormField>
      )}

      {matcherType === "remote_ip" && (
        <FormField
          label="IP Ranges"
          htmlFor="matcher_value"
          helperText="Comma-separated CIDR ranges or IP addresses to match."
        >
          <Input
            id="matcher_value"
            name="matcher_value"
            placeholder="192.168.1.0/24, 10.0.0.0/8"
            defaultValue={initialData?.matcher_value?.join(", ") ?? ""}
            required
          />
        </FormField>
      )}

      {/* TLS Termination */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Switch
            id="tls_termination"
            name="tls_termination"
            checked={tlsTermination}
            onCheckedChange={setTlsTermination}
            disabled={isUdp}
          />
          <Label htmlFor="tls_termination">TLS Termination</Label>
        </div>
        {isUdp && <p className="text-xs text-muted-foreground">Not available for UDP connections.</p>}
        {!isUdp && !tlsTermination && (
          <p className="text-xs text-muted-foreground">L4 proxy passes raw TCP streams without decryption.</p>
        )}
        {!isUdp && tlsTermination && matcherType === "tls_sni" && (
          <p className="text-xs text-muted-foreground">Caddy will automatically provision and serve a certificate for the matched SNI domains.</p>
        )}
        {!isUdp && tlsTermination && matcherType !== "tls_sni" && !hasExplicitCert && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Without TLS SNI matching, Caddy cannot automatically provision certificates. Select a specific certificate below.</p>
        )}
        {!isUdp && tlsTermination && matcherType !== "tls_sni" && hasExplicitCert && (
          <p className="text-xs text-muted-foreground">The selected certificate will be used. Without SNI matching, automatic certificate provisioning is not available.</p>
        )}
      </div>

      {/* Certificate Select — visible when TLS is ON */}
      {tlsTermination && !isUdp && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="certificate_id">Certificate</Label>
          <Select
            name="certificate_id"
            value={selectedCertId}
            onValueChange={setSelectedCertId}
          >
            <SelectTrigger id="certificate_id">
              <SelectValue placeholder="Managed by Caddy (Auto)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Managed by Caddy (Auto)</SelectItem>
              {certificates.map((cert) => (
                <SelectItem key={cert.id} value={String(cert.id)}>
                  {cert.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Switch
            id="proxy_protocol_receive"
            name="proxy_protocol_receive"
            defaultChecked={initialData?.proxy_protocol_receive ?? false}
            disabled={isUdp}
          />
          <Label htmlFor="proxy_protocol_receive">
            Accept inbound PROXY protocol
          </Label>
        </div>
        {isUdp && <p className="text-xs text-muted-foreground">Not available for UDP connections.</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="proxy_protocol_version">
          Send PROXY protocol to upstream
        </Label>
        <Select
          name="proxy_protocol_version"
          defaultValue={initialData?.proxy_protocol_version ?? "__none__"}
          disabled={isUdp}
        >
          <SelectTrigger id="proxy_protocol_version">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            <SelectItem value="v1">v1</SelectItem>
            <SelectItem value="v2">v2</SelectItem>
          </SelectContent>
        </Select>
        {isUdp && <p className="text-xs text-muted-foreground">Not available for UDP connections.</p>}
      </div>

      {/* Load Balancer */}
      <div className="rounded-lg border border-cyan-500/60 bg-cyan-500/5 p-4">
        <input type="hidden" name="lb_present" value="1" />
        <input type="hidden" name="lb_enabled_present" value="1" />
        <input type="hidden" name="lb_enabled" value={lbEnabled ? "on" : ""} />

        <div className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-row items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center shrink-0">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">Load Balancer</p>
              <p className="text-sm text-muted-foreground mt-0.5">Configure load balancing and health checks for multiple upstreams</p>
            </div>
          </div>
          <Switch checked={lbEnabled} onCheckedChange={setLbEnabled} className="shrink-0" />
        </div>

        <div className={cn(
          "overflow-hidden transition-all duration-200",
          lbEnabled ? "max-h-[3000px] opacity-100 mt-4" : "max-h-0 opacity-0 pointer-events-none"
        )}>
          <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lb_policy">Policy</Label>
                <Select
                  name="lb_policy"
                  defaultValue={
                    initialData?.load_balancer?.policy ?? "random"
                  }
                >
                  <SelectTrigger id="lb_policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="least_conn">
                      Least Connections
                    </SelectItem>
                    <SelectItem value="ip_hash">IP Hash</SelectItem>
                    <SelectItem value="first">First Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField label="Try Duration" htmlFor="lb_try_duration">
                <Input
                  id="lb_try_duration"
                  name="lb_try_duration"
                  placeholder="5s"
                  defaultValue={
                    initialData?.load_balancer?.tryDuration ?? ""
                  }
                />
              </FormField>
              <FormField label="Try Interval" htmlFor="lb_try_interval">
                <Input
                  id="lb_try_interval"
                  name="lb_try_interval"
                  placeholder="250ms"
                  defaultValue={
                    initialData?.load_balancer?.tryInterval ?? ""
                  }
                />
              </FormField>
              <FormField label="Retries" htmlFor="lb_retries">
                <Input
                  id="lb_retries"
                  name="lb_retries"
                  type="number"
                  defaultValue={initialData?.load_balancer?.retries ?? ""}
                />
              </FormField>

              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">
                Active Health Check
              </p>
              <input
                type="hidden"
                name="lb_active_health_enabled_present"
                value="1"
              />
              <div className="flex items-center gap-2">
                <Switch
                  id="lb_active_health_enabled"
                  name="lb_active_health_enabled"
                  defaultChecked={
                    initialData?.load_balancer?.activeHealthCheck?.enabled ??
                    false
                  }
                />
                <Label htmlFor="lb_active_health_enabled">
                  Enable Active Health Check
                </Label>
              </div>
              <FormField
                label="Health Check Port"
                htmlFor="lb_active_health_port"
              >
                <Input
                  id="lb_active_health_port"
                  name="lb_active_health_port"
                  type="number"
                  defaultValue={
                    initialData?.load_balancer?.activeHealthCheck?.port ?? ""
                  }
                />
              </FormField>
              <FormField label="Interval" htmlFor="lb_active_health_interval">
                <Input
                  id="lb_active_health_interval"
                  name="lb_active_health_interval"
                  placeholder="30s"
                  defaultValue={
                    initialData?.load_balancer?.activeHealthCheck?.interval ??
                    ""
                  }
                />
              </FormField>
              <FormField label="Timeout" htmlFor="lb_active_health_timeout">
                <Input
                  id="lb_active_health_timeout"
                  name="lb_active_health_timeout"
                  placeholder="5s"
                  defaultValue={
                    initialData?.load_balancer?.activeHealthCheck?.timeout ?? ""
                  }
                />
              </FormField>

              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">
                Passive Health Check
              </p>
              <input
                type="hidden"
                name="lb_passive_health_enabled_present"
                value="1"
              />
              <div className="flex items-center gap-2">
                <Switch
                  id="lb_passive_health_enabled"
                  name="lb_passive_health_enabled"
                  defaultChecked={
                    initialData?.load_balancer?.passiveHealthCheck?.enabled ??
                    false
                  }
                />
                <Label htmlFor="lb_passive_health_enabled">
                  Enable Passive Health Check
                </Label>
              </div>
              <FormField
                label="Fail Duration"
                htmlFor="lb_passive_health_fail_duration"
              >
                <Input
                  id="lb_passive_health_fail_duration"
                  name="lb_passive_health_fail_duration"
                  placeholder="30s"
                  defaultValue={
                    initialData?.load_balancer?.passiveHealthCheck
                      ?.failDuration ?? ""
                  }
                />
              </FormField>
              <FormField label="Max Fails" htmlFor="lb_passive_health_max_fails">
                <Input
                  id="lb_passive_health_max_fails"
                  name="lb_passive_health_max_fails"
                  type="number"
                  defaultValue={
                    initialData?.load_balancer?.passiveHealthCheck?.maxFails ??
                    ""
                  }
                />
              </FormField>
              <FormField
                label="Unhealthy Latency"
                htmlFor="lb_passive_health_unhealthy_latency"
              >
                <Input
                  id="lb_passive_health_unhealthy_latency"
                  name="lb_passive_health_unhealthy_latency"
                  placeholder="5s"
                  defaultValue={
                    initialData?.load_balancer?.passiveHealthCheck
                      ?.unhealthyLatency ?? ""
                  }
                />
              </FormField>
          </div>
        </div>
      </div>

      {/* DNS Resolver */}
      <div className="rounded-lg border border-emerald-500/60 bg-emerald-500/5 p-4">
        <input type="hidden" name="dns_present" value="1" />
        <input type="hidden" name="dns_enabled_present" value="1" />
        <input type="hidden" name="dns_enabled" value={dnsEnabled ? "on" : ""} />

        <div className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-row items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
              <Globe className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">Custom DNS Resolvers</p>
              <p className="text-sm text-muted-foreground mt-0.5">Configure per-host DNS resolution for upstream discovery</p>
            </div>
          </div>
          <Switch checked={dnsEnabled} onCheckedChange={setDnsEnabled} className="shrink-0" />
        </div>

        <div className={cn(
          "overflow-hidden transition-all duration-200",
          dnsEnabled ? "max-h-[3000px] opacity-100 mt-4" : "max-h-0 opacity-0 pointer-events-none"
        )}>
          <div className="flex flex-col gap-3">
              <FormField
                label="DNS Resolvers"
                htmlFor="dns_resolvers"
                helperText="One per line. Used for upstream hostname resolution."
              >
                <Textarea
                  id="dns_resolvers"
                  name="dns_resolvers"
                  placeholder={"1.1.1.1\n8.8.8.8"}
                  defaultValue={
                    initialData?.dns_resolver?.resolvers?.join("\n") ?? ""
                  }
                  rows={2}
                />
              </FormField>
              <FormField
                label="Fallback Resolvers"
                htmlFor="dns_fallbacks"
                helperText="Fallback DNS servers (one per line)."
              >
                <Textarea
                  id="dns_fallbacks"
                  name="dns_fallbacks"
                  placeholder="8.8.4.4"
                  defaultValue={
                    initialData?.dns_resolver?.fallbacks?.join("\n") ?? ""
                  }
                  rows={1}
                />
              </FormField>
              <FormField label="Timeout" htmlFor="dns_timeout">
                <Input
                  id="dns_timeout"
                  name="dns_timeout"
                  placeholder="5s"
                  defaultValue={initialData?.dns_resolver?.timeout ?? ""}
                />
              </FormField>
          </div>
        </div>
      </div>

      {/* Upstream DNS Resolution / Pinning */}
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultUpstreamDnsAccordion}
        className="rounded-lg border border-violet-500/60 bg-violet-500/5"
      >
        <AccordionItem value="upstream-dns" className="border-b-0">
          <AccordionTrigger className="text-sm font-medium hover:no-underline px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
                <Pin className="h-4 w-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold leading-snug">Upstream DNS Pinning</p>
                <p className="text-sm font-normal text-muted-foreground">Pin upstream DNS resolution to concrete IP addresses at config time</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <div className="flex flex-col gap-3 pt-1">
              <input
                type="hidden"
                name="upstream_dns_resolution_present"
                value="1"
              />
              <p className="text-sm text-muted-foreground">
                When enabled, upstream hostnames are resolved to IP addresses at
                config time, pinning DNS resolution.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="upstream_dns_resolution_mode">
                  Resolution Mode
                </Label>
                <Select
                  name="upstream_dns_resolution_mode"
                  defaultValue={
                    initialData?.upstream_dns_resolution?.enabled === true
                      ? "enabled"
                      : initialData?.upstream_dns_resolution?.enabled === false
                      ? "disabled"
                      : "inherit"
                  }
                >
                  <SelectTrigger id="upstream_dns_resolution_mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">
                      Inherit from global settings
                    </SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="upstream_dns_resolution_family">
                  Address Family Preference
                </Label>
                <Select
                  name="upstream_dns_resolution_family"
                  defaultValue={
                    initialData?.upstream_dns_resolution?.family ?? "inherit"
                  }
                >
                  <SelectTrigger id="upstream_dns_resolution_family">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">
                      Inherit from global settings
                    </SelectItem>
                    <SelectItem value="both">Both (IPv6 + IPv4)</SelectItem>
                    <SelectItem value="ipv6">IPv6 only</SelectItem>
                    <SelectItem value="ipv4">IPv4 only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Geo Blocking */}
      <GeoBlockFields
        initialValues={initialData ? {
          geoblock: initialData.geoblock ?? null,
          geoblock_mode: initialData.geoblock_mode ?? "merge",
        } : undefined}
        hideAdvanced
        customDescription="Block or allow traffic by country, continent, ASN, CIDR, or IP. Blocked connections are immediately closed."
      />

      {/* Mutual TLS (mTLS) — requires TLS termination */}
      <MtlsFields
        value={initialData?.mtls ?? null}
        caCertificates={caCertificates}
        disabled={isUdp || !tlsTermination}
        disabledReason={isUdp ? "mTLS is not available for UDP connections." : "Enable TLS termination to configure mTLS."}
      />

      {/* Upstream TLS Dial */}
      <UpstreamTlsFields
        initialData={initialData?.upstream_tls}
        disabled={isUdp}
      />
    </form>
  );
}

export function CreateL4HostDialog({
  open,
  onClose,
  initialData,
  certificates = [],
  caCertificates = [],
}: {
  open: boolean;
  onClose: () => void;
  initialData?: L4ProxyHost | null;
  certificates?: Certificate[];
  caCertificates?: CaCertificate[];
}) {
  const [state, formAction] = useFormState(
    createL4ProxyHostAction,
    INITIAL_ACTION_STATE
  );
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      if (state.message) toast.success(state.message);
      setIsPending(false);
      onClose();
    } else if (state.status === "error") {
      if (state.message) toast.error(state.message);
      setIsPending(false);
    }
  }, [state.status, state.message, onClose]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={initialData ? "Duplicate L4 Proxy Host" : "Create L4 Proxy Host"}
      maxWidth="lg"
      submitLabel="Create"
      isSubmitting={isPending}
      onSubmit={() => {
        setIsPending(true);
        (
          document.getElementById("create-l4-host-form") as HTMLFormElement
        )?.requestSubmit();
      }}
    >
      <L4HostForm
        formId="create-l4-host-form"
        formAction={formAction}
        state={state}
        initialData={
          initialData ? { ...initialData, name: `${initialData.name} (Copy)` } : null
        }
        certificates={certificates}
        caCertificates={caCertificates}
      />
    </AppDialog>
  );
}

export function EditL4HostDialog({
  open,
  host,
  onClose,
  certificates = [],
  caCertificates = [],
}: {
  open: boolean;
  host: L4ProxyHost;
  onClose: () => void;
  certificates?: Certificate[];
  caCertificates?: CaCertificate[];
}) {
  const [state, formAction] = useFormState(
    updateL4ProxyHostAction.bind(null, host.id),
    INITIAL_ACTION_STATE
  );
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      if (state.message) toast.success(state.message);
      setIsPending(false);
      onClose();
    } else if (state.status === "error") {
      if (state.message) toast.error(state.message);
      setIsPending(false);
    }
  }, [state.status, state.message, onClose]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Edit L4 Proxy Host"
      maxWidth="lg"
      submitLabel="Save Changes"
      isSubmitting={isPending}
      onSubmit={() => {
        setIsPending(true);
        (
          document.getElementById("edit-l4-host-form") as HTMLFormElement
        )?.requestSubmit();
      }}
    >
      <L4HostForm
        formId="edit-l4-host-form"
        formAction={formAction}
        state={state}
        initialData={host}
        certificates={certificates}
        caCertificates={caCertificates}
      />
    </AppDialog>
  );
}

export function DeleteL4HostDialog({
  open,
  host,
  onClose,
}: {
  open: boolean;
  host: L4ProxyHost;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(
    deleteL4ProxyHostAction.bind(null, host.id),
    INITIAL_ACTION_STATE
  );
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      if (state.message) toast.success(state.message);
      setIsPending(false);
      onClose();
    } else if (state.status === "error") {
      if (state.message) toast.error(state.message);
      setIsPending(false);
    }
  }, [state.status, state.message, onClose]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Delete L4 Proxy Host"
      maxWidth="lg"
      submitLabel="Delete"
      isSubmitting={isPending}
      onSubmit={() => {
        setIsPending(true);
        (
          document.getElementById("delete-l4-host-form") as HTMLFormElement
        )?.requestSubmit();
      }}
    >
      <form
        id="delete-l4-host-form"
        action={formAction}
        className="flex flex-col gap-4"
      >
        {state.status !== "idle" && state.message && (
          <Alert
            variant={state.status === "error" ? "destructive" : "default"}
          >
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm">
          Are you sure you want to delete the L4 proxy host{" "}
          <strong>{host.name}</strong>?
        </p>
        <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Protocol</span>
            <Badge variant={host.protocol === "tcp" ? "info" : "warning"} className="text-[10px] px-1.5 py-0">
              {host.protocol.toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Listen</span>
            <span className="font-mono text-xs">{host.listen_address}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Upstreams</span>
            <span className="font-mono text-xs">{host.upstreams.join(", ")}</span>
          </div>
        </div>
        <p className="text-sm text-destructive font-medium">
          This action cannot be undone.
        </p>
      </form>
    </AppDialog>
  );
}
