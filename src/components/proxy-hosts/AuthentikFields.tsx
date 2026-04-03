import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { AuthentikSettings } from "@/lib/settings";
import { ProxyHost } from "@/lib/models/proxy-hosts";

const AUTHENTIK_DEFAULT_HEADERS = [
    "X-Authentik-Username",
    "X-Authentik-Groups",
    "X-Authentik-Entitlements",
    "X-Authentik-Email",
    "X-Authentik-Name",
    "X-Authentik-Uid",
    "X-Authentik-Jwt",
    "X-Authentik-Meta-Jwks",
    "X-Authentik-Meta-Outpost",
    "X-Authentik-Meta-Provider",
    "X-Authentik-Meta-App",
    "X-Authentik-Meta-Version"
];

const AUTHENTIK_DEFAULT_TRUSTED_PROXIES = ["private_ranges"];

function HiddenCheckboxField({
    name,
    defaultChecked,
    label,
    disabled,
    helperText
}: {
    name: string;
    defaultChecked: boolean;
    label: string;
    disabled?: boolean;
    helperText?: string;
}) {
    return (
        <div>
            <input type="hidden" name={`${name}_present`} value="1" />
            <div className={cn("flex items-start gap-2", disabled && "opacity-50")}>
                <Checkbox
                    id={`checkbox-${name}`}
                    name={name}
                    defaultChecked={defaultChecked}
                    disabled={disabled}
                />
                <label
                    htmlFor={`checkbox-${name}`}
                    className={cn("text-sm cursor-pointer", disabled && "cursor-not-allowed")}
                >
                    {label}
                </label>
            </div>
            {helperText && (
                <p className="text-xs text-muted-foreground ml-6 -mt-0.5">
                    {helperText}
                </p>
            )}
        </div>
    );
}

export function AuthentikFields({
    authentik,
    defaults
}: {
    authentik?: ProxyHost["authentik"] | null;
    defaults?: AuthentikSettings | null;
}) {
    const initial = authentik ?? null;
    const [enabled, setEnabled] = useState(initial?.enabled ?? false);
    const [protectedPathsValue, setProtectedPathsValue] = useState(initial?.protectedPaths?.join(", ") ?? "");
    const [excludedPathsValue, setExcludedPathsValue] = useState(initial?.excludedPaths?.join(", ") ?? "");

    const copyHeadersValue =
        initial && initial.copyHeaders.length > 0 ? initial.copyHeaders.join("\n") : AUTHENTIK_DEFAULT_HEADERS.join("\n");
    const trustedProxiesValue =
        initial && initial.trustedProxies.length > 0
            ? initial.trustedProxies.join("\n")
            : AUTHENTIK_DEFAULT_TRUSTED_PROXIES.join("\n");
    const setHostHeaderDefault = initial?.setOutpostHostHeader ?? true;

    const protectedPathsDisabled = !enabled || excludedPathsValue.trim() !== "";
    const excludedPathsDisabled = !enabled || protectedPathsValue.trim() !== "";

    return (
        <div className="rounded-lg border border-primary bg-primary/5 p-4">
            <input type="hidden" name="authentik_present" value="1" />
            <input type="hidden" name="authentik_enabled_present" value="1" />
            <div className="flex flex-col gap-4">
                <div className="flex flex-row items-start justify-between gap-2">
                    <div className="flex flex-row items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5 w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
                            <KeyRound className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold leading-snug">Authentik Forward Auth</p>
                            <p className="text-sm text-muted-foreground mt-0.5">Proxy authentication via Authentik outpost</p>
                        </div>
                    </div>
                    <Switch
                        name="authentik_enabled"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                        className="shrink-0"
                    />
                </div>

                <div className={cn(
                    "overflow-hidden transition-all duration-200",
                    enabled ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Outpost Domain</label>
                            <Input
                                name="authentik_outpost_domain"
                                placeholder="outpost.goauthentik.io"
                                defaultValue={initial?.outpostDomain ?? defaults?.outpostDomain ?? ""}
                                required={enabled}
                                disabled={!enabled}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Outpost Upstream URL</label>
                            <Input
                                name="authentik_outpost_upstream"
                                placeholder="https://outpost.internal:9000"
                                defaultValue={initial?.outpostUpstream ?? defaults?.outpostUpstream ?? ""}
                                required={enabled}
                                disabled={!enabled}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Auth Endpoint (Optional)</label>
                            <Input
                                name="authentik_auth_endpoint"
                                placeholder="/outpost.goauthentik.io/auth/caddy"
                                defaultValue={initial?.authEndpoint ?? defaults?.authEndpoint ?? ""}
                                disabled={!enabled}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Headers to Copy</label>
                            <Textarea
                                name="authentik_copy_headers"
                                defaultValue={copyHeadersValue}
                                disabled={!enabled}
                                rows={3}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Trusted Proxies</label>
                            <Input
                                name="authentik_trusted_proxies"
                                defaultValue={trustedProxiesValue}
                                disabled={!enabled}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Protected Paths (Optional)</label>
                            <Textarea
                                name="authentik_protected_paths"
                                placeholder="/secret/*, /admin/*"
                                value={protectedPathsValue}
                                onChange={(e) => setProtectedPathsValue(e.target.value)}
                                disabled={protectedPathsDisabled}
                                rows={2}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {excludedPathsValue.trim() !== ""
                                    ? "Not available when Excluded Paths is set."
                                    : "Leave empty to protect entire domain. Specify paths to protect specific routes only."}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Excluded Paths (Optional)</label>
                            <Textarea
                                name="authentik_excluded_paths"
                                placeholder="/share/*, /api/public/*"
                                value={excludedPathsValue}
                                onChange={(e) => setExcludedPathsValue(e.target.value)}
                                disabled={excludedPathsDisabled}
                                rows={2}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {protectedPathsValue.trim() !== ""
                                    ? "Not available when Protected Paths is set."
                                    : "Paths that bypass authentication when the entire domain is protected."}
                            </p>
                        </div>
                        <HiddenCheckboxField
                            name="authentik_set_host_header"
                            defaultChecked={setHostHeaderDefault}
                            label="Set Host Header for Outpost"
                            disabled={!enabled}
                            helperText="Recommended: Keep enabled. Only disable if using IP-based outpost access or troubleshooting routing issues."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
