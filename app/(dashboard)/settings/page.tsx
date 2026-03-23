export const dynamic = 'force-dynamic';

import SettingsClient from "./SettingsClient";
import { getCloudflareSettings, getGeneralSettings, getAuthentikSettings, getMetricsSettings, getLoggingSettings, getDnsSettings, getSetting, getUpstreamDnsResolutionSettings, getGeoBlockSettings, getRetentionSettings } from "@/src/lib/settings";
import { getInstanceMode, getReplicaLastSync, getPrimaryToken, isInstanceModeFromEnv, isSyncTokenFromEnv, getEnvReplicaInstances } from "@/src/lib/instance-sync";
import { listInstances } from "@/src/lib/models/instances";
import { requireAdmin } from "@/src/lib/auth";
export default async function SettingsPage() {
  await requireAdmin();

  // Check if configuration is from environment variables
  const modeFromEnv = isInstanceModeFromEnv();
  const tokenFromEnv = isSyncTokenFromEnv();

  const [general, cloudflare, authentik, metrics, logging, dns, upstreamDnsResolution, instanceMode, globalGeoBlock, retention] = await Promise.all([
    getGeneralSettings(),
    getCloudflareSettings(),
    getAuthentikSettings(),
    getMetricsSettings(),
    getLoggingSettings(),
    getDnsSettings(),
    getUpstreamDnsResolutionSettings(),
    getInstanceMode(),
    getGeoBlockSettings(),
    getRetentionSettings(),
  ]);

  const [overrideGeneral, overrideCloudflare, overrideAuthentik, overrideMetrics, overrideLogging, overrideDns, overrideUpstreamDnsResolution] =
    instanceMode === "replica"
      ? await Promise.all([
          getSetting("general"),
          getSetting("cloudflare"),
          getSetting("authentik"),
          getSetting("metrics"),
          getSetting("logging"),
          getSetting("dns"),
          getSetting("upstream_dns_resolution")
        ])
      : [null, null, null, null, null, null, null];

  const [replicaToken, replicaLastSync] = instanceMode === "replica"
    ? await Promise.all([getPrimaryToken(), getReplicaLastSync()])
    : [null, null];

  const instances = instanceMode === "primary" ? await listInstances() : [];
  const envInstances = instanceMode === "primary" ? getEnvReplicaInstances() : [];

  return (
    <SettingsClient
      general={general}
      cloudflare={{
        hasToken: Boolean(cloudflare?.apiToken),
        zoneId: cloudflare?.zoneId,
        accountId: cloudflare?.accountId
      }}
      authentik={authentik}
      metrics={metrics}
      logging={logging}
      dns={dns}
      upstreamDnsResolution={upstreamDnsResolution}
      globalGeoBlock={globalGeoBlock}
      retention={retention}
      instanceSync={{
        mode: instanceMode,
        modeFromEnv,
        tokenFromEnv,
        overrides: {
          general: overrideGeneral !== null,
          cloudflare: overrideCloudflare !== null,
          authentik: overrideAuthentik !== null,
          metrics: overrideMetrics !== null,
          logging: overrideLogging !== null,
          dns: overrideDns !== null,
          upstreamDnsResolution: overrideUpstreamDnsResolution !== null
        },
        replica: instanceMode === "replica" ? {
          hasToken: Boolean(replicaToken),
          lastSyncAt: replicaLastSync?.at ?? null,
          lastSyncError: replicaLastSync?.error ?? null
        } : null,
        primary: instanceMode === "primary" ? { instances, envInstances } : null
      }}
    />
  );
}
