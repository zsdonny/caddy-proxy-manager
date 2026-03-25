"use client";

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
import { cn } from "@/lib/utils";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { L4UpstreamTlsConfig } from "@/lib/models/l4-proxy-hosts";

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

type UpstreamTlsFieldsProps = {
  initialData?: L4UpstreamTlsConfig | null;
  disabled?: boolean;
};

export function UpstreamTlsFields({ initialData, disabled }: UpstreamTlsFieldsProps) {
  const [enabled, setEnabled] = useState(initialData?.enabled ?? false);

  return (
    <div className={cn(
      "rounded-lg border border-sky-500/60 bg-sky-500/5 p-4",
      disabled && "opacity-50"
    )}>
      <input type="hidden" name="upstream_tls_present" value="1" />
      <input type="hidden" name="upstream_tls_enabled" value={!disabled && enabled ? "on" : ""} />

      <div className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-row items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5 w-8 h-8 rounded-xl bg-sky-500 flex items-center justify-center shrink-0">
            <LockKeyhole className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-snug">Upstream TLS Dial</p>
            <p className="text-sm text-muted-foreground mt-0.5">Configure TLS for connections from Caddy to your upstream servers</p>
          </div>
        </div>
        <Switch
          checked={!disabled && enabled}
          onCheckedChange={setEnabled}
          disabled={disabled}
          className="shrink-0"
        />
      </div>

      {disabled && (
        <p className="text-xs text-muted-foreground mt-2">Not available for UDP connections.</p>
      )}

      {!disabled && (
        <div className={cn(
          "overflow-hidden transition-all duration-200",
          enabled ? "max-h-[3000px] opacity-100 mt-4" : "max-h-0 opacity-0 pointer-events-none"
        )}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="upstream_tls_insecure_skip_verify"
                name="upstream_tls_insecure_skip_verify"
                defaultChecked={initialData?.insecure_skip_verify ?? false}
              />
              <Label htmlFor="upstream_tls_insecure_skip_verify">Skip Certificate Verification</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Skip SSL certificate verification for upstream connections.
            </p>

            <FormField
              label="Server Name (SNI)"
              htmlFor="upstream_tls_server_name"
              helperText="Override the TLS server name sent to the upstream."
            >
              <Input
                id="upstream_tls_server_name"
                name="upstream_tls_server_name"
                placeholder="db.internal.example.com"
                defaultValue={initialData?.server_name ?? ""}
              />
            </FormField>

            <FormField
              label="Root CA PEM Files"
              htmlFor="upstream_tls_root_ca_pem_files"
              helperText="Paths to CA PEM files inside the Caddy container, one per line."
            >
              <Textarea
                id="upstream_tls_root_ca_pem_files"
                name="upstream_tls_root_ca_pem_files"
                placeholder="/etc/caddy/certs/internal-ca.pem"
                defaultValue={initialData?.root_ca_pem_files?.join("\n") ?? ""}
                rows={2}
              />
            </FormField>

            <FormField
              label="Client Certificate File"
              htmlFor="upstream_tls_client_cert_file"
              helperText="Path to client certificate PEM file inside the Caddy container."
            >
              <Input
                id="upstream_tls_client_cert_file"
                name="upstream_tls_client_cert_file"
                placeholder="/etc/caddy/certs/client.pem"
                defaultValue={initialData?.client_certificate_file ?? ""}
              />
            </FormField>

            <FormField
              label="Client Certificate Key File"
              htmlFor="upstream_tls_client_key_file"
              helperText="Path to client certificate key file inside the Caddy container."
            >
              <Input
                id="upstream_tls_client_key_file"
                name="upstream_tls_client_key_file"
                placeholder="/etc/caddy/certs/client-key.pem"
                defaultValue={initialData?.client_certificate_key_file ?? ""}
              />
            </FormField>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upstream_tls_renegotiation">TLS Renegotiation</Label>
              <Select
                name="upstream_tls_renegotiation"
                defaultValue={initialData?.renegotiation ?? "never"}
              >
                <SelectTrigger id="upstream_tls_renegotiation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="freely">Freely</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls whether the upstream server can request TLS renegotiation.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
